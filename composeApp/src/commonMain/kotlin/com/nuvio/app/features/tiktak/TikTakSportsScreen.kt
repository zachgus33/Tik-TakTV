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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.core.ui.NuvioToastController
import com.nuvio.app.core.ui.tikTakTvFocus
import com.nuvio.app.core.sync.TikTakWebLiveTvSync
import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.livetv.LiveTvChannel
import com.nuvio.app.features.livetv.LiveTvProgramme
import com.nuvio.app.features.livetv.LiveTvRepository
import com.nuvio.app.features.livetv.channelHasUpcomingGuideData
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.trakt.TraktPlatformClock
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
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
    val shortName: String? = null,
    val abbreviation: String? = null,
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
    val broadcasts: List<String> = emptyList(),
    val startEpochMs: Long? = null,
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
    val playChannel: (LiveTvChannel) -> Unit = { channel ->
        scope.launch { onChannelClick(LiveTvRepository.prepareForPlayback(channel)) }
    }
    val liveState by remember {
        // Sports depends on the same guide-backed channel index as Live TV. Loading it here
        // keeps the expensive guide work off Home startup while still making a direct visit
        // to Sports populate streams and scores.
        LiveTvRepository.ensureLoaded()
        LiveTvRepository.uiState
    }.collectAsState()
    LaunchedEffect(Unit) { LiveTvRepository.ensureGuideLoaded() }
    // The full profile pull can fail before reaching the web IPTV payload. A
    // direct visit to Sports must recover the account provider independently
    // when the profile has no loaded channels. Friend-code IPTV takes priority.
    val activeProfileId = ProfileRepository.activeProfileId
    LaunchedEffect(activeProfileId) {
        val state = LiveTvRepository.uiState.value
        if (state.channels.isEmpty() && !state.isLoading &&
            !LiveTvRepository.hasFriendXtreamOverride()
        ) {
            try {
                TikTakWebLiveTvSync.pull(activeProfileId)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                // Sports scores remain available even when the provider is offline.
            }
        }
    }
    // Keep the last successful scoreboard visible while its feeds refresh.
    var scores by remember { mutableStateOf(scoreCache) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var sportFilter by remember { mutableStateOf("all") }
    var searchingScoreId by remember { mutableStateOf<String?>(null) }
    var unmatchedScoreId by remember { mutableStateOf<String?>(null) }

    // Indexing thousands of IPTV channels and matching every score used to run
    // during composition. On Fire TV that blocked input dispatch long enough to
    // trigger an ANR. Build the complete sports view once on a worker thread.
    var derived by remember(liveState.sourceUrl) {
        mutableStateOf(deriveSportsState(emptyList(), emptyMap(), emptyMap(), scores, sportFilter))
    }
    LaunchedEffect(
        liveState.channels,
        scores,
        sportFilter,
    ) {
        // Guide checkpoints must not cancel a large match calculation every
        // time another channel's EPG arrives. Rebuild from the latest guide
        // at a bounded cadence, keeping the previous results visible.
        var previousProgrammes: Map<String, LiveTvProgramme>? = null
        var previousSchedules: Map<String, List<LiveTvProgramme>>? = null
        while (currentCoroutineContext().isActive) {
            val latest = LiveTvRepository.uiState.value
            if (previousProgrammes !== latest.currentProgrammes ||
                previousSchedules !== latest.programmeSchedules
            ) {
                previousProgrammes = latest.currentProgrammes
                previousSchedules = latest.programmeSchedules
                derived = withContext(Dispatchers.Default) {
                    deriveSportsState(
                        channels = liveState.channels,
                        programmes = latest.currentProgrammes,
                        schedules = latest.programmeSchedules,
                        scores = scores,
                        sportFilter = sportFilter,
                    )
                }
            }
            delay(1_000L)
        }
    }
    val visibleLiveEvents = derived.liveEvents
    // Show scores before the worker finishes matching the IPTV guide.
    val visibleScores = derived.scores.ifEmpty {
        scores.asSequence()
            .filter { sportFilter == "all" || it.sport == sportFilter }
            .take(MAX_VISIBLE_SCORE_EVENTS)
            .toList()
    }
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

    fun openScore(event: NativeScoreEvent, matched: LiveTvChannel?) {
        if (matched != null) {
            unmatchedScoreId = null
            playChannel(matched)
            return
        }
        if (searchingScoreId != null) return
        unmatchedScoreId = null
        searchingScoreId = event.id
        scope.launch {
            try {
                // The guide may have finished loading after the score card
                // rendered. Recheck once, with visible feedback meanwhile.
                val channel = withContext(Dispatchers.Default) {
                    findScoreChannel(event, liveState.channels, liveState.currentProgrammes, liveState.programmeSchedules)
                } ?: run {
                    // A direct visit to Sports may precede the full XML guide.
                    // Fetch the small guide only for channels named by this
                    // game's broadcaster, then retry once with fresh data.
                    val candidates = broadcastGuideCandidates(event, LiveTvRepository.uiState.value.channels)
                    // Requery even if a channel has today's current show. Its
                    // upcoming game may only exist in the short EPG response.
                    withTimeoutOrNull(8_000L) {
                        LiveTvRepository.loadXtreamGuideForChannels(candidates, force = true)?.join()
                    }
                    val latest = LiveTvRepository.uiState.value
                    withContext(Dispatchers.Default) {
                        findScoreChannel(event, latest.channels, latest.currentProgrammes, latest.programmeSchedules)
                    }
                }
                if (channel != null) {
                    playChannel(channel)
                } else {
                    val latest = LiveTvRepository.uiState.value
                    val choices = withContext(Dispatchers.Default) {
                        guidedScoreChannelChoices(
                            event, latest.channels, latest.currentProgrammes, latest.programmeSchedules,
                        )
                    }
                    if (choices.isNotEmpty()) {
                        playChannel(choices.first())
                    } else {
                        openScoreEvent(
                            event,
                            null,
                            channelsAvailable = latest.channels.isNotEmpty(),
                            channelsStillLoading = latest.isLoading || latest.isEpgLoading,
                            onChannelClick = playChannel,
                        )
                        unmatchedScoreId = event.id
                    }
                }
            } finally {
                searchingScoreId = null
            }
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
                    relevantChannels = derived.relevantChannels[event.id].orEmpty(),
                    searching = searchingScoreId == event.id,
                    unmatched = unmatchedScoreId == event.id,
                    channelsAvailable = liveState.channels.isNotEmpty(),
                    channelsLoading = liveState.isLoading,
                    onClick = { openScore(event, matchedChannel) },
                    onChannelClick = playChannel,
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
                    relevantChannels = derived.relevantChannels[event.id].orEmpty(),
                    searching = searchingScoreId == event.id,
                    unmatched = unmatchedScoreId == event.id,
                    channelsAvailable = liveState.channels.isNotEmpty(),
                    channelsLoading = liveState.isLoading,
                    onClick = { openScore(event, matchedChannel) },
                    onChannelClick = playChannel,
                )
            }
        }
        item { SectionTitle("ON YOUR LIVE TV", "Live and upcoming sports with guide data") }
        if (visibleLiveEvents.isEmpty()) {
            item {
                Text(
                    text = when {
                        liveState.isLoading -> "Loading channels from your IPTV provider."
                        liveState.isEpgLoading -> "Checking your provider's sports guide."
                        liveState.channels.isEmpty() -> "No Live TV channels loaded on this profile. Check the IPTV connection in Live TV."
                        else -> "No matching sports programmes are listed right now."
                    },
                    color = MaterialTheme.nuvio.colors.textMuted,
                )
            }
        } else {
            items(visibleLiveEvents, key = { "channel:${it.first.id}:${it.second}" }) { (channel, title) ->
                FocusCard(onClick = { playChannel(channel) }) {
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
                    relevantChannels = emptyList(),
                    searching = searchingScoreId == event.id,
                    unmatched = unmatchedScoreId == event.id,
                    channelsAvailable = liveState.channels.isNotEmpty(),
                    channelsLoading = liveState.isLoading,
                    onClick = { openScore(event, matchedChannel) },
                    onChannelClick = playChannel,
                )
            }
        }
    }
}

