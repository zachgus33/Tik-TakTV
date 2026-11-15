package com.tiktaktv.nativepreview

import com.nuvio.app.features.livetv.LiveTvChannel
import com.nuvio.app.features.livetv.LiveTvProgramme
import com.nuvio.app.features.livetv.channelHasUpcomingGuideData
import com.nuvio.app.features.livetv.selectGuideBackedChannels
import org.junit.Assert.assertEquals
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
        assertTrue(channelHasUpcomingGuideData(channel, mapOf("guide-id" to programme), emptyMap(), 1L))
    }

    @Test
    fun acceptsUpcomingScheduleByChannelIdFallback() {
        assertTrue(channelHasUpcomingGuideData(channel, emptyMap(), mapOf("channel-id" to listOf(programme)), 1L))
    }

    @Test
    fun rejectsChannelWithoutGuideData() {
        assertFalse(channelHasUpcomingGuideData(channel, emptyMap(), emptyMap()))
    }

    @Test
    fun rejectsExpiredProgrammeAndSchedule() {
        assertFalse(channelHasUpcomingGuideData(
            channel,
            mapOf("guide-id" to programme),
            mapOf("channel-id" to listOf(programme)),
            2L,
        ))
    }

    @Test
    fun guideRowsContainChannelsWithUpcomingProgrammes() {
        val unguided = channel.copy(id = "unguided", tvgId = "unguided")
        val expired = channel.copy(id = "expired", tvgId = "expired")
        assertEquals(
            listOf(channel),
            selectGuideBackedChannels(
                listOf(unguided, expired, channel),
                mapOf("expired" to programme),
                mapOf("guide-id" to listOf(programme.copy(startEpochMs = 3L, stopEpochMs = 4L))),
                2L,
            ),
        )
        assertEquals(
            listOf(channel),
            selectGuideBackedChannels(listOf(unguided, channel), emptyMap(), mapOf("guide-id" to listOf(programme)), 1L),
        )
    }
}
