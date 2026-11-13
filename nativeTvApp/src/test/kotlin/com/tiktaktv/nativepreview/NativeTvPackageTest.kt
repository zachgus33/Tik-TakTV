package com.tiktaktv.nativepreview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeTvPackageTest {
    @Test
    fun nativePackageMatchesAmazonSubmissionAndExistingSideloadInstalls() {
        assertEquals("com.tiktaktv.tv.nativepreview", BuildConfig.APPLICATION_ID)
    }

    @Test
    fun signedNativeAppKeepsItsExistingUpdateChannel() {
        assertTrue(BuildConfig.VERSION_CODE > 1)
        assertTrue(BuildConfig.UPDATE_METADATA_URL.startsWith("https://"))
        assertTrue(BuildConfig.UPDATE_METADATA_URL.contains("native-preview-latest"))
    }
}
