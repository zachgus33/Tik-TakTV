package com.nuvio.app.features.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.input.PasswordVisualTransformation
import com.nuvio.app.features.tracking.ExternalTrackingRepository

internal fun LazyListScope.externalTrackingSettingsContent(provider: String, isTablet: Boolean) {
    item { ExternalTrackingSettingsPage(provider = provider, isTablet = isTablet) }
}

@Composable
private fun ExternalTrackingSettingsPage(provider: String, isTablet: Boolean) {
    ExternalTrackingRepository.ensureLoaded()
    val state by ExternalTrackingRepository.state.collectAsState()
    val uriHandler = LocalUriHandler.current
    var browserError by remember(provider) { mutableStateOf("") }
    var pinToken by remember(provider) { mutableStateOf("") }
    val simkl = provider == "simkl"
    val name = if (simkl) "Simkl" else "AniList"
    val connected = if (simkl) state.simklConnected else state.anilistConnected
    SettingsSection(title = name, isTablet = isTablet) {
        SettingsGroup(isTablet = isTablet) {
            Column(modifier = Modifier.fillMaxWidth().padding(20.dp)) {
                Text(if (simkl) "Connect your own Simkl account to this profile for movie, show and anime tracking."
                    else "Connect your own AniList account to this profile for anime tracking.")
                Text("This connection is separate from Trakt and Nuvio watch history.",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 8.dp, bottom = 16.dp))
                if (connected) {
                    Text("Connected to $name")
                    if (simkl) {
                        SettingsSwitchRow(
                            title = "Scrobble playback to Simkl",
                            description = "Off until you enable it for this profile.",
                            checked = state.simklScrobblingEnabled,
                            isTablet = isTablet,
                            onCheckedChange = ExternalTrackingRepository::setSimklScrobbling,
                        )
                    } else {
                        SettingsSwitchRow(
                            title = "Update AniList anime progress",
                            description = "Off until you enable it for this profile. Only anime with an AniList or MAL ID are matched.",
                            checked = state.anilistProgressEnabled,
                            isTablet = isTablet,
                            onCheckedChange = ExternalTrackingRepository::setAniListProgress,
                        )
                    }
                    Button(onClick = { ExternalTrackingRepository.disconnect(provider) }) {
                        Text("Disconnect $name")
                    }
                } else if (simkl) {
                    Button(onClick = ExternalTrackingRepository::connectSimkl, enabled = !state.simklLoading) {
                        Text(if (state.simklLoading) "Connecting…" else "Connect Simkl")
                    }
                    if (state.simklCode.isNotBlank()) {
                        Text("On your phone, open ${state.simklVerificationUrl} and approve the connection.",
                            modifier = Modifier.padding(top = 12.dp))
                        Text("Activation code: ${state.simklCode}",
                            style = MaterialTheme.typography.titleLarge,
                            modifier = Modifier.padding(top = 8.dp))
                    }
                } else {
                    Button(onClick = {
                        browserError = ""
                        runCatching { uriHandler.openUri(ExternalTrackingRepository.anilistAuthorizationUrl()) }
                            .onFailure { browserError = "Could not open a browser on this TV. Install or enable a browser, then try again." }
                    }) { Text("Connect AniList") }
                    Text("No browser on this TV? Open https://www.tiktaktv.me/anilist-tv-pair.html on your phone, approve AniList, then paste the access token here using your Fire TV remote app keyboard.",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 16.dp))
                    OutlinedTextField(value = pinToken, onValueChange = { pinToken = it },
                        label = { Text("AniList access token") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                    Button(onClick = {
                        ExternalTrackingRepository.connectAniListWithToken(pinToken)
                        pinToken = ""
                    }, enabled = pinToken.isNotBlank(), modifier = Modifier.padding(top = 8.dp)) {
                        Text("Verify AniList token")
                    }
                }
                val error = if (simkl) state.simklError else state.anilistError
                if (error.isNotBlank() || browserError.isNotBlank())
                    Text(error.ifBlank { browserError }, color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 12.dp))
            }
        }
    }
}
