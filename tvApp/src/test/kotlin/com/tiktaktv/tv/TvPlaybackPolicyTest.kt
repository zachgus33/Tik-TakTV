package com.tiktaktv.tv

import org.junit.Assert.assertFalse
import org.junit.Test

class TvPlaybackPolicyTest {
    @Test
    fun asynchronousTvPlayersDoNotRequireASecondRemoteGesture() {
        assertFalse(TvPlaybackPolicy.requiresMediaPlaybackGesture)
    }
}
