package com.nuvio.app.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState

@Composable
internal fun rememberPosterCardStyleUiState(): PosterCardStyleUiState {
    PosterCardStyleRepository.ensureLoaded()
    val uiState by PosterCardStyleRepository.uiState.collectAsState()
    if (!LocalTvMode.current) return uiState

    // TV layouts use density-independent pixels, so phone-sized poster
    // preferences become physically oversized on a 1080p television.
    val tvWidth = uiState.widthDp.coerceAtMost(108)
    return uiState.copy(
        widthDp = tvWidth,
        heightDp = (tvWidth * 3) / 2,
    )
}
