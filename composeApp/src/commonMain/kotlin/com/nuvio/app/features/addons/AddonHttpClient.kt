package com.nuvio.app.features.addons

internal suspend fun fetchAddonResponseText(
    url: String,
    forceRefresh: Boolean = false,
    maxResponseBodyBytes: Int? = null,
): String {
    if (maxResponseBodyBytes != null) {
        val response = httpRequestRaw(
            method = "GET",
            url = url,
            headers = buildMap {
                put("Accept", "application/json")
                if (forceRefresh) put("Cache-Control", "no-cache")
            },
            body = "",
            maxResponseBodyBytes = maxResponseBodyBytes,
        )
        if (response.status !in 200..299) {
            error("HTTP ${response.status}")
        }
        if (response.body.endsWith(TRUNCATED_RESPONSE_MARKER)) {
            error("Add-on response exceeded the ${maxResponseBodyBytes / (1024 * 1024)} MB safety limit")
        }
        if (response.body.isBlank()) {
            error("Empty add-on response")
        }
        return response.body
    }

    return if (forceRefresh) {
        httpGetTextWithHeaders(
            url = url,
            headers = mapOf("Cache-Control" to "no-cache"),
        )
    } else {
        httpGetText(url)
    }

}

private const val TRUNCATED_RESPONSE_MARKER = "...[truncated]"
