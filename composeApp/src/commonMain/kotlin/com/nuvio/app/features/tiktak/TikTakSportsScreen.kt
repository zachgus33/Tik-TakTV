package com.nuvio.app.features.tiktak

import androidx.compose.foundation.background
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
import androidx.compose.runtime.produceState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.core.ui.NuvioToastController
import com.nuvio.app.core.ui.tikTakTvFocus
import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.livetv.LiveTvChannel
import com.nuvio.app.features.livetv.LiveTvProgramme
import com.nuvio.app.features.livetv.LiveTvRepository
import com.nuvio.app.features.livetv.channelHasGuideData
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
    val liveState by remember {
        // Sports depends on the same guide-backed channel index as Live TV. Loading it here
        // keeps the expensive guide work off Home startup while still making a direct visit
        // to Sports populate streams and scores.
        LiveTvRepository.ensureLoaded()
        LiveTvRepository.uiState
    }.collectAsState()
    LaunchedEffect(Unit) { LiveTvRepository.ensureGuideLoaded() }
    var scores by remember { mutableStateOf<List<NativeScoreEvent>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var sportFilter by remember { mutableStateOf("all") }

    // Indexing thousands of IPTV channels and matching every score used to run
    // during composition. On Fire TV that blocked input dispatch long enough to
    // trigger an ANR. Build the complete sports view once on a worker thread.
    val derived by produceState(
        initialValue = SportsDerivedState(),
        liveState.channels,
        liveState.currentProgrammes,
        liveState.programmeSchedules,
        scores,
        sportFilter,
    ) {
        value = withContext(Dispatchers.Default) {
            deriveSportsState(
                channels = liveState.channels,
                programmes = liveState.currentProgrammes,
                schedules = liveState.programmeSchedules,
                scores = scores,
                sportFilter = sportFilter,
            )
        }
    }
    val visibleLiveEvents = derived.liveEvents
    val visibleScores = derived.scores
    val liveScores = visibleScores.filter { it.state == "in" }
    val upcomingScores = visibleScores.filter { it.state == "pre" }
    val recentScores = visibleScores.filter { it.state == "post" }

    fun refreshScores() {
        if (loading) return
        scope.launch {
            loading = true
            error = null
            runCatching { withContext(Dispatchers.Default) { loadNativeScores() } }
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
                Button(
                    onClick = ::refreshScores,
                    modifier = Modifier.tikTakTvFocus(),
                ) { Text("Refresh scores") }
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(listOf("all", "football", "basketball", "baseball", "hockey", "soccer", "fighting")) { sport ->
                    Button(
                        onClick = { sportFilter = sport },
                        modifier = Modifier.tikTakTvFocus(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (sportFilter == sport) MaterialTheme.nuvio.colors.accent else MaterialTheme.nuvio.colors.surface,
                        ),
                    ) { Text(if (sport == "all") "All sports" else sport.replaceFirstChar { it.uppercase() }) }
                }
            }
        }
        if (loading && scores.isEmpty()) item { CircularProgressIndicator(color = MaterialTheme.nuvio.colors.accent) }
        error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
        if (liveScores.isNotEmpty()) {
            item { SectionTitle("LIVE NOW", "Games in progress — scores update automatically") }
            items(liveScores, key = { "live-score:${it.id}" }) { event ->
                val matchedChannel = derived.matchedChannels[event.id]
                ScoreCard(
                    event = event,
                    matchedChannelName = matchedChannel?.name,
                    onClick = { openScoreEvent(event, matchedChannel, liveState.channels.isEmpty(), onChannelClick) },
                )
            }
        }
        if (upcomingScores.isNotEmpty()) {
            item { SectionTitle("COMING UP", "Scheduled games — streamable games are shown first") }
            items(upcomingScores, key = { "upcoming-score:${it.id}" }) { event ->
                val matchedChannel = derived.matchedChannels[event.id]
                ScoreCard(
                    event = event,
                    matchedChannelName = matchedChannel?.name,
                    onClick = { openScoreEvent(event, matchedChannel, liveState.channels.isEmpty(), onChannelClick) },
                )
            }
        }
        item { SectionTitle("ON YOUR LIVE TV", "Live and upcoming sports with guide data") }
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
        if (recentScores.isNotEmpty()) {
            item { SectionTitle("RECENT RESULTS", "Finished games and final scores") }
            items(recentScores, key = { "recent-score:${it.id}" }) { event ->
                val matchedChannel = derived.matchedChannels[event.id]
                ScoreCard(
                    event = event,
                    matchedChannelName = matchedChannel?.name,
                    onClick = { openScoreEvent(event, matchedChannel, liveState.channels.isEmpty(), onChannelClick) },
                )
            }
        }
    }
}

private data class SportsDerivedState(
    val liveEvents: List<Pair<LiveTvChannel, String?>> = emptyList(),
    val scores: List<NativeScoreEvent> = emptyList(),
    val matchedChannels: Map<String, LiveTvChannel> = emptyMap(),
)

