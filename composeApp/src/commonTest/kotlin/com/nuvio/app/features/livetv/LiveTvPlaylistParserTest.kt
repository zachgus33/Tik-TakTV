package com.nuvio.app.features.livetv

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals

class LiveTvPlaylistParserTest {
    @Test
    fun buildsCurrentAndUpcomingGuideSchedule() {
        val now = LiveTvClock.parseXmlTvTimestamp("20261108193000 +0000")!!
        val schedules = parseXmlTvProgrammeSchedules(
            """
            <tv>
              <programme start="20261108190000 +0000" stop="20261108200000 +0000" channel="cbs"><title>Evening News</title></programme>
              <programme start="20261108200000 +0000" stop="20261108210000 +0000" channel="cbs"><title>College Football</title></programme>
              <programme start="20261108210000 +0000" stop="20261108220000 +0000" channel="cbs"><title>Local News</title></programme>
            </tv>
            """.trimIndent(),
            nowEpochMs = now,
        )

        assertEquals(listOf("Evening News", "College Football", "Local News"), schedules.getValue("cbs").map { it.title })
    }

    @Test
    fun parsesBoundedXtreamShortGuideWithBase64Titles() {
        val now = 1_794_169_800_000L
        val root = Json.parseToJsonElement(
            """
            {
              "epg_listings": [
                {
                  "title": "RXZlbmluZyBOZXdz",
                  "start_timestamp": 1794168000,
                  "stop_timestamp": 1794171600
                },
                {
                  "title": "Too late",
                  "start_timestamp": 1794182400,
                  "stop_timestamp": 1794186000
                }
              ]
            }
            """.trimIndent(),
        ).jsonObject

        val schedules = parseXtreamShortEpg(root, now)

        assertEquals(listOf("Evening News"), schedules.map(LiveTvProgramme::title))
    }

    @Test
    fun keepsChannelsVisibleUntilGuideMatchesAreAvailable() {
        val channels = listOf(
            LiveTvChannel("one", "CBS", "https://stream.test/one", tvgId = "cbs"),
            LiveTvChannel("two", "NBC", "https://stream.test/two", tvgId = "nbc"),
        )

        val withoutGuide = selectGuideBackedChannelsOrAll(channels, emptyMap(), emptyMap())
        assertEquals(channels, withoutGuide.channels)
        assertEquals(true, withoutGuide.usingFallback)

        val programme = LiveTvProgramme("News", 1L, 2L, "")
        val withGuide = selectGuideBackedChannelsOrAll(
            channels,
            currentProgrammes = mapOf("cbs" to programme),
            schedules = emptyMap(),
        )
        assertEquals(listOf("CBS"), withGuide.channels.map(LiveTvChannel::name))
        assertEquals(false, withGuide.usingFallback)
    }

    @Test
    fun parsesChannelMetadataAndHeaders() {
        val playlist = parseM3uPlaylistData(
            """
            #EXTM3U url-tvg="https://epg.test/guide.xml"
            #EXTINF:-1 tvg-id="trt1.tr" tvg-name="TRT 1" tvg-logo="https://img.test/trt.png" group-title="Ulusal",TRT 1 HD
            #EXTVLCOPT:http-user-agent=Nuvio
            #EXTVLCOPT:http-referrer=https://playlist-referrer.test/
            https://stream.test/trt.m3u8
            """.trimIndent(),
        )
        val channels = playlist.channels

        assertEquals(1, channels.size)
        assertEquals(listOf("https://epg.test/guide.xml"), playlist.epgUrls)
        assertEquals("trt1.tr", channels.first().tvgId)
        assertEquals("TRT 1 HD", channels.first().name)
        assertEquals("Ulusal", channels.first().group)
        assertEquals("https://img.test/trt.png", channels.first().logoUrl)
        assertEquals("Nuvio", channels.first().headers["User-Agent"])
        assertEquals("https://playlist-referrer.test/", channels.first().headers["Referer"])
        assertEquals("hls", channels.first().streamType)
    }

    @Test
    fun parsesInlineStreamHeaders() {
        val channels = parseM3uPlaylist(
            """
            #EXTM3U
            #EXTINF:-1,Header Channel
            https://stream.test/header.m3u8|Referer=https://example.test
            """.trimIndent(),
        )

        assertEquals(1, channels.size)
        assertEquals("https://example.test", channels.first().headers["Referer"])
    }

    @Test
    fun marksMatroskaStreamsFromPlaylist() {
        val channels = parseM3uPlaylist(
            """
            #EXTM3U
            #EXTINF:-1,Movie Stream
            #EXTVLCOPT:http-referrer=https://example.test/
            https://stream.test/movie.mkv
            """.trimIndent(),
        )

        assertEquals(1, channels.size)
        assertEquals("matroska", channels.first().streamType)
        assertEquals("https://example.test/", channels.first().headers["Referer"])
    }

    @Test
    fun removesDuplicateStreamUrls() {
        val channels = parseM3uPlaylist(
            """
            #EXTM3U
            #EXTINF:-1,Channel One
            https://stream.test/live.m3u8
            #EXTINF:-1,Channel One Duplicate
            https://stream.test/live.m3u8
            """.trimIndent(),
        )

        assertEquals(1, channels.size)
        assertEquals("Channel One", channels.first().name)
    }

    @Test
    fun skipsCategoryHeadingLikeEntries() {
        val channels = parseM3uPlaylist(
            """
            #EXTM3U
            #EXTINF:-1,#### HABER KANALLARI ####
            https://stream.test/haber.m3u8
            #EXTINF:-1,TRT 1 HD
            https://stream.test/trt1.m3u8
            """.trimIndent(),
        )

        assertEquals(1, channels.size)
        assertEquals("TRT 1 HD", channels.first().name)
    }

    @Test
    fun capsVeryLargePlaylistsForLowMemoryTvDevices() {
        val playlist = buildString {
            appendLine("#EXTM3U")
            repeat(LiveTvInMemoryChannelLimit + 25) { index ->
                appendLine("#EXTINF:-1,Channel $index")
                appendLine("https://stream.test/$index.m3u8")
            }
        }

        val channels = parseM3uPlaylist(playlist)

        assertEquals(LiveTvInMemoryChannelLimit, channels.size)
        assertEquals("Channel 0", channels.first().name)
        assertEquals("Channel ${LiveTvInMemoryChannelLimit - 1}", channels.last().name)
    }
}
