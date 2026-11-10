package com.nuvio.app

import coil3.size.Size
import kotlin.test.Test
import kotlin.test.assertEquals

class NativeTvArtworkSizeTest {
    @Test
    fun smallArtworkKeepsItsMeasuredDecodeSize() {
        assertEquals(
            Size(width = 80, height = 80),
            nativeTvArtworkDecodeSize(Size(width = 80, height = 80)),
        )
    }

    @Test
    fun oversizedArtworkIsClampedToTheTvEnvelope() {
        assertEquals(
            Size(width = 720, height = 405),
            nativeTvArtworkDecodeSize(Size(width = 1920, height = 1080)),
        )
    }

    @Test
    fun undefinedArtworkUsesABoundedFallback() {
        assertEquals(
            Size(width = 720, height = 405),
            nativeTvArtworkDecodeSize(Size.ORIGINAL),
        )
    }
}
