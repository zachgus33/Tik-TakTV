package com.tiktaktv.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MobileUrlPolicyTest {
    @Test fun appUrlsAreRestrictedToTikTakTvHttps() {
        assertTrue(MobileUrlPolicy.isAppUrl("https://www.tiktaktv.me/#home"))
        assertTrue(MobileUrlPolicy.isAppUrl("https://tiktaktv.me/account"))
        assertFalse(MobileUrlPolicy.isAppUrl("http://tiktaktv.me"))
        assertFalse(MobileUrlPolicy.isAppUrl("https://tiktaktv.me.evil.example"))
        assertFalse(MobileUrlPolicy.isAppUrl("https://user@tiktaktv.me"))
    }

    @Test fun downloadsRequireSecureUrlsWithoutEmbeddedCredentials() {
        assertTrue(MobileUrlPolicy.isDownload("https://api.tiktaktv.me/media/abc/download.mp4"))
        assertTrue(MobileUrlPolicy.isDownload("https://authorized-provider.example/file.mp4"))
        assertFalse(MobileUrlPolicy.isDownload("http://authorized-provider.example/file.mp4"))
        assertFalse(MobileUrlPolicy.isDownload("https://user:password@authorized-provider.example/file.mp4"))
    }

    @Test fun filenamesAreSafeForAndroidDownloads() {
        assertEquals("Episode_ 1_.mp4", MobileUrlPolicy.safeFilename("Episode: 1?.mp4"))
        assertEquals("TikTak-TV-download", MobileUrlPolicy.safeFilename("..."))
    }
}
