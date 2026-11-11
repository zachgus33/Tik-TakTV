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
}
