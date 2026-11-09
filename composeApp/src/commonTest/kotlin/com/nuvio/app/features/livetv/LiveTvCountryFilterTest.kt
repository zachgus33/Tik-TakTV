package com.nuvio.app.features.livetv

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class LiveTvCountryFilterTest {
    private fun channel(name: String, group: String) = LiveTvChannel(
        id = name,
        name = name,
        streamUrl = "https://stream.test/$name",
        group = group,
    )

    @Test
    fun recognizesUnitedStatesAndCommonCountryPrefixes() {
        assertEquals("US", liveTvCountryFor(channel("CBS HD", "US| GENERAL"))?.code)
        assertEquals("GB", liveTvCountryFor(channel("BBC One", "UK | Entertainment"))?.code)
        assertEquals("CA", liveTvCountryFor(channel("CBC", "Canada News"))?.code)
    }

    @Test
    fun doesNotGuessCountryFromUnrelatedCategoryText() {
        assertNull(liveTvCountryFor(channel("Discovery", "Movies and series")))
    }

    @Test
    fun fallsBackToChannelNameWhenGroupIsMissing() {
        assertEquals("US", liveTvCountryFor(channel("United States | ESPN", ""))?.code)
    }
}
