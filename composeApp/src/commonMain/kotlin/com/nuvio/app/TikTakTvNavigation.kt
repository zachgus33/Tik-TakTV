package com.nuvio.app

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.NuvioTokens
import com.nuvio.app.core.ui.PlatformBackHandler
import com.nuvio.app.core.ui.nuvio
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.compose_nav_home
import nuvio.composeapp.generated.resources.compose_nav_library
import nuvio.composeapp.generated.resources.compose_nav_live_tv
import nuvio.composeapp.generated.resources.compose_nav_profile
import nuvio.composeapp.generated.resources.compose_nav_search
import nuvio.composeapp.generated.resources.sidebar_home
import nuvio.composeapp.generated.resources.sidebar_library
import nuvio.composeapp.generated.resources.sidebar_live_tv
import nuvio.composeapp.generated.resources.sidebar_search
import nuvio.composeapp.generated.resources.sidebar_settings
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.stringResource

internal val TikTakTvNavigationRailWidth = 124.dp

private data class TikTakTvNavigationEntry(
    val tab: AppScreenTab,
    val label: String,
    val icon: DrawableResource,
)

/** Remote-first root navigation used only by the dedicated native TV host. */
@Composable
internal fun TikTakTvNavigationRail(
    selectedTab: AppScreenTab,
    liveTvEnabled: Boolean,
    onTabSelected: (AppScreenTab) -> Unit,
    focusRequestKey: Int = 0,
    onFocusChanged: (Boolean) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val entries = buildList {
        add(TikTakTvNavigationEntry(AppScreenTab.Home, stringResource(Res.string.compose_nav_home), Res.drawable.sidebar_home))
        add(TikTakTvNavigationEntry(AppScreenTab.Search, stringResource(Res.string.compose_nav_search), Res.drawable.sidebar_search))
        if (liveTvEnabled) {
            add(TikTakTvNavigationEntry(AppScreenTab.LiveTv, stringResource(Res.string.compose_nav_live_tv), Res.drawable.sidebar_live_tv))
        }
        add(TikTakTvNavigationEntry(AppScreenTab.Library, stringResource(Res.string.compose_nav_library), Res.drawable.sidebar_library))
        add(TikTakTvNavigationEntry(AppScreenTab.Settings, stringResource(Res.string.compose_nav_profile), Res.drawable.sidebar_settings))
    }

    Column(
        modifier = modifier
            .width(TikTakTvNavigationRailWidth)
            .fillMaxHeight()
            .focusGroup()
            .onFocusChanged { onFocusChanged(it.hasFocus) }
            .background(MaterialTheme.nuvio.colors.surface.copy(alpha = 0.96f))
            .padding(horizontal = 14.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "T",
            color = MaterialTheme.nuvio.colors.accent,
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Black,
        )
        Text(
            text = "TikTak TV",
            color = MaterialTheme.nuvio.colors.textPrimary,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(16.dp))

        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            entries.forEach { entry ->
                TikTakTvNavigationItem(
                    entry = entry,
                    selected = selectedTab == entry.tab,
                    initiallyFocused = selectedTab == entry.tab,
                    focusRequestKey = focusRequestKey,
                    onClick = { onTabSelected(entry.tab) },
                )
            }
        }

        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "NATIVE TV",
            color = MaterialTheme.nuvio.colors.textMuted,
            style = MaterialTheme.typography.labelSmall,
            letterSpacing = NuvioTokens.Type.labelXs / 8,
        )
    }
}

