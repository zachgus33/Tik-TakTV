package com.nuvio.app.features.tracking

import com.nuvio.app.features.addons.httpRequestRaw
import com.nuvio.app.features.profiles.ProfileRepository
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

data class AniListMediaState(val id: Int, val progress: Int, val episodes: Int?,
    val format: String, val status: String, val rating: Int?)

object AniListRepository {
    private val json = Json { ignoreUnknownKeys = true }
    private val query = "query(\$id:Int,\$idMal:Int){Media(id:\$id,idMal:\$idMal,type:ANIME){id episodes format mediaListEntry{id status progress score(format:POINT_10)}}}"

    fun canTrack(id: String): Boolean = id.matches(Regex("(?i)(anilist|mal):[1-9][0-9]*"))

    suspend fun getMedia(profileId: Int, id: String): AniListMediaState? {
        if (!canTrack(id)) return null
        val number = id.substringAfter(':').toIntOrNull() ?: return null
        val variables = buildJsonObject {
            put(if (id.startsWith("mal:", true)) "idMal" else "id", number)
        }
        val media = request(profileId, query, variables)["Media"] as? JsonObject ?: return null
        val entry = media["mediaListEntry"] as? JsonObject
        return AniListMediaState(
            id = media["id"]?.jsonPrimitive?.intOrNull ?: return null,
            progress = entry?.get("progress")?.jsonPrimitive?.intOrNull ?: 0,
            episodes = media["episodes"]?.jsonPrimitive?.intOrNull,
            format = media["format"]?.jsonPrimitive?.content.orEmpty(),
            status = entry?.get("status")?.jsonPrimitive?.content.orEmpty(),
            rating = entry?.get("score")?.jsonPrimitive?.doubleOrNull?.toInt()?.takeIf { it > 0 },
        )
    }

    suspend fun rate(profileId: Int, id: String, rating: Int?) {
        require(rating == null || rating in 1..10) { "Choose a rating from 1 to 10." }
        val media = getMedia(profileId, id) ?: error("This title has no AniList anime ID.")
        request(profileId,
            "mutation(\$id:Int!,\$scoreRaw:Int!){SaveMediaListEntry(mediaId:\$id,scoreRaw:\$scoreRaw){id}}",
            buildJsonObject { put("id", media.id); put("scoreRaw", (rating ?: 0) * 10) })
    }

    suspend fun recordCompleted(profileId: Int, id: String, episode: Int?) {
        ExternalTrackingRepository.ensureLoaded()
        if (profileId != ProfileRepository.activeProfileId ||
            !ExternalTrackingRepository.state.value.anilistProgressEnabled) return
        val media = getMedia(profileId, id) ?: return
        val watched = if (media.format == "MOVIE") 1 else episode ?: return
        if (watched <= media.progress || media.status == "COMPLETED") return
        request(profileId,
            "mutation(\$id:Int!,\$progress:Int!,\$status:MediaListStatus!){SaveMediaListEntry(mediaId:\$id,progress:\$progress,status:\$status){id}}",
            buildJsonObject {
                put("id", media.id)
                put("progress", watched)
                put("status", if (media.format == "MOVIE" ||
                    (media.episodes != null && watched >= media.episodes)) "COMPLETED" else "CURRENT")
            })
    }

    private suspend fun request(profileId: Int, query: String, variables: JsonObject): JsonObject {
        val headers = ExternalTrackingRepository.anilistHeaders(profileId) ?: error("Connect AniList in Settings first.")
        val body = buildJsonObject { put("query", query); put("variables", variables) }
        val response = httpRequestRaw("POST", "https://graphql.anilist.co", headers, body.toString())
        check(response.status in 200..299) { "AniList request failed (HTTP ${response.status})." }
        val result = json.parseToJsonElement(response.body).jsonObject
        check(result["errors"] == null) { "AniList could not process this anime." }
        return result["data"]?.jsonObject ?: error("AniList returned no data.")
    }
}
