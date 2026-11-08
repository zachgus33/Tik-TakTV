package com.tiktaktv.nativepreview

import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeTvPackageTest {
    @Test
    fun previewPackageDoesNotReplaceReleasedTvClient() {
        assertNotEquals("com.tiktaktv.tv", BuildConfig.APPLICATION_ID)
    }

    @Test
    fun signedPreviewUsesVersionedHttpsUpdateMetadata() {
        assertTrue(BuildConfig.VERSION_CODE > 1)
        assertTrue(BuildConfig.UPDATE_METADATA_URL.startsWith("https://"))
        assertTrue(BuildConfig.UPDATE_METADATA_URL.contains("native-preview-latest"))
    }
}
