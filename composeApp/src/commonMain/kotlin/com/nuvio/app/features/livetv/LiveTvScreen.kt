package com.nuvio.app.features.livetv

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddLink
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.Tv
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.produceState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.nuvio.app.core.ui.NuvioIconActionButton
import com.nuvio.app.core.ui.NuvioInputField
import com.nuvio.app.core.ui.NuvioPrimaryButton
import com.nuvio.app.core.ui.NuvioScreen
import com.nuvio.app.core.ui.NuvioScreenHeader
import com.nuvio.app.core.ui.NuvioSectionLabel
import com.nuvio.app.core.ui.NuvioTokens
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.core.ui.tikTakTvFocus
import com.nuvio.app.features.settings.NuvioEnhancedBackupFileBridge
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.live_tv_add_source
import nuvio.composeapp.generated.resources.live_tv_all_channels
import nuvio.composeapp.generated.resources.live_tv_channel_count
import nuvio.composeapp.generated.resources.live_tv_channels
import nuvio.composeapp.generated.resources.live_tv_disconnect
import nuvio.composeapp.generated.resources.live_tv_empty_description
import nuvio.composeapp.generated.resources.live_tv_empty_title
import nuvio.composeapp.generated.resources.live_tv_favorite
import nuvio.composeapp.generated.resources.live_tv_favorites
import nuvio.composeapp.generated.resources.live_tv_load
import nuvio.composeapp.generated.resources.live_tv_load_file
import nuvio.composeapp.generated.resources.live_tv_recent_channel_cta
import nuvio.composeapp.generated.resources.live_tv_recent_channel_title
import nuvio.composeapp.generated.resources.live_tv_refresh
import nuvio.composeapp.generated.resources.live_tv_search
import nuvio.composeapp.generated.resources.live_tv_choose_category
import nuvio.composeapp.generated.resources.live_tv_provider_settings_title
import nuvio.composeapp.generated.resources.live_tv_source_hint
import nuvio.composeapp.generated.resources.live_tv_source_title
import nuvio.composeapp.generated.resources.live_tv_stalker_mac_hint
import nuvio.composeapp.generated.resources.live_tv_stalker_password_hint
import nuvio.composeapp.generated.resources.live_tv_stalker_portal_hint
import nuvio.composeapp.generated.resources.live_tv_stalker_settings_description
import nuvio.composeapp.generated.resources.live_tv_stalker_settings_title
import nuvio.composeapp.generated.resources.live_tv_stalker_username_hint
import nuvio.composeapp.generated.resources.live_tv_source_m3u
import nuvio.composeapp.generated.resources.live_tv_source_stalker
import nuvio.composeapp.generated.resources.live_tv_source_xtream
import nuvio.composeapp.generated.resources.live_tv_settings
import nuvio.composeapp.generated.resources.live_tv_title
import nuvio.composeapp.generated.resources.live_tv_xtream_password_hint
import nuvio.composeapp.generated.resources.live_tv_xtream_server_hint
import nuvio.composeapp.generated.resources.live_tv_xtream_settings_description
import nuvio.composeapp.generated.resources.live_tv_xtream_username_hint
import org.jetbrains.compose.resources.stringResource

