package com.nuvio.app.features.tracking

import com.nuvio.app.core.storage.ProfileScopedKey
import platform.Foundation.NSUserDefaults

internal actual object ExternalTrackingStorage {
    private fun key(provider: String, profileId: Int) = ProfileScopedKey.of("tracking_$provider", profileId)

    actual fun load(provider: String, profileId: Int): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(key(provider, profileId))

    actual fun save(provider: String, profileId: Int, payload: String) {
        NSUserDefaults.standardUserDefaults.setObject(payload, forKey = key(provider, profileId))
    }
}
