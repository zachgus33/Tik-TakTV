package com.nuvio.app.features.tiktak

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.tikTakTvFocus

@Composable
internal fun SponsorBlockSettingsContent(modifier: Modifier = Modifier) {
    SponsorBlockRepository.ensureLoaded()
    val preferences by SponsorBlockRepository.state.collectAsState()
    Column(modifier = modifier.fillMaxWidth().padding(16.dp)) {
        Text("SponsorBlock", style = MaterialTheme.typography.titleLarge)
        Text("Automatically skip community-marked segments in YouTube videos.",
            style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 8.dp))
        SponsorBlockOption("Skip SponsorBlock segments", preferences.enabled, SponsorBlockRepository::setEnabled)
        if (preferences.enabled) {
            sponsorBlockCategories.forEach { category ->
                SponsorBlockOption(category.title, category.id in preferences.categories) { enabled ->
                    SponsorBlockRepository.setCategory(category.id, enabled)
                }
            }
        }
    }
}

@Composable
private fun SponsorBlockOption(title: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    androidx.compose.foundation.layout.Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        Text(title, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onChange, modifier = Modifier.tikTakTvFocus())
    }
}