@Composable
fun LiveTvScreen(
    modifier: Modifier = Modifier,
    onChannelClick: (LiveTvChannel) -> Unit = {},
) {
    val uiState by remember {
        LiveTvRepository.ensureLoaded()
        LiveTvRepository.uiState
    }.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { LiveTvRepository.ensureGuideLoaded() }
    var sourceUrl by rememberSaveable { mutableStateOf(uiState.sourceUrl) }
    var query by rememberSaveable { mutableStateOf("") }
    var selectedGroup by rememberSaveable { mutableStateOf("") }
    var selectedCountry by rememberSaveable { mutableStateOf<String?>(null) }
    var favoritesOnly by rememberSaveable { mutableStateOf(false) }
    var editingSource by rememberSaveable { mutableStateOf(uiState.sourceUrl.isBlank()) }
    var showingAdvancedSettings by rememberSaveable { mutableStateOf(false) }
    var stalkerPortalUrl by rememberSaveable { mutableStateOf(uiState.stalkerSettings.portalUrl) }
    var stalkerMacAddress by rememberSaveable { mutableStateOf(uiState.stalkerSettings.macAddress) }
    var stalkerUsername by rememberSaveable { mutableStateOf(uiState.stalkerSettings.username) }
    var stalkerPassword by rememberSaveable { mutableStateOf(uiState.stalkerSettings.password) }
    var xtreamServerUrl by rememberSaveable { mutableStateOf(uiState.xtreamSettings.serverUrl) }
    var xtreamUsername by rememberSaveable { mutableStateOf(uiState.xtreamSettings.username) }
    var xtreamPassword by rememberSaveable { mutableStateOf(uiState.xtreamSettings.password) }
    var fileImportError by rememberSaveable { mutableStateOf<String?>(null) }
    var visibleChannelLimit by rememberSaveable { mutableStateOf(INITIAL_VISIBLE_CHANNEL_LIMIT) }
    var guideMode by rememberSaveable { mutableStateOf(true) }

    LaunchedEffect(uiState.sourceUrl) {
        if (sourceUrl.isBlank()) sourceUrl = uiState.sourceUrl
    }
    LaunchedEffect(uiState.channels) {
        if (uiState.channels.isNotEmpty()) editingSource = false
    }
    LaunchedEffect(uiState.stalkerSettings) {
        if (stalkerPortalUrl.isBlank()) stalkerPortalUrl = uiState.stalkerSettings.portalUrl
        if (stalkerMacAddress.isBlank()) stalkerMacAddress = uiState.stalkerSettings.macAddress
        if (stalkerUsername.isBlank()) stalkerUsername = uiState.stalkerSettings.username
        if (stalkerPassword.isBlank()) stalkerPassword = uiState.stalkerSettings.password
    }
    LaunchedEffect(uiState.xtreamSettings) {
        if (xtreamServerUrl.isBlank()) xtreamServerUrl = uiState.xtreamSettings.serverUrl
        if (xtreamUsername.isBlank()) xtreamUsername = uiState.xtreamSettings.username
        if (xtreamPassword.isBlank()) xtreamPassword = uiState.xtreamSettings.password
    }
    val derivedChannels by produceState(
        initialValue = LiveTvDerivedChannels(),
        uiState.channels,
        uiState.favoriteUrls,
        uiState.currentProgrammes,
        uiState.programmeSchedules,
        query,
        selectedGroup,
        selectedCountry,
        favoritesOnly,
    ) {
        value = withContext(Dispatchers.Default) {
            val eligibleChannels = uiState.channels.filterNot { isLikelyCategoryHeading(it.name) }
            // The guide is the source of truth for this screen. Do not expose
            // raw playlist rows that have no programme data.
            val realChannels = selectGuideBackedChannels(
                eligibleChannels,
                uiState.currentProgrammes,
                uiState.programmeSchedules,
            )
            LiveTvDerivedChannels(
                countries = realChannels.asSequence()
                    .mapNotNull(::liveTvCountryFor)
                    .distinctBy(LiveTvCountry::code)
                    .sortedWith(compareBy<LiveTvCountry>({ it.code != "US" }, { it.name }))
                    .toList(),
                groups = realChannels.asSequence()
                    .map(LiveTvChannel::group)
                    .filter(String::isNotBlank)
                    .distinct()
                    .sorted()
                    .toList(),
                visible = realChannels.filter { channel ->
                    (selectedCountry.isNullOrBlank() || liveTvCountryFor(channel)?.code == selectedCountry) &&
                    (selectedGroup.isBlank() || channel.group == selectedGroup) &&
                        (!favoritesOnly || channel.streamUrl in uiState.favoriteUrls) &&
                        (query.isBlank() || channel.name.contains(query, ignoreCase = true))
                },
            )
        }
    }
    LaunchedEffect(derivedChannels.countries) {
        if (selectedCountry == null) {
            if (derivedChannels.countries.isNotEmpty()) {
                selectedCountry = derivedChannels.countries.firstOrNull { it.code == "US" }?.code.orEmpty()
            }
        } else if (selectedCountry!!.isNotBlank() && derivedChannels.countries.none { it.code == selectedCountry }) {
            selectedCountry = ""
        }
    }
    val countries = derivedChannels.countries
    val groups = derivedChannels.groups
    val recentChannel = remember(uiState.recentChannel, uiState.channels, uiState.currentProgrammes, uiState.programmeSchedules) {
        uiState.recentChannel?.let { recent ->
            val currentMatch = uiState.channels.firstOrNull { it.streamUrl == recent.streamUrl }
            if (currentMatch != null && channelHasGuideData(currentMatch, uiState.currentProgrammes, uiState.programmeSchedules)) {
                recent.copy(
                    name = currentMatch.name,
                    logoUrl = currentMatch.logoUrl ?: recent.logoUrl,
                    group = currentMatch.group,
                    tvgId = currentMatch.tvgId ?: recent.tvgId,
                )
            } else {
                null
            }
        }
    }
    val visibleChannels = derivedChannels.visible
    val renderedChannels = remember(visibleChannels, visibleChannelLimit) {
        visibleChannels.take(visibleChannelLimit)
    }
    LaunchedEffect(query, selectedGroup, selectedCountry, favoritesOnly) {
        visibleChannelLimit = INITIAL_VISIBLE_CHANNEL_LIMIT
    }
    val loadSource: () -> Unit = {
        scope.launch {
            fileImportError = null
            if (sourceUrl.trim().startsWith("magnet:", ignoreCase = true)) {
                LiveTvIncomingSourceRepository.submitText(sourceUrl)
                editingSource = false
            } else if (LiveTvRepository.load(sourceUrl).isSuccess) {
                editingSource = false
                selectedGroup = ""
                favoritesOnly = false
            }
        }
        Unit
    }
    val chooseLocalPlaylistFile: () -> Unit = {
        fileImportError = null
        NuvioEnhancedBackupFileBridge.importBackup { result ->
            result
                .onSuccess { payload ->
                    scope.launch {
                        if (LiveTvRepository.loadLocalPlaylist("Selected M3U file", payload).isSuccess) {
                            editingSource = false
                            sourceUrl = LiveTvRepository.uiState.value.sourceUrl
                            selectedGroup = ""
                            favoritesOnly = false
                        }
                    }
                }
                .onFailure { error ->
                    fileImportError = error.message ?: "M3U file could not be read."
                }
        }
        Unit
    }
    val loadStalkerSource: () -> Unit = {
        scope.launch {
            val settings = LiveTvStalkerSettings(
                portalUrl = stalkerPortalUrl,
                macAddress = stalkerMacAddress,
                username = stalkerUsername,
                password = stalkerPassword,
            )
            if (LiveTvRepository.loadStalker(settings).isSuccess) {
                showingAdvancedSettings = false
                editingSource = false
                selectedGroup = ""
                favoritesOnly = false
            }
        }
        Unit
    }
    val loadXtreamSource: () -> Unit = {
        scope.launch {
            val settings = LiveTvXtreamSettings(
                serverUrl = xtreamServerUrl,
                username = xtreamUsername,
                password = xtreamPassword,
            )
            if (LiveTvRepository.loadXtream(settings).isSuccess) {
                showingAdvancedSettings = false
                editingSource = false
                selectedGroup = ""
                favoritesOnly = false
            }
        }
        Unit
    }
    val playChannel: (LiveTvChannel) -> Unit = { channel ->
        scope.launch {
            onChannelClick(LiveTvRepository.prepareForPlayback(channel))
        }
    }

    NuvioScreen(
        modifier = modifier,
        horizontalPadding = 16.dp,
    ) {
        if (showingAdvancedSettings) {
            item {
                NuvioScreenHeader(
                    title = stringResource(Res.string.live_tv_provider_settings_title),
                    includeStatusBarPadding = false,
                    onBack = { showingAdvancedSettings = false },
                )
            }
            item {
                LiveTvStalkerSettingsCard(
                    portalUrl = stalkerPortalUrl,
                    macAddress = stalkerMacAddress,
                    username = stalkerUsername,
                    password = stalkerPassword,
                    isLoading = uiState.isLoading,
                    errorMessage = uiState.errorMessage,
                    hasConnectedSource = uiState.sourceType == LiveTvSourceType.Stalker && uiState.channels.isNotEmpty(),
                    onPortalUrlChange = { stalkerPortalUrl = it },
                    onMacAddressChange = { stalkerMacAddress = it },
                    onUsernameChange = { stalkerUsername = it },
                    onPasswordChange = { stalkerPassword = it },
                    onLoad = loadStalkerSource,
                    onDisconnect = {
                        LiveTvRepository.disconnect()
                        editingSource = true
                        showingAdvancedSettings = false
                        favoritesOnly = false
                        selectedGroup = ""
                    },
                )
            }
            item {
                LiveTvXtreamSettingsCard(
                    serverUrl = xtreamServerUrl,
                    username = xtreamUsername,
                    password = xtreamPassword,
                    isLoading = uiState.isLoading,
                    errorMessage = uiState.errorMessage,
                    hasConnectedSource = uiState.sourceType == LiveTvSourceType.Xtream && uiState.channels.isNotEmpty(),
                    onServerUrlChange = { xtreamServerUrl = it },
                    onUsernameChange = { xtreamUsername = it },
                    onPasswordChange = { xtreamPassword = it },
                    onLoad = loadXtreamSource,
                    onDisconnect = {
                        LiveTvRepository.disconnect()
                        editingSource = true
                        showingAdvancedSettings = false
                        favoritesOnly = false
                        selectedGroup = ""
                    },
                )
            }
            return@NuvioScreen
        }

        item {
            NuvioScreenHeader(
                title = stringResource(Res.string.live_tv_title),
                includeStatusBarPadding = false,
                actions = {
                    NuvioIconActionButton(
                        icon = Icons.Rounded.Settings,
                        contentDescription = stringResource(Res.string.live_tv_settings),
                        onClick = { showingAdvancedSettings = true },
                    )
                    if (uiState.channels.isNotEmpty()) {
                        NuvioIconActionButton(
                            icon = Icons.Rounded.Refresh,
                            contentDescription = stringResource(Res.string.live_tv_refresh),
                            onClick = {
                                scope.launch {
                                    when {
                                        uiState.sourceType == LiveTvSourceType.Xtream ->
                                            LiveTvRepository.loadXtream(uiState.xtreamSettings)
                                        uiState.sourceType == LiveTvSourceType.Stalker ->
                                            LiveTvRepository.loadStalker(uiState.stalkerSettings)
                                        LiveTvStorage.hasStoredLocalPlaylist() ->
                                            LiveTvRepository.loadStoredLocalPlaylist()
                                        else ->
                                            LiveTvRepository.load(uiState.sourceUrl)
                                    }
                                }
                            },
                        )
                        NuvioIconActionButton(
                            icon = Icons.Rounded.AddLink,
                            contentDescription = stringResource(Res.string.live_tv_add_source),
                            onClick = { editingSource = !editingSource },
                        )
                    }
                },
            )
        }

        if (editingSource || uiState.channels.isEmpty()) {
            item {
                LiveTvSourceCard(
                    sourceUrl = sourceUrl,
                    isLoading = uiState.isLoading,
                    errorMessage = uiState.errorMessage,
                    fileImportError = fileImportError,
                    hasConnectedSource = uiState.channels.isNotEmpty(),
                    onSourceUrlChange = { sourceUrl = it },
                    onLoad = loadSource,
                    onChooseFile = chooseLocalPlaylistFile,
                    onDisconnect = {
                        LiveTvRepository.disconnect()
                        fileImportError = null
                        sourceUrl = ""
                        editingSource = true
                        favoritesOnly = false
                        selectedGroup = ""
                    },
                )
            }
        }

        if (recentChannel != null) {
            item {
                LiveTvRecentChannelCard(
                    channel = recentChannel,
                    onClick = {
                        playChannel(
                            uiState.channels.firstOrNull { it.streamUrl == recentChannel.streamUrl }
                                ?: LiveTvChannel(
                                    id = recentChannel.streamUrl,
                                    name = recentChannel.name,
                                    streamUrl = recentChannel.streamUrl,
                                    tvgId = recentChannel.tvgId,
                                    logoUrl = recentChannel.logoUrl,
                                    group = recentChannel.group,
                                ),
                        )
                    },
                )
            }
        }

        if (uiState.channels.isNotEmpty()) {
            item {
                NuvioInputField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = stringResource(Res.string.live_tv_search),
                    trailingContent = {
                        if (query.isBlank()) {
                            Icon(
                                imageVector = Icons.Rounded.Search,
                                contentDescription = null,
                                tint = MaterialTheme.nuvio.colors.textMuted,
                            )
                        } else {
                            IconButton(onClick = { query = "" }) {
                                Icon(
                                    imageVector = Icons.Rounded.Close,
                                    contentDescription = null,
                                    tint = MaterialTheme.nuvio.colors.textMuted,
                                )
                            }
                        }
                    },
                )
            }

            item {
                LiveTvFilterRow(
                    countries = countries,
                    selectedCountry = selectedCountry.orEmpty(),
                    groups = groups,
                    selectedGroup = selectedGroup,
                    favoritesOnly = favoritesOnly,
                    allLabel = stringResource(Res.string.live_tv_all_channels),
                    favoritesLabel = stringResource(Res.string.live_tv_favorites),
                    categoryLabel = stringResource(Res.string.live_tv_choose_category),
                    countryLabel = "All countries",
                    onCountrySelected = { selectedCountry = it },
                    onAllSelected = {
                        favoritesOnly = false
                        selectedGroup = ""
                    },
                    onFavoritesSelected = {
                        favoritesOnly = true
                        selectedGroup = ""
                    },
                    onGroupSelected = {
                        favoritesOnly = false
                        selectedGroup = it
                    },
                )
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        NuvioSectionLabel(text = if (guideMode) "Live TV guide" else stringResource(Res.string.live_tv_channels))
                        OutlinedButton(
                            onClick = { guideMode = !guideMode },
                            modifier = Modifier.tikTakTvFocus(),
                        ) {
                            Text(if (guideMode) "Channel list" else "Guide")
                        }
                    }
                    Text(
                        text = stringResource(Res.string.live_tv_channel_count, visibleChannels.size),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.nuvio.colors.textMuted,
                    )
                }
            }

            if (visibleChannels.isEmpty()) {
                item {
                    Text(
                        text = if (uiState.isEpgLoading) {
                            "Loading guide data. Channels will appear when programme information is ready…"
                        } else {
                            "No channels with guide data match these filters."
                        },
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.nuvio.colors.textMuted,
                    )
                }
            }

            if (guideMode) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                    ) {
                        Spacer(modifier = Modifier.width(302.dp))
                        listOf("Now", "+30 min", "+1 hr", "+1 hr 30").forEach { label ->
                            Text(
                                text = label,
                                modifier = Modifier.weight(1f),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.nuvio.colors.textMuted,
                            )
                        }
                    }
                }
            }

            items(
                count = renderedChannels.size,
                key = { index -> renderedChannels[index].id },
            ) { index ->
                LiveTvChannelRow(
                    channel = renderedChannels[index],
                    programme = renderedChannels[index].tvgId?.let(uiState.currentProgrammes::get)
                        ?: uiState.currentProgrammes[renderedChannels[index].id],
                    schedule = if (guideMode) {
                        renderedChannels[index].tvgId?.let(uiState.programmeSchedules::get)
                            ?: uiState.programmeSchedules[renderedChannels[index].id]
                            ?: emptyList()
                    } else {
                        emptyList()
                    },
                    showGuide = guideMode,
                    isFavorite = renderedChannels[index].streamUrl in uiState.favoriteUrls,
                    onFavoriteClick = { LiveTvRepository.toggleFavorite(renderedChannels[index]) },
                    onClick = { playChannel(renderedChannels[index]) },
                )
            }
            if (renderedChannels.size < visibleChannels.size) {
                item {
                    Button(onClick = {
                        visibleChannelLimit = (visibleChannelLimit + VISIBLE_CHANNEL_PAGE_SIZE)
                            .coerceAtMost(visibleChannels.size)
                    }) {
                        Text("Show more channels (${renderedChannels.size} of ${visibleChannels.size})")
                    }
                }
            }
        } else if (!uiState.isLoading && !editingSource) {
            item {
                LiveTvEmptyState(onAddSource = { editingSource = true })
            }
        }
    }
}

