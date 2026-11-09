package com.nuvio.app.features.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.BugReport
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material.icons.rounded.CollectionsBookmark
import androidx.compose.material.icons.rounded.Extension
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.People
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.Tv
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.core.build.AppVersionConfig
import com.nuvio.app.core.ui.NuvioTvTextField
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.collection.CollectionRepository
import com.nuvio.app.features.debrid.DebridSettingsRepository
import com.nuvio.app.features.home.HomeCatalogSettingsRepository
import com.nuvio.app.features.home.SyncCatalogItem
import com.nuvio.app.features.home.SyncHomeCatalogPayload
import com.nuvio.app.features.tiktak.TikTakServiceClient
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.compose_about_version_format
import nuvio.composeapp.generated.resources.compose_settings_page_account
import nuvio.composeapp.generated.resources.compose_settings_page_advanced
import nuvio.composeapp.generated.resources.compose_settings_page_appearance
import nuvio.composeapp.generated.resources.compose_settings_page_integrations
import nuvio.composeapp.generated.resources.compose_settings_page_licenses_attributions
import nuvio.composeapp.generated.resources.compose_settings_page_notifications
import nuvio.composeapp.generated.resources.compose_settings_page_playback
import nuvio.composeapp.generated.resources.compose_settings_page_supporters_contributors
import nuvio.composeapp.generated.resources.compose_settings_root_account_description
import nuvio.composeapp.generated.resources.compose_settings_root_appearance_description
import nuvio.composeapp.generated.resources.compose_settings_root_check_updates_description
import nuvio.composeapp.generated.resources.compose_settings_root_check_updates_title
import nuvio.composeapp.generated.resources.compose_settings_root_content_discovery_description
import nuvio.composeapp.generated.resources.compose_settings_root_general_section
import nuvio.composeapp.generated.resources.compose_settings_root_integrations_description
import nuvio.composeapp.generated.resources.compose_settings_root_notifications_description
import nuvio.composeapp.generated.resources.settings_nuvio_enhanced_description
import nuvio.composeapp.generated.resources.settings_nuvio_enhanced_section
import nuvio.composeapp.generated.resources.settings_nuvio_enhanced_title
import nuvio.composeapp.generated.resources.compose_settings_root_profile_description
import nuvio.composeapp.generated.resources.compose_settings_root_profile_title
import nuvio.composeapp.generated.resources.compose_settings_root_trakt_description
import nuvio.composeapp.generated.resources.compose_settings_root_about_section
import nuvio.composeapp.generated.resources.compose_settings_root_account_section
import nuvio.composeapp.generated.resources.compose_settings_root_advanced_description
import nuvio.composeapp.generated.resources.compose_settings_root_advanced_section
import nuvio.composeapp.generated.resources.compose_settings_page_content_discovery
import nuvio.composeapp.generated.resources.settings_playback_subtitle
import nuvio.composeapp.generated.resources.updates_debug_test_description
import nuvio.composeapp.generated.resources.updates_debug_test_title
import nuvio.composeapp.generated.resources.about_supporters_contributors_subtitle
import nuvio.composeapp.generated.resources.about_licenses_attributions_subtitle
import org.jetbrains.compose.resources.stringResource

