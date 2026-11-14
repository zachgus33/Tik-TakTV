package com.nuvio.app.core.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SheetState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.widthIn
import kotlinx.coroutines.launch

data class NuvioDropdownOption(
    val key: String,
    val label: String,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NuvioDropdownChip(
    title: String,
    label: String,
    selectedKey: String?,
    options: List<NuvioDropdownOption>,
    enabled: Boolean = true,
    pillStyle: Boolean = false,
    onSelected: (NuvioDropdownOption) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MaterialTheme.nuvio
    var isSheetVisible by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val coroutineScope = rememberCoroutineScope()
    val selected = selectedKey != null
    val shape = if (pillStyle) tokens.shapes.chip else tokens.shapes.compactCard
    val containerColor = when {
        pillStyle && selected -> tokens.colors.overlaySelected
        else -> tokens.colors.surface
    }

    Row(
        modifier = modifier
            .then(if (enabled) Modifier.tikTakTvFocus() else Modifier)
            .clip(shape)
            .background(containerColor)
            .then(
                if (pillStyle && !selected) {
                    Modifier.border(
                        width = NuvioTokens.Border.thin,
                        color = tokens.colors.borderSubtle,
                        shape = shape,
                    )
                } else {
                    Modifier
                },
            )
            .then(
                if (enabled) {
                    Modifier.clickable { isSheetVisible = true }
                } else {
                    Modifier
                },
            )
            .padding(
                horizontal = if (pillStyle) 16.dp else NuvioTokens.Space.s12,
                vertical = if (pillStyle) 9.dp else tokens.components.chipVerticalPadding,
            ),
        horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s6),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = when {
                !enabled -> tokens.colors.textDisabled
                pillStyle && selected -> tokens.colors.accent
                pillStyle -> tokens.colors.textSecondary
                else -> tokens.colors.textPrimary
            },
            fontWeight = when {
                pillStyle && selected -> FontWeight.SemiBold
                pillStyle -> FontWeight.Medium
                else -> FontWeight.Normal
            },
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Icon(
            imageVector = Icons.Rounded.KeyboardArrowDown,
            contentDescription = null,
            modifier = Modifier.size(NuvioTokens.Icon.sm + NuvioTokens.Space.s2),
            tint = when {
                !enabled -> tokens.colors.borderDefault
                pillStyle && selected -> tokens.colors.accent
                else -> tokens.colors.textMuted
            },
        )
    }

    if (isSheetVisible) {
        NuvioDropdownOptionsSheet(
            title = title,
            options = options,
            selectedKey = selectedKey,
            sheetState = sheetState,
            onDismiss = {
                coroutineScope.launch {
                    dismissNuvioBottomSheet(
                        sheetState = sheetState,
                        onDismiss = { isSheetVisible = false },
                    )
                }
            },
            onSelected = { option ->
                onSelected(option)
                coroutineScope.launch {
                    dismissNuvioBottomSheet(
                        sheetState = sheetState,
                        onDismiss = { isSheetVisible = false },
                    )
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NuvioDropdownOptionsSheet(
    title: String,
    options: List<NuvioDropdownOption>,
    selectedKey: String?,
    sheetState: SheetState,
    onDismiss: () -> Unit,
    onSelected: (NuvioDropdownOption) -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    if (LocalTvMode.current) {
        val selectedIndex = options.indexOfFirst { it.key == selectedKey }.coerceAtLeast(0)
        val listState = rememberLazyListState(initialFirstVisibleItemIndex = selectedIndex)
        val initialFocus = remember { FocusRequester() }
        LaunchedEffect(options, selectedKey) { initialFocus.requestFocus() }
        Dialog(
            onDismissRequest = onDismiss,
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Surface(
                modifier = Modifier.padding(24.dp).fillMaxWidth().widthIn(max = 640.dp),
                shape = tokens.shapes.compactCard,
                color = tokens.colors.surfaceSheet,
            ) {
                Column(modifier = Modifier.padding(vertical = 12.dp)) {
                    Text(
                        text = title,
                        modifier = Modifier.padding(horizontal = 24.dp, vertical = 14.dp),
                        style = MaterialTheme.typography.titleLarge,
                        color = tokens.colors.textPrimary,
                    )
                    NuvioBottomSheetDivider()
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp),
                    ) {
                        itemsIndexed(options) { index, option ->
                            NuvioBottomSheetActionRow(
                                title = option.label,
                                onClick = { onSelected(option) },
                                modifier = if (index == selectedIndex) Modifier.focusRequester(initialFocus) else Modifier,
                                trailingContent = {
                                    if (option.key == selectedKey) {
                                        Icon(Icons.Rounded.Check, contentDescription = null,
                                            tint = tokens.colors.accent, modifier = Modifier.size(tokens.icons.md))
                                    }
                                },
                            )
                            if (index < options.lastIndex) NuvioBottomSheetDivider()
                        }
                    }
                }
            }
        }
        return
    }
    NuvioModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = nuvioSafeBottomPadding(tokens.spacing.screenHorizontal)),
        ) {
            Text(
                text = title,
                modifier = Modifier.padding(horizontal = tokens.spacing.screenHorizontal, vertical = NuvioTokens.Space.s14),
                style = MaterialTheme.typography.titleLarge,
                color = tokens.colors.textPrimary,
            )
            NuvioBottomSheetDivider()
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = tokens.breakpoints.largePhone),
            ) {
                itemsIndexed(options) { index, option ->
                    NuvioBottomSheetActionRow(
                        title = option.label,
                        onClick = { onSelected(option) },
                        trailingContent = {
                            if (option.key == selectedKey) {
                                Icon(
                                    imageVector = Icons.Rounded.Check,
                                    contentDescription = null,
                                    tint = tokens.colors.accent,
                                    modifier = Modifier.size(tokens.icons.md),
                                )
                            }
                        },
                    )
                    if (index < options.lastIndex) {
                        NuvioBottomSheetDivider()
                    }
                }
            }
        }
    }
}
