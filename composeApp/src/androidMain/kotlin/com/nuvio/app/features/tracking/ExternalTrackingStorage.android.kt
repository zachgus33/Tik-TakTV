package com.nuvio.app.features.tracking

import android.content.Context
import android.content.SharedPreferences
import com.nuvio.app.core.storage.ProfileScopedKey
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.userId

internal actual object ExternalTrackingStorage {
    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences("tiktak_external_tracking", Context.MODE_PRIVATE)
    }

    private fun key(provider: String, profileId: Int): String? = AuthRepository.state.value.userId
        ?.let { "${it}_${ProfileScopedKey.of("tracking_$provider", profileId)}" }

    actual fun load(provider: String, profileId: Int): String? {
        val prefs = preferences ?: return null
        val scoped = key(provider, profileId) ?: return null
        prefs.getString(scoped, null)?.let { return it }
        val legacy = ProfileScopedKey.of("tracking_$provider", profileId)
        val payload = prefs.getString(legacy, null) ?: return null
        prefs.edit().putString(scoped, payload).remove(legacy).apply()
        return payload
    }

    actual fun save(provider: String, profileId: Int, payload: String) {
        val scoped = key(provider, profileId) ?: return
        preferences?.edit()?.putString(scoped, payload)?.apply()
    }
}