internal fun LazyListScope.settingsRootContent(
    isTablet: Boolean,
    onPlaybackClick: () -> Unit,
    onAppearanceClick: () -> Unit,
    onAdvancedClick: () -> Unit,
    onNotificationsClick: () -> Unit,
    onContentDiscoveryClick: () -> Unit,
    onNuvioEnhancedClick: () -> Unit,
    onIntegrationsClick: () -> Unit,
    onSupportersContributorsClick: () -> Unit,
    onLicensesAttributionsClick: () -> Unit,
    onCheckForUpdatesClick: (() -> Unit)? = null,
    onTestUpdateBannerClick: (() -> Unit)? = null,
    onDownloadsClick: () -> Unit,
    onAddonsClick: () -> Unit,
    onCollectionsClick: () -> Unit,
    onLiveTvClick: () -> Unit,
    onAccountClick: () -> Unit,
    onSwitchProfileClick: (() -> Unit)? = null,
    showAccountSection: Boolean = true,
    showEnhancedSection: Boolean = true,
    showGeneralSection: Boolean = true,
    showAboutSection: Boolean = true,
    showAdvancedSection: Boolean = true,
    showSupportersContributorsPage: Boolean = true,
) {
    if (showAccountSection) {
        item {
            SettingsSection(
                title = stringResource(Res.string.compose_settings_root_account_section),
                isTablet = isTablet,
            ) {
                SettingsGroup(isTablet = isTablet) {
                    if (onSwitchProfileClick != null) {
                        SettingsNavigationRow(
                            title = stringResource(Res.string.compose_settings_root_profile_title),
                            description = stringResource(Res.string.compose_settings_root_profile_description),
                            icon = Icons.Rounded.People,
                            isTablet = isTablet,
                            onClick = onSwitchProfileClick,
                        )
                        SettingsGroupDivider(isTablet = isTablet)
                    }
                    SettingsNavigationRow(
                        title = stringResource(Res.string.compose_settings_page_account),
                        description = stringResource(Res.string.compose_settings_root_account_description),
                        icon = Icons.Rounded.AccountCircle,
                        isTablet = isTablet,
                        onClick = onAccountClick,
                    )
                }
            }
        }
    }
    if (showEnhancedSection) {
        item {
            val enhancedSettings by remember {
                NuvioEnhancedSettingsRepository.ensureLoaded()
                NuvioEnhancedSettingsRepository.uiState
            }.collectAsStateWithLifecycle()
            SettingsSection(
                title = stringResource(Res.string.settings_nuvio_enhanced_section),
                isTablet = isTablet,
            ) {
                SettingsGroup(isTablet = isTablet) {
                    SettingsNavigationRow(
                        title = "Add-ons",
                        description = "Catalogs and sources",
                        icon = Icons.Rounded.Extension,
                        isTablet = isTablet,
                        onClick = onAddonsClick,
                    )
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsNavigationRow(
                        title = "Collections",
                        description = "Home rows, metadata and synced lists",
                        icon = Icons.Rounded.CollectionsBookmark,
                        isTablet = isTablet,
                        onClick = onCollectionsClick,
                    )
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsNavigationRow(
                        title = "Live TV",
                        description = "IPTV sources, playlists and guide",
                        icon = Icons.Rounded.Tv,
                        isTablet = isTablet,
                        onClick = onLiveTvClick,
                    )
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsNavigationRow(
                        title = stringResource(Res.string.settings_nuvio_enhanced_title),
                        description = stringResource(Res.string.settings_nuvio_enhanced_description),
                        icon = Icons.Rounded.AutoAwesome,
                        isTablet = isTablet,
                        highlighted = enhancedSettings.hasNewFeatures,
                        onClick = onNuvioEnhancedClick,
                    )
                }
            }
        }
    }
    if (showGeneralSection) {
        item {
            SettingsSection(
                title = stringResource(Res.string.compose_settings_root_general_section),
                isTablet = isTablet,
            ) {
                SettingsGroup(isTablet = isTablet) {
                    SettingsNavigationRow(
                        title = stringResource(Res.string.compose_settings_page_appearance),
                        description = stringResource(Res.string.compose_settings_root_appearance_description),
                        icon = Icons.Rounded.Palette,
                        isTablet = isTablet,
                        onClick = onAppearanceClick,
                    )
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsNavigationRow(
                        title = stringResource(Res.string.compose_settings_page_content_discovery),
                        description = stringResource(Res.string.compose_settings_root_content_discovery_description),
                        icon = Icons.Rounded.Extension,
                        isTablet = isTablet,
                        onClick = onContentDiscoveryClick,
                    )
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsNavigationRow(
                        title = stringResource(Res.string.compose_settings_page_playback),
                        description = stringResource(Res.string.settings_playback_subtitle),
                        icon = Icons.Rounded.PlayArrow,
                        isTablet = isTablet,
                        onClick = onPlaybackClick,
                    )
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsNavigationRow(
                        title = stringResource(Res.string.compose_settings_page_integrations),
                        description = stringResource(Res.string.compose_settings_root_integrations_description),
                        icon = Icons.Rounded.Link,
                        isTablet = isTablet,
                        onClick = onIntegrationsClick,
                    )
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsNavigationRow(
                        title = stringResource(Res.string.compose_settings_page_notifications),
                        description = stringResource(Res.string.compose_settings_root_notifications_description),
                        icon = Icons.Rounded.Notifications,
                        isTablet = isTablet,
                        onClick = onNotificationsClick,
                    )
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsNavigationRow(
                        title = "Downloads",
                        description = "Offline activity and history",
                        icon = Icons.Rounded.CloudDownload,
                        isTablet = isTablet,
                        onClick = onDownloadsClick,
                    )
                }
            }
        }
        item { FriendAccessSettingsCard(isTablet = isTablet) }
    }
    if (showAboutSection) {
        item {
            SettingsSection(
                title = stringResource(Res.string.compose_settings_root_about_section),
                isTablet = isTablet,
            ) {
                SettingsGroup(isTablet = isTablet) {
                    if (showSupportersContributorsPage) {
                        SettingsNavigationRow(
                            title = stringResource(Res.string.compose_settings_page_supporters_contributors),
                            description = stringResource(Res.string.about_supporters_contributors_subtitle),
                            icon = Icons.Rounded.Favorite,
                            enabled = false,
                            isTablet = isTablet,
                            onClick = {},
                        )
                        SettingsGroupDivider(isTablet = isTablet)
                    }
                    SettingsNavigationRow(
                        title = stringResource(Res.string.compose_settings_page_licenses_attributions),
                        description = stringResource(Res.string.about_licenses_attributions_subtitle),
                        icon = Icons.Rounded.Info,
                        isTablet = isTablet,
                        onClick = onLicensesAttributionsClick,
                    )
                    if (onCheckForUpdatesClick != null) {
                        SettingsGroupDivider(isTablet = isTablet)
                        SettingsNavigationRow(
                            title = stringResource(Res.string.compose_settings_root_check_updates_title),
                            description = stringResource(Res.string.compose_settings_root_check_updates_description),
                            icon = Icons.Rounded.CloudDownload,
                            isTablet = isTablet,
                            onClick = onCheckForUpdatesClick,
                        )
                    }
                    if (onTestUpdateBannerClick != null) {
                        SettingsGroupDivider(isTablet = isTablet)
                        SettingsNavigationRow(
                            title = stringResource(Res.string.updates_debug_test_title),
                            description = stringResource(Res.string.updates_debug_test_description),
                            icon = Icons.Rounded.BugReport,
                            isTablet = isTablet,
                            onClick = onTestUpdateBannerClick,
                        )
                    }
                }
            }
        }
    }
    if (showAdvancedSection) {
        item {
            SettingsSection(
                title = stringResource(Res.string.compose_settings_root_advanced_section),
                isTablet = isTablet,
            ) {
                SettingsGroup(isTablet = isTablet) {
                    SettingsNavigationRow(
                        title = stringResource(Res.string.compose_settings_page_advanced),
                        description = stringResource(Res.string.compose_settings_root_advanced_description),
                        icon = Icons.Rounded.Tune,
                        isTablet = isTablet,
                        onClick = onAdvancedClick,
                    )
                }
            }
        }
    }
    item {
        val uriHandler = LocalUriHandler.current
        androidx.compose.foundation.layout.Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = if (isTablet) 20.dp else 16.dp),
        ) {
            Text(
                text = "TikTak TV",
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Text(
                text = "github.com/zachgus33/Tik-TakTV",
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp)
                    .clickable {
                        uriHandler.openUri("https://github.com/zachgus33/Tik-TakTV")
                    },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
                textAlign = TextAlign.Center,
            )
            Text(
                text = stringResource(
                    Res.string.compose_about_version_format,
                    AppVersionConfig.VERSION_NAME,
                    AppVersionConfig.VERSION_CODE,
                ),
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun FriendAccessSettingsCard(isTablet: Boolean) {
    var dialogVisible by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    SettingsSection(title = "TikTak TV", isTablet = isTablet) {
        SettingsGroup(isTablet = isTablet) {
            SettingsNavigationRow(
                title = "Friend code",
                description = "Install a shared TikTak TV setup on this profile",
                icon = Icons.Rounded.Security,
                isTablet = isTablet,
                onClick = { dialogVisible = true },
            )
        }
    }

    if (dialogVisible) {
        AlertDialog(
            onDismissRequest = { if (!busy) dialogVisible = false },
            title = { Text("Redeem friend code") },
            text = {
                androidx.compose.foundation.layout.Column(
                    verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp),
                ) {
                    Text("Enter the code shared by the account owner. Add-ons and supported playback access will be installed into this profile.")
                    NuvioTvTextField(
                        value = code,
                        onValueChange = { code = it.filter(Char::isDigit).take(12); message = null },
                        enabled = !busy,
                        label = { Text("Friend code") },
                    )
                    message?.let { Text(it, color = if (it.startsWith("Installed")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = {
                Button(
                    enabled = !busy && code.length in 6..12,
                    onClick = {
                        scope.launch {
                            busy = true
                            message = null
                            runCatching {
                                val response = TikTakServiceClient.post("/friend/redeem", "{\"code\":\"$code\"}")
                                if (response.status !in 200..299) {
                                    val error = runCatching {
                                        Json.parseToJsonElement(response.body).jsonObject["error"]?.jsonPrimitive?.contentOrNull
                                    }.getOrNull()
                                    error(error ?: "Friend code was not accepted (HTTP ${response.status}).")
                                }
                                val root = Json.parseToJsonElement(response.body).jsonObject
                                val template = root["template"]?.jsonObject
                                val addonBases = template?.get("addons")?.jsonArray.orEmpty().mapNotNull { addon ->
                                    runCatching { addon.jsonObject["base"]?.jsonPrimitive?.contentOrNull }.getOrNull()
                                }
                                AddonRepository.initialize()
                                var installed = 0
                                addonBases.forEach { base ->
                                    if (AddonRepository.addAddon(base.orEmpty()).let { it is com.nuvio.app.features.addons.AddAddonResult.Success }) installed++
                                }
                                val collections = template?.get("collections")?.jsonArray
                                if (collections != null) {
                                    CollectionRepository.importFromJson(collections.toString()).getOrThrow()
                                }
                                val homeCatalogs = template?.get("homeCatalogs")?.jsonArray
                                if (homeCatalogs != null) {
                                    val items = Json { ignoreUnknownKeys = true }
                                        .decodeFromString<List<SyncCatalogItem>>(homeCatalogs.toString())
                                    HomeCatalogSettingsRepository.applyFromRemote(
                                        SyncHomeCatalogPayload(items = items),
                                    )
                                }
                                root["torboxKey"]?.jsonPrimitive?.contentOrNull?.takeIf(String::isNotBlank)?.let(DebridSettingsRepository::setTorboxApiKey)
                                root["realDebridKey"]?.jsonPrimitive?.contentOrNull?.takeIf(String::isNotBlank)?.let(DebridSettingsRepository::setRealDebridApiKey)
                                "Installed shared setup ($installed add-ons, ${collections?.size ?: 0} collections)."
                            }.onSuccess { summary ->
                                message = summary
                                code = ""
                            }.onFailure { error ->
                                message = error.message ?: "Friend setup could not be installed."
                            }
                            busy = false
                        }
                    },
                ) { Text(if (busy) "Installing…" else "Install") }
            },
            dismissButton = { TextButton(enabled = !busy, onClick = { dialogVisible = false }) { Text("Close") } },
        )
    }
}
