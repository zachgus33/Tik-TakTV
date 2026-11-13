package com.nuvio.app.features.tiktak

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.NuvioPosterCard
import com.nuvio.app.core.ui.NuvioPosterShape
import com.nuvio.app.core.ui.NuvioTvTextField
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.core.ui.tikTakTvFocus
import com.nuvio.app.features.watchprogress.WatchProgressRepository
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class TikTakYouTubeItem(
    val videoId: String? = null,
    val playlistId: String? = null,
    val kind: String? = null,
    val title: String = "YouTube",
    val channel: String? = null,
    val thumbnail: String? = null,
    val itemCount: Int? = null,
)

@Serializable
private data class TikTakYouTubeSubscription(
    val id: String,
    val title: String,
    val thumbnail: String? = null,
)

@Serializable
private data class YouTubeSearchResponse(
    val results: List<TikTakYouTubeItem> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class YouTubeAccountResponse(
    val connected: Boolean = false,
    val videoFeed: List<TikTakYouTubeItem> = emptyList(),
    val recentFeed: List<TikTakYouTubeItem> = emptyList(),
    val subscriptionFeed: List<TikTakYouTubeItem> = emptyList(),
    val historyFeed: List<TikTakYouTubeItem> = emptyList(),
    val musicFeed: List<TikTakYouTubeItem> = emptyList(),
    val activity: List<TikTakYouTubeItem> = emptyList(),
    val playlists: List<TikTakYouTubeItem> = emptyList(),
    val subscriptions: List<TikTakYouTubeSubscription> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class YouTubeAccountRequest(
    val summary: Boolean = false,
    val refresh: Boolean = false,
    val recentVideoIds: List<String> = emptyList(),
)

private val YouTubeJson = Json { ignoreUnknownKeys = true }
private val YouTubeVideoIdPattern = Regex("^[A-Za-z0-9_-]{11}$")

@Composable
fun TikTakYouTubeScreen(
    onPlay: (TikTakYouTubeItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var query by rememberSaveable { mutableStateOf("") }
    var kind by rememberSaveable { mutableStateOf("video") }
    var section by rememberSaveable { mutableStateOf("forYou") }
    var accountItems by remember { mutableStateOf<List<TikTakYouTubeItem>>(emptyList()) }
    var recentItems by remember { mutableStateOf<List<TikTakYouTubeItem>>(emptyList()) }
    var subscriptionItems by remember { mutableStateOf<List<TikTakYouTubeItem>>(emptyList()) }
    var historyItems by remember { mutableStateOf<List<TikTakYouTubeItem>>(emptyList()) }
    var playlistItems by remember { mutableStateOf<List<TikTakYouTubeItem>>(emptyList()) }
    var subscriptions by remember { mutableStateOf<List<TikTakYouTubeSubscription>>(emptyList()) }
    var results by remember { mutableStateOf<List<TikTakYouTubeItem>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var accountLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun localHistory(): List<TikTakYouTubeItem> =
        WatchProgressRepository.uiState.value.entries
            .asSequence()
            .filter { it.contentType.equals("youtube", ignoreCase = true) || it.parentMetaId.startsWith("youtube:", ignoreCase = true) }
            .filter { YouTubeVideoIdPattern.matches(it.videoId) }
            .sortedByDescending { it.lastUpdatedEpochMs }
            .map { entry ->
                TikTakYouTubeItem(
                    videoId = entry.videoId,
                    kind = "video",
                    title = entry.title,
                    channel = entry.providerName ?: "YouTube",
                    thumbnail = entry.poster ?: "https://i.ytimg.com/vi/${entry.videoId}/hqdefault.jpg",
                )
            }
            .distinctBy(TikTakYouTubeItem::stableKey)
            .take(MAX_VISIBLE_YOUTUBE_ITEMS)
            .toList()

    suspend fun loadAccount(refresh: Boolean = false) {
        accountLoading = true
        runCatching {
            val recentVideoIds = localHistory()
                .mapNotNull(TikTakYouTubeItem::videoId)
                .take(40)
            val body = YouTubeJson.encodeToString(YouTubeAccountRequest(refresh = refresh, recentVideoIds = recentVideoIds))
            val response = TikTakServiceClient.post("/youtube/account", body)
            val payload = YouTubeJson.decodeFromString<YouTubeAccountResponse>(response.body)
            if (response.status !in 200..299) error(payload.error ?: "YouTube account could not be loaded.")
            payload
        }.onSuccess { payload ->
            // Account feeds can repeat the same upload across subscriptions and
            // activity. Duplicate LazyRow keys crash Compose on low-memory TV
            // devices, and unbounded artwork decoding can freeze Fire TV.
            accountItems = (if (kind == "music") payload.musicFeed else payload.videoFeed.ifEmpty { payload.activity })
                .distinctBy(TikTakYouTubeItem::stableKey)
                .take(MAX_YOUTUBE_FEED_ITEMS)
            recentItems = if (kind == "video") payload.recentFeed
                .distinctBy(TikTakYouTubeItem::stableKey)
                .take(MAX_VISIBLE_YOUTUBE_ITEMS) else emptyList()
            subscriptionItems = payload.subscriptionFeed.distinctBy(TikTakYouTubeItem::stableKey)
                .take(MAX_VISIBLE_YOUTUBE_ITEMS)
            historyItems = (localHistory() + payload.historyFeed).distinctBy(TikTakYouTubeItem::stableKey)
                .take(MAX_VISIBLE_YOUTUBE_ITEMS)
            playlistItems = payload.playlists
                .filter { item -> item.kind == null || item.kind == kind }
                .distinctBy(TikTakYouTubeItem::stableKey)
                .take(MAX_VISIBLE_YOUTUBE_ITEMS)
            subscriptions = if (kind == "video") payload.subscriptions.take(MAX_VISIBLE_YOUTUBE_ITEMS) else emptyList()
        }
            .onFailure {
                error = it.message
                historyItems = localHistory()
            }
        accountLoading = false
    }

    fun search() {
        if (query.isBlank() || loading) return
        scope.launch {
            loading = true
            error = null
            runCatching {
                val body = YouTubeJson.encodeToString(
                    mapOf("query" to query.trim(), "kind" to kind),
                )
                val response = TikTakServiceClient.post("/youtube/search", body)
                val payload = YouTubeJson.decodeFromString<YouTubeSearchResponse>(response.body)
                if (response.status !in 200..299) error(payload.error ?: "YouTube search failed.")
                payload.results
            }.onSuccess { items ->
                results = items
                    .distinctBy(TikTakYouTubeItem::stableKey)
                    .take(MAX_VISIBLE_YOUTUBE_ITEMS)
            }
                .onFailure { error = it.message }
            loading = false
        }
    }

    fun loadSubscription(subscription: TikTakYouTubeSubscription) {
        if (loading) return
        scope.launch {
            loading = true
            error = null
            runCatching {
                val body = YouTubeJson.encodeToString(
                    mapOf("channelId" to subscription.id, "kind" to "video"),
                )
                val response = TikTakServiceClient.post("/youtube/search", body)
                val payload = YouTubeJson.decodeFromString<YouTubeSearchResponse>(response.body)
                if (response.status !in 200..299) error(payload.error ?: "Subscription could not be loaded.")
                payload.results
            }.onSuccess { items ->
                results = items.distinctBy(TikTakYouTubeItem::stableKey).take(MAX_VISIBLE_YOUTUBE_ITEMS)
                query = subscription.title
            }.onFailure { error = it.message }
            loading = false
        }
    }

    LaunchedEffect(kind) {
        accountItems = emptyList()
        recentItems = emptyList()
        subscriptionItems = emptyList()
        historyItems = emptyList()
        playlistItems = emptyList()
        subscriptions = emptyList()
        loadAccount(false)
    }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 40.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item {
            Text(
                text = if (kind == "music") "YouTube Music" else "YouTube",
                style = MaterialTheme.typography.displaySmall,
                color = MaterialTheme.nuvio.colors.textPrimary,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "Search and play inside TikTak TV.",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.nuvio.colors.textMuted,
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                listOf("video" to "Videos", "music" to "Music").forEach { (value, label) ->
                    Button(
                        onClick = { kind = value },
                        modifier = Modifier.tikTakTvFocus(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (kind == value) MaterialTheme.nuvio.colors.accent else MaterialTheme.nuvio.colors.surface,
                        ),
                        shape = RoundedCornerShape(12.dp),
                    ) { Text(label) }
                }
                Button(
                    onClick = { scope.launch { loadAccount(true) } },
                    enabled = !accountLoading,
                    modifier = Modifier.tikTakTvFocus(),
                    shape = RoundedCornerShape(12.dp),
                ) { Text(if (accountLoading) "Refreshing…" else "Refresh suggestions") }
            }
        }
        if (kind == "video") {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    listOf("forYou" to "For You", "playlists" to "My Playlists", "subscriptions" to "Subscriptions", "history" to "History")
                        .forEach { (value, label) ->
                            Button(
                                onClick = { section = value },
                                modifier = Modifier.tikTakTvFocus(),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (section == value) MaterialTheme.nuvio.colors.accent else MaterialTheme.nuvio.colors.surface,
                                ),
                                shape = RoundedCornerShape(12.dp),
                            ) { Text(label) }
                        }
                }
            }
        }
        item {
            Row(modifier = Modifier.fillMaxWidth()) {
                NuvioTvTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Search ${if (kind == "music") "music" else "videos"}") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                Spacer(modifier = Modifier.width(12.dp))
                Button(
                    onClick = ::search,
                    modifier = Modifier.height(56.dp).tikTakTvFocus(),
                ) {
                    Text("Search")
                }
            }
        }
        if (loading) {
            item { CircularProgressIndicator(color = MaterialTheme.nuvio.colors.accent) }
        }
        error?.let { message ->
            item { Text(message, color = MaterialTheme.colorScheme.error) }
        }
        if (results.isNotEmpty()) {
            item { YouTubeRow("Search results", results, onPlay) }
        }
        if ((kind == "music" || section == "forYou") && accountItems.isNotEmpty()) {
            item { YouTubeRow(if (kind == "music") "Your music" else "For You", accountItems, onPlay) }
        } else if (kind == "video" && section == "forYou" && !accountLoading) {
            item {
                Text("For You", style = MaterialTheme.typography.titleLarge)
                Text("No suggestions yet. Refresh suggestions or search for a video.")
            }
        }
        if (kind == "video" && section == "forYou" && recentItems.isNotEmpty()) {
            item { YouTubeRow("Related uploads from channels you watched", recentItems, onPlay) }
        }
        if ((kind == "music" || section == "playlists") && playlistItems.isNotEmpty()) {
            item { YouTubeRow(if (kind == "music") "Saved music & playlists" else "Your playlists & Watch Later", playlistItems, onPlay) }
        }
        if (kind == "video" && section == "subscriptions" && subscriptionItems.isNotEmpty()) {
            item { YouTubeRow("Latest from your subscriptions", subscriptionItems, onPlay) }
        }
        if (kind == "video" && section == "subscriptions" && subscriptions.isNotEmpty()) {
            item { YouTubeSubscriptionRow(subscriptions, ::loadSubscription) }
        }
        if (kind == "video" && section == "history" && historyItems.isNotEmpty()) {
            item { YouTubeRow("Watch history", historyItems, onPlay) }
        }
    }
}

