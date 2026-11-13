package com.nuvio.app

import com.nuvio.app.features.watchprogress.ContinueWatchingItem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class YouTubeContinueWatchingTest {
    @Test
    fun youtubeProgressUsesStableVideoIdEvenWhenRemoteTypeIsMovie() {
        val item = progressItem(
            parentMetaId = "youtube:q6IgJuItFlw",
            parentMetaType = "movie",
            videoId = "youtube:q6IgJuItFlw",
        )

        assertEquals("q6IgJuItFlw", item.youtubeVideoIdOrNull())
    }

    @Test
    fun ordinaryMovieStillUsesMoviePlayback() {
        assertNull(progressItem("tt1234567", "movie", "tt1234567").youtubeVideoIdOrNull())
    }

    private fun progressItem(parentMetaId: String, parentMetaType: String, videoId: String) =
        ContinueWatchingItem(
            parentMetaId = parentMetaId,
            parentMetaType = parentMetaType,
            videoId = videoId,
            title = "Video",
            subtitle = "",
            imageUrl = null,
            resumePositionMs = 45_000L,
            durationMs = 120_000L,
            progressFraction = 0.375f,
        )
}
