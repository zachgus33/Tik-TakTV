package com.tiktaktv.tv

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AdBlockPolicyTest {
    @Test
    fun blocksKnownAdHostsAndTheirSubdomains() {
        assertTrue(AdBlockPolicy.shouldBlock("https://ads.adnxs.com/render"))
        assertTrue(AdBlockPolicy.shouldBlock("https://popads.net/popup"))
    }

    @Test
    fun preservesPlaybackAndApplicationHosts() {
        assertFalse(AdBlockPolicy.shouldBlock("https://www.tiktaktv.me/"))
        assertFalse(AdBlockPolicy.shouldBlock("https://www.youtube.com/embed/abcdefghijk"))
        assertFalse(AdBlockPolicy.shouldBlock("https://r1---sn.example.googlevideo.com/videoplayback"))
        assertFalse(AdBlockPolicy.shouldBlock("https://stream.example/live.m3u8"))
    }
}