private data class LiveTvDerivedChannels(
    val countries: List<LiveTvCountry> = emptyList(),
    val groups: List<String> = emptyList(),
    val visible: List<LiveTvChannel> = emptyList(),
)

fun channelHasGuideData(
    channel: LiveTvChannel,
    currentProgrammes: Map<String, LiveTvProgramme>,
    schedules: Map<String, List<LiveTvProgramme>>,
): Boolean {
    val keys = listOfNotNull(channel.tvgId?.takeIf(String::isNotBlank), channel.id)
    return keys.any { key -> currentProgrammes[key] != null || !schedules[key].isNullOrEmpty() }
}

internal fun selectGuideBackedChannels(
    channels: List<LiveTvChannel>,
    currentProgrammes: Map<String, LiveTvProgramme>,
    schedules: Map<String, List<LiveTvProgramme>>,
): List<LiveTvChannel> = channels.filter { channelHasGuideData(it, currentProgrammes, schedules) }

internal data class LiveTvCountry(val code: String, val name: String)

private val liveTvCountries = listOf(
    Triple("US", "United States", Regex("^(?:US\\s*[|: -]|UNITED STATES\\b|USA\\b)", RegexOption.IGNORE_CASE)),
    Triple("CA", "Canada", Regex("^(?:CA\\s*[|: -]|CANADA\\b)", RegexOption.IGNORE_CASE)),
    Triple("GB", "United Kingdom", Regex("^(?:UK|GB)\\s*[|: -]|^UNITED KINGDOM\\b", RegexOption.IGNORE_CASE)),
    Triple("IE", "Ireland", Regex("^(?:IE|IR)\\s*[|: -]|^IRELAND\\b", RegexOption.IGNORE_CASE)),
    Triple("FR", "France", Regex("^FR\\s*[|: -]|^FRANCE\\b", RegexOption.IGNORE_CASE)),
    Triple("ES", "Spain", Regex("^ES\\s*[|: -]|^(?:SPAIN|ESPAÑA)\\b", RegexOption.IGNORE_CASE)),
    Triple("DE", "Germany", Regex("^DE\\s*[|: -]|^GERMANY\\b", RegexOption.IGNORE_CASE)),
    Triple("IT", "Italy", Regex("^IT\\s*[|: -]|^ITALY\\b", RegexOption.IGNORE_CASE)),
    Triple("PT", "Portugal", Regex("^PT\\s*[|: -]|^PORTUGAL\\b", RegexOption.IGNORE_CASE)),
    Triple("NL", "Netherlands", Regex("^NL\\s*[|: -]|^NETHERLANDS?\\b", RegexOption.IGNORE_CASE)),
    Triple("AU", "Australia", Regex("^AU\\s*[|: -]|^AUSTRALIA\\b", RegexOption.IGNORE_CASE)),
    Triple("NZ", "New Zealand", Regex("^NZ\\s*[|: -]|^NEW ZEALAND\\b", RegexOption.IGNORE_CASE)),
    Triple("BR", "Brazil", Regex("^BR\\s*[|: -]|^BRAZIL\\b", RegexOption.IGNORE_CASE)),
    Triple("IN", "India", Regex("^(?:IN\\s*[|: -]|INDIA\\b|ASIA\\s*\\|.*INDIA)", RegexOption.IGNORE_CASE)),
)

