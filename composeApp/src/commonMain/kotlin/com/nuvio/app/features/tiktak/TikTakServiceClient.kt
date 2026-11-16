package com.nuvio.app.features.tiktak

import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.features.addons.RawHttpResponse
import com.nuvio.app.features.addons.httpRequestRaw
import com.nuvio.app.features.livetv.LiveTvChannel
import com.nuvio.app.features.profiles.ProfileRepository
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.delay
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Serializable
private data class FriendAddonRestoreRequest(val urls: List<String>)

@Serializable
private data class FriendAddonRestoreItem(val url: String, val base: String)

@Serializable
private data class FriendAddonRestoreResponse(val addons: List<FriendAddonRestoreItem> = emptyList())

internal object TikTakServiceClient {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun post(path: String, body: String): RawHttpResponse {
        val accessToken = SupabaseProvider.client.auth.currentSessionOrNull()?.accessToken
            ?.takeIf { it.isNotBlank() }
            ?: error("Sign in to use this TikTak TV feature.")
        val requestBody = if (path.ensureLeadingSlash().startsWith("/youtube/")) {
            val fields = json.parseToJsonElement(body).jsonObject
            JsonObject(fields + ("profileId" to JsonPrimitive(ProfileRepository.activeProfileId))).toString()
        } else body
        return httpRequestRaw(
            method = "POST",
            url = "$BASE_URL${path.ensureLeadingSlash()}",
            headers = mapOf(
                "Authorization" to "Bearer $accessToken",
                "Content-Type" to "application/json",
                "Accept" to "application/json",
                // The playback endpoint rejects Ktor's default client identity
                // with 403 even for a valid signed-in account session.
                "User-Agent" to "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            ),
            body = requestBody,
            maxResponseBodyBytes = 4 * 1024 * 1024,
        )
    }

    suspend fun prepareLiveChannel(channel: LiveTvChannel): LiveTvChannel? {
        val payload = JsonObject(mapOf(
            "url" to JsonPrimitive(channel.streamUrl),
            "headers" to JsonObject(channel.headers.mapValues { JsonPrimitive(it.value) }),
            "mode" to JsonPrimitive("transcode"),
            "audioCodec" to JsonPrimitive("aac"),
            "live" to JsonPrimitive(true),
            "start" to JsonPrimitive(0),
        ))
        var response = post("/prepare", payload.toString())
        if (response.status == 429) {
            delay(1_200L)
            response = post("/prepare", payload.toString())
        }
        println("TikTak live prepare status=${response.status}")
        if (response.status !in 200..299) return null
        val path = json.parseToJsonElement(response.body).jsonObject["path"]
            ?.jsonPrimitive?.contentOrNull ?: return null
        if (!path.startsWith("/media/") || !path.endsWith(".m3u8")) return null
        return channel.copy(
            streamUrl = "$BASE_URL$path",
            headers = emptyMap(),
            streamType = "hls",
        )
    }

    suspend fun restoreFriendAddonBases(urls: List<String>): Map<String, String> {
        if (urls.isEmpty()) return emptyMap()
        val response = post(
            "/friend/restore-addons",
            json.encodeToString(FriendAddonRestoreRequest(urls.take(100))),
        )
        if (response.status !in 200..299) return emptyMap()
        return json.decodeFromString<FriendAddonRestoreResponse>(response.body)
            .addons
            .associate { it.url to it.base }
    }

    private fun String.ensureLeadingSlash(): String = if (startsWith('/')) this else "/$this"

    private const val BASE_URL = "https://api.tiktaktv.me"
}
