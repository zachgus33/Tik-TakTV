package com.tiktaktv.tv

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.SslErrorHandler
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.net.http.SslError
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class MainActivity : ComponentActivity() {
    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var pendingUpdateUrl: String? = null
    private var pendingUpdateSha256: String? = null
    private var updateCheckStarted = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY

        root = FrameLayout(this)
        webView = WebView(this).apply {
            setBackgroundColor(0xFF0D0D0F.toInt())
            isFocusable = true
            isFocusableInTouchMode = true
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture =
                    TvPlaybackPolicy.requiresMediaPlaybackGesture
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                allowFileAccess = false
                allowContentAccess = false
                mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                userAgentString = "$userAgentString TikTakTV-AndroidTV/${BuildConfig.VERSION_NAME}"
            }
            webViewClient = TvClient()
            webChromeClient = TvChromeClient()
            addJavascriptInterface(TvBridge(), "TikTakTV")
            setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
                startDownload(url, userAgent, contentDisposition, mimeType)
            }
        }
        root.addView(
            webView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        setContentView(root)
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = handleBack()
            },
        )
        if (savedInstanceState == null) webView.loadUrl(BuildConfig.START_URL)
        else webView.restoreState(savedInstanceState)
        webView.requestFocus()
        checkForUpdate()
    }

    override fun onResume() {
        super.onResume()
        val url = pendingUpdateUrl ?: return
        if (canInstallPackages()) {
            pendingUpdateUrl = null
            val sha256 = pendingUpdateSha256
            pendingUpdateSha256 = null
            downloadUpdate(url, sha256)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP,
            KeyEvent.KEYCODE_DPAD_DOWN,
            KeyEvent.KEYCODE_DPAD_LEFT,
            KeyEvent.KEYCODE_DPAD_RIGHT,
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER -> {
                webView.evaluateJavascript(remoteScript(keyCode), null)
                return true
            }
            KeyEvent.KEYCODE_MENU -> {
                webView.evaluateJavascript(FOCUS_NAVIGATION, null)
                return true
            }
            KeyEvent.KEYCODE_SEARCH -> {
                webView.evaluateJavascript(FOCUS_SEARCH, null)
                return true
            }
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_MEDIA_PLAY,
            KeyEvent.KEYCODE_MEDIA_PAUSE,
            KeyEvent.KEYCODE_MEDIA_REWIND,
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                webView.evaluateJavascript(mediaScript(keyCode), null)
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        if (
            keyCode == KeyEvent.KEYCODE_DPAD_UP ||
            keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
            keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
            keyCode == KeyEvent.KEYCODE_DPAD_RIGHT ||
            keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
            keyCode == KeyEvent.KEYCODE_ENTER
        ) return true
        return super.onKeyUp(keyCode, event)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FILE_PICKER_REQUEST) {
            val result = if (resultCode == RESULT_OK) {
                data?.clipData?.let { clip ->
                    Array(clip.itemCount) { index -> clip.getItemAt(index).uri }
                } ?: data?.data?.let { arrayOf(it) }
            } else null
            fileCallback?.onReceiveValue(result)
            fileCallback = null
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }

    private fun applyTvMode() {
        webView.evaluateJavascript(TV_BOOTSTRAP, null)
    }

    private fun checkForUpdate() {
        if (updateCheckStarted) return
        updateCheckStarted = true
        Thread {
            runCatching {
                val connection =
                    (URL(BuildConfig.UPDATE_METADATA_URL).openConnection() as HttpURLConnection).apply {
                        connectTimeout = 8_000
                        readTimeout = 8_000
                        instanceFollowRedirects = true
                        setRequestProperty("Accept", "application/json")
                    }
                try {
                    if (connection.responseCode !in 200..299) return@runCatching
                    val metadata =
                        JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                    val versionCode = metadata.getLong("versionCode")
                    if (versionCode <= BuildConfig.VERSION_CODE) return@runCatching
                    val versionName =
                        metadata.optString("versionName", versionCode.toString())
                    val apkUrl = metadata.getString("apkUrl")
                    val sha256 = metadata.optString("sha256").ifBlank { null }
                    runOnUiThread { offerUpdate(versionName, apkUrl, sha256) }
                } finally {
                    connection.disconnect()
                }
            }
        }.start()
    }

    private fun offerUpdate(versionName: String, apkUrl: String, sha256: String?) {
        if (isFinishing || isDestroyed) return
        AlertDialog.Builder(this)
            .setTitle(R.string.update_available)
            .setMessage(getString(R.string.update_message, versionName))
            .setNegativeButton(R.string.update_later, null)
            .setPositiveButton(R.string.update_action) { _, _ -> prepareUpdate(apkUrl, sha256) }
            .show()
    }

    private fun canInstallPackages(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls()

    private fun prepareUpdate(apkUrl: String, sha256: String?) {
        if (canInstallPackages()) {
            downloadUpdate(apkUrl, sha256)
            return
        }
        pendingUpdateUrl = apkUrl
        pendingUpdateSha256 = sha256
        Toast.makeText(this, R.string.update_permission, Toast.LENGTH_LONG).show()
        runCatching {
            startActivity(
                Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:$packageName"),
                ),
            )
        }.onFailure {
            pendingUpdateUrl = null
            pendingUpdateSha256 = null
            Toast.makeText(this, R.string.update_install_failed, Toast.LENGTH_LONG).show()
        }
    }

    private fun downloadUpdate(apkUrl: String, expectedSha256: String?) {
        Toast.makeText(this, R.string.update_downloading, Toast.LENGTH_LONG).show()
        Thread {
            val result = runCatching {
                val updateDir = File(cacheDir, "updates").apply { mkdirs() }
                val apk = File(updateDir, "TikTak-TV-update.apk")
                val partial = File(updateDir, "TikTak-TV-update.apk.part")
                partial.delete()
                val connection =
                    (URL(apkUrl).openConnection() as HttpURLConnection).apply {
                        connectTimeout = 15_000
                        readTimeout = 90_000
                        instanceFollowRedirects = true
                        setRequestProperty("Accept", APK_MIME_TYPE)
                        setRequestProperty("User-Agent", "TikTakTV-AndroidTV/${BuildConfig.VERSION_NAME}")
                    }
                try {
                    if (connection.responseCode !in 200..299) {
                        error("Update download failed with HTTP ${connection.responseCode}")
                    }
                    connection.inputStream.use { input ->
                        partial.outputStream().buffered().use { output -> input.copyTo(output) }
                    }
                } finally {
                    connection.disconnect()
                }
                if (partial.length() == 0L) error("Downloaded update is empty")
                if (!expectedSha256.isNullOrBlank()) {
                    val digest = MessageDigest.getInstance("SHA-256")
                    partial.inputStream().buffered().use { input ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            digest.update(buffer, 0, count)
                        }
                    }
                    val actual = digest.digest().joinToString("") { "%02x".format(it) }
                    if (!actual.equals(expectedSha256, ignoreCase = true)) {
                        error("Downloaded update checksum did not match")
                    }
                }
                apk.delete()
                if (!partial.renameTo(apk)) error("Could not prepare downloaded update")
                apk
            }
            runOnUiThread {
                result.onSuccess(::openDownloadedUpdate).onFailure {
                    Toast.makeText(this, R.string.download_failed, Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }

    private fun openDownloadedUpdate(apk: File) {
        val uri = FileProvider.getUriForFile(this, "$packageName.updates", apk)
        val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
        val installer =
            Intent(Intent.ACTION_INSTALL_PACKAGE)
                .setData(uri)
                .addFlags(flags)
                .putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
        runCatching { startActivity(installer) }.recoverCatching {
            startActivity(
                Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, APK_MIME_TYPE)
                    .addFlags(flags),
            )
        }.onFailure {
            Toast.makeText(this, R.string.update_install_failed, Toast.LENGTH_LONG).show()
        }
    }

    private fun handleBack() {
        if (fullscreenView != null) {
            hideFullscreen()
            return
        }
        webView.evaluateJavascript(HANDLE_WEB_BACK) { result ->
            if (result == "true") return@evaluateJavascript
            if (webView.canGoBack()) webView.goBack() else finish()
        }
    }

    private fun mediaScript(keyCode: Int): String = when (keyCode) {
        KeyEvent.KEYCODE_MEDIA_PLAY -> MEDIA_PLAY
        KeyEvent.KEYCODE_MEDIA_PAUSE -> MEDIA_PAUSE
        KeyEvent.KEYCODE_MEDIA_REWIND -> MEDIA_REWIND
        KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> MEDIA_FAST_FORWARD
        else -> MEDIA_TOGGLE
    }

    private fun remoteScript(keyCode: Int): String = when (keyCode) {
        KeyEvent.KEYCODE_DPAD_UP -> remoteArrowScript("ArrowUp")
        KeyEvent.KEYCODE_DPAD_DOWN -> remoteArrowScript("ArrowDown")
        KeyEvent.KEYCODE_DPAD_LEFT -> remoteArrowScript("ArrowLeft")
        KeyEvent.KEYCODE_DPAD_RIGHT -> remoteArrowScript("ArrowRight")
        else -> REMOTE_ACTIVATE
    }

    private fun remoteArrowScript(key: String) = """
        (() => {
          const target = document.activeElement || document.body;
          target.dispatchEvent(new KeyboardEvent('keydown', {
            key: '$key', bubbles: true, cancelable: true
          }));
        })();
    """.trimIndent()

    private fun openExternal(uri: Uri) {
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
    }

    private inner class TvBridge {
        @JavascriptInterface
        fun openSmartTube(videoId: String) {
            if (!SmartTubePolicy.accepts(videoId)) return
            runOnUiThread {
                val uri = Uri.parse("vnd.youtube://$videoId")
                val opened = SmartTubePolicy.packages.any { packageName ->
                    runCatching {
                        startActivity(
                            Intent(Intent.ACTION_VIEW, uri)
                                .setPackage(packageName)
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                        )
                    }.isSuccess
                }
                if (!opened)
                    Toast.makeText(
                        this@MainActivity,
                        "SmartTube is not installed. Continuing in TikTak TV.",
                        Toast.LENGTH_LONG,
                    ).show()
            }
        }
    }

    private fun startDownload(
        value: String,
        userAgent: String?,
        contentDisposition: String?,
        mimeType: String?,
    ) {
        val uri = runCatching { Uri.parse(value) }.getOrNull()
        if (uri == null || !TvUrlPolicy.isDownload(value)) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_LONG).show()
            return
        }
        val filename = URLUtil.guessFileName(value, contentDisposition, mimeType)
        val request = DownloadManager.Request(uri)
            .setTitle(filename)
            .setMimeType(mimeType)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
        userAgent?.let { request.addRequestHeader("User-Agent", it) }
        CookieManager.getInstance().getCookie(value)?.let {
            request.addRequestHeader("Cookie", it)
        }
        runCatching {
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        }.onSuccess {
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show()
        }.onFailure {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_LONG).show()
        }
    }

    private fun showFullscreen(view: View, callback: WebChromeClient.CustomViewCallback) {
        if (fullscreenView != null) callback.onCustomViewHidden()
        fullscreenView = view
        fullscreenCallback = callback
        webView.visibility = View.GONE
        root.addView(
            view,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
    }

    private fun hideFullscreen() {
        val view = fullscreenView ?: return
        root.removeView(view)
        fullscreenView = null
        webView.visibility = View.VISIBLE
        fullscreenCallback?.onCustomViewHidden()
        fullscreenCallback = null
        webView.requestFocus()
    }

    private inner class TvClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (TvUrlPolicy.isInternal(request.url.toString())) return false
            if (!request.isForMainFrame) return false
            if (request.hasGesture() && !AdBlockPolicy.shouldBlock(request.url.toString())) {
                openExternal(request.url)
            } else {
                Toast.makeText(this@MainActivity, "Blocked an unwanted redirect", Toast.LENGTH_SHORT).show()
            }
            return true
        }

        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest,
        ): WebResourceResponse? {
            if (!AdBlockPolicy.shouldBlock(request.url.toString())) return null
            return WebResourceResponse(
                "text/plain",
                "UTF-8",
                204,
                "No Content",
                mapOf("Cache-Control" to "no-store"),
                ByteArrayInputStream(ByteArray(0)),
            )
        }

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            if (!TvUrlPolicy.isInternal(url)) view.stopLoading()
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (TvUrlPolicy.isInternal(url)) applyTvMode()
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            handler.cancel()
        }
    }

    private inner class TvChromeClient : WebChromeClient() {
        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            showFullscreen(view, callback)
        }

        override fun onHideCustomView() = hideFullscreen()

        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = filePathCallback
            return runCatching {
                startActivityForResult(fileChooserParams.createIntent(), FILE_PICKER_REQUEST)
                true
            }.getOrElse {
                fileCallback = null
                false
            }
        }
    }

    companion object {
        private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
        private const val FILE_PICKER_REQUEST = 4107
        private const val HANDLE_WEB_BACK = """
            (() => {
              const dialogs = Array.from(document.querySelectorAll('dialog[open]'));
              const dialog = dialogs[dialogs.length - 1];
              if (!dialog) return false;
              const action = dialog.querySelector('${TvDialogBackPolicy.actionSelector}');
              if (action) action.click(); else dialog.close();
              return true;
            })();
        """
        private const val FOCUS_NAVIGATION = """
            (() => {
              const target = document.querySelector('.sidebar button, .sidebar a, nav button, nav a');
              if (target) { target.focus(); target.scrollIntoView({block:'nearest'}); }
            })();
        """
        private const val FOCUS_SEARCH = """
            (() => {
              const target = document.querySelector('input[type="search"], input[aria-label*="Search"]');
              if (target) target.focus();
            })();
        """
        private const val MEDIA_TOGGLE = """(() => { const v=document.querySelector('video'); if(v) v.paused?v.play():v.pause(); })();"""
        private const val MEDIA_PLAY = """(() => { const v=document.querySelector('video'); if(v) v.play(); })();"""
        private const val MEDIA_PAUSE = """(() => { const v=document.querySelector('video'); if(v) v.pause(); })();"""
        private const val MEDIA_REWIND = """(() => { const b=document.querySelector('[aria-label="Rewind 10 seconds"]'); if(b) b.click(); else { const v=document.querySelector('video'); if(v) v.currentTime=Math.max(0,v.currentTime-10); } })();"""
        private const val MEDIA_FAST_FORWARD = """(() => { const b=document.querySelector('[aria-label="Fast forward 10 seconds"]'); if(b) b.click(); else { const v=document.querySelector('video'); if(v) v.currentTime=Math.min(v.duration||Infinity,v.currentTime+10); } })();"""
        private const val REMOTE_ACTIVATE = """(() => { const target=document.activeElement; if(target && target!==document.body && typeof target.click==='function') target.click(); })();"""
        private val TV_BOOTSTRAP = """
            (() => {
              document.documentElement.classList.add('tv-mode');
              if (window.__tiktakTvFocusInstalled) return;
              window.__tiktakTvFocusInstalled = true;
              document.addEventListener('focusin', event => {
                const target = event.target;
                if (target && target.scrollIntoView) {
                  target.scrollIntoView({block: 'nearest', inline: 'center', behavior: 'smooth'});
                }
              });
              const first = document.querySelector('button:not([disabled]), a[href], input, select');
              if (first) first.focus({preventScroll: false});
            })();
        """.trimIndent()
    }
}