internal fun liveTvCountryFor(channel: LiveTvChannel): LiveTvCountry? {
    val candidate = channel.group.ifBlank { channel.name }.trim()
    return liveTvCountries.firstNotNullOfOrNull { (code, name, pattern) ->
        LiveTvCountry(code, name).takeIf { pattern.containsMatchIn(candidate) }
    }
}

private const val INITIAL_VISIBLE_CHANNEL_LIMIT = 80
private const val VISIBLE_CHANNEL_PAGE_SIZE = 80

@Composable
private fun LiveTvRecentChannelCard(
    channel: LiveTvRecentChannel,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    Surface(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
        color = tokens.colors.surface,
        shape = tokens.shapes.card,
        border = BorderStroke(NuvioTokens.Border.thin, tokens.colors.borderSubtle),
    ) {
        Row(
            modifier = Modifier.padding(tokens.spacing.cardPadding),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(58.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(tokens.colors.overlaySelected)
                    .border(
                        width = NuvioTokens.Border.thin,
                        color = tokens.colors.borderSubtle,
                        shape = RoundedCornerShape(16.dp),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                if (!channel.logoUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = channel.logoUrl,
                        contentDescription = channel.name,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(7.dp),
                        contentScale = ContentScale.Fit,
                    )
                } else {
                    Icon(
                        imageVector = Icons.Rounded.Tv,
                        contentDescription = null,
                        tint = tokens.colors.accent,
                    )
                }
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Text(
                    text = stringResource(Res.string.live_tv_recent_channel_title),
                    style = MaterialTheme.typography.labelMedium,
                    color = tokens.colors.textMuted,
                )
                Text(
                    text = channel.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = tokens.colors.textPrimary,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (channel.group.isNotBlank()) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(RoundedCornerShape(99.dp))
                                .background(tokens.colors.accent),
                        )
                        Text(
                            text = channel.group,
                            style = MaterialTheme.typography.bodySmall,
                            color = tokens.colors.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }

            }

            Surface(
                color = tokens.colors.overlaySelected,
                shape = tokens.shapes.chip,
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.PlayArrow,
                        contentDescription = null,
                        tint = tokens.colors.accent,
                    )
                    Text(
                        text = stringResource(Res.string.live_tv_recent_channel_cta),
                        style = MaterialTheme.typography.labelLarge,
                        color = tokens.colors.textPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

@Composable
private fun LiveTvSourceCard(
    sourceUrl: String,
    isLoading: Boolean,
    errorMessage: String?,
    fileImportError: String?,
    hasConnectedSource: Boolean,
    onSourceUrlChange: (String) -> Unit,
    onLoad: () -> Unit,
    onChooseFile: () -> Unit,
    onDisconnect: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = tokens.colors.surface,
        shape = tokens.shapes.card,
    ) {
        Column(
            modifier = Modifier.padding(tokens.spacing.cardPadding),
            verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s12),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s12),
            ) {
                Box(
                    modifier = Modifier
                        .size(NuvioTokens.Space.s48)
                        .clip(tokens.shapes.compactCard)
                        .background(tokens.colors.overlaySelected),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.AddLink,
                        contentDescription = null,
                        tint = tokens.colors.accent,
                    )
                }
                Column {
                    Text(
                        text = stringResource(Res.string.live_tv_source_title),
                        style = MaterialTheme.typography.titleMedium,
                        color = tokens.colors.textPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = stringResource(Res.string.live_tv_empty_description),
                        style = MaterialTheme.typography.bodySmall,
                        color = tokens.colors.textMuted,
                    )
                }
            }
            NuvioInputField(
                value = sourceUrl,
                onValueChange = onSourceUrlChange,
                placeholder = stringResource(Res.string.live_tv_source_hint),
            )
            (errorMessage ?: fileImportError)?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.colors.danger,
                )
            }
            NuvioPrimaryButton(
                text = stringResource(Res.string.live_tv_load),
                enabled = sourceUrl.isNotBlank() && !isLoading,
                onClick = onLoad,
            )
            OutlinedButton(
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading,
                onClick = onChooseFile,
            ) {
                Text(text = stringResource(Res.string.live_tv_load_file))
            }
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .size(NuvioTokens.Icon.md)
                        .align(Alignment.CenterHorizontally),
                    color = tokens.colors.accent,
                    strokeWidth = 2.dp,
                )
            }
            if (hasConnectedSource) {
                Text(
                    text = stringResource(Res.string.live_tv_disconnect),
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .clickable(onClick = onDisconnect)
                        .padding(8.dp),
                    style = MaterialTheme.typography.labelLarge,
                    color = tokens.colors.danger,
                )
            }
        }
    }
}

