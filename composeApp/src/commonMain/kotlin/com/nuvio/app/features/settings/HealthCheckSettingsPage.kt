package com.nuvio.app.features.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.addons.httpRequestRaw
import com.nuvio.app.features.debrid.DebridSettingsRepository
import com.nuvio.app.features.livetv.LiveTvRepository
import com.nuvio.app.features.profiles.ProfileRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

private data class HealthCheckEntry(val title: String, val detail: String)

internal fun LazyListScope.healthCheckSettingsContent(isTablet: Boolean) {
    item {
        val profileId = ProfileRepository.activeProfileId
        val scope = rememberCoroutineScope()
        var running by remember(profileId) { mutableStateOf(false) }
        var results by remember(profileId) { mutableStateOf<List<HealthCheckEntry>>(emptyList()) }

        suspend fun runChecks() {
            if (running) return
            running = true
            try {
                AddonRepository.initialize()
                LiveTvRepository.ensureLoaded()
                val addons = AddonRepository.uiState.value.addons.filter { it.enabled }
                val online = coroutineScope {
                    addons.map { addon ->
                        async {
                            withTimeoutOrNull(8_000) {
                                runCatching {
                                    httpRequestRaw(
                                        method = "GET",
                                        url = addon.manifestUrl,
                                        headers = emptyMap(),
                                        body = "",
                                        maxResponseBodyBytes = 256 * 1024,
                                    ).status in 200..299
                                }.getOrDefault(false)
                            } == true
                        }
                    }.awaitAll().count { it }
                }
                val serviceReady = withTimeoutOrNull(8_000) {
                    runCatching {
                        httpRequestRaw(
                            method = "GET",
                            url = "https://api.tiktaktv.me/healthz",
                            headers = emptyMap(),
                            body = "",
                        ).status in 200..299
                    }.getOrDefault(false)
                } == true
                val debrid = DebridSettingsRepository.snapshot()
                val live = LiveTvRepository.uiState.value
                results = listOf(
                    HealthCheckEntry("Streaming add-ons", "$online of ${addons.size} enabled manifests responded."),
                    HealthCheckEntry("Playback service", if (serviceReady) "TikTak TV service is responding." else "The service did not respond. Check your connection."),
                    HealthCheckEntry("Debrid setup", if (debrid.hasAnyApiKey) "A debrid account is configured. Test playback to verify access." else "No debrid account configured; this is optional."),
                    HealthCheckEntry("Live TV & guide", if (live.channels.isNotEmpty()) "${live.channels.size} channels loaded; ${live.currentProgrammes.size} current guide entries." else "No channels loaded. Check your Live TV source."),
                )
            } finally {
                running = false
            }
        }

        LaunchedEffect(profileId) { runChecks() }
        SettingsSection(title = "Playback health", isTablet = isTablet) {
            SettingsGroup(isTablet = isTablet) {
                SettingsNavigationRow(
                    title = if (running) "Checking connections..." else "Run checks",
                    description = "Test add-ons and the playback service; inspect local playback setup.",
                    icon = Icons.Rounded.Refresh,
                    isTablet = isTablet,
                    enabled = !running,
                    onClick = { scope.launch { runChecks() } },
                )
            }
        }
        SettingsSection(title = "Results", isTablet = isTablet) {
            SettingsGroup(isTablet = isTablet) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    if (results.isEmpty()) Text("Checking connections...")
                    results.forEach { entry ->
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(entry.title, style = MaterialTheme.typography.titleMedium)
                            Text(
                                entry.detail,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}
