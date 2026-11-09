package com.tiktaktv.nativepreview

import com.nuvio.app.features.livetv.LiveTvChannel
import com.nuvio.app.features.livetv.LiveTvProgramme
import com.nuvio.app.features.livetv.channelHasGuideData
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveTvGuideFilteringTest {
    private val channel = LiveTvChannel(
        id = "channel-id",
        name = "US | Test",
        streamUrl = "https://example.com/live.m3u8",
        tvgId = "guide-id",
    )
    private val programme = LiveTvProgramme("Live", 1L, 2L, "Now")

    @Test
    fun acceptsCurrentProgrammeByGuideId() {
        assertTrue(channelHasGuideData(channel, mapOf("guide-id" to programme), emptyMap()))
    }

    @Test
    fun acceptsUpcomingScheduleByChannelIdFallback() {
        assertTrue(channelHasGuideData(channel, emptyMap(), mapOf("channel-id" to listOf(programme))))
    }

    @Test
    fun rejectsChannelWithoutGuideData() {
        assertFalse(channelHasGuideData(channel, emptyMap(), emptyMap()))
    }
}
