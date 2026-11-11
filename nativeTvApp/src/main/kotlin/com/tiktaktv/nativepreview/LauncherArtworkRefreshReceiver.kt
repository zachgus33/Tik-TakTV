package com.tiktaktv.nativepreview

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager

/**
 * Fire OS can retain a failed launcher-art lookup after replacing a sideloaded
 * APK. Publishing a real component state change makes its launcher discard
 * that stale package entry and resolve the artwork from the new APK path.
 */
class LauncherArtworkRefreshReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return

        val pendingResult = goAsync()
        Thread {
            val component = ComponentName(context, TikTakTvLauncherV4Activity::class.java)
            val packageManager = context.packageManager
            runCatching {
                packageManager.setComponentEnabledSetting(
                    component,
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP,
                )
                Thread.sleep(750)
                packageManager.setComponentEnabledSetting(
                    component,
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                    PackageManager.DONT_KILL_APP,
                )
            }
            pendingResult.finish()
        }.start()
    }
}
