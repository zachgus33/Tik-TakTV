package com.nuvio.app.features.tiktak

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.livetv.LiveTvChannel
import com.nuvio.app.features.livetv.LiveTvRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private data class NativeScoreTeam(val name: String, val score: String)

private data class NativeScoreEvent(
    val id: String,
    val sport: String,
    val league: String,
    val name: String,
    val detail: String,
    val state: String,
    val teams: List<NativeScoreTeam>,
)

private val SportsJson = Json { ignoreUnknownKeys = true }
private val ScoreFeeds = listOf(
    Triple("football", "football/nfl", "NFL"),
    Triple("football", "football/college-football", "College Football"),
    Triple("basketball", "basketball/nba", "NBA"),
    Triple("basketball", "basketball/wnba", "WNBA"),
    Triple("hockey", "hockey/nhl", "NHL"),
    Triple("baseball", "baseball/mlb", "MLB"),
    Triple("soccer", "soccer/eng.1", "Premier League"),
    Triple("soccer", "soccer/usa.1", "MLS"),
    Triple("fighting", "mma/ufc", "UFC"),
)

@Composable
fun TikTakSportsScreen(
    onChannelClick: (LiveTvChannel) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val liveState by LiveTvRepository.uiState.collectAsState()
    var scores by remember { mutableStateOf<List<NativeScoreEvent>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var sportFilter by remember { mutableStateOf("all") }
    var countryFilter by remember { mutableStateOf("All countries") }

    val liveEvents = remember(liveState.channels, liveState.currentProgrammes) {
        liveState.channels.mapNotNull { channel ->
            val programme = liveState.currentProgrammes[channel.tvgId]
                ?: liveState.currentProgrammes[channel.id]
            val searchable = "${programme?.title.orEmpty()} ${channel.name} ${channel.group}".lowercase()
            if (SportsKeywords.any(searchable::contains)) channel to programme?.title else null
        }
    }
    val countries = remember(liveEvents) {
        listOf("All countries") + liveEvents.mapNotNull { (channel, _) ->
            channel.group.substringBefore('|').substringBefore(':').trim().takeIf { it.length in 2..28 }
        }.distinct().sorted()
    }
    val visibleLiveEvents = liveEvents.filter { (channel, title) ->
        val searchable = "${title.orEmpty()} ${channel.name} ${channel.group}".lowercase()
        (sportFilter == "all" || searchable.contains(sportFilter)) &&
            (countryFilter == "All countries" || channel.group.contains(countryFilter, ignoreCase = true))
    }
    val visibleScores = scores.filter { sportFilter == "all" || it.sport == sportFilter }

    fun refreshScores() {
        if (loading) return
        scope.launch {
            loading = true
            error = null
            runCatching { loadNativeScores() }
                .onSuccess { scores = it }
                .onFailure { error = it.message ?: "Scores could not be loaded." }
            loading = false
        }
    }

    LaunchedEffect(Unit) { refreshScores() }

    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 40.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text(
                        text = "Sports & scores",
                        style = MaterialTheme.typography.displaySmall,
                        color = MaterialTheme.nuvio.colors.textPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "Live scores first, followed by sports from your IPTV provider.",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.nuvio.colors.textMuted,
                    )
                }
                Button(onClick = ::refreshScores) { Text("Refresh scores") }
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(listOf("all", "football", "basketball", "baseball", "hockey", "soccer", "fighting")) { sport ->
                    Button(
                        onClick = { sportFilter = sport },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (sportFilter == sport) MaterialTheme.nuvio.colors.accent else MaterialTheme.nuvio.colors.surface,
                        ),
                    ) { Text(if (sport == "all") "All sports" else sport.replaceFirstChar { it.uppercase() }) }
                }
            }
        }
        if (countries.size > 1) {
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(countries) { country ->
                        Button(
                            onClick = { countryFilter = country },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (countryFilter == country) MaterialTheme.nuvio.colors.accent else MaterialTheme.nuvio.colors.surface,
                            ),
                        ) { Text(country) }
                    }
                }
            }
        }
        if (loading && scores.isEmpty()) item { CircularProgressIndicator(color = MaterialTheme.nuvio.colors.accent) }
        error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
        if (visibleScores.isNotEmpty()) {
            item { SectionTitle("Live and recent scores") }
            items(visibleScores, key = { "score:${it.id}" }) { event -> ScoreCard(event) }
        }
        item { SectionTitle("Live and upcoming on your channels") }
        if (visibleLiveEvents.isEmpty()) {
            item {
                Text(
                    text = if (liveState.channels.isEmpty()) "Your IPTV provider is still syncing or has no channels." else "No matching sports programmes are listed right now.",
                    color = MaterialTheme.nuvio.colors.textMuted,
                )
            }
        } else {
            items(visibleLiveEvents, key = { "channel:${it.first.id}:${it.second}" }) { (channel, title) ->
                FocusCard(onClick = { onChannelClick(channel) }) {
                    Text(
                        text = title ?: channel.name,
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.nuvio.colors.textPrimary,
                        fontWeight = FontWeight.Bold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = "${channel.name}${channel.group.takeIf(String::isNotBlank)?.let { " • $it" }.orEmpty()}",
                        color = MaterialTheme.nuvio.colors.textMuted,
                    )
                }
            }
        }
    }
}

