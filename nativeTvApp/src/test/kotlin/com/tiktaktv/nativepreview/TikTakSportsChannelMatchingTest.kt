package com.tiktaktv.nativepreview

import com.nuvio.app.features.livetv.LiveTvChannel
import com.nuvio.app.features.livetv.LiveTvProgramme
import com.nuvio.app.features.tiktak.NativeScoreEvent
import com.nuvio.app.features.tiktak.NativeScoreTeam
import com.nuvio.app.features.tiktak.findScoreChannel
import com.nuvio.app.features.tiktak.deriveSportsState
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

    @Test
    fun wrongAbcProgrammeDoesNotOpenThatFeed() {
        val wrongAbc = espn.copy(id = "abc-east", name = "ABC East", tvgId = "abc.east")
        val rightAbc = espn.copy(id = "abc-west", name = "ABC West", tvgId = "abc.west")
        val programmes = mapOf(
            "abc.east" to programme("Evening News"),
            "abc.west" to programme("Alabama Crimson Tide vs Georgia Bulldogs"),
        )

        assertEquals(rightAbc, findScoreChannel(event("in", "ABC"), listOf(wrongAbc, rightAbc), programmes))
    }

    @Test
    fun oneMatchingTeamDoesNotProveTheSameGame() {
        val wrongAbc = espn.copy(id = "abc", name = "ABC", tvgId = "abc.us")
        val programmes = mapOf("abc.us" to programme("Alabama Crimson Tide vs Auburn Tigers"))

        assertNull(findScoreChannel(event("in", "ABC"), listOf(wrongAbc), programmes))
    }

    @Test
    fun ambiguousAbcFeedsWithoutCurrentGuideDoNotAutoLaunch() {
        val abcEast = espn.copy(id = "abc-east", name = "ABC East")
        val abcWest = espn.copy(id = "abc-west", name = "ABC West")

        assertNull(findScoreChannel(event("in", "ABC"), listOf(abcEast, abcWest), emptyMap()))
    }

    @Test
    fun scoreMatchesBroadcastChannelEvenWhenOnlyOtherChannelsHaveGuideData() {
        val state = deriveSportsState(
            channels = listOf(nfl, espn),
            programmes = mapOf("nfl.us" to programme("NFL Total Access")),
            schedules = emptyMap(),
            scores = listOf(event("in", "ESPN")),
            sportFilter = "all",
        )

        assertEquals(espn, state.matchedChannels["game-1"])
    }

    @Test
    fun broadcasterWithGenericSportGuideCanOpenWhenItIsTheOnlyCandidate() {
        assertEquals(
            espn,
            findScoreChannel(
                event("in", "ESPN").copy(league = "NCAA - Football"),
                listOf(espn),
                mapOf("espn.us" to programme("College Football")),
            ),
        )
    }

    @Test
    fun genericSportsGuideDoesNotOverrideAConflictingMatchup() {
        val wrong = espn.copy(tvgId = "espn.wrong")
        val programmes = mapOf("espn.wrong" to programme("Alabama Crimson Tide vs Auburn Tigers"))

        assertNull(findScoreChannel(event("in", "ESPN"), listOf(wrong), programmes))
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