@Composable
private fun LiveTvStalkerSettingsCard(
    portalUrl: String,
    macAddress: String,
    username: String,
    password: String,
    isLoading: Boolean,
    errorMessage: String?,
    hasConnectedSource: Boolean,
    onPortalUrlChange: (String) -> Unit,
    onMacAddressChange: (String) -> Unit,
    onUsernameChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onLoad: () -> Unit,
    onDisconnect: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = tokens.colors.surface,
        shape = tokens.shapes.card,
        border = BorderStroke(NuvioTokens.Border.thin, tokens.colors.borderSubtle),
    ) {
        Column(
            modifier = Modifier.padding(tokens.spacing.cardPadding),
            verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s12),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s12),
            ) {
                Box(
                    modifier = Modifier
                        .size(NuvioTokens.Space.s48)
                        .clip(tokens.shapes.compactCard)
                        .background(tokens.colors.overlaySelected),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Settings,
                        contentDescription = null,
                        tint = tokens.colors.accent,
                    )
                }
                Column(
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = stringResource(Res.string.live_tv_source_stalker),
                        style = MaterialTheme.typography.titleMedium,
                        color = tokens.colors.textPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = stringResource(Res.string.live_tv_stalker_settings_description),
                        style = MaterialTheme.typography.bodySmall,
                        color = tokens.colors.textMuted,
                    )
                }
            }

            SourceTypePillRow(
                activeLabel = stringResource(Res.string.live_tv_source_stalker),
                inactiveLabel = stringResource(Res.string.live_tv_source_m3u),
            )

            NuvioInputField(
                value = portalUrl,
                onValueChange = onPortalUrlChange,
                placeholder = stringResource(Res.string.live_tv_stalker_portal_hint),
            )
            NuvioInputField(
                value = macAddress,
                onValueChange = onMacAddressChange,
                placeholder = stringResource(Res.string.live_tv_stalker_mac_hint),
            )
            NuvioInputField(
                value = username,
                onValueChange = onUsernameChange,
                placeholder = stringResource(Res.string.live_tv_stalker_username_hint),
            )
            NuvioInputField(
                value = password,
                onValueChange = onPasswordChange,
                placeholder = stringResource(Res.string.live_tv_stalker_password_hint),
            )

            errorMessage?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.colors.danger,
                )
            }
            NuvioPrimaryButton(
                text = stringResource(Res.string.live_tv_load),
                enabled = portalUrl.isNotBlank() && macAddress.isNotBlank() && !isLoading,
                onClick = onLoad,
            )
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .size(NuvioTokens.Icon.md)
                        .align(Alignment.CenterHorizontally),
                    color = tokens.colors.accent,
                    strokeWidth = 2.dp,
                )
            }
            if (hasConnectedSource) {
                Text(
                    text = stringResource(Res.string.live_tv_disconnect),
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .clickable(onClick = onDisconnect)
                        .padding(8.dp),
                    style = MaterialTheme.typography.labelLarge,
                    color = tokens.colors.danger,
                )
            }
        }
    }
}

