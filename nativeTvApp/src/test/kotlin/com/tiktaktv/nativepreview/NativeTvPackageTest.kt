package com.tiktaktv.nativepreview

import org.junit.Assert.assertNotEquals
import org.junit.Test

class NativeTvPackageTest {
    @Test
    fun previewPackageDoesNotReplaceReleasedTvClient() {
        assertNotEquals("com.tiktaktv.tv", BuildConfig.APPLICATION_ID)
    }
}
