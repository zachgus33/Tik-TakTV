package com.nuvio.app.core.ui

import androidx.compose.foundation.IndicationNodeFactory
import androidx.compose.foundation.interaction.FocusInteraction
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.node.DelegatableNode
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.invalidateDraw
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * A single, app-wide D-pad focus treatment for the native TV host.
 *
 * Shared phone and web screens use many different Material and custom
 * clickables. They all publish [FocusInteraction] events through their normal
 * indication source, so drawing the TV focus ring here keeps every current and
 * future screen visible to a remote user without duplicating focus styling in
 * every feature.
 */
object TikTakTvFocusIndication : IndicationNodeFactory {
    override fun create(interactionSource: InteractionSource): DelegatableNode =
        TikTakTvFocusIndicationNode(interactionSource)

    override fun equals(other: Any?): Boolean = other === this

    override fun hashCode(): Int = 0x54564F43
}

private class TikTakTvFocusIndicationNode(
    private val interactionSource: InteractionSource,
) : Modifier.Node(), DrawModifierNode {
    private val activeFocusInteractions = mutableSetOf<FocusInteraction.Focus>()
    private var focused = false

    override fun onAttach() {
        coroutineScope.launch {
            interactionSource.interactions.collect { interaction ->
                when (interaction) {
                    is FocusInteraction.Focus -> activeFocusInteractions += interaction
                    is FocusInteraction.Unfocus -> activeFocusInteractions -= interaction.focus
                }
                val nextFocused = activeFocusInteractions.isNotEmpty()
                if (focused != nextFocused) {
                    focused = nextFocused
                    invalidateDraw()
                }
            }
        }
    }

    override fun ContentDrawScope.draw() {
        drawContent()
        if (!focused) return

        // The selected control has to remain obvious from across a room and on
        // washed-out projectors. A tinted wash plus a two-tone ring survives
        // both dark artwork and bright cards better than the former thin line.
        drawRoundRect(
            color = Color(0x33FF4F9A),
            cornerRadius = CornerRadius(14.dp.toPx()),
        )
        val strokeWidth = 6.dp.toPx()
        val inset = strokeWidth / 2f
        drawRoundRect(
            color = Color(0xFFFF4F9A),
            topLeft = androidx.compose.ui.geometry.Offset(inset, inset),
            size = androidx.compose.ui.geometry.Size(
                width = (size.width - strokeWidth).coerceAtLeast(0f),
                height = (size.height - strokeWidth).coerceAtLeast(0f),
            ),
            cornerRadius = CornerRadius(14.dp.toPx()),
            style = Stroke(width = strokeWidth),
        )
        val innerStrokeWidth = 2.dp.toPx()
        val innerInset = strokeWidth + innerStrokeWidth / 2f
        drawRoundRect(
            color = Color.White,
            topLeft = androidx.compose.ui.geometry.Offset(innerInset, innerInset),
            size = androidx.compose.ui.geometry.Size(
                width = (size.width - innerInset * 2f).coerceAtLeast(0f),
                height = (size.height - innerInset * 2f).coerceAtLeast(0f),
            ),
            cornerRadius = CornerRadius(10.dp.toPx()),
            style = Stroke(width = innerStrokeWidth),
        )
    }
}
