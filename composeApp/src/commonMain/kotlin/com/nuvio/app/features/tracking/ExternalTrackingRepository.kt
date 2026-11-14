package com.nuvio.app.features.tracking

import com.nuvio.app.features.addons.httpRequestRaw
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.trakt.TraktPlatformClock
import io.ktor.http.Url
import io.ktor.http.encodeURLParameter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private const val SIMKL_CLIENT_ID = "7d78ae78c096eab58e7f6cdcb544c42a277fae5ebee8f178215ff2a37c3b284a"
private const val ANILIST_CLIENT_ID = "56992"
private const val ANILIST_PIN_CLIENT_ID = "56995"
private const val ANILIST_CALLBACK = "https://www.tiktaktv.me/anilist-tv-callback.html"

@Serializable
internal data class TrackingAccount(
    val accessToken: String = "",
    val refreshToken: String = "",
    val expiresAtMs: Long = 0L,
    val scope: String = "",
    val pendingState: String = "",
    val pendingAtMs: Long = 0L,
    val scrobblingEnabled: Boolean = false,
    val progressEnabled: Boolean = false,
)

data class ExternalTrackingUiState(
    val simklConnected: Boolean = false,
    val simklLoading: Boolean = false,
    val simklCode: String = "",
    val simklVerificationUrl: String = "",
    val simklError: String = "",
    val simklScrobblingEnabled: Boolean = false,
    val anilistConnected: Boolean = false,
    val anilistProgressEnabled: Boolean = false,
    val anilistError: String = "",
)

object ExternalTrackingRepository {
    private val json = Json { ignoreUnknownKeys = true }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _state = MutableStateFlow(ExternalTrackingUiState())
    val state = _state.asStateFlow()
    private var generation = 0
    private var loadedProfile = -1

    private fun load(provider: String, profileId: Int): TrackingAccount =
        runCatching { json.decodeFromString<TrackingAccount>(ExternalTrackingStorage.load(provider, profileId).orEmpty()) }
            .getOrDefault(TrackingAccount())

    private fun save(provider: String, profileId: Int, account: TrackingAccount) =
        ExternalTrackingStorage.save(provider, profileId, json.encodeToString(account))

    fun ensureLoaded() {
        val profile = ProfileRepository.activeProfileId
        if (profile == loadedProfile) return
        onProfileChanged()
    }

    fun onProfileChanged() {
        generation++
        loadedProfile = ProfileRepository.activeProfileId
        val simkl = load("simkl", loadedProfile)
        val anilist = load("anilist", loadedProfile)
        _state.value = ExternalTrackingUiState(
            simklConnected = simkl.accessToken.isNotBlank(),
            simklScrobblingEnabled = simkl.scrobblingEnabled,
            anilistConnected = anilist.accessToken.isNotBlank() && anilist.expiresAtMs > TraktPlatformClock.nowEpochMs(),
            anilistProgressEnabled = anilist.progressEnabled,
        )
    }

    fun setSimklScrobbling(enabled: Boolean) {
        ensureLoaded()
        val profile = loadedProfile
        val current = load("simkl", profile)
        if (current.accessToken.isBlank()) return
        save("simkl", profile, current.copy(scrobblingEnabled = enabled))
        _state.value = _state.value.copy(simklScrobblingEnabled = enabled)
    }

    fun setAniListProgress(enabled: Boolean) {
        ensureLoaded()
        val profile = loadedProfile
        val current = load("anilist", profile)
        if (current.accessToken.isBlank()) return
        save("anilist", profile, current.copy(progressEnabled = enabled))
        _state.value = _state.value.copy(anilistProgressEnabled = enabled)
    }

    fun disconnect(provider: String) {
        ensureLoaded()
        generation++
        save(provider, loadedProfile, TrackingAccount())
        onProfileChanged()
    }

