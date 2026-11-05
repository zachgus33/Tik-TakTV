package com.tiktaktv.tv

import org.junit.Assert.assertTrue
import org.junit.Test

class TvDialogBackPolicyTest {
    @Test
    fun `back prefers minimizing live playback before closing a dialog`() {
        val minimize = TvDialogBackPolicy.actionSelector.indexOf("Minimize live player")
        val close = TvDialogBackPolicy.actionSelector.indexOf("Close")

        assertTrue(minimize >= 0)
        assertTrue(close > minimize)
    }
}
