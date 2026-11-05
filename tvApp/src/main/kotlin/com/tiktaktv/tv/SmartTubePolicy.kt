package com.tiktaktv.tv

/** Small allow-list used by the web bridge before handing a video to another app. */
object SmartTubePolicy {
    private val videoId = Regex("^[A-Za-z0-9_-]{6,32}$")

    val packages = listOf(
        "com.teamsmart.videomanager.tv",
        "org.smarttube.beta",
        "app.smarttube.stable",
        "com.liskovsoft.smartyoutubetv2.tv",
    )

    fun accepts(value: String): Boolean = videoId.matches(value)
}
