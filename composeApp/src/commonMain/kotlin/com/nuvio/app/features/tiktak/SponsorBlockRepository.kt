package com.nuvio.app.features.tiktak

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

internal data class SponsorBlockCategory(val id: String, val title: String)

internal val sponsorBlockCategories = listOf(
    SponsorBlockCategory("sponsor", "Sponsors"),
    SponsorBlockCategory("selfpromo", "Self-promotion"),
    SponsorBlockCategory("interaction", "Interaction reminders"),
    SponsorBlockCategory("intro", "Introductions"),
    SponsorBlockCategory("outro", "End cards and credits"),
    SponsorBlockCategory("preview", "Previews and recaps"),
    SponsorBlockCategory("music_offtopic", "Non-music sections"),
)

@Serializable
internal data class SponsorBlockPreferences(
    val enabled: Boolean = true,
    val categories: Set<String> = sponsorBlockCategories.mapTo(linkedSetOf()) { it.id },
)

@Serializable
internal data class SponsorBlockSegment(val start: Double, val end: Double, val category: String)

@Serializable
private data class SponsorBlockResponse(val segments: List<SponsorBlockSegment> = emptyList())

internal object SponsorBlockRepository {
    private val json = Json { ignoreUnknownKeys = true }
    private val _state = MutableStateFlow(SponsorBlockPreferences())
    val state = _state.asStateFlow()
    private var loaded = false

    fun ensureLoaded() {
        if (loaded) return
        loaded = true
        val valid = sponsorBlockCategories.mapTo(setOf()) { it.id }
        _state.value = runCatching {
            json.decodeFromString<SponsorBlockPreferences>(SponsorBlockStorage.load().orEmpty())
        }.getOrDefault(SponsorBlockPreferences()).let { it.copy(categories = it.categories.intersect(valid)) }
    }

    fun setEnabled(enabled: Boolean) {
        ensureLoaded()
        update(_state.value.copy(enabled = enabled))
    }

    fun setCategory(category: String, enabled: Boolean) {
        ensureLoaded()
        if (sponsorBlockCategories.none { it.id == category }) return
        update(_state.value.copy(categories = if (enabled) _state.value.categories + category else _state.value.categories - category))
    }

    private fun update(preferences: SponsorBlockPreferences) {
        ensureLoaded()
        _state.value = preferences
        SponsorBlockStorage.save(json.encodeToString(preferences))
    }

    suspend fun segments(videoId: String): List<SponsorBlockSegment> {
        if (!Regex("^[A-Za-z0-9_-]{11}$").matches(videoId)) return emptyList()
        val response = runCatching {
            TikTakServiceClient.post("/sponsorblock", json.encodeToString(mapOf("videoId" to videoId)))
        }.getOrNull() ?: return emptyList()
        if (response.status !in 200..299) return emptyList()
        return runCatching { json.decodeFromString<SponsorBlockResponse>(response.body).segments }
            .getOrDefault(emptyList())
            .filter { it.start >= 0.0 && it.end > it.start && it.end.isFinite() }
    }
}

internal expect object SponsorBlockStorage {
    fun load(): String?
    fun save(payload: String)
}
