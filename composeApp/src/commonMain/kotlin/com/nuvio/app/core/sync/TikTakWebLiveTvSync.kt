package com.nuvio.app.core.sync

import co.touchlab.kermit.Logger
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.features.livetv.LiveTvRepository
import com.nuvio.app.features.livetv.LiveTvXtreamSettings
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
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
        migrateLegacyWebProgress(profileId = profileId, payload = own)
        val provider = listOfNotNull(
            own?.objectValue("provider"),
            own?.objectValue("accountProvider"),
            primary?.objectValue("accountProvider"),
            primary?.objectValue("provider"),
        ).firstOrNull(::isValidProvider)

        if (provider == null) {
            // A standalone XMLTV URL belongs to the profile when Live TV comes from an
            // imported M3U file. Xtream providers expose their own XMLTV endpoint and must
            // not also start this legacy loader: doing both retained two large guide parses
            // and exhausted the 192 MB Fire TV heap during account sync.
            listOfNotNull(
                own?.stringValue("epgUrl"),
                primary?.stringValue("epgUrl"),
            ).firstOrNull(::isSafeHttpUrl)
                ?.let(LiveTvRepository::loadExternalEpgWhenReady)
            return own != null
        }

        val settings = LiveTvXtreamSettings(
            serverUrl = provider.stringValue("server").orEmpty(),
            username = provider.stringValue("username").orEmpty(),
            password = provider.stringValue("password").orEmpty(),
        )
        // Restore credentials and the bounded channel index during account sync, but leave
        // the multi-megabyte XMLTV guide until the user opens Live TV or Sports. Running the
        // guide parse alongside home catalogs, library, collections, and hero video startup
        // pushed old Fire TV devices to their 192 MB heap ceiling and froze navigation.
        val result = LiveTvRepository.loadXtream(settings, loadGuide = false)
        if (result.isFailure) {
            log.w(result.exceptionOrNull()) { "Unable to restore the signed-in TikTak TV provider" }
            return false
        }

        return true
    }

    /**
     * Older TikTak Web builds retained Continue Watching in the web profile
     * blob before the shared progress RPC became authoritative. Upserting
     * those rows is idempotent and lets native TV restore existing history.
     */
    private suspend fun migrateLegacyWebProgress(profileId: Int, payload: JsonObject?) {
        val progress = payload?.arrayValue("progress").orEmpty()
        if (progress.isEmpty()) return

        val existingKeys = runCatching {
            val pullParams = buildJsonObject {
                put("p_profile_id", profileId)
                put("p_limit", MAX_LEGACY_PROGRESS_ITEMS)
            }
            SupabaseProvider.client.postgrest
                .rpc("sync_pull_watch_progress", pullParams)
                .decodeList<ExistingProgressRow>()
                .mapTo(mutableSetOf()) { it.resolvedKey() }
        }.onFailure { error ->
            log.w(error) { "Skipping legacy progress migration because current rows could not be checked" }
        }.getOrNull() ?: return

        val entries = buildJsonArray {
            progress.asSequence().take(MAX_LEGACY_PROGRESS_ITEMS).forEach { element ->
                val row = runCatching { element.jsonObject }.getOrNull() ?: return@forEach
                val item = row.objectValue("item") ?: return@forEach
                if (!item.stringValue("source").equals("addon", ignoreCase = true)) return@forEach
                val contentId = item.stringValue("id")?.takeIf(String::isNotBlank) ?: return@forEach
                val contentType = item.stringValue("type")
                    ?.takeIf { it == "movie" || it == "series" }
                    ?: return@forEach
                val episode = row.objectValue("episode")
                val videoId = episode?.stringValue("id")?.takeIf(String::isNotBlank) ?: contentId
                val season = episode?.intValue("season")
                val episodeNumber = episode?.intValue("episode")
                val positionMs = ((row.doubleValue("seconds") ?: 0.0) * 1000.0).toLong().coerceAtLeast(0L)
                val durationMs = ((row.doubleValue("duration") ?: 0.0) * 1000.0).toLong().coerceAtLeast(0L)
                if (durationMs <= 0L || positionMs <= 0L) return@forEach
                val updatedAt = row.longValue("at") ?: 0L
                val progressKey = if (season != null && episodeNumber != null) {
                    "${contentId}_s${season}e${episodeNumber}"
                } else {
                    contentId
                }
                // Compatibility migration must never replace a newer native
                // row with an older copy retained in the web settings blob.
                if (progressKey in existingKeys) return@forEach
                add(
                    buildJsonObject {
                        put("content_id", contentId)
                        put("content_type", contentType)
                        put("video_id", videoId)
                        if (season != null) put("season", season)
                        if (episodeNumber != null) put("episode", episodeNumber)
                        put("position", positionMs)
                        put("duration", durationMs)
                        put("last_watched", updatedAt)
                        put("progress_key", progressKey)
                    },
                )
            }
        }
        if (entries.isEmpty()) return

        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_entries", entries)
            putSyncOriginClientId()
        }
        runCatching {
            SupabaseProvider.client.postgrest.rpc("sync_push_watch_progress", params)
        }.onFailure { error ->
            log.w(error) { "Unable to migrate TikTak Web Continue Watching for profile $profileId" }
        }
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

    private fun JsonObject.arrayValue(key: String): JsonArray? =
        runCatching { get(key) as? JsonArray }.getOrNull()

    private fun JsonObject.doubleValue(key: String): Double? =
        runCatching { get(key)?.jsonPrimitive?.doubleOrNull }.getOrNull()

    private fun JsonObject.longValue(key: String): Long? =
        runCatching { get(key)?.jsonPrimitive?.longOrNull }.getOrNull()

    private fun JsonObject.intValue(key: String): Int? = longValue(key)?.toInt()

    private const val PRIMARY_PROFILE_ID = 1
    private const val WEB_SYNC_PLATFORM = "tiktak_web"
    private const val WEB_SETTINGS_FIELD = "tikTakWebV1"
    private const val MAX_LEGACY_PROGRESS_ITEMS = 100
}

@Serializable
private data class WebSettingsBlobResponse(
    @SerialName("settings_json") val settingsJson: JsonObject? = null,
)

@Serializable
private data class ExistingProgressRow(
    @SerialName("progress_key") val progressKey: String = "",
    @SerialName("content_id") val contentId: String = "",
    val season: Int? = null,
    val episode: Int? = null,
) {
    fun resolvedKey(): String = progressKey.takeIf(String::isNotBlank)
        ?: if (season != null && episode != null) "${contentId}_s${season}e${episode}" else contentId
}