private fun deriveSportsState(
    channels: List<LiveTvChannel>,
    programmes: Map<String, LiveTvProgramme>,
    schedules: Map<String, List<LiveTvProgramme>>,
    scores: List<NativeScoreEvent>,
    sportFilter: String,
): SportsDerivedState {
    val guidedChannels = channels.filter { channelHasGuideData(it, programmes, schedules) }
    val channelSearchIndex = buildSportsChannelSearchIndex(guidedChannels, programmes)
    val liveEvents = guidedChannels.mapNotNull { channel ->
        val programme = channel.tvgId?.let(programmes::get) ?: programmes[channel.id]
        val searchable = "${programme?.title.orEmpty()} ${channel.name} ${channel.group}".lowercase()
        if (SportsKeywords.any(searchable::contains)) channel to programme?.title else null
    }
    val filteredScores = scores.asSequence()
        .filter { sportFilter == "all" || it.sport == sportFilter }
        .toList()
    val matchedChannels = filteredScores.mapNotNull { event ->
        findScoreChannelFromIndex(event, channelSearchIndex)?.let { event.id to it }
    }.toMap()
    val visibleScores = prioritizeStreamableScores(filteredScores, matchedChannels)
        .take(MAX_VISIBLE_SCORE_EVENTS)
    return SportsDerivedState(
        liveEvents = liveEvents.asSequence().filter { (channel, title) ->
            val searchable = "${title.orEmpty()} ${channel.name} ${channel.group}".lowercase()
            sportFilter == "all" || searchable.contains(sportFilter)
        }.take(MAX_VISIBLE_SPORT_CHANNELS).toList(),
        scores = visibleScores,
        matchedChannels = matchedChannels,
    )
}

/** Keeps the score feed's live/upcoming ordering inside each group while putting
 * events that can launch a guide-backed stream before informational scores. */
fun prioritizeStreamableScores(
    scores: List<NativeScoreEvent>,
    matchedChannels: Map<String, LiveTvChannel>,
): List<NativeScoreEvent> = scores.withIndex()
    .sortedWith(compareBy<IndexedValue<NativeScoreEvent>>(
        { it.value.id !in matchedChannels },
        { it.index },
    ))
    .map(IndexedValue<NativeScoreEvent>::value)

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
                        team.record?.let {
                            Text("Season record: $it", color = MaterialTheme.nuvio.colors.textMuted)
                        }
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
    return findScoreChannelFromIndex(event, buildSportsChannelSearchIndex(channels, currentProgrammes))
}

private data class SportsChannelSearchEntry(
    val channel: LiveTvChannel,
    val programmeTokens: Set<String>,
    val channelTokens: Set<String>,
    val hasProgramme: Boolean,
)

private fun buildSportsChannelSearchIndex(
    channels: List<LiveTvChannel>,
    currentProgrammes: Map<String, LiveTvProgramme>,
): List<SportsChannelSearchEntry> = channels.map { channel ->
    val programme = channel.tvgId?.let(currentProgrammes::get) ?: currentProgrammes[channel.id]
    SportsChannelSearchEntry(
        channel = channel,
        programmeTokens = normalizedSportsTokens(programme?.title.orEmpty()),
        channelTokens = normalizedSportsTokens("${channel.name} ${channel.group}"),
        hasProgramme = programme != null,
    )
}

private fun findScoreChannelFromIndex(
    event: NativeScoreEvent,
    index: List<SportsChannelSearchEntry>,
): LiveTvChannel? {
    if (index.isEmpty()) return null
    val eventTokens = normalizedSportsTokens(event.name + " " + event.teams.joinToString(" ") { it.name })
    val teamTokenSets = event.teams.map { normalizedSportsTokens(it.name) }.filter(Set<String>::isNotEmpty)
    val broadcastTokens = normalizedBroadcastTokens(event.broadcast.orEmpty())

    return index.asSequence()
        .mapNotNull { entry ->
            val programmeTokens = entry.programmeTokens
            val matchingTeams = teamTokenSets.count { team ->
                val required = if (team.size <= 1) 1 else 2
                team.count(programmeTokens::contains) >= required
            }
            val programmeOverlap = eventTokens.count(programmeTokens::contains)
            val channelTokens = entry.channelTokens
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
                (if (entry.hasProgramme) 10 else 0)
            entry.channel to score
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
    // Streaming-service names are availability metadata, not reliable IPTV
    // channel identities. Treating "Disney+" as a channel token previously
    // paired NHL games with Disney Junior, for example.
    "disney", "hulu", "peacock", "paramount", "amazon", "prime", "apple", "youtube", "max",
)

@Composable
private fun FocusCard(onClick: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 1000.dp)
            .background(MaterialTheme.nuvio.colors.surface, RoundedCornerShape(16.dp))
            .tikTakTvFocus()
            .clickable(onClick = onClick)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) { content() }
}

@Composable
private fun SectionTitle(text: String, description: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(text, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.nuvio.colors.textPrimary, fontWeight = FontWeight.ExtraBold)
        description?.let { Text(it, color = MaterialTheme.nuvio.colors.textMuted) }
    }
}

private fun openScoreEvent(
    event: NativeScoreEvent,
    matchedChannel: LiveTvChannel?,
    channelsStillLoading: Boolean,
    onChannelClick: (LiveTvChannel) -> Unit,
) {
    if (matchedChannel != null) {
        onChannelClick(matchedChannel)
    } else {
        NuvioToastController.show(
            if (channelsStillLoading) {
                "Live TV is still syncing. Try this game again when your channels are ready."
            } else {
                "No live channel carrying ${event.name} was found in your IPTV guide."
            },
        )
    }
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

