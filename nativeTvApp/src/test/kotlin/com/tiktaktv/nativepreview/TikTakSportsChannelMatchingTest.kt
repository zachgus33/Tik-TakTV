package com.tiktaktv.nativepreview

import com.nuvio.app.features.livetv.LiveTvChannel
import com.nuvio.app.features.livetv.LiveTvProgramme
import com.nuvio.app.features.tiktak.NativeScoreEvent
import com.nuvio.app.features.tiktak.NativeScoreTeam
import com.nuvio.app.features.tiktak.findScoreChannel
import com.nuvio.app.features.tiktak.deriveSportsState
import com.nuvio.app.features.tiktak.guidedScoreChannelChoices
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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
    fun channelNameAloneDoesNotProveItCarriesTheGame() {
        assertNull(findScoreChannel(event("in", "ESPN"), listOf(nfl, espn), emptyMap()))
    }

    @Test
    fun finishedScoreDoesNotLaunchUnguidedChannel() {
        assertNull(findScoreChannel(event("post", "ESPN Network HD"), listOf(espn), emptyMap()))
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
    fun shortenedGuideMatchupMatchesBothDistinctiveTeamNames() {
        assertEquals(
            espn,
            findScoreChannel(
                event("in", "ESPN"),
                listOf(espn),
                mapOf("espn.us" to programme("Alabama vs Georgia")),
            ),
        )
    }

    @Test
    fun sharedCityWordsDoNotMatchTwoDifferentTeams() {
        val score = event("in", "ESPN").copy(
            teams = listOf(
                NativeScoreTeam("New York Knicks", "90"),
                NativeScoreTeam("New York Nets", "88"),
            ),
        )
        assertNull(findScoreChannel(
            score,
            listOf(espn),
            mapOf("espn.us" to programme("New York vs Boston")),
        ))
    }

    @Test
    fun ambiguousAbcFeedsWithoutCurrentGuideDoNotAutoLaunch() {
        val abcEast = espn.copy(id = "abc-east", name = "ABC East", streamUrl = "https://example.com/abc-east.m3u8")
        val abcWest = espn.copy(id = "abc-west", name = "ABC West", streamUrl = "https://example.com/abc-west.m3u8")
        assertNull(findScoreChannel(event("in", "ABC"), listOf(abcEast, abcWest), emptyMap()))
    }

    @Test
    fun scoreWaitsForItsOwnGuideData() {
        val state = deriveSportsState(
            channels = listOf(nfl, espn),
            programmes = mapOf("nfl.us" to programme("NFL Total Access")),
            schedules = emptyMap(),
            scores = listOf(event("in", "ESPN")),
            sportFilter = "all",
        )

        assertNull(state.matchedChannels["game-1"])
    }

    @Test
    fun abbreviatedMatchupAndUsaNetBroadcastFindTheRightChannel() {
        val usa = espn.copy(id = "usa", name = "USA Network HD", tvgId = "usa.network")
        val wrong = espn.copy(id = "sky", name = "Sky Sports", tvgId = "sky.sports")
        val score = event("in", "USA Net").copy(
            name = "ORST @ BOIS",
            teams = listOf(
                NativeScoreTeam("Oregon State Beavers", "14", shortName = "Oregon State", abbreviation = "ORST"),
                NativeScoreTeam("Boise State Broncos", "10", shortName = "Boise State", abbreviation = "BOIS"),
            ),
        )
        val programmes = mapOf(
            "usa.network" to programme("College Football: Oregon St vs Boise St"),
            "sky.sports" to programme("English Premier League Football"),
        )
        assertEquals(usa, findScoreChannel(score, listOf(wrong, usa), programmes))
    }

    @Test
    fun allEspnBroadcastNamesAreCheckedAgainstTheGuide() {
        val abc = espn.copy(id = "abc", name = "ABC HD", tvgId = "abc.us")
        val score = event("in", "ESPN+").copy(broadcasts = listOf("ESPN+", "ABC"))
        assertEquals(abc, findScoreChannel(score, listOf(espn, abc), mapOf(
            "espn.us" to programme("SportsCenter"),
            "abc.us" to programme("Alabama Crimson Tide vs Georgia Bulldogs"),
        )))
    }

    @Test
    fun currentScheduleCanMatchBeforeCurrentProgrammeIndexUpdates() {
        val now = System.currentTimeMillis()
        val scheduled = programme("Alabama Crimson Tide vs Georgia Bulldogs").copy(
            startEpochMs = now - 60_000L,
            stopEpochMs = now + 60_000L,
        )
        assertEquals(espn, findScoreChannel(
            event("in", "ESPN"), listOf(espn), emptyMap(),
            mapOf("espn.us" to listOf(scheduled)),
        ))
    }

    @Test
    fun upcomingScoreMatchesItsScheduledGameInsteadOfCurrentShow() {
        val start = System.currentTimeMillis() + 3 * 60 * 60_000L
        val current = programme("SportsCenter").copy(
            startEpochMs = start - 4 * 60 * 60_000L,
            stopEpochMs = start - 2 * 60 * 60_000L,
        )
        val upcoming = programme("Alabama Crimson Tide vs Georgia Bulldogs").copy(
            startEpochMs = start,
            stopEpochMs = start + 3 * 60 * 60_000L,
        )
        assertEquals(espn, findScoreChannel(
            event("pre", "ESPN").copy(startEpochMs = start),
            listOf(espn),
            mapOf("espn.us" to current),
            mapOf("espn.us" to listOf(current, upcoming)),
        ))
        assertNull(findScoreChannel(
            event("pre", "ESPN").copy(startEpochMs = start + 12 * 60 * 60_000L),
            listOf(espn),
            mapOf("espn.us" to current),
            mapOf("espn.us" to listOf(current, upcoming)),
        ))
    }

    @Test
    fun unconfirmedScoreOffersOnlyBroadcasterChannelsWithGuideData() {
        val now = System.currentTimeMillis()
        val guided = programme("College Football").copy(
            startEpochMs = now - 60_000L,
            stopEpochMs = now + 60_000L,
        )
        val unguidedEspn = espn.copy(id = "espn-no-guide", tvgId = "espn.no-guide")
        assertEquals(
            listOf(espn),
            guidedScoreChannelChoices(
                event("in", "ESPN"),
                listOf(unguidedEspn, nfl, espn),
                mapOf("espn.us" to guided),
                emptyMap(),
            ),
        )
    }

    @Test
    fun broadGroupNameDoesNotImpersonateTheBroadcaster() {
        val wrong = espn.copy(id = "sky", name = "Sky Sports", group = "USA Sports", tvgId = "sky.us")
        assertNull(findScoreChannel(event("in", "USA Net"), listOf(wrong), mapOf(
            "sky.us" to programme("College Football"),
        )))
    }

    @Test
    fun sportsChannelsWithoutGuideStayHiddenWhileGuideLoads() {
        val state = deriveSportsState(
            channels = listOf(espn),
            programmes = emptyMap(),
            schedules = emptyMap(),
            scores = emptyList(),
            sportFilter = "all",
        )
        assertTrue(state.liveEvents.isEmpty())
    }

    @Test
    fun unrelatedGuideProgrammeIsNotShownAsLiveSports() {
        val state = deriveSportsState(
            channels = listOf(espn),
            programmes = mapOf("espn.us" to programme("Evening News")),
            schedules = emptyMap(),
            scores = emptyList(),
            sportFilter = "all",
        )
        assertTrue(state.liveEvents.isEmpty())
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
    fun websiteSecNetworkScoreFindsEarlierFootballGuideDespiteCurrentBasketball() {
        val now = System.currentTimeMillis()
        val sec = espn.copy(id = "sec", name = "US| SEC NETWORK HD", tvgId = "sec.us")
        val secSixty = espn.copy(id = "sec-60", name = "US| SEC NETWORK ᴴᴰ ⁶⁰ᶠᵖˢ", tvgId = "sec60.us")
        val score = event("in", "SEC Network").copy(
            league = "NCAA - Football",
            startEpochMs = now - 90 * 60_000L,
        )
        val basketball = programme("Live: Women's College Basketball").copy(
            startEpochMs = now - 20 * 60_000L,
            stopEpochMs = now + 100 * 60_000L,
        )
        val football = programme("Live: College Football").copy(
            startEpochMs = now - 3 * 60 * 60_000L,
            stopEpochMs = now - 50 * 60_000L,
        )

        assertEquals(sec, findScoreChannel(
            score,
            listOf(sec, secSixty),
            mapOf("sec.us" to basketball, "sec60.us" to basketball),
            mapOf("sec.us" to listOf(football, basketball), "sec60.us" to listOf(football, basketball)),
        ))
        assertEquals(listOf(sec, secSixty), guidedScoreChannelChoices(
            score,
            listOf(sec, secSixty),
            mapOf("sec.us" to basketball, "sec60.us" to basketball),
            mapOf("sec.us" to listOf(football, basketball), "sec60.us" to listOf(football, basketball)),
        ))
    }

    @Test
    fun websiteSecNetworkChoiceSurvivesGenericCurrentGuideWhenEarlierSlotIsUnavailable() {
        val sec = espn.copy(id = "sec", name = "US| SEC NETWORK HD", tvgId = "sec.us")
        val secSixty = espn.copy(id = "sec-60", name = "US| SEC NETWORK ᴴᴰ ⁶⁰ᶠᵖˢ", tvgId = "sec60.us")
        val unrelated = espn.copy(id = "yes", name = "US| YES NETWORK HD", tvgId = "yes.us")
        val score = event("in", "SEC Network").copy(league = "NCAA - Football")
        val current = mapOf(
            "sec.us" to programme("SEC Inside"),
            "sec60.us" to programme("SEC Inside"),
            "yes.us" to programme("Live: Women's College Basketball"),
        )

        assertEquals(sec, findScoreChannel(score, listOf(unrelated, sec, secSixty), current))
        assertEquals(listOf(sec, secSixty), guidedScoreChannelChoices(
            score, listOf(unrelated, sec, secSixty), current, emptyMap(),
        ))
    }

    @Test
    fun websiteBtnScoreFindsBigTenNetworkWithoutMatchingEspn() {
        val btn = espn.copy(id = "btn", name = "US| BIG TEN NETWORK HD", tvgId = "btn.us")
        val score = event("in", "BTN").copy(
            sport = "basketball",
            league = "NCAA Men's Basketball",
            teams = listOf(NativeScoreTeam("Boise State Broncos", "12"), NativeScoreTeam("Nebraska Cornhuskers", "18")),
        )
        val current = mapOf(
            "btn.us" to programme("Live: College Basketball"),
            "espn.us" to programme("SportsCenter"),
        )

        assertEquals(btn, findScoreChannel(score, listOf(espn, btn), current))
        assertEquals(listOf(btn), guidedScoreChannelChoices(score, listOf(espn, btn), current, emptyMap()))
    }

    @Test
    fun regionalNbaFeedMatchesScoreThroughGuideVenueDespiteDaznBroadcast() {
        val regional = espn.copy(id = "csn", name = "US| CSN PHILADELPHIA HD", tvgId = "csn.us")
        val unrelated = espn.copy(id = "news", name = "US| CBS NEWS", tvgId = "news.us")
        val score = event("in", "DAZN IND").copy(
            sport = "basketball",
            league = "National Basketball Association",
            name = "IND @ PHI",
            venue = "Xfinity Mobile Arena",
            teams = listOf(NativeScoreTeam("Indiana Pacers", "68"), NativeScoreTeam("Philadelphia 76ers", "73")),
        )
        val guide = mapOf(
            "csn.us" to programme("Live: NBA Basketball").copy(description = "From Xfinity Mobile Arena in Philadelphia."),
            "news.us" to programme("Live: NBA Basketball"),
        )

        assertEquals(regional, findScoreChannel(score, listOf(unrelated, regional), guide))
        assertEquals(listOf(regional), guidedScoreChannelChoices(score, listOf(unrelated, regional), guide, emptyMap()))
    }

    @Test
    fun abbreviatedSecAndAccBroadcastsMatchTheirFullNetworkNames() {
        val sec = espn.copy(id = "sec", name = "US| SEC NETWORK HD", tvgId = "sec.us")
        val acc = espn.copy(id = "acc", name = "US| ACC NETWORK HD", tvgId = "acc.us")
        val current = mapOf(
            "sec.us" to programme("College Football"),
            "acc.us" to programme("College Football"),
        )

        assertEquals(sec, findScoreChannel(event("in", "SECN"), listOf(acc, sec), current))
        assertEquals(acc, findScoreChannel(event("in", "ACCN"), listOf(sec, acc), current))
    }

    @Test
    fun fs1ScoreMatchesFoxSportsOneButNotFoxSportsTwo() {
        val fs1 = espn.copy(id = "fs1", name = "US| FOX SPORTS 1 HD", tvgId = "fox-sports-1.us")
        val fs2 = espn.copy(id = "fs2", name = "US| FOX SPORTS 2 HD", tvgId = "fox-sports-2.us")
        val score = event("in", "FS1").copy(league = "NCAA - Football")
        val programmes = mapOf(
            "fox-sports-1.us" to programme("College Football"),
            "fox-sports-2.us" to programme("College Football"),
        )

        assertEquals(fs1, findScoreChannel(score, listOf(fs2, fs1), programmes))
        assertNull(findScoreChannel(score, listOf(fs2), programmes))
        assertEquals(fs1, findScoreChannel(score.copy(broadcast = "FOX Sports 1"), listOf(fs2, fs1), programmes))
    }

    @Test
    fun abbreviatedNetworksMatchTheirFullChannelNames() {
        val score = event("in", "CBSSN").copy(league = "NCAA - Football")
        val cbsSports = espn.copy(id = "cbssn", name = "CBS Sports Network HD", tvgId = "cbssn.us")
        val cbsLocal = espn.copy(id = "cbs", name = "CBS HD", tvgId = "cbs.us")
        val programmes = mapOf(
            "cbssn.us" to programme("College Football"),
            "cbs.us" to programme("College Football"),
        )

        assertEquals(cbsSports, findScoreChannel(score, listOf(cbsLocal, cbsSports), programmes))
        assertEquals(cbsSports, findScoreChannel(score.copy(broadcast = "CBS Sports Network"), listOf(cbsLocal, cbsSports), programmes))
        assertNull(findScoreChannel(score, listOf(cbsLocal), programmes))
        assertEquals(cbsLocal, findScoreChannel(score.copy(broadcast = "CBS"), listOf(cbsSports, cbsLocal), programmes))
    }

    @Test
    fun espnuAndEspnDoNotShareGenericGuideMatches() {
        val espnu = espn.copy(id = "espnu", name = "ESPN U HD", tvgId = "espnu.us")
        val programmes = mapOf(
            "espn.us" to programme("College Football"),
            "espnu.us" to programme("College Football"),
        )

        assertEquals(espnu, findScoreChannel(event("in", "ESPNU"), listOf(espn, espnu), programmes))
        assertNull(findScoreChannel(event("in", "ESPNU"), listOf(espn), programmes))
        assertEquals(espn, findScoreChannel(event("in", "ESPN"), listOf(espnu, espn), programmes))
    }

    @Test
    fun genericSportsGuideDoesNotOverrideAConflictingMatchup() {
        val wrong = espn.copy(tvgId = "espn.wrong")
        val programmes = mapOf("espn.wrong" to programme("Alabama Crimson Tide vs Auburn Tigers"))

        assertNull(findScoreChannel(event("in", "ESPN"), listOf(wrong), programmes))
    }

    @Test
    fun fullNflLeagueNameFindsCanonicalFoxStreamAndRelevantChannels() {
        val score = event("in", "Fox").copy(
            league = "National Football League",
            name = "NE @ DET",
            teams = listOf(NativeScoreTeam("New England Patriots", "7"), NativeScoreTeam("Detroit Lions", "14")),
        )
        val news = espn.copy(id = "fox-news", name = "FOX News", tvgId = "fox-news.us")
        val business = espn.copy(id = "fox-business", name = "FOX Business News", tvgId = "fox-business.us")
        val local = espn.copy(id = "fox-29", name = "FOX 29", tvgId = "fox-29.us")
        val national = espn.copy(id = "fox-hd", name = "US| FOX HD", tvgId = "fox.us")
        val programmes = mapOf(
            "fox-news.us" to programme("Sunday Morning Futures"),
            "fox-business.us" to programme("Barron's Roundtable"),
            "fox-29.us" to programme("Live: NFL Football"),
            "fox.us" to programme("Live: NFL Football"),
        )
        val channels = listOf(news, business, local, national)

        assertEquals(national, findScoreChannel(score, channels, programmes))
        assertEquals(listOf(national, local), guidedScoreChannelChoices(score, channels, programmes, emptyMap()))
    }

    @Test
    fun wrongBroadcasterNeverWinsEvenWithTheExactMatchupInItsGuide() {
        val score = event("in", "Fox").copy(
            league = "National Football League",
            name = "NE VS DET",
            teams = listOf(NativeScoreTeam("New England Patriots", "3"), NativeScoreTeam("Detroit Lions", "28")),
        )
        val bein = espn.copy(id = "bein", name = "UK| BEIN SPORT 2 EN FHD", tvgId = "fox.us")
        val fox = espn.copy(id = "fox", name = "US| FOX HD", tvgId = "fox.local")
        val programmes = mapOf(
            "fox.us" to programme("New England Patriots vs Detroit Lions"),
            "fox.local" to programme("Live: NFL Football"),
        )

        assertEquals(fox, findScoreChannel(score, listOf(bein, fox), programmes))
        assertEquals(listOf(fox), guidedScoreChannelChoices(score, listOf(bein, fox), programmes, emptyMap()))
    }

    @Test
    fun liveScoreDoesNotLaunchAChannelWithOnlyFutureGuideData() {
        val future = programme("New England Patriots vs Detroit Lions").copy(
            startEpochMs = System.currentTimeMillis() + 30 * 60_000L,
            stopEpochMs = System.currentTimeMillis() + 3 * 60 * 60_000L,
        )
        val score = event("in", "Fox").copy(
            league = "National Football League",
            teams = listOf(NativeScoreTeam("New England Patriots", "3"), NativeScoreTeam("Detroit Lions", "28")),
        )
        val fox = espn.copy(id = "fox", name = "US| FOX HD", tvgId = "fox.us")

        assertNull(findScoreChannel(score, listOf(fox), emptyMap(), mapOf("fox.us" to listOf(future))))
    }

    @Test
    fun websiteStyleRelevantFoxChannelsExcludeNewsAndAutoPreferNationalFeed() {
        val score = event("in", "Fox").copy(
            league = "National Football League",
            name = "NE VS DET",
            teams = listOf(NativeScoreTeam("New England Patriots", "10"), NativeScoreTeam("Detroit Lions", "35")),
        )
        val fox = espn.copy(id = "fox", name = "US| FOX HD", tvgId = "fox.us")
        val local = espn.copy(id = "fox-29", name = "US| FOX 29", tvgId = "fox-29.us")
        val news = espn.copy(id = "fox-news", name = "US| FOX NEWS HD", tvgId = "fox-news.us")
        val business = espn.copy(id = "fox-business", name = "US| FOX BUSINESS NETWORK HD", tvgId = "fox-business.us")
        val staleGuide = programme("Live: FOX NFL Sunday").copy(
            startEpochMs = System.currentTimeMillis() - 5 * 60 * 60_000L,
            stopEpochMs = System.currentTimeMillis() - 3 * 60 * 60_000L,
        )
        val current = mapOf(
            "fox.us" to staleGuide,
            "fox-29.us" to staleGuide,
            "fox-news.us" to programme("Live: FOX NFL Sunday"),
            "fox-business.us" to programme("New England Patriots vs Detroit Lions"),
        )
        val channels = listOf(news, business, local, fox)

        assertEquals(fox, findScoreChannel(score, channels, current))
        assertEquals(listOf(fox, local), guidedScoreChannelChoices(score, channels, current, emptyMap()))
    }

    @Test
    fun duplicateCurrentAndScheduleEntriesDoNotHideOneValidStream() {
        val score = event("in", "ESPN").copy(league = "National Football League")
        val current = programme("Live: NFL Football")
        assertEquals(espn, findScoreChannel(
            score, listOf(espn), mapOf("espn.us" to current), mapOf("espn.us" to listOf(current)),
        ))
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
        startEpochMs = System.currentTimeMillis() - 60_000L,
        stopEpochMs = System.currentTimeMillis() + 60 * 60_000L,
        timeLabel = "Now",
    )
}