data class SportsDerivedState(
    val liveEvents: List<Pair<LiveTvChannel, String?>> = emptyList(),
    val scores: List<NativeScoreEvent> = emptyList(),
    val matchedChannels: Map<String, LiveTvChannel> = emptyMap(),
    val relevantChannels: Map<String, List<LiveTvChannel>> = emptyMap(),
)

fun deriveSportsState(
    channels: List<LiveTvChannel>,
    programmes: Map<String, LiveTvProgramme>,
    schedules: Map<String, List<LiveTvProgramme>>,
    scores: List<NativeScoreEvent>,
    sportFilter: String,
): SportsDerivedState {
    // Sports uses the same guide-backed channel rule as the TV guide.
    val channelSearchIndex = buildSportsChannelSearchIndex(channels, programmes, schedules)
    val liveEvents = channels.mapNotNull { channel ->
        if (!channelHasUpcomingGuideData(channel, programmes, schedules)) return@mapNotNull null
        val programme = channel.tvgId?.let(programmes::get) ?: programmes[channel.id]
        val searchable = "${programme?.title.orEmpty()} ${channel.name} ${channel.group}".lowercase()
        val sportsChannel = SportsKeywords.any(searchable::contains) ||
            "sport" in channel.group.lowercase() || "espn" in channel.name.lowercase()
        val sportsProgramme = programme?.title?.lowercase()?.let { title ->
            SportsKeywords.any(title::contains)
        } == true
        if (sportsProgramme || (programme == null && sportsChannel)) {
            channel to programme?.title
        } else null
    }
    val filteredScores = scores.asSequence()
        .filter { sportFilter == "all" || it.sport == sportFilter }
        .take(MAX_VISIBLE_SCORE_EVENTS * 2)
        .toList()
    val relevantChannels = filteredScores.mapNotNull { event ->
        findScoreChannelsFromIndex(event, channelSearchIndex).take(3)
            .takeIf(List<LiveTvChannel>::isNotEmpty)?.let { event.id to it }
    }.toMap()
    val matchedChannels = relevantChannels.mapValues { it.value.first() }
    val visibleScores = prioritizeStreamableScores(filteredScores, matchedChannels)
        .take(MAX_VISIBLE_SCORE_EVENTS)
    return SportsDerivedState(
        liveEvents = liveEvents.asSequence().filter { (channel, title) ->
            val searchable = "${title.orEmpty()} ${channel.name} ${channel.group}".lowercase()
            sportFilter == "all" || searchable.contains(sportFilter)
        }.take(MAX_VISIBLE_SPORT_CHANNELS).toList(),
        scores = visibleScores,
        matchedChannels = matchedChannels,
        relevantChannels = relevantChannels,
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
    relevantChannels: List<LiveTvChannel>,
    searching: Boolean,
    unmatched: Boolean,
    channelsAvailable: Boolean,
    channelsLoading: Boolean,
    onClick: () -> Unit,
    onChannelClick: (LiveTvChannel) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    FocusCard(onClick = {
        if (event.state == "post") {
            NuvioToastController.show("This game has ended. Select a live or upcoming game to find a channel.")
        } else onClick()
    }) {
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
            text = when {
                event.state == "post" -> "Final score - no live broadcast"
                searching -> "Checking the Live TV guide for this game..."
                unmatched -> "No guide-confirmed stream for this game in your Live TV lineup"
                matchedChannelName != null -> "Press OK to watch on $matchedChannelName"
                channelsLoading -> "Loading your Live TV channels before matching this game"
                !channelsAvailable -> "No Live TV channels loaded on this profile"
                else -> "Press OK to look for this game in your Live TV guide"
            },
            color = if (matchedChannelName != null) MaterialTheme.nuvio.colors.accent else MaterialTheme.nuvio.colors.textMuted,
            fontWeight = FontWeight.SemiBold,
        )
    }
    if (event.state != "post" && relevantChannels.isNotEmpty()) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            relevantChannels.take(3).forEach { channel ->
                Button(onClick = { onChannelClick(channel) }, modifier = Modifier.tikTakTvFocus()) {
                    Text("Watch ${channel.name}", maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
    }
}

fun findScoreChannel(
    event: NativeScoreEvent,
    channels: List<LiveTvChannel>,
    currentProgrammes: Map<String, LiveTvProgramme>,
    schedules: Map<String, List<LiveTvProgramme>> = emptyMap(),
): LiveTvChannel? {
    return findScoreChannelFromIndex(event, buildSportsChannelSearchIndex(channels, currentProgrammes, schedules))
}

private data class SportsChannelSearchEntry(
    val channel: LiveTvChannel,
    val programmeTokens: Set<String>,
    val programmeTitle: String,
    val channelTokens: Set<String>,
    val hasProgramme: Boolean,
    val isCurrentProgramme: Boolean,
    val startEpochMs: Long,
    val stopEpochMs: Long,
)

private fun buildSportsChannelSearchIndex(
    channels: List<LiveTvChannel>,
    currentProgrammes: Map<String, LiveTvProgramme>,
    schedules: Map<String, List<LiveTvProgramme>> = emptyMap(),
): List<SportsChannelSearchEntry> {
    val now = GMTDate().timestamp
    return channels.flatMap { channel ->
        val keys = listOfNotNull(channel.tvgId?.takeIf(String::isNotBlank), channel.id)
        val currentEntries = keys.mapNotNull(currentProgrammes::get)
        val entries = currentEntries + keys.flatMap { schedules[it].orEmpty() }
            .filter { it.stopEpochMs > now - 6 * 60 * 60_000L }
        val tokens = sportsChannelBroadcastTokens(channel.name)
        entries.distinctBy { Triple(it.title, it.startEpochMs, it.stopEpochMs) }
            .map { programme ->
                SportsChannelSearchEntry(
                    channel = channel,
                    programmeTokens = normalizedSportsTokens(programme.title),
                    programmeTitle = programme.title,
                    // A broad group such as "USA Sports" is not proof that every channel
                    // in it is the USA Network broadcast named on a score card.
                    channelTokens = tokens,
                    hasProgramme = true,
                    isCurrentProgramme = programme in currentEntries,
                    startEpochMs = programme.startEpochMs,
                    stopEpochMs = programme.stopEpochMs,
                )
            }
    }
}

private fun findScoreChannelFromIndex(
    event: NativeScoreEvent,
    index: List<SportsChannelSearchEntry>,
): LiveTvChannel? = findScoreChannelsFromIndex(event, index).firstOrNull()

private fun findScoreChannelsFromIndex(
    event: NativeScoreEvent,
    index: List<SportsChannelSearchEntry>,
): List<LiveTvChannel> {
    if (index.isEmpty()) return emptyList()
    val now = GMTDate().timestamp
    val eventTokens = normalizedSportsTokens(event.name + " " + event.teams.joinToString(" ") { it.name })
    val teams = event.teams.filter { normalizedSportsTokens(it.name).isNotEmpty() }
    val teamSignatures = teams.map { distinctiveTeamTokens(it, teams) }
    val broadcastOptions = eventBroadcastTokens(event)

    val candidates = index.asSequence()
        .mapNotNull { entry ->
            val eventStart = event.startEpochMs
            // The web Sports matcher accepts guide events within eight hours
            // of the score. IPTV guide times can drift by several hours, so
            // the TV must search the same window instead of discarding the
            // broadcaster before it can be ranked.
            if (eventStart != null &&
                (eventStart < entry.startEpochMs - 8 * 60 * 60_000L ||
                    eventStart > entry.stopEpochMs + 8 * 60 * 60_000L)
            ) return@mapNotNull null
            // A recent guide event may be the broadcaster's best evidence for
            // a live score while its current-programme index has moved on.
            if (event.state == "in" && !entry.isCurrentProgramme &&
                (entry.stopEpochMs <= now - 2 * 60 * 60_000L ||
                    entry.startEpochMs > now)
            ) return@mapNotNull null
            val programmeTokens = entry.programmeTokens
            val matchingTeams = teamSignatures.count { tokens -> tokens.any(programmeTokens::contains) }
            val programmeOverlap = eventTokens.count(programmeTokens::contains)
            val allTeamsMatch = teams.isNotEmpty() && matchingTeams == teams.size
            val channelTokens = entry.channelTokens
            val broadcastOverlap = broadcastOptions.maxOfOrNull { tokens -> tokens.count(channelTokens::contains) } ?: 0
            val broadcastMatch = broadcastOptions.any { tokens -> tokens.all(channelTokens::contains) }
            // A guide title is sometimes assigned to the wrong IPTV feed.
            // When ESPN names a broadcaster, the actual channel name must
            // agree before we can auto-launch it.
            if (broadcastOptions.isNotEmpty() && !broadcastMatch) return@mapNotNull null
            if (isUnrelatedNewsChannel(entry.channel, broadcastOptions)) return@mapNotNull null
            val genericSportProgramme = broadcastMatch && entry.hasProgramme &&
                isGenericSportProgramme(entry.programmeTitle, event)

            // A named broadcaster alone cannot prove which feed carries a game.
            // When guide data names a programme, require the actual matchup;
            // otherwise a second ABC feed can win despite airing another show.
            if (entry.hasProgramme && !allTeamsMatch && !genericSportProgramme) {
                return@mapNotNull null
            }
            // A channel's name is not evidence that it is carrying this game.
            // With no current guide entry, ABC/ESPN regional feeds can show a
            // different programme despite matching the broadcast label.
            if (!entry.hasProgramme) {
                return@mapNotNull null
            }
            val score = (if (allTeamsMatch) 300 else 0) + programmeOverlap * 8 +
                (if (broadcastMatch) 35 + broadcastOverlap * 5 else 0) +
                (if (entry.hasProgramme) 10 else 0) +
                (if (genericSportProgramme) 50 else 0) +
                canonicalBroadcastScore(event, entry.channel)
            entry.channel to score
        }
        .sortedByDescending { it.second }
        .distinctBy { it.first.id }
        .map { it.first }
        .toList()
    if (candidates.isNotEmpty()) return candidates

    // The website can still surface the named sports network when its EPG
    // labels the current slot as another generic sports show. Keep this
    // fallback limited to guide-backed sports networks so local affiliates,
    // news feeds, and channels with no EPG cannot impersonate the broadcast.
    if (event.state != "in" || broadcastOptions.isEmpty()) return emptyList()
    return index.asSequence()
        .filter { entry ->
            val current = entry.isCurrentProgramme ||
                (entry.startEpochMs <= now && now < entry.stopEpochMs)
            val titleWords = normalizeSportsText(entry.programmeTitle).split(' ').toSet()
            current &&
                isDedicatedSportsChannel(entry.channel.name) &&
                !isUnrelatedNewsChannel(entry.channel, broadcastOptions) &&
                titleWords.none { it == "vs" || it == "versus" || it == "at" } &&
                SportsKeywords.any { word -> entry.programmeTitle.lowercase().contains(word) } &&
                broadcastOptions.any { option -> option.all(entry.channelTokens::contains) }
        }
        .map(SportsChannelSearchEntry::channel)
        .distinctBy(LiveTvChannel::id)
        .sortedByDescending { canonicalBroadcastScore(event, it) }
        .toList()
}

private fun isDedicatedSportsChannel(name: String): Boolean {
    val normalized = normalizeSportsText(name)
    return listOf(
        "sec network", "big ten network", "espn", "fox sports", "cbs sports",
        "nbc sports", "nfl network", "nba tv", "mlb network", "nhl network",
        "tennis channel", "golf channel", "bein sports", "sky sports",
        "sportsnet", "dazn", "tnt sports", "tsn",
    ).any(normalized::contains)
}

private fun canonicalBroadcastScore(event: NativeScoreEvent, channel: LiveTvChannel): Int {
    val channelName = normalizeSportsText(channel.name)
        .replace(Regex("^(?:us|usa|united states) "), "")
        .replace(Regex(" (?:hd|fhd|uhd|4k|sd)$"), "")
    return if ((event.broadcasts + listOfNotNull(event.broadcast)).any { broadcast ->
            channelName == normalizeSportsText(broadcast) ||
                broadcastAliases(channelName).intersect(broadcastAliases(broadcast)).isNotEmpty()
        }) 40 else 0
}

private fun isGenericSportProgramme(title: String, event: NativeScoreEvent): Boolean {
    val words = normalizeSportsText(title).split(' ').toSet()
    // A guide title naming an actual matchup must match both ESPN teams.
    if ("vs" in words || "versus" in words || "at" in words) return false
    val eventTeamTokens = event.teams.flatMap { normalizedSportsTokens(it.name) }.toSet()
    if (eventTeamTokens.any(words::contains)) return false
    val sportWords = when (event.sport) {
        "football" -> setOf("football", "nfl")
        "basketball" -> setOf("basketball", "nba", "wnba")
        "hockey" -> setOf("hockey", "nhl")
        "baseball" -> setOf("baseball", "mlb")
        "soccer" -> setOf("soccer", "mls")
        "fighting" -> setOf("ufc", "mma", "boxing")
        else -> emptySet()
    }
    if (sportWords.none(words::contains)) return false
    val leagueMarkers = setOf("nfl", "nba", "wnba", "nhl", "mlb", "mls", "ufc", "ncaa", "college")
    val titleLeague = words.intersect(leagueMarkers).map { if (it == "ncaa") "college" else it }.toSet()
    val eventLeagueWords = normalizeSportsText(event.league).split(' ').toSet()
    val eventLeague = eventLeagueWords.intersect(leagueMarkers)
        .map { if (it == "ncaa") "college" else it }.toMutableSet().apply {
            if (setOf("national", "football", "league").all(eventLeagueWords::contains)) add("nfl")
            if (setOf("national", "basketball", "association").all(eventLeagueWords::contains)) add("nba")
            if (setOf("national", "hockey", "league").all(eventLeagueWords::contains)) add("nhl")
            if (setOf("major", "league", "baseball").all(eventLeagueWords::contains)) add("mlb")
        }
    return titleLeague.isEmpty() || titleLeague.any(eventLeague::contains)
}

private fun normalizeSportsText(value: String): String = value
    .lowercase()
    .replace(Regex("[^a-z0-9]+"), " ")
    .replace(Regex("\\bst\\b"), "state")
    .trim()

private fun normalizedSportsTokens(value: String): Set<String> = normalizeSportsText(value)
    .split(' ')
    .asSequence()
    .filter { it.length >= 3 && it !in SportsMatchStopWords }
    .toSet()

private fun sportsChannelBroadcastTokens(identity: String): Set<String> {
    val aliases = broadcastAliases(identity)
    val broadBrandTokens = buildSet {
        if ("fs1" in aliases || "fs2" in aliases) add("fox")
        if ("cbssn" in aliases) add("cbs")
        if ("nbcsn" in aliases) add("nbc")
        if ("espnu" in aliases) add("espn")
        if ("nfln" in aliases) add("nfl")
        if ("mlbn" in aliases) add("mlb")
        if ("nhln" in aliases) add("nhl")
        if ("nbatv" in aliases) add("nba")
    }
    return (normalizedSportsTokens(identity) - broadBrandTokens) + aliases
}

// ESPN scorecards often use short network names while IPTV playlists spell
// them out. Preserve channel numbers and network suffixes to avoid selecting
// a different feed merely because its generic sports programme also matches.
private fun broadcastAliases(value: String): Set<String> {
    val normalized = normalizeSportsText(value)
    return BroadcastAliasPatterns.mapNotNull { (pattern, alias) ->
        alias.takeIf { pattern.containsMatchIn(normalized) }
    }.toSet()
}

private val BroadcastAliasPatterns = listOf(
    Regex("\\b(?:fox sports (?:1|one)|fs1)\\b") to "fs1",
    Regex("\\b(?:fox sports (?:2|two)|fs2)\\b") to "fs2",
    Regex("\\b(?:cbs sports network|cbssn)\\b") to "cbssn",
    Regex("\\b(?:nbc sports network|nbcsn)\\b") to "nbcsn",
    Regex("\\b(?:espn u|espnu)\\b") to "espnu",
    Regex("\\b(?:nfl network|nfln)\\b") to "nfln",
    Regex("\\b(?:mlb network|mlbn)\\b") to "mlbn",
    Regex("\\b(?:nhl network|nhln)\\b") to "nhln",
    Regex("\\b(?:nba tv|nbatv)\\b") to "nbatv",
)

private fun normalizedBroadcastTokens(value: String): Set<String> {
    if ('+' in value) return emptySet()
    val aliases = broadcastAliases(value)
    if (aliases.isNotEmpty()) return aliases
    return normalizedSportsTokens(value)
        .map { if (it == "net") "network" else it }
        .filterNot { it in BroadcastMatchStopWords }
        .toSet()
}

private fun distinctiveTeamTokens(
    team: NativeScoreTeam,
    teams: List<NativeScoreTeam>,
): Set<String> {
    val otherTeamTokens = teams.asSequence().filterNot { it === team }
        .flatMap { other ->
            sequenceOf(other.name, other.shortName, other.abbreviation)
                .filterNotNull().flatMap { normalizedSportsTokens(it).asSequence() }
        }.toSet()
    return listOfNotNull(team.name, team.shortName, team.abbreviation)
        .flatMap { normalizedSportsTokens(it) }
        .toSet() - otherTeamTokens
}

private fun eventBroadcastTokens(event: NativeScoreEvent): List<Set<String>> =
    (event.broadcasts + listOfNotNull(event.broadcast))
        .map(::normalizedBroadcastTokens)
        .filter(Set<String>::isNotEmpty)
        .distinct()

private fun isUnrelatedNewsChannel(channel: LiveTvChannel, broadcasts: List<Set<String>>): Boolean {
    val nameWords = normalizeSportsText(channel.name).split(' ').toSet()
    val newsWords = setOf("news", "business")
    return nameWords.any(newsWords::contains) && broadcasts.none { option -> option.any(newsWords::contains) }
}

private fun broadcastGuideCandidates(event: NativeScoreEvent, channels: List<LiveTvChannel>): List<LiveTvChannel> {
    val broadcasts = eventBroadcastTokens(event)
    if (broadcasts.isEmpty()) return emptyList()
    return channels.asSequence().filter { channel ->
        if (isUnrelatedNewsChannel(channel, broadcasts)) return@filter false
        val tokens = sportsChannelBroadcastTokens(channel.name)
        broadcasts.any { option -> option.all(tokens::contains) }
    }.sortedByDescending { canonicalBroadcastScore(event, it) }.take(24).toList()
}

fun guidedScoreChannelChoices(
    event: NativeScoreEvent,
    channels: List<LiveTvChannel>,
    programmes: Map<String, LiveTvProgramme>,
    schedules: Map<String, List<LiveTvProgramme>>,
): List<LiveTvChannel> {
    // Match the website's score-to-guide relationship: only offer channels
    // whose actual programme fits this game, never every channel named Fox.
    return findScoreChannelsFromIndex(event, buildSportsChannelSearchIndex(channels, programmes, schedules))
        .take(12)
}

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
    channelsAvailable: Boolean,
    channelsStillLoading: Boolean,
    onChannelClick: (LiveTvChannel) -> Unit,
) {
    if (matchedChannel != null) {
        onChannelClick(matchedChannel)
    } else {
        NuvioToastController.show(
            if (!channelsAvailable && !channelsStillLoading) {
                "No Live TV channels are loaded on this profile. Check your IPTV connection in Live TV."
            } else if (channelsStillLoading) {
                "Live TV is still syncing. Try this game again when your channels are ready."
            } else {
                "No guide-confirmed channel for ${event.name} was found in your IPTV lineup."
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
                    withTimeoutOrNull(SCORE_FEED_TIMEOUT_MS) {
                        val raw = httpGetText(
                            "https://site.api.espn.com/apis/site/v2/sports/$path/scoreboard?dates=$date&limit=500",
                        )
                        parseScoreEvents(raw, sport, league)
                    }.orEmpty()
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
                shortName = team.string("shortDisplayName"),
                abbreviation = team.string("abbreviation"),
            )
        }
        val broadcasts = competition.array("broadcasts").flatMap { item ->
            runCatching { item.jsonObject.array("names") }.getOrNull().orEmpty().mapNotNull { name ->
                runCatching { name.jsonPrimitive.contentOrNull }.getOrNull()
            }
        }.distinct()
        NativeScoreEvent(
            id = event.string("id") ?: return@mapNotNull null,
            sport = sport,
            league = league,
            name = event.string("shortName") ?: event.string("name") ?: "Game",
            detail = type?.string("shortDetail") ?: type?.string("detail") ?: "",
            state = type?.string("state") ?: "pre",
            teams = teams,
            venue = competition.objectValue("venue")?.string("fullName"),
            broadcast = broadcasts.firstOrNull(),
            broadcasts = broadcasts,
            startEpochMs = event.string("date")?.let(TraktPlatformClock::parseIsoDateTimeToEpochMs),
        )
    }
}

private fun JsonObject.array(key: String): JsonArray = runCatching { get(key)?.jsonArray }.getOrNull() ?: JsonArray(emptyList())
private fun JsonArray.firstObject(): JsonObject? = firstOrNull()?.let { runCatching { it.jsonObject }.getOrNull() }
private fun JsonObject.objectValue(key: String): JsonObject? = runCatching { get(key)?.jsonObject }.getOrNull()
private fun JsonObject.string(key: String): String? = runCatching { get(key)?.jsonPrimitive?.contentOrNull }.getOrNull()

private val SportsKeywords = listOf(
    "football", "basketball", "baseball", "hockey", "soccer", "tennis", "golf", "ufc", "mma", "boxing", "racing", "formula 1", "grand prix", "nfl", "nba", "nhl", "mlb", "match", " vs ", "sports",
)

private const val MAX_VISIBLE_SCORE_EVENTS = 120
private const val MAX_VISIBLE_SPORT_CHANNELS = 200
private const val SCORE_CACHE_TTL_MS = 120_000L
private const val SCORE_FEED_TIMEOUT_MS = 6_000L
private const val TWELVE_HOURS_MS = 12L * 60L * 60L * 1000L

