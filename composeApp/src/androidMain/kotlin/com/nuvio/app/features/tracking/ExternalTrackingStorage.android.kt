package com.nuvio.app.features.tracking

import android.content.Context
import android.content.SharedPreferences
import com.nuvio.app.core.storage.ProfileScopedKey

internal actual object ExternalTrackingStorage {
    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences("tiktak_external_tracking", Context.MODE_PRIVATE)
    }

    private fun key(provider: String, profileId: Int) = ProfileScopedKey.of("tracking_$provider", profileId)

    actual fun load(provider: String, profileId: Int): String? =
        preferences?.getString(key(provider, profileId), null)

    actual fun save(provider: String, profileId: Int, payload: String) {
        preferences?.edit()?.putString(key(provider, profileId), payload)?.apply()
    }
}
