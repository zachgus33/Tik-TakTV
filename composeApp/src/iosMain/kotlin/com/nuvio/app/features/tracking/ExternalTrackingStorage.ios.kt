package com.nuvio.app.features.tracking

import com.nuvio.app.core.storage.ProfileScopedKey
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.userId
import platform.Foundation.NSUserDefaults

internal actual object ExternalTrackingStorage {
    private fun key(provider: String, profileId: Int): String? = AuthRepository.state.value.userId
        ?.let { "${it}_${ProfileScopedKey.of("tracking_$provider", profileId)}" }

    actual fun load(provider: String, profileId: Int): String? {
        val scoped = key(provider, profileId) ?: return null
        val defaults = NSUserDefaults.standardUserDefaults
        defaults.stringForKey(scoped)?.let { return it }
        val legacy = ProfileScopedKey.of("tracking_$provider", profileId)
        val payload = defaults.stringForKey(legacy) ?: return null
        defaults.setObject(payload, forKey = scoped)
        defaults.removeObjectForKey(legacy)
        return payload
    }

    actual fun save(provider: String, profileId: Int, payload: String) {
        val scoped = key(provider, profileId) ?: return
        NSUserDefaults.standardUserDefaults.setObject(payload, forKey = scoped)
    }
}
