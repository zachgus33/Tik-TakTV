package com.nuvio.app.features.trakt

import android.content.Context
import android.content.SharedPreferences
import com.nuvio.app.core.storage.ProfileScopedKey
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.userId

internal actual object TraktAuthStorage {
    private const val preferencesName = "nuvio_trakt_auth"
    private const val payloadKey = "trakt_auth_payload"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

    private fun scopedKey(profileId: Int): String? = AuthRepository.state.value.userId
        ?.let { "${it}_${ProfileScopedKey.of(payloadKey, profileId)}" }

    actual fun loadPayload(): String? {
        val prefs = preferences ?: return null
        val key = scopedKey(com.nuvio.app.features.profiles.ProfileRepository.activeProfileId) ?: return null
        prefs.getString(key, null)?.let { return it }
        val legacyKey = ProfileScopedKey.of(payloadKey)
        val legacy = prefs.getString(legacyKey, null) ?: return null
        prefs.edit().putString(key, legacy).remove(legacyKey).apply()
        return legacy
    }

    actual fun savePayload(payload: String) {
        val key = scopedKey(com.nuvio.app.features.profiles.ProfileRepository.activeProfileId) ?: return
        preferences
            ?.edit()
            ?.putString(key, payload)
            ?.apply()
    }

    fun removeProfile(profileId: Int) {
        val key = scopedKey(profileId) ?: return
        preferences
            ?.edit()
            ?.remove(key)
            ?.apply()
    }
}
