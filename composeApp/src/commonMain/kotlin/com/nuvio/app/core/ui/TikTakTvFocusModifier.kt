package com.nuvio.app.core.ui

import androidx.compose.foundation.interaction.FocusInteraction
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp

/**
 * Adds the TV scale and elevation treatment to prominent controls.
 *
 * The app-wide [TikTakTvFocusIndication] covers standard controls. Prominent
 * cards also draw the same inset ring from their direct focus state because
 * some older Compose clickables do not publish a [FocusInteraction]. Both
 * rings use identical bounds, so they overlap as one instead of stacking.
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
            shape = RoundedCornerShape(16.dp)
            clip = false
        }
        .drawWithContent {
            drawContent()
            if (!focused) return@drawWithContent
            val strokeWidth = 6.dp.toPx()
            val inset = strokeWidth / 2f
            drawRoundRect(
                color = Color(0xFFFF4F9A),
                topLeft = Offset(inset, inset),
                size = Size(
                    width = (size.width - strokeWidth).coerceAtLeast(0f),
                    height = (size.height - strokeWidth).coerceAtLeast(0f),
                ),
                cornerRadius = CornerRadius(14.dp.toPx()),
                style = Stroke(width = strokeWidth),
            )
        }
}
