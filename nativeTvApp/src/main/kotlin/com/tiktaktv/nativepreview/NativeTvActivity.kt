package com.tiktaktv.nativepreview

import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import com.nuvio.app.App
import com.nuvio.app.MainActivity
import com.nuvio.app.NativeTvHostMode
import com.nuvio.app.TikTakTvShellPreview
import com.nuvio.app.core.ui.LocalTvMode
import com.nuvio.app.core.ui.NuvioTheme

/**
 * Android TV host for the native Compose application.
 *
 * The preview intentionally uses a separate application id from the released
 * WebView client until migration and feature-parity checks are complete.
 */
open class NativeTvActivity : MainActivity() {
    private var showShellPreview = false

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
        enterTvFullscreen()
    }

    @Composable
    override fun AppContent() {
        CompositionLocalProvider(LocalTvMode provides true) {
            if (showShellPreview) {
                NuvioTheme(darkTheme = true) {
                    TikTakTvShellPreview()
                }
            } else {
                App()
            }
        }
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

    private companion object {
        const val EXTRA_SHELL_PREVIEW = "native_tv_shell_preview"
        const val PREVIEW_LOG_TAG = "TikTakNativeTv"
        const val PREVIEW_LOG_MESSAGE = "Shell preview requested"
    }
}

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
        setContent {
            LaunchedEffect(Unit) {
                Log.i("TikTakNativeTv", "Shell preview composed")
            }
            CompositionLocalProvider(LocalTvMode provides true) {
                NuvioTheme(darkTheme = true) {
                    TikTakTvShellPreview()
                }
            }
        }
    }
}