    fun connectSimkl() {
        ensureLoaded()
        val profile = loadedProfile
        val attempt = ++generation
        _state.value = _state.value.copy(simklLoading = true, simklError = "", simklCode = "")
        scope.launch {
            val body = form(mapOf("client_id" to SIMKL_CLIENT_ID, "scope" to "media:read media:write"))
            val response = runCatching { httpRequestRaw("POST", "https://api.simkl.com/oauth2/device", authHeaders(), body) }
                .getOrNull()
            if (attempt != generation || profile != ProfileRepository.activeProfileId) return@launch
            if (response == null || response.status !in 200..299) {
                _state.value = _state.value.copy(simklLoading = false, simklError = "Could not start Simkl sign-in. Try again.")
                return@launch
            }
            val device = runCatching { json.decodeFromString<SimklDevice>(response!!.body) }.getOrNull()
            if (device == null) {
                _state.value = _state.value.copy(simklLoading = false, simklError = "Simkl returned an invalid activation code.")
                return@launch
            }
            _state.value = _state.value.copy(simklLoading = false, simklCode = device.userCode,
                simklVerificationUrl = device.verificationUriComplete.ifBlank { device.verificationUri })
            val deadline = TraktPlatformClock.nowEpochMs() + device.expiresIn * 1000L
            var interval = maxOf(device.interval, 5L) * 1000L
            while (attempt == generation && profile == ProfileRepository.activeProfileId &&
                TraktPlatformClock.nowEpochMs() < deadline) {
                delay(interval)
                val tokenResponse = runCatching { httpRequestRaw("POST", "https://api.simkl.com/oauth2/token", authHeaders(),
                    form(mapOf("grant_type" to "urn:ietf:params:oauth:grant-type:device_code",
                        "client_id" to SIMKL_CLIENT_ID, "device_code" to device.deviceCode))) }.getOrNull() ?: continue
                if (attempt != generation || profile != ProfileRepository.activeProfileId) return@launch
                if (tokenResponse.status == 200) {
                    val token = runCatching { json.decodeFromString<SimklToken>(tokenResponse.body) }.getOrNull()
                    if (token != null && "media:write" in token.scope) {
                        save("simkl", profile, TrackingAccount(token.accessToken, token.refreshToken,
                            TraktPlatformClock.nowEpochMs() + token.expiresIn * 1000L, token.scope))
                        _state.value = _state.value.copy(simklConnected = true, simklCode = "", simklVerificationUrl = "")
                        return@launch
                    }
                    _state.value = _state.value.copy(simklError = "Simkl did not grant tracking access.")
                    break
                }
                val error = runCatching { json.parseToJsonElement(tokenResponse.body).jsonObject["error"]?.jsonPrimitive?.content }.getOrNull()
                if (error == "slow_down") interval += 5000L
                else if (error != "authorization_pending") break
            }
            if (attempt == generation) _state.value = _state.value.copy(simklCode = "", simklVerificationUrl = "",
                simklError = _state.value.simklError.ifBlank { "Simkl sign-in expired or was declined. Try again." })
        }
    }

    fun anilistAuthorizationUrl(): String {
        ensureLoaded()
        val profile = loadedProfile
        val state = trackingRandomState()
        save("anilist", profile, load("anilist", profile).copy(pendingState = state,
            pendingAtMs = TraktPlatformClock.nowEpochMs()))
        return "https://anilist.co/api/v2/oauth/authorize?client_id=$ANILIST_CLIENT_ID" +
            "&redirect_uri=${ANILIST_CALLBACK.encodeURLParameter()}&response_type=token&state=$state"
    }

    fun anilistPinAuthorizationUrl(): String =
        "https://anilist.co/api/v2/oauth/authorize?client_id=$ANILIST_PIN_CLIENT_ID" +
            "&redirect_uri=${"https://anilist.co/api/v2/oauth/pin".encodeURLParameter()}&response_type=token"

    fun connectAniListWithToken(input: String) {
        ensureLoaded()
        val profile = loadedProfile
        val attempt = ++generation
        val token = input.trim().removePrefix("Bearer ").trim()
        if (!token.matches(Regex("[A-Za-z0-9_.-]{100,}"))) {
            _state.value = _state.value.copy(anilistError = "Paste the complete AniList access token shown on your phone.")
            return
        }
        _state.value = _state.value.copy(anilistError = "Verifying AniList account…")
        scope.launch {
            val response = runCatching { httpRequestRaw("POST", "https://graphql.anilist.co",
                mapOf("Authorization" to "Bearer $token", "Content-Type" to "application/json"),
                "{\"query\":\"query { Viewer { id } }\"}") }.getOrNull()
            if (attempt != generation || profile != ProfileRepository.activeProfileId) return@launch
            if (response == null || response.status !in 200..299 ||
                runCatching { json.parseToJsonElement(response.body).jsonObject["data"]?.jsonObject?.get("Viewer") }
                    .getOrNull() == null) {
                _state.value = _state.value.copy(anilistError = "AniList rejected that token. Copy the full token and try again.")
                return@launch
            }
            val previous = load("anilist", profile)
            save("anilist", profile, TrackingAccount(accessToken = token,
                expiresAtMs = TraktPlatformClock.nowEpochMs() + 365L * 24 * 60 * 60 * 1000,
                progressEnabled = previous.progressEnabled))
            _state.value = _state.value.copy(anilistConnected = true, anilistError = "")
        }
    }

