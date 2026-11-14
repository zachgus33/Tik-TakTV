package com.nuvio.app.features.tracking

import com.nuvio.app.features.addons.httpRequestRaw
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.trakt.TraktPlatformClock
import com.nuvio.app.features.trakt.TraktScrobbleItem
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Simkl is opt-in. Its one-write-per-20-seconds limit is shared by all scrobble actions. */
internal object SimklScrobbleRepository {
    private val sendMutex = Mutex()
    private var lastSentAtMs = 0L

    suspend fun start(profileId: Int, item: TraktScrobbleItem, progress: Float) = send("start", profileId, item, progress)
    suspend fun stop(profileId: Int, item: TraktScrobbleItem, progress: Float) = send("stop", profileId, item, progress)

    private suspend fun send(action: String, profileId: Int, item: TraktScrobbleItem, progress: Float) {
        ExternalTrackingRepository.ensureLoaded()
        if (profileId != ProfileRepository.activeProfileId ||
            !ExternalTrackingRepository.state.value.simklScrobblingEnabled) return
        val media = when (item) {
            is TraktScrobbleItem.Movie -> buildJsonObject {
                put("movie", buildJsonObject {
                    item.title?.let { put("title", it) }
                    item.year?.let { put("year", it) }
                    put("ids", buildIds(item.ids.imdb, item.ids.tmdb))
                })
            }
            is TraktScrobbleItem.Episode -> buildJsonObject {
                put("show", buildJsonObject {
                    item.showTitle?.let { put("title", it) }
                    item.showYear?.let { put("year", it) }
                    put("ids", buildIds(item.showIds.imdb, item.showIds.tmdb))
                })
                put("episode", buildJsonObject {
                    put("season", item.season)
                    put("number", item.number)
                })
            }
        }
        // A Trakt-only ID is not a Simkl ID. Require a common identifier to avoid fuzzy matches.
        val sharedId = when (item) {
            is TraktScrobbleItem.Movie -> item.ids.imdb != null || item.ids.tmdb != null
            is TraktScrobbleItem.Episode -> item.showIds.imdb != null || item.showIds.tmdb != null
        }
        if (!sharedId) return
        val body = buildJsonObject {
            put("progress", (progress.coerceIn(0f, 100f) * 100).toInt() / 100f)
            media.forEach { (key, value) -> put(key, value) }
        }
        sendMutex.withLock {
            val waitMs = 21_000L - (TraktPlatformClock.nowEpochMs() - lastSentAtMs)
            if (waitMs > 0) delay(waitMs)
            if (profileId != ProfileRepository.activeProfileId ||
                !ExternalTrackingRepository.state.value.simklScrobblingEnabled) return@withLock
            val headers = ExternalTrackingRepository.simklHeaders(profileId) ?: return@withLock
            lastSentAtMs = TraktPlatformClock.nowEpochMs()
            runCatching {
                httpRequestRaw("POST", ExternalTrackingRepository.simklApiUrl("/scrobble/$action"),
                    headers + ("Content-Type" to "application/json"), Json.encodeToString(
                        kotlinx.serialization.json.JsonObject.serializer(), body))
            }
        }
    }

    private fun buildIds(imdb: String?, tmdb: Int?) = buildJsonObject {
        imdb?.takeIf { it.matches(Regex("tt\\d+")) }?.let { put("imdb", it) }
        tmdb?.let { put("tmdb", it) }
    }
}
