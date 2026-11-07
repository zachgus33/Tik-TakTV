package com.nuvio.app.core.ui

import androidx.compose.runtime.staticCompositionLocalOf

/** True only for the dedicated native Android TV host. */
val LocalTvMode = staticCompositionLocalOf { false }
