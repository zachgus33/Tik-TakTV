package com.nuvio.app

import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import com.nuvio.app.core.ui.LocalTvMode
import com.nuvio.app.core.ui.NuvioTheme

/** Installs the deterministic TV shell using the app's own Compose runtime. */
fun ComponentActivity.setNativeTvShellPreviewContent() {
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
