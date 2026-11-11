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
    val musicFeed: List<TikTakYouTubeItem> = emptyList(),
    val activity: List<TikTakYouTubeItem> = emptyList(),
    val playlists: List<TikTakYouTubeItem> = emptyList(),
    val subscriptions: List<TikTakYouTubeSubscription> = emptyList(),
    val error: String? = null,
)

private val YouTubeJson = Json { ignoreUnknownKeys = true }

@Composable
fun TikTakYouTubeScreen(
    onPlay: (TikTakYouTubeItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var query by rememberSaveable { mutableStateOf("") }
    var kind by rememberSaveable { mutableStateOf("video") }
    var accountItems by remember { mutableStateOf<List<TikTakYouTubeItem>>(emptyList()) }
    var playlistItems by remember { mutableStateOf<List<TikTakYouTubeItem>>(emptyList()) }
    var subscriptions by remember { mutableStateOf<List<TikTakYouTubeSubscription>>(emptyList()) }
    var results by remember { mutableStateOf<List<TikTakYouTubeItem>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun loadAccount() {
        runCatching {
            val response = TikTakServiceClient.post("/youtube/account", "{\"summary\":false}")
            val payload = YouTubeJson.decodeFromString<YouTubeAccountResponse>(response.body)
            if (response.status !in 200..299) error(payload.error ?: "YouTube account could not be loaded.")
            payload
        }.onSuccess { payload ->
            // Account feeds can repeat the same upload across subscriptions and
            // activity. Duplicate LazyRow keys crash Compose on low-memory TV
            // devices, and unbounded artwork decoding can freeze Fire TV.
            accountItems = (if (kind == "music") payload.musicFeed else payload.videoFeed.ifEmpty { payload.activity })
                .distinctBy(TikTakYouTubeItem::stableKey)
                .take(MAX_VISIBLE_YOUTUBE_ITEMS)
            playlistItems = payload.playlists
                .filter { item -> item.kind == null || item.kind == kind }
                .distinctBy(TikTakYouTubeItem::stableKey)
                .take(MAX_VISIBLE_YOUTUBE_ITEMS)
            subscriptions = if (kind == "video") payload.subscriptions.take(MAX_VISIBLE_YOUTUBE_ITEMS) else emptyList()
        }
            .onFailure { error = it.message }
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
        playlistItems = emptyList()
        subscriptions = emptyList()
        loadAccount()
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
        if (accountItems.isNotEmpty()) {
            item { YouTubeRow(if (kind == "music") "Your music" else "Videos for you", accountItems, onPlay) }
        }
        if (playlistItems.isNotEmpty()) {
            item { YouTubeRow(if (kind == "music") "Saved music & playlists" else "Your playlists & Watch Later", playlistItems, onPlay) }
        }
        if (subscriptions.isNotEmpty()) {
            item { YouTubeSubscriptionRow(subscriptions, ::loadSubscription) }
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