    fun onAniListCallback(callback: String) {
        if (!callback.startsWith("tiktaktv://anilist/auth?")) return
        ensureLoaded()
        val profile = loadedProfile
        val current = load("anilist", profile)
        val params = runCatching { Url(callback).parameters }.getOrNull() ?: return
        val now = TraktPlatformClock.nowEpochMs()
        val token = params["access_token"].orEmpty()
        val expiry = params["expires_in"]?.toLongOrNull() ?: 0L
        if (params["state"] != current.pendingState || current.pendingState.isBlank() ||
            now - current.pendingAtMs > 10 * 60_000L || token.isBlank() || expiry <= 0L ||
            params["token_type"]?.lowercase() != "bearer") {
            _state.value = _state.value.copy(anilistError = "AniList sign-in could not be verified. Try again.")
            return
        }
        save("anilist", profile, TrackingAccount(accessToken = token, expiresAtMs = now + expiry * 1000L,
            progressEnabled = current.progressEnabled))
        _state.value = _state.value.copy(anilistConnected = true, anilistError = "")
    }

    suspend fun simklHeaders(profileId: Int): Map<String, String>? {
        if (profileId != ProfileRepository.activeProfileId) return null
        val current = load("simkl", profileId)
        if (current.accessToken.isBlank()) return null
        val token = if (current.expiresAtMs > TraktPlatformClock.nowEpochMs() + 60_000L) current.accessToken else {
            if (current.refreshToken.isBlank()) return null
            val response = runCatching { httpRequestRaw("POST", "https://api.simkl.com/oauth2/token", authHeaders(),
                form(mapOf("grant_type" to "refresh_token", "client_id" to SIMKL_CLIENT_ID,
                    "refresh_token" to current.refreshToken))) }.getOrNull() ?: return null
            val fresh = runCatching { json.decodeFromString<SimklToken>(response.body) }.getOrNull() ?: return null
            save("simkl", profileId, current.copy(accessToken = fresh.accessToken, refreshToken = fresh.refreshToken,
                expiresAtMs = TraktPlatformClock.nowEpochMs() + fresh.expiresIn * 1000L, scope = fresh.scope))
            fresh.accessToken
        }
        return mapOf("Authorization" to "Bearer $token", "Accept" to "application/json",
            "User-Agent" to "TikTakTV/1.0")
    }

    fun anilistHeaders(profileId: Int): Map<String, String>? {
        if (profileId != ProfileRepository.activeProfileId) return null
        val account = load("anilist", profileId)
        if (account.accessToken.isBlank() || account.expiresAtMs <= TraktPlatformClock.nowEpochMs()) return null
        return mapOf("Authorization" to "Bearer ${account.accessToken}",
            "Content-Type" to "application/json", "Accept" to "application/json")
    }

    fun simklApiUrl(path: String): String = "https://api.simkl.com$path?client_id=$SIMKL_CLIENT_ID" +
        "&app-name=TikTakTV&app-version=1.0"

    private fun authHeaders() = mapOf("Content-Type" to "application/x-www-form-urlencoded",
        "Accept" to "application/json", "User-Agent" to "TikTakTV/1.0")

    private fun form(values: Map<String, String>) = values.entries.joinToString("&") { (key, value) ->
        "${key.encodeURLParameter()}=${value.encodeURLParameter()}" }
}

@Serializable
private data class SimklDevice(
    @kotlinx.serialization.SerialName("device_code") val deviceCode: String,
    @kotlinx.serialization.SerialName("user_code") val userCode: String,
    @kotlinx.serialization.SerialName("verification_uri") val verificationUri: String,
    @kotlinx.serialization.SerialName("verification_uri_complete") val verificationUriComplete: String = "",
    @kotlinx.serialization.SerialName("expires_in") val expiresIn: Long,
    val interval: Long = 5L,
)

@Serializable
private data class SimklToken(
    @kotlinx.serialization.SerialName("access_token") val accessToken: String,
    @kotlinx.serialization.SerialName("refresh_token") val refreshToken: String,
    @kotlinx.serialization.SerialName("expires_in") val expiresIn: Long,
    val scope: String = "",
)
