package com.nuvio.app.features.tiktak

import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.features.addons.RawHttpResponse
import com.nuvio.app.features.addons.httpRequestRaw
import io.github.jan.supabase.auth.auth

internal object TikTakServiceClient {
    suspend fun post(path: String, body: String): RawHttpResponse {
        val accessToken = SupabaseProvider.client.auth.currentSessionOrNull()?.accessToken
            ?.takeIf { it.isNotBlank() }
            ?: error("Sign in to use this TikTak TV feature.")
        return httpRequestRaw(
            method = "POST",
            url = "$BASE_URL${path.ensureLeadingSlash()}",
            headers = mapOf(
                "Authorization" to "Bearer $accessToken",
                "Content-Type" to "application/json",
                "Accept" to "application/json",
            ),
            body = body,
            maxResponseBodyBytes = 4 * 1024 * 1024,
        )
    }

    private fun String.ensureLeadingSlash(): String = if (startsWith('/')) this else "/$this"

    private const val BASE_URL = "https://api.tiktaktv.me"
}