@Composable
private fun ScoreCard(event: NativeScoreEvent) {
    FocusCard(onClick = {}) {
        Text("${event.league} • ${event.detail}", color = MaterialTheme.nuvio.colors.accent, fontWeight = FontWeight.Bold)
        Text(event.name, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.nuvio.colors.textPrimary)
        event.teams.forEach { team ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(team.name, color = MaterialTheme.nuvio.colors.textPrimary)
                Text(team.score, color = MaterialTheme.nuvio.colors.textPrimary, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun FocusCard(onClick: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 1000.dp)
            .onFocusChanged { focused = it.hasFocus }
            .border(if (focused) 4.dp else 1.dp, if (focused) Color(0xFFFF4F9A) else MaterialTheme.nuvio.colors.borderDefault, RoundedCornerShape(16.dp))
            .background(MaterialTheme.nuvio.colors.surface, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) { content() }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.nuvio.colors.textPrimary, fontWeight = FontWeight.Bold)
}

private suspend fun loadNativeScores(): List<NativeScoreEvent> = coroutineScope {
    ScoreFeeds.map { (sport, path, league) ->
        async {
            runCatching {
                val raw = httpGetText("https://site.api.espn.com/apis/site/v2/sports/$path/scoreboard?limit=250")
                parseScoreEvents(raw, sport, league)
            }.getOrDefault(emptyList())
        }
    }.awaitAll().flatten().distinctBy(NativeScoreEvent::id).sortedWith(
        compareBy<NativeScoreEvent> { if (it.state == "in") 0 else if (it.state == "pre") 1 else 2 }
            .thenBy(NativeScoreEvent::league),
    )
}

private fun parseScoreEvents(raw: String, sport: String, fallbackLeague: String): List<NativeScoreEvent> {
    val root = SportsJson.parseToJsonElement(raw).jsonObject
    val league = root.array("leagues").firstObject()?.string("name") ?: fallbackLeague
    return root.array("events").mapNotNull { element ->
        val event = runCatching { element.jsonObject }.getOrNull() ?: return@mapNotNull null
        val competition = event.array("competitions").firstObject() ?: return@mapNotNull null
        val status = event.objectValue("status")
        val type = status?.objectValue("type")
        val teams = competition.array("competitors").mapNotNull { sideElement ->
            val side = runCatching { sideElement.jsonObject }.getOrNull() ?: return@mapNotNull null
            val team = side.objectValue("team") ?: return@mapNotNull null
            NativeScoreTeam(
                name = team.string("displayName") ?: team.string("name") ?: "Team",
                score = side.string("score").orEmpty(),
            )
        }
        NativeScoreEvent(
            id = event.string("id") ?: return@mapNotNull null,
            sport = sport,
            league = league,
            name = event.string("shortName") ?: event.string("name") ?: "Game",
            detail = type?.string("shortDetail") ?: type?.string("detail") ?: "",
            state = type?.string("state") ?: "pre",
            teams = teams,
        )
    }
}

private fun JsonObject.array(key: String): JsonArray = runCatching { get(key)?.jsonArray }.getOrNull() ?: JsonArray(emptyList())
private fun JsonArray.firstObject(): JsonObject? = firstOrNull()?.let { runCatching { it.jsonObject }.getOrNull() }
private fun JsonObject.objectValue(key: String): JsonObject? = runCatching { get(key)?.jsonObject }.getOrNull()
private fun JsonObject.string(key: String): String? = runCatching { get(key)?.jsonPrimitive?.contentOrNull }.getOrNull()

private val SportsKeywords = listOf(
    "football", "basketball", "baseball", "hockey", "soccer", "tennis", "golf", "ufc", "mma", "boxing", "racing", "formula 1", "grand prix", "nfl", "nba", "nhl", "mlb", "match", " vs ",
)

