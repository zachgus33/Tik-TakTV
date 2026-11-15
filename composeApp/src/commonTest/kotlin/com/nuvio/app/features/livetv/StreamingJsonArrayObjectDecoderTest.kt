package com.nuvio.app.features.livetv

import kotlin.test.Test
import kotlin.test.assertEquals

class StreamingJsonArrayObjectDecoderTest {
    @Test
    fun decodesObjectsAcrossChunksWithoutTreatingStringBracesAsStructure() {
        val names = mutableListOf<String>()
        val decoder = StreamingJsonArrayObjectDecoder { item ->
            names += item["name"].toString().trim('"')
        }

        decoder.accept("  [{\"name\":\"first }")
        decoder.accept(" stream\",\"nested\":{\"ok\":true}},")
        decoder.accept("{\"name\":\"second \\\"quoted\\\"\"}]")

        assertEquals(listOf("first } stream", "second \\\"quoted\\\""), names)
    }

    @Test
    fun decodesManyObjectsWhenChunkBoundariesSplitTheArrayAndItems() {
        val names = mutableListOf<String>()
        val decoder = StreamingJsonArrayObjectDecoder { item ->
            names += item["name"].toString().trim('"')
        }
        val payload = (1..250).joinToString(",", prefix = " [ ", postfix = " ] ") { index ->
            "{\"name\":\"channel $index\",\"nested\":{\"value\":$index}}"
        }
        payload.chunked(37).forEach(decoder::accept)

        assertEquals(250, names.size)
        assertEquals("channel 1", names.first())
        assertEquals("channel 250", names.last())
    }

    @Test
    fun skipsUnneededEntriesWithoutLosingTheNextObjectAcrossChunks() {
        val names = mutableListOf<String>()
        val decoder = StreamingJsonArrayObjectDecoder(
            shouldParse = { raw -> raw.contains("\"epg_channel_id\":\"sports\"") },
        ) { item ->
            names += item["name"].toString().trim('"')
        }
        val payload = """[{"name":"ignore","epg_channel_id":""},{"name":"keep","epg_channel_id":"sports"},{"name":"also ignore"}]"""
        payload.chunked(13).forEach(decoder::accept)

        assertEquals(listOf("keep"), names)
    }
}
