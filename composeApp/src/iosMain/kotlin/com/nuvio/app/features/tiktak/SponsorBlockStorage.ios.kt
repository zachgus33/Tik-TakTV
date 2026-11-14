package com.nuvio.app.features.tiktak

import platform.Foundation.NSUserDefaults

internal actual object SponsorBlockStorage {
    private const val key = "tiktak_sponsorblock_preferences"

    actual fun load(): String? = NSUserDefaults.standardUserDefaults.stringForKey(key)

    actual fun save(payload: String) {
        NSUserDefaults.standardUserDefaults.setObject(payload, forKey = key)
    }
}
