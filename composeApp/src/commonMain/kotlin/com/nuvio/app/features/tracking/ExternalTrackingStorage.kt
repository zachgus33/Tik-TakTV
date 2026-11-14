package com.nuvio.app.features.tracking

internal expect object ExternalTrackingStorage {
    fun load(provider: String, profileId: Int): String?
    fun save(provider: String, profileId: Int, payload: String)
}