@Composable
private fun YouTubeSubscriptionRow(
    subscriptions: List<TikTakYouTubeSubscription>,
    onClick: (TikTakYouTubeSubscription) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            text = "Subscriptions",
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.nuvio.colors.textPrimary,
            fontWeight = FontWeight.Bold,
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            items(subscriptions, key = TikTakYouTubeSubscription::id) { subscription ->
                NuvioPosterCard(
                    title = subscription.title,
                    imageUrl = subscription.thumbnail,
                    shape = NuvioPosterShape.Landscape,
                    detailLine = "Subscription",
                    onClick = { onClick(subscription) },
                )
            }
        }
    }
}

@Composable
private fun YouTubeRow(
    title: String,
    items: List<TikTakYouTubeItem>,
    onPlay: (TikTakYouTubeItem) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.nuvio.colors.textPrimary,
            fontWeight = FontWeight.Bold,
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            items(items, key = TikTakYouTubeItem::stableKey) { item ->
                NuvioPosterCard(
                    title = item.title,
                    imageUrl = item.thumbnail,
                    shape = NuvioPosterShape.Landscape,
                    detailLine = item.channel,
                    onClick = { onPlay(item) },
                )
            }
        }
    }
}

private fun TikTakYouTubeItem.stableKey(): String =
    videoId?.takeIf(String::isNotBlank)?.let { "video:$it" }
        ?: playlistId?.takeIf(String::isNotBlank)?.let { "playlist:$it" }
        ?: "title:${title.trim().lowercase()}:${channel.orEmpty().trim().lowercase()}"

private const val MAX_VISIBLE_YOUTUBE_ITEMS = 72
private const val MAX_YOUTUBE_FEED_ITEMS = 160
