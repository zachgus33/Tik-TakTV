package com.nuvio.app.features.tracking

import com.nuvio.app.features.addons.httpRequestRaw
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.trakt.TraktPlatformClock
import com.nuvio.app.features.trakt.parseTraktContentIds
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

object SimklRatingsRepository {
    private data class Cached(val fetchedAt: Long, val rows: List<JsonObject>)
    private val cache = mutableMapOf<String, Cached>()
    private val json = Json { ignoreUnknownKeys = true }

    fun canRate(type: String, id: String): Boolean =
        type.lowercase() in setOf("movie", "series", "show", "tv", "tvshow") &&
            parseTraktContentIds(id).let { it.imdb != null || it.tmdb != null }

    suspend fun getRating(type: String, id: String): Int? {
        if (!canRate(type, id)) return null
        val profile = ProfileRepository.activeProfileId
        val kind = if (type.lowercase() == "movie") "movies" else "shows"
        val cacheKey = "$profile:$kind"
        val now = TraktPlatformClock.nowEpochMs()
        val rows = cache[cacheKey]?.takeIf { now - it.fetchedAt < 5 * 60_000L }?.rows ?: run {
            val headers = ExternalTrackingRepository.simklHeaders(profile) ?: return null
            val response = httpRequestRaw("GET", ExternalTrackingRepository.simklApiUrl(
                "/sync/ratings/$kind/1,2,3,4,5,6,7,8,9,10"), headers, "",
                maxResponseBodyBytes = 4 * 1024 * 1024)
            check(response.status in 200..299) { "Simkl ratings could not load (HTTP ${response.status})." }
            val values = (json.parseToJsonElement(response.body).jsonObject[kind] as? JsonArray)
                ?.mapNotNull { it as? JsonObject }.orEmpty()
            cache[cacheKey] = Cached(now, values)
            values
        }
        val wanted = parseTraktContentIds(id)
        return rows.firstOrNull { row ->
            val ids = (row[kind.dropLast(1)] as? JsonObject)?.get("ids") as? JsonObject
                ?: row["ids"] as? JsonObject
            ids != null && (wanted.imdb != null && ids["imdb"]?.jsonPrimitive?.content == wanted.imdb ||
                wanted.tmdb != null && ids["tmdb"]?.jsonPrimitive?.content == wanted.tmdb.toString())
        }?.get("user_rating")?.jsonPrimitive?.intOrNull
    }

    suspend fun setRating(type: String, id: String, rating: Int?) {
        require(canRate(type, id)) { "This title has no Simkl-compatible ID." }
        require(rating == null || rating in 1..10) { "Choose a rating from 1 to 10." }
        val profile = ProfileRepository.activeProfileId
        val headers = ExternalTrackingRepository.simklHeaders(profile) ?: error("Connect Simkl in Settings first.")
        val kind = if (type.lowercase() == "movie") "movies" else "shows"
        val ids = parseTraktContentIds(id)
        val body = buildJsonObject {
            put(kind, JsonArray(listOf(buildJsonObject {
                put("ids", buildJsonObject {
                    ids.imdb?.let { put("imdb", it) }
                    ids.tmdb?.let { put("tmdb", it.toString()) }
                })
                rating?.let { put("rating", it) }
            })))
        }
        val path = if (rating == null) "/sync/ratings/remove" else "/sync/ratings"
        val response = httpRequestRaw("POST", ExternalTrackingRepository.simklApiUrl(path),
            headers + ("Content-Type" to "application/json"), body.toString())
        check(response.status in 200..299) { "Simkl rating was not saved (HTTP ${response.status})." }
        val counts = json.parseToJsonElement(response.body).jsonObject
        val accepted = counts[if (rating == null) "deleted" else "added"]
            ?.jsonObject?.get(kind)?.jsonPrimitive?.intOrNull
        check(accepted == 1) { "Simkl did not accept this title's rating." }
        cache.remove("$profile:$kind")
    }
}
