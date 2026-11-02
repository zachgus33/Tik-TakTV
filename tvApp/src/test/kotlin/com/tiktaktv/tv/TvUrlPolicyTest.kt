package com.tiktaktv.tv

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TvUrlPolicyTest {
    @Test
    fun acceptsOnlyTikTakPagesInsideTheApp() {
        assertTrue(TvUrlPolicy.isInternal("https://www.tiktaktv.me/?tv=1#home"))
        assertTrue(TvUrlPolicy.isInternal("https://tiktaktv.me/#settings"))
        assertFalse(TvUrlPolicy.isInternal("http://www.tiktaktv.me/"))
        assertFalse(TvUrlPolicy.isInternal("https://tiktaktv.me.example.com/"))
        assertFalse(TvUrlPolicy.isInternal("https://user:secret@tiktaktv.me/"))
        assertFalse(TvUrlPolicy.isInternal("javascript:alert(1)"))
    }

    @Test
    fun limitsNativeDownloadsToTikTakAndItsCompanion() {
        assertTrue(TvUrlPolicy.isDownload("https://www.tiktaktv.me/file.mp4"))
        assertTrue(TvUrlPolicy.isDownload("https://api.tiktaktv.me/media/test.mp4"))
        assertFalse(TvUrlPolicy.isDownload("https://example.com/file.apk"))
        assertFalse(TvUrlPolicy.isDownload("file:///sdcard/secret"))
    }
}
