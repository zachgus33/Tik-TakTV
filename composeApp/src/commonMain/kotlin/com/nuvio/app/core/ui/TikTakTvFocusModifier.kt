package com.nuvio.app.core.ui

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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp

/**
 * Explicit ten-foot focus treatment for controls whose own surface can cover
 * the app-wide indication. Place this before clickable/combinedClickable so it
 * observes the same focus target created by the click modifier.
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
        .drawWithContent {
            drawContent()
            if (!focused) return@drawWithContent

            drawRect(Color(0x3DFF4F9A))
            val outer = 7.dp.toPx()
            val outerInset = outer / 2f
            drawRoundRect(
                color = Color(0xFFFF4F9A),
                topLeft = Offset(outerInset, outerInset),
                size = Size(
                    (size.width - outer).coerceAtLeast(0f),
                    (size.height - outer).coerceAtLeast(0f),
                ),
                cornerRadius = CornerRadius(14.dp.toPx()),
                style = Stroke(outer),
            )
            val inner = 2.dp.toPx()
            val innerInset = outer + inner / 2f
            drawRoundRect(
                color = Color.White,
                topLeft = Offset(innerInset, innerInset),
                size = Size(
                    (size.width - innerInset * 2f).coerceAtLeast(0f),
                    (size.height - innerInset * 2f).coerceAtLeast(0f),
                ),
                cornerRadius = CornerRadius(10.dp.toPx()),
                style = Stroke(inner),
            )
        }
}
