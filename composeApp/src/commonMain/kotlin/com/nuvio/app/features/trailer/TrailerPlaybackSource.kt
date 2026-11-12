package com.nuvio.app.features.trailer

data class TrailerPlaybackSource(
    val videoUrl: String,
    val audioUrl: String? = null,
    val qualities: List<TrailerPlaybackQuality> = emptyList(),
)

data class TrailerPlaybackQuality(
    val height: Int,
    val videoUrl: String,
    val audioUrl: String? = null,
)
