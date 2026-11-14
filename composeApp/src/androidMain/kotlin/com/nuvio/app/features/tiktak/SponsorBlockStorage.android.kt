package com.nuvio.app.features.tiktak

import android.content.Context
import android.content.SharedPreferences

internal actual object SponsorBlockStorage {
    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences("tiktak_sponsorblock", Context.MODE_PRIVATE)
    }

    actual fun load(): String? = preferences?.getString("preferences", null)

    actual fun save(payload: String) {
        preferences?.edit()?.putString("preferences", payload)?.apply()
    }
}
