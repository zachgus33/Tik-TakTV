package com.nuvio.app.features.trakt

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString

class TraktAuthRepositoryTest {

    @Test
    fun `refresh request includes the client secret required by Trakt`() {
        val payload = Json.encodeToString(
            TraktRefreshTokenRequest(
                refreshToken = "refresh",
                clientId = "client",
                clientSecret = "secret",
                redirectUri = "urn:test",
            ),
        )
        assertTrue(payload.contains("\"client_secret\":\"secret\""))
    }

    @Test
    fun `device sign-in keeps polling while Trakt awaits approval`() {
        assertEquals(TraktDevicePollAction.WAIT, traktDevicePollAction(400))
        assertEquals(TraktDevicePollAction.SLOW_DOWN, traktDevicePollAction(429))
    }

    @Test
    fun `device sign-in stops for invalid used expired or denied codes`() {
        listOf(404, 409, 410, 418).forEach { status ->
            assertEquals(TraktDevicePollAction.STOP, traktDevicePollAction(status))
        }
    }

    @Test
    fun `HTTP 400 preserves saved credentials for a corrected refresh request`() {
        assertEquals(
            TraktTokenRefreshResponseAction.REJECTED,
            traktTokenRefreshResponseAction(400),
        )
    }

    @Test
    fun `successful token responses are accepted`() {
        assertEquals(
            TraktTokenRefreshResponseAction.ACCEPT,
            traktTokenRefreshResponseAction(200),
        )
        assertEquals(
            TraktTokenRefreshResponseAction.ACCEPT,
            traktTokenRefreshResponseAction(201),
        )
    }

    @Test
    fun `non-400 failures preserve credentials for a later attempt`() {
        listOf(401, 429, 500, 503).forEach { status ->
            assertEquals(
                TraktTokenRefreshResponseAction.TRANSIENT_FAILURE,
                traktTokenRefreshResponseAction(status),
            )
        }
    }
}