@Composable
private fun TikTakTvNavigationItem(
    entry: TikTakTvNavigationEntry,
    selected: Boolean,
    initiallyFocused: Boolean,
    focusRequestKey: Int,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val background by animateColorAsState(
        targetValue = when {
            focused -> MaterialTheme.nuvio.colors.accent.copy(alpha = 0.28f)
            selected -> MaterialTheme.nuvio.colors.accent.copy(alpha = 0.14f)
            else -> Color.Transparent
        },
        label = "tv_nav_background",
    )
    val borderColor by animateColorAsState(
        targetValue = if (focused) MaterialTheme.nuvio.colors.accent else Color.Transparent,
        label = "tv_nav_border",
    )
    val itemSize by animateDpAsState(
        targetValue = if (focused) 64.dp else 58.dp,
        label = "tv_nav_item_size",
    )

    LaunchedEffect(initiallyFocused, focusRequestKey) {
        if (initiallyFocused) focusRequester.requestFocus()
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .height(itemSize)
            .scale(if (focused) 1.04f else 1f)
            .focusRequester(focusRequester)
            .onFocusChanged { focused = it.hasFocus }
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown && event.key == Key.DirectionRight) {
                    focusManager.moveFocus(FocusDirection.Right)
                } else {
                    false
                }
            }
            .clip(RoundedCornerShape(14.dp))
            .background(background)
            .border(2.dp, borderColor, RoundedCornerShape(14.dp))
            .selectable(
                selected = selected,
                role = Role.Tab,
                onClick = onClick,
            )
            .padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            painter = painterResource(entry.icon),
            contentDescription = entry.label,
            tint = if (focused || selected) MaterialTheme.nuvio.colors.accent else MaterialTheme.nuvio.colors.textMuted,
            modifier = Modifier.size(24.dp),
        )
        Text(
            text = entry.label,
            color = if (focused || selected) MaterialTheme.nuvio.colors.textPrimary else MaterialTheme.nuvio.colors.textMuted,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = if (focused || selected) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
        )
    }
}

/** Deterministic ten-foot shell used by CI to validate focus and scaling without account credentials. */
@Composable
fun TikTakTvShellPreview() {
    var selectedTab by remember { mutableStateOf(AppScreenTab.Home) }
    var railHasFocus by remember { mutableStateOf(false) }
    var railFocusRequestKey by remember { mutableStateOf(0) }
    PlatformBackHandler(enabled = true) {
        if (!railHasFocus) {
            railFocusRequestKey++
        } else if (selectedTab != AppScreenTab.Home) {
            selectedTab = AppScreenTab.Home
        }
    }
    Row(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.nuvio.colors.background),
    ) {
        TikTakTvNavigationRail(
            selectedTab = selectedTab,
            liveTvEnabled = true,
            onTabSelected = { selectedTab = it },
            focusRequestKey = railFocusRequestKey,
            onFocusChanged = { railHasFocus = it },
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 48.dp, vertical = 38.dp),
        ) {
            Text(
                text = selectedTab.name.replace("LiveTv", "Live TV"),
                color = MaterialTheme.nuvio.colors.textPrimary,
                style = MaterialTheme.typography.displaySmall,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "Native Android TV preview",
                color = MaterialTheme.nuvio.colors.textMuted,
                style = MaterialTheme.typography.titleMedium,
            )
            Spacer(modifier = Modifier.height(36.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(24.dp),
            ) {
                repeat(4) { index -> TikTakTvPreviewContentCard(index = index, modifier = Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun TikTakTvPreviewContentCard(index: Int, modifier: Modifier = Modifier) {
    var focused by remember { mutableStateOf(false) }
    Box(
        modifier = modifier
            .height(124.dp)
            .onFocusChanged { focused = it.hasFocus }
            .clip(RoundedCornerShape(18.dp))
            .background(
                if (focused) MaterialTheme.nuvio.colors.accent.copy(alpha = 0.22f)
                else MaterialTheme.nuvio.colors.surface,
            )
            .border(
                width = if (focused) 3.dp else 1.dp,
                color = if (focused) MaterialTheme.nuvio.colors.accent else MaterialTheme.nuvio.colors.borderDefault,
                shape = RoundedCornerShape(18.dp),
            )
            .focusable(),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "Content ${index + 1}",
            color = MaterialTheme.nuvio.colors.textPrimary,
            style = MaterialTheme.typography.titleMedium,
        )
    }
}
