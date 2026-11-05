package com.tiktaktv.tv

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SmartTubePolicyTest {
    @Test
    fun acceptsOnlyPlainYouTubeVideoIds() {
        assertTrue(SmartTubePolicy.accepts("dQw4w9WgXcQ"))
        assertFalse(SmartTubePolicy.accepts("https://youtube.com/watch?v=dQw4w9WgXcQ"))
        assertFalse(SmartTubePolicy.accepts("../../private"))
        assertFalse(SmartTubePolicy.accepts("bad id"))
    }
}
