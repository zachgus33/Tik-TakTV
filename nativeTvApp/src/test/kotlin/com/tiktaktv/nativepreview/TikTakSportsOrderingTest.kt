package com.tiktaktv.nativepreview

import com.nuvio.app.features.livetv.LiveTvChannel
import com.nuvio.app.features.tiktak.NativeScoreEvent
import com.nuvio.app.features.tiktak.prioritizeStreamableScores
import org.junit.Assert.assertEquals
import org.junit.Test

class TikTakSportsOrderingTest {
    @Test
    fun streamableScoresComeFirstWithoutChangingOrderInsideGroups() {
        val scores = listOf(
            score("no-stream-1"),
            score("stream-1"),
            score("no-stream-2"),
            score("stream-2"),
        )
        val channel = LiveTvChannel(
            id = "espn",
            name = "ESPN",
            streamUrl = "https://example.com/espn.m3u8",
        )

        val ordered = prioritizeStreamableScores(
            scores = scores,
            matchedChannels = mapOf("stream-1" to channel, "stream-2" to channel),
        )

        assertEquals(
            listOf("stream-1", "stream-2", "no-stream-1", "no-stream-2"),
            ordered.map(NativeScoreEvent::id),
        )
    }

    private fun score(id: String) = NativeScoreEvent(
        id = id,
        sport = "football",
        league = "NFL",
        name = id,
        detail = "",
        state = "pre",
        teams = emptyList(),
    )
}
