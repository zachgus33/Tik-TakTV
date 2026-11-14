package com.nuvio.app.features.collection

import com.nuvio.app.features.addons.AddonCatalog
import com.nuvio.app.features.addons.ManagedAddon
import com.nuvio.app.features.addons.enabledAddons

internal data class ResolvedCollectionCatalog(
    val addon: ManagedAddon,
    val catalog: AddonCatalog,
)

internal fun List<ManagedAddon>.findCollectionCatalog(
    source: CollectionCatalogSource,
): ResolvedCollectionCatalog? {
    val activeAddons = enabledAddons()
    val declaredAddon = activeAddons.firstOrNull {
        it.manifest?.id == source.addonId ||
            it.manifestUrl == source.addonId ||
            it.manifestUrl.removeSuffix("/manifest.json") == source.addonId
    }
    val declaredCatalog = declaredAddon?.manifest?.catalogs?.findSourceCatalog(source)
    if (declaredAddon != null && declaredCatalog != null) {
        return ResolvedCollectionCatalog(addon = declaredAddon, catalog = declaredCatalog)
    }
    if (declaredAddon != null) {
        return ResolvedCollectionCatalog(
            addon = declaredAddon,
            catalog = AddonCatalog(source.type, source.catalogId.substringBefore(","), source.catalogId),
        )
    }

    if (source.addonId.startsWith("https://", ignoreCase = true)) {
        val path = source.addonId.substringBefore('?').trimEnd('/')
        val query = source.addonId.substringAfter('?', "").let { if (it.isBlank()) "" else "?$it" }
        val url = (if (path.endsWith("/manifest.json")) path else "$path/manifest.json") + query
        if (any { !it.enabled && it.manifestUrl == url }) return null
        return ResolvedCollectionCatalog(
            addon = ManagedAddon(manifestUrl = url),
            catalog = AddonCatalog(source.type, source.catalogId.substringBefore(","), source.catalogId),
        )
    }

    val matching = if (source.addonId.isBlank()) activeAddons.firstNotNullOfOrNull { addon ->
        val catalog = addon.manifest?.catalogs?.find {
            it.id == source.catalogId && it.type == source.type
        } ?: return@firstNotNullOfOrNull null
        ResolvedCollectionCatalog(addon = addon, catalog = catalog)
    } else null
    if (matching != null) return matching
    val arabicAddonId = source.addonId == "community.elcinema.metadata"
    val arabicCatalog = source.catalogId.startsWith("elcinema-") && source.type in listOf("movie", "series")
    val arabicDisabled = any { it.manifest?.id == "community.elcinema.metadata" && !it.enabled }
    if (arabicAddonId && arabicCatalog && !arabicDisabled) {
        return ResolvedCollectionCatalog(
            addon = ManagedAddon(manifestUrl = "https://arabcinemeta.osamayousry.com/manifest.json"),
            catalog = AddonCatalog(source.type, source.catalogId.substringBefore(","), source.catalogId),
        )
    }
    return null
}

internal fun List<AvailableCatalog>.findAvailableCatalog(
    source: CollectionCatalogSource,
): AvailableCatalog? {
    val declaredCatalogs = filter { it.addonId == source.addonId }
    return declaredCatalogs.findSourceCatalog(source)
        ?: firstOrNull { it.catalogId == source.catalogId && it.type == source.type }
}

private fun List<AddonCatalog>.findSourceCatalog(source: CollectionCatalogSource): AddonCatalog? =
    find { it.id == source.catalogId && it.type == source.type }
        ?: find { it.id == source.catalogId.substringBefore(",") && it.type == source.type }

private fun List<AvailableCatalog>.findSourceCatalog(source: CollectionCatalogSource): AvailableCatalog? =
    find { it.catalogId == source.catalogId && it.type == source.type }
        ?: find { it.catalogId == source.catalogId.substringBefore(",") && it.type == source.type }
