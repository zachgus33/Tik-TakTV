package com.nuvio.app.features.player

import androidx.compose.foundation.border
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.LocalTvMode

/** Visible mouse hover and remote focus for player actions and menu choices. */
@Composable
internal fun Modifier.playerHoverFocusOutline(shape: Shape): Modifier {
    if (!LocalTvMode.current) return this
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val hovered by interactionSource.collectIsHoveredAsState()
    val highlighted = focused || hovered
    return this
        .hoverable(interactionSource)
        .onFocusChanged { focused = it.hasFocus }
        .border(
            width = if (highlighted) 3.dp else 0.dp,
            color = if (highlighted) Color(0xFFFF4F9A) else Color.Transparent,
            shape = shape,
        )
}

/** Request focus on a real action after its animated panel enters the tree. */
@Composable
internal fun Modifier.playerInitialFocus(visible: Boolean): Modifier {
    if (!LocalTvMode.current) return this
    val requester = remember { FocusRequester() }
    LaunchedEffect(visible) {
        if (visible) repeat(4) {
            withFrameNanos { }
            if (runCatching { requester.requestFocus() }.getOrDefault(false)) return@LaunchedEffect
        }
    }
    return this.focusRequester(requester)
}
