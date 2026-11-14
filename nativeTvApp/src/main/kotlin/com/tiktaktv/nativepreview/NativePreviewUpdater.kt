package com.tiktaktv.nativepreview

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/** Small, signed-preview updater. Fire OS still owns the final install confirmation. */
internal class NativePreviewUpdater(private val activity: Activity) {
    private val preferences = activity.getSharedPreferences(PREFERENCES, Activity.MODE_PRIVATE)
    private var installLaunched = false

    fun checkForUpdates() {
        if (BuildConfig.DEBUG || !checking.compareAndSet(false, true)) return
        Thread {
            runCatching {
                val metadata = readJson(BuildConfig.UPDATE_METADATA_URL)
                val versionCode = metadata.getLong("versionCode")
                if (versionCode <= BuildConfig.VERSION_CODE) {
                    clearPendingApk()
                    return@runCatching
                }
                val versionName = metadata.optString("versionName", "new preview")
                val apkUrl = metadata.getString("apkUrl")
                val expectedSha256 = metadata.getString("sha256")
                val apk = download(apkUrl, versionCode)
                check(apk.sha256().equals(expectedSha256, ignoreCase = true)) {
                    "Downloaded native preview checksum did not match metadata"
                }
                preferences.edit().putString(PENDING_APK, apk.absolutePath).apply()
                activity.runOnUiThread { showReadyDialog(versionName) }
            }.onFailure { error ->
                Log.w(TAG, "Native preview update check failed", error)
            }
            checking.set(false)
        }.apply {
            name = "TikTakNativePreviewUpdater"
            isDaemon = true
            start()
        }
    }

    private fun showReadyDialog(versionName: String) {
        if (activity.isFinishing || activity.isDestroyed) return
        AlertDialog.Builder(activity)
            .setTitle("TikTak TV preview update")
            .setMessage("Version $versionName is ready. Install it now?")
            .setNegativeButton("Later", null)
            .setPositiveButton("Install") { _, _ ->
                val apk = pendingApk() ?: return@setPositiveButton
                if (canInstallPackages()) {
                    install(apk)
                } else {
                    activity.startActivity(
                        Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:${activity.packageName}"),
                        ),
                    )
                }
            }
            .show()
    }

    private fun pendingApk(): File? = preferences.getString(PENDING_APK, null)
        ?.let(::File)
        ?.takeIf(File::exists)

    private fun clearPendingApk() {
        val staleApk = pendingApk()
        preferences.edit().remove(PENDING_APK).apply()
        staleApk?.delete()
    }

    private fun canInstallPackages(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity.packageManager.canRequestPackageInstalls()

    private fun install(apk: File) {
        if (installLaunched) return
        installLaunched = true
        preferences.edit().remove(PENDING_APK).apply()
        val uri = FileProvider.getUriForFile(
            activity,
            "${activity.packageName}.fileprovider",
            apk,
        )
        activity.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, APK_MIME_TYPE)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
        )
    }

    private fun readJson(url: String): JSONObject {
        val connection = open(url)
        return connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
            .also { connection.disconnect() }
    }

    private fun download(url: String, versionCode: Long): File {
        val destination = File(File(activity.cacheDir, "updates"), "native-preview-$versionCode.apk")
        destination.parentFile?.mkdirs()
        val connection = open(url)
        connection.inputStream.use { input ->
            destination.outputStream().use(input::copyTo)
        }
        connection.disconnect()
        return destination
    }

    private fun open(url: String): HttpURLConnection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 20_000
        readTimeout = 120_000
        instanceFollowRedirects = true
        requestMethod = "GET"
        connect()
        check(responseCode in 200..299) { "HTTP $responseCode from $url" }
    }

    private fun File.sha256(): String {
        val digest = MessageDigest.getInstance("SHA-256")
        inputStream().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val count = input.read(buffer)
                if (count <= 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
    }

    private companion object {
        const val TAG = "TikTakNativeUpdate"
        const val PREFERENCES = "native_preview_updater"
        const val PENDING_APK = "pending_apk"
        const val APK_MIME_TYPE = "application/vnd.android.package-archive"
        val checking = AtomicBoolean(false)
    }
}
