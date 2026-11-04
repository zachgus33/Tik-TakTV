package com.tiktaktv.tv

/** Playback defaults shared by the TV WebView and its regression tests. */
internal object TvPlaybackPolicy {
    // Remote selection creates embedded players asynchronously. Requiring a
    // second gesture here prevents YouTube playback from starting afterward.
    const val requiresMediaPlaybackGesture = false
}
