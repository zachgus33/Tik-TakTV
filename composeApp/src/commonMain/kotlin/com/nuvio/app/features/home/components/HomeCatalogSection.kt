package com.nuvio.app.features.home.components

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.unit.Dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.core.ui.NuvioShelfSection
import com.nuvio.app.core.ui.NuvioViewAllPillSize
import com.nuvio.app.core.ui.rememberPosterCardStyleUiState
import com.nuvio.app.features.home.HomeCatalogSettingsRepository
import com.nuvio.app.features.home.HomeCatalogSection
import com.nuvio.app.features.home.HomeRepository
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.home.stableKey
import com.nuvio.app.features.watching.application.WatchingState

@Composable
fun HomeCatalogRowSection(
    section: HomeCatalogSection,
    modifier: Modifier = Modifier,
    entries: List<MetaPreview> = section.items,
    watchedKeys: Set<String> = emptySet(),
    fullyWatchedSeriesKeys: Set<String> = emptySet(),
    hideReleaseDates: Boolean = false,
    sectionPadding: Dp? = null,
    onViewAllClick: (() -> Unit)? = null,
    onPosterClick: ((MetaPreview) -> Unit)? = null,
    onPosterLongClick: ((MetaPreview) -> Unit)? = null,
    onPosterFocusTargetActivated: ((String) -> Unit)? = null,
    restoreFocusToken: String? = null,
    restoreFocusRequestCount: Int = 0,
) {
    if (sectionPadding != null) {
        HomeCatalogRowSectionContent(
            section = section,
            entries = entries,
            watchedKeys = watchedKeys,
            fullyWatchedSeriesKeys = fullyWatchedSeriesKeys,
            hideReleaseDates = hideReleaseDates,
            modifier = modifier.fillMaxWidth(),
            sectionPadding = sectionPadding,
            onViewAllClick = onViewAllClick,
            onPosterClick = onPosterClick,
            onPosterLongClick = onPosterLongClick,
            onPosterFocusTargetActivated = onPosterFocusTargetActivated,
            restoreFocusToken = restoreFocusToken,
            restoreFocusRequestCount = restoreFocusRequestCount,
        )
    } else {
        BoxWithConstraints(modifier = modifier.fillMaxWidth()) {
            HomeCatalogRowSectionContent(
                section = section,
                entries = entries,
                watchedKeys = watchedKeys,
                fullyWatchedSeriesKeys = fullyWatchedSeriesKeys,
                hideReleaseDates = hideReleaseDates,
                modifier = Modifier.fillMaxWidth(),
                sectionPadding = homeSectionHorizontalPaddingForWidth(maxWidth.value),
                onViewAllClick = onViewAllClick,
                onPosterClick = onPosterClick,
                onPosterLongClick = onPosterLongClick,
                onPosterFocusTargetActivated = onPosterFocusTargetActivated,
                restoreFocusToken = restoreFocusToken,
                restoreFocusRequestCount = restoreFocusRequestCount,
            )
        }
    }
}

@Composable
private fun HomeCatalogRowSectionContent(
    section: HomeCatalogSection,
    entries: List<MetaPreview>,
    watchedKeys: Set<String>,
    fullyWatchedSeriesKeys: Set<String>,
    hideReleaseDates: Boolean,
    modifier: Modifier,
    sectionPadding: Dp,
    onViewAllClick: (() -> Unit)?,
    onPosterClick: ((MetaPreview) -> Unit)?,
    onPosterLongClick: ((MetaPreview) -> Unit)?,
    onPosterFocusTargetActivated: ((String) -> Unit)?,
    restoreFocusToken: String?,
    restoreFocusRequestCount: Int,
) {
    val posterCardStyle = rememberPosterCardStyleUiState()
    val homeCatalogSettings by remember {
        HomeCatalogSettingsRepository.snapshot()
        HomeCatalogSettingsRepository.uiState
    }.collectAsStateWithLifecycle()
    val rowState = rememberLazyListState()
    val restoreFocusRequester = remember { FocusRequester() }
    val restoreIndex = remember(section.key, entries, restoreFocusToken) {
        entries.indexOfFirst { item ->
            homeCatalogFocusToken(section.key, item) == restoreFocusToken
        }
    }

    LaunchedEffect(restoreFocusRequestCount, restoreIndex) {
        if (restoreFocusRequestCount <= 0 || restoreIndex < 0) return@LaunchedEffect
        val resolvedRowCount = homeCatalogSettings.homeCatalogRowCount.coerceIn(1, 4)
        rowState.scrollToItem(restoreIndex / resolvedRowCount)
        withFrameNanos { }
        runCatching { restoreFocusRequester.requestFocus() }
    }

    NuvioShelfSection(
        title = section.title,
        entries = entries,
        modifier = modifier,
        headerHorizontalPadding = sectionPadding,
        rowContentPadding = PaddingValues(horizontal = sectionPadding),
        showHeaderAccent = !homeCatalogSettings.hideCatalogUnderline,
        rowCount = homeCatalogSettings.homeCatalogRowCount,
        onViewAllClick = onViewAllClick,
        viewAllPillSize = NuvioViewAllPillSize.Compact,
        onEndReached = if (section.hasMore) {
            { HomeRepository.loadMoreHomeSection(section.key) }
        } else {
            null
        },
        externalRowState = rowState,
        key = { item -> item.stableKey() },
    ) { item ->
        val focusToken = homeCatalogFocusToken(section.key, item)
        HomePosterCard(
            item = item,
            useLandscapeBackdropMode = posterCardStyle.catalogLandscapeModeEnabled,
            isWatched = WatchingState.isPosterWatched(
                watchedKeys = watchedKeys,
                item = item,
                fullyWatchedSeriesKeys = fullyWatchedSeriesKeys,
            ),
            hideReleaseDate = hideReleaseDates,
            focusRequester = if (focusToken == restoreFocusToken) restoreFocusRequester else null,
            onClick = if (onPosterClick != null || onPosterFocusTargetActivated != null) {
                {
                    onPosterFocusTargetActivated?.invoke(focusToken)
                    onPosterClick?.invoke(item)
                }
            } else {
                null
            },
            onLongClick = onPosterLongClick?.let { { it(item) } },
        )
    }
}

private fun homeCatalogFocusToken(sectionKey: String, item: MetaPreview): String =
    "catalog:$sectionKey:${item.stableKey()}"
