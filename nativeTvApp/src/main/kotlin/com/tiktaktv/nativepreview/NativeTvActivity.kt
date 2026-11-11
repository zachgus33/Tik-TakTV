package com.tiktaktv.nativepreview

import android.os.Build
import android.os.Bundle
import android.content.Context
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.inputmethod.InputMethodManager
import androidx.activity.ComponentActivity
import androidx.compose.foundation.LocalIndication
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import com.nuvio.app.App
import com.nuvio.app.MainActivity
import com.nuvio.app.NativeTvHostMode
import com.nuvio.app.TikTakTvShellPreview
import com.nuvio.app.setNativeTvShellPreviewContent
import com.nuvio.app.core.ui.LocalTvMode
import com.nuvio.app.core.ui.NuvioTheme
import com.nuvio.app.core.ui.TikTakTvFocusIndication

/**
 * Android TV host for the native Compose application.
 *
 * The preview intentionally uses a separate application id from the released
 * WebView client until migration and feature-parity checks are complete.
 */
open class NativeTvActivity : MainActivity() {
    private var showShellPreview = false
    private lateinit var previewUpdater: NativePreviewUpdater

    override fun onCreate(savedInstanceState: Bundle?) {
        // Capture this before MainActivity processes the incoming intent. The
        // preview is a CI-only rendering mode used to verify the ten-foot shell
        // without requiring account credentials.
        showShellPreview = intent?.getBooleanExtra(EXTRA_SHELL_PREVIEW, false) == true
        if (showShellPreview) {
            Log.i(PREVIEW_LOG_TAG, PREVIEW_LOG_MESSAGE)
        }
        NativeTvHostMode.enable()
        super.onCreate(savedInstanceState)
        previewUpdater = NativePreviewUpdater(this)
        if (!showShellPreview && BuildConfig.ENABLE_SIDELOAD_UPDATES) previewUpdater.checkForUpdates()
        enterTvFullscreen()
    }

    override fun onResume() {
        super.onResume()
        if (BuildConfig.ENABLE_SIDELOAD_UPDATES && ::previewUpdater.isInitialized) previewUpdater.resumePendingInstall()
    }

    @Composable
    override fun AppContent() {
        CompositionLocalProvider(
            LocalTvMode provides true,
            LocalIndication provides TikTakTvFocusIndication,
        ) {
            if (showShellPreview) {
                NuvioTheme(darkTheme = true) {
                    TikTakTvShellPreview()
                }
            } else {
                App()
            }
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val isNavigationKey = event.keyCode == KeyEvent.KEYCODE_DPAD_UP ||
            event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
            event.keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
            event.keyCode == KeyEvent.KEYCODE_DPAD_RIGHT ||
            event.keyCode == KeyEvent.KEYCODE_TAB
        if (event.action == KeyEvent.ACTION_DOWN && isNavigationKey) {
            // A D-pad move only moves focus. It must never grant a text field
            // permission to cover the TV with the software keyboard. Select on
            // the focused field still enters editing through Compose normally.
            dismissSoftwareKeyboard()
            window.decorView.postDelayed(::dismissSoftwareKeyboard, 40L)
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterTvFullscreen()
    }

    private fun enterTvFullscreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.systemBars())
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        }
    }

    private fun dismissSoftwareKeyboard() {
        val inputMethodManager = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        inputMethodManager.hideSoftInputFromWindow(window.decorView.windowToken, 0)
    }

    private companion object {
        const val EXTRA_SHELL_PREVIEW = "native_tv_shell_preview"
        const val PREVIEW_LOG_TAG = "TikTakNativeTv"
        const val PREVIEW_LOG_MESSAGE = "Shell preview requested"
    }
}

/**
 * Stable, explicitly badged Fire TV launcher component.
 *
 * Keeping this component separate from [NativeTvActivity] forces launchers
 * that cached a blank legacy tile to create a fresh entry during an in-place
 * update while preserving the package, signing identity, and all app data.
 */
class TikTakTvLauncherV2Activity : NativeTvActivity()

class TikTakTvLauncherV3Activity : NativeTvActivity()

class TikTakTvLauncherV4Activity : NativeTvActivity()

/**
 * CI-only host that always renders the deterministic ten-foot shell.
 *
 * This intentionally does not inherit MainActivity: its job is to prove the
 * TV shell itself renders at each target resolution without account state,
 * startup routing, or an input method obscuring the captured frame.
 */
class NativeTvShellPreviewActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        Log.i("TikTakNativeTv", "Shell preview activity requested")
        NativeTvHostMode.enable()
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        setNativeTvShellPreviewContent()
    }
}
