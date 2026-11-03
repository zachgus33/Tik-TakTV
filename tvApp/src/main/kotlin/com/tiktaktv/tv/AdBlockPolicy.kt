package com.tiktaktv.tv

import java.net.URI

/** A conservative filter for ad networks commonly used by popup pages. */
internal object AdBlockPolicy {
    private val blockedHosts = setOf(
        "adnxs.com", "adsrvr.org", "adsterra.com", "clickadu.com",
        "criteo.com", "criteo.net", "exoclick.com", "hilltopads.com",
        "juicyads.com", "mgid.com", "onclickalgo.com", "outbrain.com",
        "popads.net", "popcash.net", "propellerads.com",
        "scorecardresearch.com", "taboola.com", "trafficjunky.net",
    )

    fun shouldBlock(value: String): Boolean = runCatching {
        val host = URI(value).host?.lowercase() ?: return@runCatching false
        blockedHosts.any { host == it || host.endsWith(".$it") }
    }.getOrDefault(false)
}
