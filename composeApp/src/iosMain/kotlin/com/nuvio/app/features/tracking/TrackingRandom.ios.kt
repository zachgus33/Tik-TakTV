package com.nuvio.app.features.tracking

import platform.Foundation.NSUUID

internal actual fun trackingRandomState(): String = NSUUID().UUIDString
