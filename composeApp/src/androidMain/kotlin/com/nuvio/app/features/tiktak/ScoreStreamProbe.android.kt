package com.nuvio.app.features.tiktak

import com.nuvio.app.features.livetv.LiveTvChannel
import com.nuvio.app.core.network.IPv4FirstDns
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

private val scoreStreamProbeClient = OkHttpClient.Builder()
    .dns(IPv4FirstDns())
    .callTimeout(3, TimeUnit.SECONDS)
    .followRedirects(true)
    .build()

internal actual suspend fun probeScoreStreamStatus(channel: LiveTvChannel): Int? = withContext(Dispatchers.IO) {
    if (!channel.streamUrl.startsWith("http://", true) && !channel.streamUrl.startsWith("https://", true)) {
        return@withContext null
    }
    try {
        val request = Request.Builder().url(channel.streamUrl).apply {
            header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            channel.headers.forEach { (name, value) -> header(name, value) }
        }.get().build()
        scoreStreamProbeClient.newCall(request).execute().use { it.code }
    } catch (error: CancellationException) {
        throw error
    } catch (_: Exception) {
        null
    }
}
