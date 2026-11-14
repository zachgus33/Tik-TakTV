package com.nuvio.app.features.trakt

import com.nuvio.app.features.addons.httpRequestRaw
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
private data class RatingMedia(val ids: TraktExternalIds)

@Serializable
private data class RatingEntry(
    val rating: Int,
    val movie: RatingMedia? = null,
    val show: RatingMedia? = null,
)

@Serializable
private data class RatingWriteEntry(val ids: TraktExternalIds, val rating: Int? = null)

@Serializable
private data class RatingWriteRequest(
    val movies: List<RatingWriteEntry>? = null,
    val shows: List<RatingWriteEntry>? = null,
)

@Serializable
private data class RatingWriteCounts(val movies: Int = 0, val shows: Int = 0)

@Serializable
private data class RatingWriteResponse(
    val added: RatingWriteCounts? = null,
    val deleted: RatingWriteCounts? = null,
)

object TraktRatingsRepository {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    fun canRate(type: String, id: String): Boolean =
        type.lowercase() in setOf("movie", "series", "show", "tv", "tvshow") &&
            parseTraktContentIds(id).hasAnyId()

    suspend fun getRating(type: String, id: String): Int? {
        if (!canRate(type, id)) return null
        val ids = parseTraktContentIds(id)
        val kind = if (type.lowercase() == "movie") "movies" else "shows"
        val headers = TraktAuthRepository.authorizedHeaders() ?: return null
        for (page in 1..20) {
            val response = httpRequestRaw(
                "GET", "https://api.trakt.tv/sync/ratings/$kind?page=$page&limit=1000", headers, "",
                maxResponseBodyBytes = 4 * 1024 * 1024,
            )
            check(response.status in 200..299) { "Trakt ratings could not load (HTTP ${response.status})." }
            val rows = json.decodeFromString<List<RatingEntry>>(response.body)
            rows.firstOrNull { sameIds(ids, if (kind == "movies") it.movie?.ids else it.show?.ids) }
                ?.let { return it.rating }
            val pages = response.headers.entries.firstOrNull { it.key.equals("x-pagination-page-count", true) }
                ?.value?.toIntOrNull()
            if (if (pages != null) page >= pages else rows.size < 1000) break
        }
        return null
    }

    suspend fun setRating(type: String, id: String, rating: Int?) {
        require(canRate(type, id)) { "This title has no Trakt-compatible ID." }
        require(rating == null || rating in 1..10) { "Choose a rating from 1 to 10." }
        val headers = TraktAuthRepository.authorizedHeaders() ?: error("Connect Trakt in Settings first.")
        val movie = type.lowercase() == "movie"
        val entry = RatingWriteEntry(parseTraktContentIds(id), rating)
        val request = if (movie) RatingWriteRequest(movies = listOf(entry)) else RatingWriteRequest(shows = listOf(entry))
        val path = if (rating == null) "ratings/remove" else "ratings"
        val response = httpRequestRaw(
            "POST", "https://api.trakt.tv/sync/$path",
            headers + ("Content-Type" to "application/json"), json.encodeToString(request),
        )
        check(response.status in 200..299) { "Trakt rating was not saved (HTTP ${response.status})." }
        val result = json.decodeFromString<RatingWriteResponse>(response.body)
        val accepted = if (rating == null) result.deleted else result.added
        check((if (movie) accepted?.movies else accepted?.shows) == 1) { "Trakt did not accept this title's rating." }
    }

    private fun sameIds(left: TraktExternalIds, right: TraktExternalIds?): Boolean = right != null && (
        (!left.imdb.isNullOrBlank() && left.imdb == right.imdb) ||
            (left.tmdb != null && left.tmdb == right.tmdb) ||
            (left.trakt != null && left.trakt == right.trakt)
        )
}
