package com.tiktaktv.tv

import android.net.Uri

internal object TvUrlPolicy {
    private val internalHosts = setOf("tiktaktv.me", "www.tiktaktv.me")

    fun isInternal(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host?.lowercase() in internalHosts

    fun isDownload(uri: Uri): Boolean =
        uri.scheme == "https" &&
            (isInternal(uri) || uri.host?.lowercase() == "api.tiktaktv.me")
}
