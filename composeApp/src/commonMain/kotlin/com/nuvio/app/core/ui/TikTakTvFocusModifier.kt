package com.nuvio.app.core.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp

/**
 * Adds the TV scale and elevation treatment to prominent controls.
 *
 * The single visible ring is supplied app-wide by [TikTakTvFocusIndication].
 * Drawing a second ring here caused the doubled pink outline seen on Sports
 * cards and other controls that opt in to this emphasis modifier.
 */
fun Modifier.tikTakTvFocus(): Modifier = composed {
    if (!LocalTvMode.current) return@composed this

    var focused by remember { mutableStateOf(false) }
    this
        .onFocusChanged { focused = it.hasFocus }
        .graphicsLayer {
            scaleX = if (focused) 1.045f else 1f
            scaleY = if (focused) 1.045f else 1f
            shadowElevation = if (focused) 14.dp.toPx() else 0f
            clip = false
        }
}
