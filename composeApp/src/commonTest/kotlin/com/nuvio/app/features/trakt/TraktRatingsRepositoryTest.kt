package com.nuvio.app.features.trakt

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TraktRatingsRepositoryTest {
    @Test
    fun `ratings require movie or show with stable Trakt ids`() {
        assertTrue(TraktRatingsRepository.canRate("movie", "tt0111161"))
        assertTrue(TraktRatingsRepository.canRate("series", "tmdb:1396"))
        assertFalse(TraktRatingsRepository.canRate("movie", "custom:unmatched"))
        assertFalse(TraktRatingsRepository.canRate("channel", "tt0111161"))
    }
}
