package com.tiktaktv.nativepreview

import com.nuvio.app.features.livetv.LiveTvChannel
import com.nuvio.app.features.livetv.LiveTvProgramme
import com.nuvio.app.features.tiktak.NativeScoreEvent
import com.nuvio.app.features.tiktak.NativeScoreTeam
import com.nuvio.app.features.tiktak.findScoreChannel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TikTakSportsChannelMatchingTest {
    private val espn = LiveTvChannel(
        id = "espn",
        name = "ESPN HD",
        streamUrl = "https://example.com/espn.m3u8",
        tvgId = "espn.us",
        group = "US Sports",
    )
    private val nfl = LiveTvChannel(
        id = "nfl",
        name = "NFL Network",
        streamUrl = "https://example.com/nfl.m3u8",
        tvgId = "nfl.us",
        group = "US Sports",
    )

    @Test
    fun currentGuideTeamsBeatUnrelatedSportsChannel() {
        val programmes = mapOf(
            "espn.us" to programme("College Football: Alabama Crimson Tide vs Georgia Bulldogs"),
            "nfl.us" to programme("NFL Total Access"),
        )

        assertEquals(espn, findScoreChannel(event("in", "ESPN"), listOf(nfl, espn), programmes))
    }

    @Test
    fun liveEventCanUseNamedBroadcasterWhenGuideTitleIsGeneric() {
        assertEquals(espn, findScoreChannel(event("in", "ESPN"), listOf(nfl, espn), emptyMap()))
    }

    @Test
    fun scoreCanUseNamedBroadcasterWhenGuideDataIsMissing() {
        assertEquals(espn, findScoreChannel(event("post", "ESPN Network HD"), listOf(espn), emptyMap()))
    }

    @Test
    fun streamingServiceNameDoesNotMatchUnrelatedLinearChannel() {
        val disneyJunior = LiveTvChannel(
            id = "disney-junior",
            name = "Disney Junior",
            streamUrl = "https://example.com/disney-junior.m3u8",
            tvgId = "disney-junior.us",
            group = "Kids",
        )

        assertNull(findScoreChannel(event("in", "Disney+"), listOf(disneyJunior), emptyMap()))
    }

    private fun event(state: String, broadcast: String) = NativeScoreEvent(
        id = "game-1",
        sport = "football",
        league = "College Football",
        name = "Alabama vs Georgia",
        detail = "2nd Quarter",
        state = state,
        teams = listOf(
            NativeScoreTeam("Alabama Crimson Tide", "14"),
            NativeScoreTeam("Georgia Bulldogs", "10"),
        ),
        broadcast = broadcast,
    )

    private fun programme(title: String) = LiveTvProgramme(
        title = title,
        startEpochMs = 1L,
        stopEpochMs = 2L,
        timeLabel = "Now",
    )
}
