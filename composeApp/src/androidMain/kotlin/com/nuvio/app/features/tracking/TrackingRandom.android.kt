package com.nuvio.app.features.tracking

import java.security.SecureRandom

internal actual fun trackingRandomState(): String = ByteArray(24).also(SecureRandom()::nextBytes)
    .joinToString("") { "%02x".format(it) }
