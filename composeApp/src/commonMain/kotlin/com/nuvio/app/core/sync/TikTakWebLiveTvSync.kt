package com.nuvio.app.core.sync

import co.touchlab.kermit.Logger
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.features.livetv.LiveTvRepository
import com.nuvio.app.features.livetv.LiveTvXtreamSettings
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.buildJsonObject

/**
 * Restores TikTak Web's account-owned IPTV connection into the native client.
 *
 * The website stores its feature payload under the `tiktak_web` platform while
 * the Compose client stores native settings separately. Reading both is
 * intentional: it preserves each client's settings without asking a signed-in
 * TV user to enter the same Xtream credentials again.
 */
internal object TikTakWebLiveTvSync {
    private val log = Logger.withTag("TikTakWebLiveTvSync")

    suspend fun pull(profileId: Int): Boolean {
        val own = pullWebPayload(profileId)
        val primary = if (profileId == PRIMARY_PROFILE_ID) own else pullWebPayload(PRIMARY_PROFILE_ID)
        val provider = listOfNotNull(
            own?.objectValue("provider"),
            own?.objectValue("accountProvider"),
            primary?.objectValue("accountProvider"),
            primary?.objectValue("provider"),
        ).firstOrNull(::isValidProvider) ?: return false

        val settings = LiveTvXtreamSettings(
            serverUrl = provider.stringValue("server").orEmpty(),
            username = provider.stringValue("username").orEmpty(),
            password = provider.stringValue("password").orEmpty(),
        )
        val result = LiveTvRepository.loadXtream(settings)
        if (result.isFailure) {
            log.w(result.exceptionOrNull()) { "Unable to restore the signed-in TikTak TV provider" }
            return false
        }

        own?.stringValue("epgUrl")
            ?.takeIf(::isSafeHttpUrl)
            ?.let(LiveTvRepository::loadExternalEpg)
        return true
    }

    private suspend fun pullWebPayload(profileId: Int): JsonObject? {
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_platform", WEB_SYNC_PLATFORM)
        }
        return SupabaseProvider.client.postgrest
            .rpc("sync_pull_profile_settings_blob", params)
            .decodeList<WebSettingsBlobResponse>()
            .firstOrNull()
            ?.settingsJson
            ?.objectValue(WEB_SETTINGS_FIELD)
    }

    private fun isValidProvider(provider: JsonObject): Boolean =
        isSafeHttpUrl(provider.stringValue("server")) &&
            !provider.stringValue("username").isNullOrBlank() &&
            !provider.stringValue("password").isNullOrBlank()

    private fun isSafeHttpUrl(value: String?): Boolean {
        val normalized = value?.trim().orEmpty()
        return normalized.startsWith("https://", ignoreCase = true) ||
            normalized.startsWith("http://", ignoreCase = true)
    }

    private fun JsonObject.objectValue(key: String): JsonObject? =
        runCatching { get(key)?.jsonObject }.getOrNull()

    private fun JsonObject.stringValue(key: String): String? =
        runCatching { get(key)?.jsonPrimitive?.contentOrNull?.trim() }.getOrNull()

    private const val PRIMARY_PROFILE_ID = 1
    private const val WEB_SYNC_PLATFORM = "tiktak_web"
    private const val WEB_SETTINGS_FIELD = "tikTakWebV1"
}

@Serializable
private data class WebSettingsBlobResponse(
    @SerialName("settings_json") val settingsJson: JsonObject? = null,
)