@Composable
private fun LiveTvXtreamSettingsCard(
    serverUrl: String,
    username: String,
    password: String,
    isLoading: Boolean,
    errorMessage: String?,
    hasConnectedSource: Boolean,
    onServerUrlChange: (String) -> Unit,
    onUsernameChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onLoad: () -> Unit,
    onDisconnect: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = tokens.colors.surface,
        shape = tokens.shapes.card,
        border = BorderStroke(NuvioTokens.Border.thin, tokens.colors.borderSubtle),
    ) {
        Column(
            modifier = Modifier.padding(tokens.spacing.cardPadding),
            verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s12),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s12),
            ) {
                Box(
                    modifier = Modifier
                        .size(NuvioTokens.Space.s48)
                        .clip(tokens.shapes.compactCard)
                        .background(tokens.colors.overlaySelected),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Tv,
                        contentDescription = null,
                        tint = tokens.colors.accent,
                    )
                }
                Column(
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = stringResource(Res.string.live_tv_source_xtream),
                        style = MaterialTheme.typography.titleMedium,
                        color = tokens.colors.textPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = stringResource(Res.string.live_tv_xtream_settings_description),
                        style = MaterialTheme.typography.bodySmall,
                        color = tokens.colors.textMuted,
                    )
                }
            }

            SourceTypePillRow(
                activeLabel = stringResource(Res.string.live_tv_source_xtream),
                inactiveLabel = stringResource(Res.string.live_tv_source_m3u),
            )

            NuvioInputField(
                value = serverUrl,
                onValueChange = onServerUrlChange,
                placeholder = stringResource(Res.string.live_tv_xtream_server_hint),
            )
            NuvioInputField(
                value = username,
                onValueChange = onUsernameChange,
                placeholder = stringResource(Res.string.live_tv_xtream_username_hint),
            )
            NuvioInputField(
                value = password,
                onValueChange = onPasswordChange,
                placeholder = stringResource(Res.string.live_tv_xtream_password_hint),
            )

            errorMessage?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.colors.danger,
                )
            }
            NuvioPrimaryButton(
                text = stringResource(Res.string.live_tv_load),
                enabled = serverUrl.isNotBlank() && username.isNotBlank() && password.isNotBlank() && !isLoading,
                onClick = onLoad,
            )
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .size(NuvioTokens.Icon.md)
                        .align(Alignment.CenterHorizontally),
                    color = tokens.colors.accent,
                    strokeWidth = 2.dp,
                )
            }
            if (hasConnectedSource) {
                Text(
                    text = stringResource(Res.string.live_tv_disconnect),
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .clickable(onClick = onDisconnect)
                        .padding(8.dp),
                    style = MaterialTheme.typography.labelLarge,
                    color = tokens.colors.danger,
                )
            }
        }
    }
}

