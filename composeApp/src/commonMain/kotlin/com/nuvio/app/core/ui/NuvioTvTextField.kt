package com.nuvio.app.core.ui

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.TextFieldColors
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.withFrameNanos

/**
 * A text field that is safe to navigate with a TV remote.
 *
 * D-pad focus only selects the field. The user must press Select/Enter before
 * the software keyboard opens. Up, Down, or Back exits editing and returns to
 * normal D-pad navigation. Touch and non-TV builds retain normal text-field
 * behavior.
 */
@Composable
fun NuvioTvTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    isError: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    label: (@Composable (() -> Unit))? = null,
    placeholder: (@Composable (() -> Unit))? = null,
    leadingIcon: (@Composable (() -> Unit))? = null,
    trailingIcon: (@Composable (() -> Unit))? = null,
    supportingText: (@Composable (() -> Unit))? = null,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    textStyle: TextStyle? = null,
    shape: Shape = RoundedCornerShape(12.dp),
    colors: TextFieldColors = OutlinedTextFieldDefaults.colors(),
) {
    val isTv = LocalTvMode.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    var hasFocus by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }

    LaunchedEffect(isTv, editing) {
        if (isTv && editing) {
            // Wait until readOnly=false has reached the platform text input
            // node before requesting the TV keyboard.
            withFrameNanos { }
            keyboardController?.show()
        }
    }

    fun finishEditing(direction: FocusDirection? = null): Boolean {
        if (!isTv || !editing) return false
        editing = false
        keyboardController?.hide()
        if (direction != null) focusManager.moveFocus(direction)
        return true
    }

    Box(
        modifier = modifier
            .onFocusChanged { state ->
                hasFocus = state.hasFocus
                if (!state.hasFocus && editing) {
                    editing = false
                    keyboardController?.hide()
                }
            }
            .onPreviewKeyEvent { event ->
                if (!isTv || event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                when (event.key) {
                    Key.DirectionCenter, Key.Enter, Key.NumPadEnter -> {
                        if (!editing && !readOnly) {
                            editing = true
                            true
                        } else {
                            false
                        }
                    }
                    Key.DirectionUp -> finishEditing(FocusDirection.Up)
                    Key.DirectionDown -> finishEditing(FocusDirection.Down)
                    Key.Back, Key.Escape -> finishEditing()
                    else -> false
                }
            }
            .then(
                if (isTv && hasFocus) {
                    Modifier.border(3.dp, MaterialTheme.nuvio.colors.accent, shape)
                } else {
                    Modifier
                },
            ),
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            enabled = enabled,
            readOnly = readOnly || (isTv && !editing),
            isError = isError,
            singleLine = singleLine,
            minLines = minLines,
            maxLines = maxLines,
            label = label,
            placeholder = placeholder,
            leadingIcon = leadingIcon,
            trailingIcon = trailingIcon,
            supportingText = supportingText,
            visualTransformation = visualTransformation,
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            textStyle = textStyle ?: LocalTextStyle.current,
            shape = shape,
            colors = colors,
        )
    }
}
