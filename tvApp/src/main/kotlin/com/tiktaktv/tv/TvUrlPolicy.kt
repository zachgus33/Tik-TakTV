package com.tiktaktv.tv

import java.net.URI

internal object TvUrlPolicy {
    private val internalHosts = setOf("tiktaktv.me", "www.tiktaktv.me")

    fun isInternal(value: String): Boolean = runCatching {
        val uri = URI(value)
        uri.scheme.equals("https", ignoreCase = true) &&
            uri.host?.lowercase() in internalHosts &&
            uri.userInfo == null
    }.getOrDefault(false)

    fun isDownload(value: String): Boolean = runCatching {
        val uri = URI(value)
        uri.scheme.equals("https", ignoreCase = true) &&
            uri.userInfo == null &&
            (isInternal(value) || uri.host?.lowercase() == "api.tiktaktv.me")
    }.getOrDefault(false)
}