@Composable
private fun SourceTypePillRow(
    activeLabel: String,
    inactiveLabel: String,
) {
    val tokens = MaterialTheme.nuvio
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            color = tokens.colors.overlaySelected,
            contentColor = tokens.colors.textPrimary,
            shape = tokens.shapes.chip,
            border = BorderStroke(NuvioTokens.Border.thin, tokens.colors.accent.copy(alpha = 0.52f)),
        ) {
            Text(
                text = activeLabel,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Surface(
            color = tokens.colors.surfaceCard,
            contentColor = tokens.colors.textMuted,
            shape = tokens.shapes.chip,
            border = BorderStroke(NuvioTokens.Border.thin, tokens.colors.borderSubtle),
        ) {
            Text(
                text = inactiveLabel,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun LiveTvChannelRow(
    channel: LiveTvChannel,
    programme: LiveTvProgramme?,
    schedule: List<LiveTvProgramme>,
    showGuide: Boolean,
    isFavorite: Boolean,
    onFavoriteClick: () -> Unit,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    Surface(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
        color = tokens.colors.surface,
        shape = tokens.shapes.compactCard,
        border = BorderStroke(1.dp, tokens.colors.borderSubtle),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(tokens.colors.surfaceCard),
                contentAlignment = Alignment.Center,
            ) {
                if (!channel.logoUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = channel.logoUrl,
                        contentDescription = channel.name,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(8.dp),
                        contentScale = ContentScale.Fit,
                    )
                } else {
                    Icon(
                        imageVector = Icons.Rounded.Tv,
                        contentDescription = null,
                        tint = tokens.colors.textMuted,
                        modifier = Modifier.size(28.dp),
                    )
                }
            }
            Column(
                modifier = if (showGuide) Modifier.width(210.dp) else Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = channel.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = tokens.colors.textPrimary,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (channel.group.isNotBlank()) {
                    Text(
                        text = channel.group,
                        style = MaterialTheme.typography.bodySmall,
                        color = tokens.colors.textMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (programme != null) {
                    Text(
                        text = buildString {
                            append(programme.title)
                            if (programme.timeLabel.isNotBlank()) {
                                append("  •  ")
                                append(programme.timeLabel)
                            }
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = tokens.colors.accent,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (showGuide) {
                LiveTvTwoHourProgrammeRow(
                    schedule = schedule,
                    currentProgramme = programme,
                    modifier = Modifier.weight(1f),
                )
            }
            if (!showGuide) {
                IconButton(onClick = onFavoriteClick) {
                    Icon(
                        imageVector = if (isFavorite) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                        contentDescription = stringResource(Res.string.live_tv_favorite),
                        tint = if (isFavorite) tokens.colors.warning else tokens.colors.textMuted,
                    )
                }
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(tokens.shapes.avatar)
                        .background(tokens.colors.overlaySelected),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.PlayArrow,
                        contentDescription = null,
                        tint = tokens.colors.accent,
                    )
                }
            }
        }
    }
}

private data class LiveTvGuideSegment(
    val programme: LiveTvProgramme?,
    val startEpochMs: Long,
    val stopEpochMs: Long,
)

@Composable
private fun LiveTvTwoHourProgrammeRow(
    schedule: List<LiveTvProgramme>,
    currentProgramme: LiveTvProgramme?,
    modifier: Modifier = Modifier,
) {
    val tokens = MaterialTheme.nuvio
    val guideStart = remember { LiveTvClock.nowEpochMs() }
    val guideEnd = guideStart + TWO_HOUR_GUIDE_MS
    val segments = remember(schedule, guideStart) {
        buildList {
            var cursor = guideStart
            schedule.asSequence()
                .filter { it.stopEpochMs > guideStart && it.startEpochMs < guideEnd }
                .sortedBy(LiveTvProgramme::startEpochMs)
                .forEach { entry ->
                    val entryStart = entry.startEpochMs.coerceIn(guideStart, guideEnd)
                    val entryEnd = entry.stopEpochMs.coerceIn(guideStart, guideEnd)
                    if (entryStart > cursor) add(LiveTvGuideSegment(null, cursor, entryStart))
                    if (entryEnd > cursor) {
                        add(LiveTvGuideSegment(entry, maxOf(cursor, entryStart), entryEnd))
                        cursor = entryEnd
                    }
                }
            if (cursor < guideEnd) add(LiveTvGuideSegment(null, cursor, guideEnd))
        }
    }

    Column(modifier = modifier) {
        Row(
            modifier = Modifier.fillMaxWidth().height(62.dp),
            horizontalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            segments.forEach { segment ->
                val duration = (segment.stopEpochMs - segment.startEpochMs).coerceAtLeast(1L).toFloat()
                val entry = segment.programme
                Surface(
                    modifier = Modifier.weight(duration).fillMaxSize(),
                    color = if (entry == currentProgramme) tokens.colors.overlaySelected else tokens.colors.surfaceCard,
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, tokens.colors.borderSubtle),
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 7.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(
                            text = entry?.title ?: "No guide data",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (entry == currentProgramme) tokens.colors.accent else tokens.colors.textPrimary,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (entry != null) {
                            Text(
                                text = entry.timeLabel,
                                style = MaterialTheme.typography.labelSmall,
                                color = tokens.colors.textMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }
    }
}

private const val TWO_HOUR_GUIDE_MS = 2L * 60L * 60L * 1_000L

@Composable
private fun LiveTvEmptyState(onAddSource: () -> Unit) {
    val tokens = MaterialTheme.nuvio
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 56.dp, horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = Icons.Rounded.Tv,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = tokens.colors.textMuted,
        )
        Text(
            text = stringResource(Res.string.live_tv_empty_title),
            style = MaterialTheme.typography.titleLarge,
            color = tokens.colors.textPrimary,
        )
        Text(
            text = stringResource(Res.string.live_tv_empty_description),
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.colors.textMuted,
        )
        Spacer(modifier = Modifier.height(4.dp))
        NuvioPrimaryButton(
            text = stringResource(Res.string.live_tv_add_source),
            modifier = Modifier.fillMaxWidth(0.72f),
            onClick = onAddSource,
        )
    }
}
