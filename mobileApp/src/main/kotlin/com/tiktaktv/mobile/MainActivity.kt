package com.tiktaktv.mobile

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.app.PictureInPictureParams
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Rect
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.util.Rational
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.net.toUri

class MainActivity : ComponentActivity() {
    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var offlineView: View
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val uris = if (result.resultCode == RESULT_OK) {
            result.data?.clipData?.let { clip ->
                Array(clip.itemCount) { index -> clip.getItemAt(index).uri }
            } ?: result.data?.data?.let { arrayOf(it) }
        } else null
        fileCallback?.onReceiveValue(uris)
        fileCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        root = FrameLayout(this).apply { setBackgroundColor(Color.rgb(13, 13, 15)) }
        webView = WebView(this).apply {
            val browser = this
            setBackgroundColor(Color.rgb(13, 13, 15))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture = true
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                allowFileAccess = false
                allowContentAccess = true
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                userAgentString = "$userAgentString TikTakTV-Android/${BuildConfig.VERSION_NAME}"
                loadWithOverviewMode = false
                useWideViewPort = true
                builtInZoomControls = false
                displayZoomControls = false
            }
            CookieManager.getInstance().apply {
                setAcceptCookie(true)
                setAcceptThirdPartyCookies(browser, true)
            }
            webViewClient = MobileClient()
            webChromeClient = MobileChromeClient()
            setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
                startDownload(url, userAgent, contentDisposition, mimeType)
            }
        }
        offlineView = createOfflineView()
        root.addView(webView, matchParentParams())
        root.addView(offlineView, matchParentParams())
        offlineView.visibility = View.GONE
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = handleBack()
        })

        if (savedInstanceState == null) loadIntent(intent) else webView.restoreState(savedInstanceState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        loadIntent(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || fullscreenView != null) return
        webView.evaluateJavascript(VIDEO_IS_PLAYING) { result ->
            if (result == "true" && !isInPictureInPictureMode) {
                runCatching {
                    val builder = PictureInPictureParams.Builder()
                        .setAspectRatio(Rational(16, 9))
                        .setSourceRectHint(Rect(0, 0, webView.width, webView.height))
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        builder.setAutoEnterEnabled(true)
                    }
                    enterPictureInPictureMode(builder.build())
                }
            }
        }
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }

    private fun loadIntent(intent: Intent) {
        val target = intent.dataString?.takeIf(MobileUrlPolicy::isAppUrl) ?: BuildConfig.START_URL
        webView.loadUrl(target)
    }

    private fun handleBack() {
        if (fullscreenView != null) {
            hideFullscreen()
            return
        }
        webView.evaluateJavascript(HANDLE_WEB_BACK) { handled ->
            if (handled == "true") return@evaluateJavascript
            if (webView.canGoBack()) webView.goBack() else finish()
        }
    }

    private fun openExternal(uri: Uri) {
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
            .onFailure { Toast.makeText(this, "No app can open this link", Toast.LENGTH_SHORT).show() }
    }

    private fun startDownload(
        value: String,
        userAgent: String?,
        contentDisposition: String?,
        mimeType: String?,
    ) {
        if (!MobileUrlPolicy.isDownload(value)) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_LONG).show()
            return
        }
        val uri = value.toUri()
        val guessed = URLUtil.guessFileName(value, contentDisposition, mimeType)
        val filename = MobileUrlPolicy.safeFilename(guessed)
        val request = DownloadManager.Request(uri)
            .setTitle(filename)
            .setMimeType(mimeType)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
        userAgent?.let { request.addRequestHeader("User-Agent", it) }
        CookieManager.getInstance().getCookie(value)?.let { request.addRequestHeader("Cookie", it) }
        runCatching {
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        }.onSuccess {
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show()
        }.onFailure {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_LONG).show()
        }
    }

    private fun showFullscreen(view: View, callback: WebChromeClient.CustomViewCallback) {
        fullscreenView?.let { hideFullscreen() }
        fullscreenView = view
        fullscreenCallback = callback
        webView.visibility = View.GONE
        root.addView(view, matchParentParams())
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    }

    private fun hideFullscreen() {
        val view = fullscreenView ?: return
        root.removeView(view)
        fullscreenView = null
        fullscreenCallback?.onCustomViewHidden()
        fullscreenCallback = null
        webView.visibility = View.VISIBLE
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
    }

    private fun createOfflineView(): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(48, 48, 48, 48)
        setBackgroundColor(Color.rgb(13, 13, 15))
        addView(TextView(context).apply {
            text = getString(R.string.offline_title)
            textSize = 24f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        })
        addView(TextView(context).apply {
            text = getString(R.string.offline_message)
            textSize = 16f
            setTextColor(Color.LTGRAY)
            gravity = Gravity.CENTER
            setPadding(0, 16, 0, 24)
        })
        addView(Button(context).apply {
            text = getString(R.string.retry)
            setOnClickListener {
                visibility = View.GONE
                this@MainActivity.offlineView.visibility = View.GONE
                webView.reload()
            }
        })
    }

    private fun matchParentParams() = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
    )

    private inner class MobileClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val value = request.url.toString()
            if (MobileUrlPolicy.isAppUrl(value)) return false
            if (!request.isForMainFrame) return false
            if (request.hasGesture() && MobileUrlPolicy.isExternalWebUrl(value)) openExternal(request.url)
            return true
        }

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            if (!MobileUrlPolicy.isAppUrl(url)) view.stopLoading()
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (!MobileUrlPolicy.isAppUrl(url)) return
            offlineView.visibility = View.GONE
            view.evaluateJavascript(MOBILE_BOOTSTRAP, null)
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) offlineView.visibility = View.VISIBLE
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            handler.cancel()
            offlineView.visibility = View.VISIBLE
        }
    }

    private inner class MobileChromeClient : WebChromeClient() {
        override fun onShowCustomView(view: View, callback: CustomViewCallback) =
            showFullscreen(view, callback)

        override fun onHideCustomView() = hideFullscreen()

        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = filePathCallback
            return runCatching {
                filePicker.launch(fileChooserParams.createIntent())
                true
            }.getOrElse {
                fileCallback = null
                false
            }
        }
    }

    companion object {
        private const val VIDEO_IS_PLAYING =
            "(() => Array.from(document.querySelectorAll('video')).some(v => !v.paused && !v.ended))();"
        private const val HANDLE_WEB_BACK = """
            (() => {
              const dialog = Array.from(document.querySelectorAll('dialog[open]')).pop();
              if (!dialog) return false;
              const close = dialog.querySelector('[aria-label*="Close"], .close, button[value="cancel"]');
              if (close) close.click(); else dialog.close();
              return true;
            })();
        """
        private val MOBILE_BOOTSTRAP = """
            (() => {
              document.documentElement.classList.add('android-app');
              document.documentElement.classList.remove('tv-mode');
            })();
        """.trimIndent()
    }
}
