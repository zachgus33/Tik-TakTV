package com.nuvio.app.features.livetv

import android.content.Context
import android.content.SharedPreferences
import android.util.Xml
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.xml.sax.Attributes
import org.xml.sax.helpers.DefaultHandler
import java.io.File
import java.io.Writer
import javax.xml.parsers.SAXParserFactory

actual object LiveTvStorage {
    private const val preferencesName = "nuvio_live_tv"
    private const val sourceTypeKey = "source_type"
    private const val sourceUrlKey = "m3u_source_url"
    private const val localPlaylistDataKey = "m3u_local_playlist_data"
    private const val stalkerPortalUrlKey = "stalker_portal_url"
    private const val stalkerMacAddressKey = "stalker_mac_address"
    private const val stalkerUsernameKey = "stalker_username"
    private const val stalkerPasswordKey = "stalker_password"
    private const val xtreamServerUrlKey = "xtream_server_url"
    private const val xtreamUsernameKey = "xtream_username"
    private const val xtreamPasswordKey = "xtream_password"
    private const val friendXtreamOverrideKey = "friend_xtream_override"
    private const val favoriteUrlsKey = "favorite_channel_urls"
    private const val recentChannelUrlKey = "recent_channel_url"
    private const val recentChannelNameKey = "recent_channel_name"
    private const val recentChannelLogoKey = "recent_channel_logo"
    private const val recentChannelGroupKey = "recent_channel_group"
    private const val recentChannelTvgIdKey = "recent_channel_tvg_id"

    private var preferences: SharedPreferences? = null
    private var appContext: Context? = null
    private val cacheJson = Json { ignoreUnknownKeys = true; encodeDefaults = false }

    private fun resolvedProfileId(): Int = resolveLiveTvStorageProfileId()

    private fun scopedKey(baseKey: String, profileId: Int = resolvedProfileId()): String = "${baseKey}_$profileId"

    private fun SharedPreferences.getScopedString(baseKey: String): String? {
        val profileId = resolvedProfileId()
        return getString(scopedKey(baseKey, profileId), null)
            ?: if (profileId == 1) getString(baseKey, null) else null
    }

    private fun SharedPreferences.Editor.putScopedString(baseKey: String, value: String?) {
        val profileId = resolvedProfileId()
        val profileKey = scopedKey(baseKey, profileId)
        if (value.isNullOrBlank()) {
            remove(profileKey)
            if (profileId == 1) remove(baseKey)
        } else {
            putString(profileKey, value)
            if (profileId == 1) putString(baseKey, value)
        }
    }

    fun initialize(context: Context) {
        appContext = context.applicationContext
        migrateLegacyLocalPlaylists(context.applicationContext)
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

    private fun cacheFile(): File? = appContext?.let { context ->
        File(context.filesDir, "live-tv-channels-${resolvedProfileId()}.jsonl")
    }

    private fun localPlaylistFile(profileId: Int = resolvedProfileId()): File? =
        appContext?.let { context -> File(context.filesDir, "live-tv-local-playlist-$profileId.m3u") }

    actual suspend fun loadCachedChannels(): List<LiveTvChannel> = withContext(Dispatchers.IO) {
        val file = cacheFile()?.takeIf(File::isFile) ?: return@withContext emptyList()
        file.useLines { lines ->
            lines.mapNotNull { line ->
                runCatching { cacheJson.decodeFromString<LiveTvChannel>(line) }.getOrNull()
            }.take(LiveTvInMemoryChannelLimit).toList()
        }
    }

    actual suspend fun saveCachedChannels(channels: List<LiveTvChannel>) = withContext(Dispatchers.IO) {
        val target = cacheFile() ?: return@withContext
        if (channels.isEmpty()) {
            target.delete()
            return@withContext
        }
        val temporary = File(target.parentFile, "${target.name}.tmp")
        temporary.bufferedWriter().use { writer ->
            channels.take(LiveTvInMemoryChannelLimit).forEach { channel ->
                writer.appendLine(cacheJson.encodeToString(channel))
            }
        }
        if (!temporary.renameTo(target)) {
            temporary.copyTo(target, overwrite = true)
            temporary.delete()
        }
    }

    actual fun loadSourceType(): LiveTvSourceType =
        when (preferences?.getScopedString(sourceTypeKey) ?: LiveTvSourceType.M3u.name) {
            LiveTvSourceType.Stalker.name -> LiveTvSourceType.Stalker
            LiveTvSourceType.Xtream.name -> LiveTvSourceType.Xtream
            else -> LiveTvSourceType.M3u
        }

    actual fun saveSourceType(type: LiveTvSourceType) {
        preferences?.edit()?.apply {
            putScopedString(sourceTypeKey, type.name)
        }?.apply()
    }

    actual fun loadSourceUrl(): String? =
        preferences?.getScopedString(sourceUrlKey)

    actual fun saveSourceUrl(url: String) {
        preferences?.edit()?.apply {
            putScopedString(sourceUrlKey, url)
        }?.apply()
    }

    actual fun loadLocalPlaylistData(): String? = null

    actual fun saveLocalPlaylistData(data: String) {
        val target = localPlaylistFile() ?: return
        if (data.isBlank()) {
            target.delete()
        } else {
            target.writeText(data)
        }
    }

    actual fun hasStoredLocalPlaylist(): Boolean =
        localPlaylistFile()?.let { it.isFile && it.length() > 0L } == true

    actual suspend fun loadStoredLocalPlaylist(): ParsedM3uPlaylist? = withContext(Dispatchers.IO) {
        val file = localPlaylistFile()?.takeIf { it.isFile && it.length() > 0L }
            ?: return@withContext null
        file.bufferedReader().useLines(::parseM3uPlaylistLines)
    }

    /**
     * Older builds kept an entire M3U in SharedPreferences. Large providers can
     * exceed 40 MB, which forces Android to allocate a second UTF-16 copy and
     * exhausts the Fire TV heap. Move those values to streaming files before
     * SharedPreferences is opened, while preserving every other preference.
     */
    private fun migrateLegacyLocalPlaylists(context: Context) {
        val source = File(context.applicationInfo.dataDir, "shared_prefs/$preferencesName.xml")
        if (!source.isFile || source.length() == 0L) return
        val containsLegacyPlaylist = source.bufferedReader().useLines { lines ->
            lines.any { it.contains("name=\"$localPlaylistDataKey") }
        }
        if (!containsLegacyPlaylist) return

        val replacement = File(source.parentFile, "${source.name}.playlist-migration")
        val createdPlaylists = mutableListOf<File>()
        runCatching {
            replacement.outputStream().buffered().use { output ->
                val serializer = Xml.newSerializer().apply {
                    setOutput(output, Charsets.UTF_8.name())
                    startDocument(Charsets.UTF_8.name(), true)
                }
                var playlistWriter: Writer? = null
                var skippedElementDepth = 0
                val handler = object : DefaultHandler() {
                    override fun startElement(uri: String?, localName: String?, qName: String?, attributes: Attributes) {
                        val elementName = qName?.takeIf(String::isNotBlank) ?: localName.orEmpty()
                        if (skippedElementDepth > 0) {
                            skippedElementDepth++
                            return
                        }
                        val key = attributes.getValue("name")
                        if (elementName == "string" && key != null &&
                            (key == localPlaylistDataKey || key.startsWith("${localPlaylistDataKey}_"))
                        ) {
                            val profileId = key.substringAfter("${localPlaylistDataKey}_", "1").toIntOrNull() ?: 1
                            val playlist = File(context.filesDir, "live-tv-local-playlist-$profileId.m3u")
                            val temporary = File(playlist.parentFile, "${playlist.name}.tmp")
                            createdPlaylists += temporary
                            playlistWriter = temporary.bufferedWriter()
                            skippedElementDepth = 1
                            return
                        }
                        serializer.startTag(uri.orEmpty(), elementName)
                        for (index in 0 until attributes.length) {
                            val attributeName = attributes.getQName(index).takeIf(String::isNotBlank)
                                ?: attributes.getLocalName(index)
                            serializer.attribute(attributes.getURI(index).orEmpty(), attributeName, attributes.getValue(index))
                        }
                    }

                    override fun characters(ch: CharArray, start: Int, length: Int) {
                        if (skippedElementDepth > 0) playlistWriter?.write(ch, start, length)
                        else serializer.text(ch, start, length)
                    }

                    override fun endElement(uri: String?, localName: String?, qName: String?) {
                        val elementName = qName?.takeIf(String::isNotBlank) ?: localName.orEmpty()
                        if (skippedElementDepth > 0) {
                            skippedElementDepth--
                            if (skippedElementDepth == 0) {
                                playlistWriter?.close()
                                playlistWriter = null
                            }
                            return
                        }
                        serializer.endTag(uri.orEmpty(), elementName)
                    }
                }
                SAXParserFactory.newInstance().newSAXParser().parse(source, handler)
                serializer.endDocument()
                serializer.flush()
            }
            createdPlaylists.forEach { temporary ->
                val target = File(temporary.parentFile, temporary.name.removeSuffix(".tmp"))
                if (!temporary.renameTo(target)) {
                    temporary.copyTo(target, overwrite = true)
                    temporary.delete()
                }
            }
            if (!replacement.renameTo(source)) {
                replacement.copyTo(source, overwrite = true)
                replacement.delete()
            }
        }.onFailure {
            replacement.delete()
            createdPlaylists.forEach(File::delete)
        }
    }

    actual fun loadStalkerSettings(): LiveTvStalkerSettings =
        LiveTvStalkerSettings(
            portalUrl = preferences?.getScopedString(stalkerPortalUrlKey).orEmpty(),
            macAddress = preferences?.getScopedString(stalkerMacAddressKey).orEmpty(),
            username = preferences?.getScopedString(stalkerUsernameKey).orEmpty(),
            password = preferences?.getScopedString(stalkerPasswordKey).orEmpty(),
        )

    actual fun saveStalkerSettings(settings: LiveTvStalkerSettings) {
        preferences?.edit()?.apply {
            putScopedString(stalkerPortalUrlKey, settings.portalUrl)
            putScopedString(stalkerMacAddressKey, settings.macAddress)
            putScopedString(stalkerUsernameKey, settings.username)
            putScopedString(stalkerPasswordKey, settings.password)
        }?.apply()
    }

    actual fun loadXtreamSettings(): LiveTvXtreamSettings =
        LiveTvXtreamSettings(
            serverUrl = preferences?.getScopedString(xtreamServerUrlKey).orEmpty(),
            username = preferences?.getScopedString(xtreamUsernameKey).orEmpty(),
            password = preferences?.getScopedString(xtreamPasswordKey).orEmpty(),
        )

    actual fun saveXtreamSettings(settings: LiveTvXtreamSettings) {
        preferences?.edit()?.apply {
            putScopedString(xtreamServerUrlKey, settings.serverUrl)
            putScopedString(xtreamUsernameKey, settings.username)
            putScopedString(xtreamPasswordKey, settings.password)
        }?.apply()
    }

    actual fun hasFriendXtreamOverride(): Boolean =
        preferences?.getScopedString(friendXtreamOverrideKey) == "true"

    actual fun saveFriendXtreamOverride(enabled: Boolean) {
        preferences?.edit()?.apply {
            putScopedString(friendXtreamOverrideKey, if (enabled) "true" else null)
        }?.apply()
    }

    actual fun loadFavoriteUrls(): Set<String> =
        preferences?.getScopedString(favoriteUrlsKey)
            ?.lineSequence()
            ?.map(String::trim)
            ?.filter(String::isNotBlank)
            ?.toSet()
            .orEmpty()

    actual fun saveFavoriteUrls(urls: Set<String>) {
        preferences?.edit()?.apply {
            putScopedString(favoriteUrlsKey, urls.sorted().joinToString("\n"))
        }?.apply()
    }

    actual fun loadRecentChannel(): LiveTvRecentChannel? {
        val prefs = preferences ?: return null
        val streamUrl = prefs.getScopedString(recentChannelUrlKey).orEmpty().trim()
        val name = prefs.getScopedString(recentChannelNameKey).orEmpty().trim()
        if (streamUrl.isBlank() || name.isBlank()) return null
        return LiveTvRecentChannel(
            streamUrl = streamUrl,
            name = name,
            logoUrl = prefs.getScopedString(recentChannelLogoKey)?.takeIf(String::isNotBlank),
            group = prefs.getScopedString(recentChannelGroupKey).orEmpty(),
            tvgId = prefs.getScopedString(recentChannelTvgIdKey)?.takeIf(String::isNotBlank),
        )
    }

    actual fun saveRecentChannel(channel: LiveTvRecentChannel?) {
        preferences?.edit()?.apply {
            putScopedString(recentChannelUrlKey, channel?.streamUrl)
            putScopedString(recentChannelNameKey, channel?.name)
            putScopedString(recentChannelLogoKey, channel?.logoUrl)
            putScopedString(recentChannelGroupKey, channel?.group)
            putScopedString(recentChannelTvgIdKey, channel?.tvgId)
        }?.apply()
    }
}
