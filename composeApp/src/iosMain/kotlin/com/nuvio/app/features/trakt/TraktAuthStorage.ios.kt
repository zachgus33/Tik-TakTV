package com.nuvio.app.features.trakt

import com.nuvio.app.core.storage.ProfileScopedKey
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.userId
import platform.Foundation.NSUserDefaults

internal actual object TraktAuthStorage {
    private const val payloadKey = "trakt_auth_payload"

    private fun key(): String? = AuthRepository.state.value.userId
        ?.let { "${it}_${ProfileScopedKey.of(payloadKey)}" }

    actual fun loadPayload(): String? {
        val scoped = key() ?: return null
        val defaults = NSUserDefaults.standardUserDefaults
        defaults.stringForKey(scoped)?.let { return it }
        val legacy = ProfileScopedKey.of(payloadKey)
        val payload = defaults.stringForKey(legacy) ?: return null
        defaults.setObject(payload, forKey = scoped)
        defaults.removeObjectForKey(legacy)
        return payload
    }

    actual fun savePayload(payload: String) {
        val scoped = key() ?: return
        NSUserDefaults.standardUserDefaults.setObject(payload, forKey = scoped)
    }
}
