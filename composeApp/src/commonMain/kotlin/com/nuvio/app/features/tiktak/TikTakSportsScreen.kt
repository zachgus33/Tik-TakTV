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
import androidx.compose.foundation.layout.size
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
import coil3.compose.AsyncImage
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.core.ui.NuvioToastController
import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.livetv.LiveTvChannel
import com.nuvio.app.features.livetv.LiveTvProgramme
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
import io.ktor.util.date.GMTDate

data class NativeScoreTeam(
    val name: String,
    val score: String,
    val logoUrl: String? = null,
    val record: String? = null,
)

data class NativeScoreEvent(
    val id: String,
    val sport: String,
    val league: String,
    val name: String,
    val detail: String,
    val state: String,
    val teams: List<NativeScoreTeam>,
    val venue: String? = null,
    val broadcast: String? = null,
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
private var scoreCache: List<NativeScoreEvent> = emptyList()
private var scoreCacheTimeMs: Long = 0L

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
    val visibleLiveEvents = remember(liveEvents, sportFilter, countryFilter) {
        liveEvents.asSequence().filter { (channel, title) ->
            val searchable = "${title.orEmpty()} ${channel.name} ${channel.group}".lowercase()
            (sportFilter == "all" || searchable.contains(sportFilter)) &&
                (countryFilter == "All countries" || channel.group.contains(countryFilter, ignoreCase = true))
        }.take(MAX_VISIBLE_SPORT_CHANNELS).toList()
    }
    val visibleScores = remember(scores, sportFilter) {
        scores.asSequence()
            .filter { sportFilter == "all" || it.sport == sportFilter }
            .take(MAX_VISIBLE_SCORE_EVENTS)
            .toList()
    }

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
            items(visibleScores, key = { "score:${it.id}" }) { event ->
                val matchedChannel = findScoreChannel(
                    event = event,
                    channels = liveState.channels,
                    currentProgrammes = liveState.currentProgrammes,
                )
                ScoreCard(
                    event = event,
                    matchedChannelName = matchedChannel?.name,
                    onClick = {
                        if (matchedChannel != null) {
                            onChannelClick(matchedChannel)
                        } else {
                            NuvioToastController.show(
                                if (liveState.channels.isEmpty()) {
                                    "Live TV is still syncing. Try this score again when your channels are ready."
                                } else {
                                    "No live channel carrying ${event.name} was found in your IPTV guide."
                                },
                            )
                        }
                    },
                )
            }
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
private fun ScoreCard(
    event: NativeScoreEvent,
    matchedChannelName: String?,
    onClick: () -> Unit,
) {
    FocusCard(onClick = onClick) {
        Text("${event.league} • ${event.detail}", color = MaterialTheme.nuvio.colors.accent, fontWeight = FontWeight.Bold)
        Text(event.name, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.nuvio.colors.textPrimary)
        event.teams.forEach { team ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    team.logoUrl?.let { logo ->
                        AsyncImage(
                            model = logo,
                            contentDescription = null,
                            modifier = Modifier.size(28.dp),
                        )
                    }
                    Column {
                        Text(team.name, color = MaterialTheme.nuvio.colors.textPrimary)
                        team.record?.let { Text(it, color = MaterialTheme.nuvio.colors.textMuted) }
                    }
                }
                Text(team.score, color = MaterialTheme.nuvio.colors.textPrimary, fontWeight = FontWeight.Bold)
            }
        }
        val context = listOfNotNull(event.broadcast, event.venue).joinToString(" • ")
        if (context.isNotBlank()) Text(context, color = MaterialTheme.nuvio.colors.textMuted)
        Text(
            text = matchedChannelName?.let { "Press OK to watch on $it" }
                ?: "Press OK to look for this game in your Live TV guide",
            color = if (matchedChannelName != null) MaterialTheme.nuvio.colors.accent else MaterialTheme.nuvio.colors.textMuted,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

fun findScoreChannel(
    event: NativeScoreEvent,
    channels: List<LiveTvChannel>,
    currentProgrammes: Map<String, LiveTvProgramme>,
): LiveTvChannel? {
    if (channels.isEmpty()) return null
    val eventTokens = normalizedSportsTokens(event.name + " " + event.teams.joinToString(" ") { it.name })
    val teamTokenSets = event.teams.map { normalizedSportsTokens(it.name) }.filter(Set<String>::isNotEmpty)
    val broadcastTokens = normalizedBroadcastTokens(event.broadcast.orEmpty())

    return channels.asSequence()
        .mapNotNull { channel ->
            val programme = channel.tvgId?.let(currentProgrammes::get) ?: currentProgrammes[channel.id]
            val programmeText = normalizeSportsText(programme?.title.orEmpty())
            val channelText = normalizeSportsText("${channel.name} ${channel.group}")
            val programmeTokens = normalizedSportsTokens(programmeText)
            val matchingTeams = teamTokenSets.count { team ->
                val required = if (team.size <= 1) 1 else 2
                team.count(programmeTokens::contains) >= required
            }
            val programmeOverlap = eventTokens.count(programmeTokens::contains)
            val channelTokens = normalizedSportsTokens(channelText)
            val broadcastOverlap = broadcastTokens.count(channelTokens::contains)
            val broadcastMatch = broadcastTokens.isNotEmpty() && broadcastOverlap == broadcastTokens.size

            // A guide title carrying the teams is the strongest signal. If an
            // IPTV guide is generic or missing, the score feed's named network
            // is still a deterministic route to the user's matching channel.
            if (matchingTeams == 0 && programmeOverlap < 2 && !broadcastMatch) {
                return@mapNotNull null
            }
            val score = matchingTeams * 100 + programmeOverlap * 8 +
                (if (broadcastMatch) 35 + broadcastOverlap * 5 else 0) +
                (if (programme != null) 10 else 0)
            channel to score
        }
        .maxByOrNull { it.second }
        ?.first
}

private fun normalizeSportsText(value: String): String = value
    .lowercase()
    .replace(Regex("[^a-z0-9]+"), " ")
    .trim()

private fun normalizedSportsTokens(value: String): Set<String> = normalizeSportsText(value)
    .split(' ')
    .asSequence()
    .filter { it.length >= 3 && it !in SportsMatchStopWords }
    .toSet()

private fun normalizedBroadcastTokens(value: String): Set<String> = normalizedSportsTokens(value)
    .filterNot { it in BroadcastMatchStopWords }
    .toSet()

private val SportsMatchStopWords = setOf(
    "the", "and", "for", "game", "live", "college", "football", "basketball", "baseball", "hockey", "soccer",
)

private val BroadcastMatchStopWords = setOf(
    "network", "channel", "sports", "plus", "hd", "uhd", "east", "west", "national",
)

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
    val now = GMTDate().timestamp
    if (scoreCache.isNotEmpty() && now - scoreCacheTimeMs < SCORE_CACHE_TTL_MS) return@coroutineScope scoreCache
    val dates = listOf(espnDate(now - TWELVE_HOURS_MS), espnDate(now + TWELVE_HOURS_MS)).distinct()
    val loaded = ScoreFeeds.flatMap { (sport, path, league) ->
        dates.map { date ->
            async {
                runCatching {
                    val raw = httpGetText(
                        "https://site.api.espn.com/apis/site/v2/sports/$path/scoreboard?dates=$date&limit=500",
                    )
                    parseScoreEvents(raw, sport, league)
                }.getOrDefault(emptyList())
            }
        }
    }.awaitAll().flatten().distinctBy(NativeScoreEvent::id).sortedWith(
        compareBy<NativeScoreEvent> { if (it.state == "in") 0 else if (it.state == "pre") 1 else 2 }
            .thenBy(NativeScoreEvent::league),
    )
    if (loaded.isNotEmpty()) {
        scoreCache = loaded
        scoreCacheTimeMs = now
    }
    loaded.ifEmpty { scoreCache }
}

private fun espnDate(epochMs: Long): String {
    val date = GMTDate(epochMs)
    return buildString(8) {
        append(date.year)
        append((date.month.ordinal + 1).toString().padStart(2, '0'))
        append(date.dayOfMonth.toString().padStart(2, '0'))
    }
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
                logoUrl = team.string("logo"),
                record = side.array("records").firstObject()?.string("summary"),
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
            venue = competition.objectValue("venue")?.string("fullName"),
            broadcast = competition.array("broadcasts").firstObject()
                ?.array("names")
                ?.firstOrNull()
                ?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() },
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

private const val MAX_VISIBLE_SCORE_EVENTS = 120
private const val MAX_VISIBLE_SPORT_CHANNELS = 200
private const val SCORE_CACHE_TTL_MS = 45_000L
private const val TWELVE_HOURS_MS = 12L * 60L * 60L * 1000L

