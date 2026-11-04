package com.tiktaktv.mobile

import java.net.URI

internal object MobileUrlPolicy {
    private val appHosts = setOf("tiktaktv.me", "www.tiktaktv.me")
    fun isAppUrl(value: String): Boolean = parseHttps(value)?.host?.lowercase() in appHosts

    fun isDownload(value: String): Boolean = parseHttps(value) != null

    fun isExternalWebUrl(value: String): Boolean = runCatching {
        val uri = URI(value)
        uri.userInfo == null &&
            (uri.scheme.equals("https", true) || uri.scheme.equals("http", true))
    }.getOrDefault(false)

    fun safeFilename(value: String): String {
        val cleaned = value
            .replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_")
            .trim('.', ' ')
            .take(120)
        return cleaned.ifBlank { "TikTak-TV-download" }
    }

    private fun parseHttps(value: String): URI? = runCatching {
        URI(value).takeIf {
            it.scheme.equals("https", true) && it.userInfo == null && !it.host.isNullOrBlank()
        }
    }.getOrNull()
}
