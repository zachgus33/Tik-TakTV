package com.nuvio.app.features.home

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

internal object HomeCatalogParser {
    private val json = Json {
        ignoreUnknownKeys = true
    }

    fun parseCatalog(
        payload: String,
        maxItems: Int? = null,
    ): List<MetaPreview> {
        return parseCatalogResponse(
            payload = payload,
            maxItems = maxItems,
        ).items
    }

    fun parseCatalogResponse(
        payload: String,
        maxItems: Int? = null,
    ): ParsedCatalogResponse {
        val bounded = payload.boundMetasForParsing(maxItems)
        val root = json.parseToJsonElement(bounded.payload).jsonObject
        val metas = root.array("metas")
        val parsedItems = buildList {
            val seenKeys = mutableSetOf<String>()
            metas.forEach { element ->
                if (maxItems != null && size >= maxItems) return@forEach

                val meta = element as? JsonObject ?: return@forEach
                val id = meta.string("id")
                val type = meta.string("type")
                val name = meta.string("name")

                if (id.isNullOrBlank() || type.isNullOrBlank() || name.isNullOrBlank()) {
                    return@forEach
                }

                val item = MetaPreview(
                    id = id,
                    type = type,
                    name = name,
                    poster = meta.string("poster"),
                    banner = meta.string("banner") ?: meta.string("background"),
                    logo = meta.string("logo"),
                    posterShape = meta.string("posterShape").toPosterShape(),
                    description = meta.string("description") ?: meta.string("overview"),
                    releaseInfo = meta.string("releaseInfo"),
                    rawReleaseDate = meta.string("released"),
                    imdbRating = meta.string("imdbRating"),
                    genres = meta.array("genres").mapNotNull { genre ->
                        genre.jsonPrimitive.contentOrNull?.takeIf { it.isNotBlank() }
                    },
                )
                if (seenKeys.add(item.stableKey())) {
                    add(item)
                }
            }
        }
        return ParsedCatalogResponse(
            items = parsedItems,
            rawItemCount = bounded.rawItemCount ?: metas.size,
        )
    }

    /**
     * Catalog add-ons can return several megabytes of metadata even when a screen only needs one
     * short row. Building a JsonElement tree for that entire response creates a much larger peak
     * allocation on TV devices. Scan the top-level metas array first and decode only a small prefix.
     * We retain extra entries so duplicate/invalid metas do not prevent the caller reaching its cap.
     */
    private fun String.boundMetasForParsing(maxItems: Int?): BoundedCatalogPayload {
        if (maxItems == null || maxItems <= 0) return BoundedCatalogPayload(this, null)

        val keyIndex = indexOf("\"metas\"")
        if (keyIndex < 0) return BoundedCatalogPayload(this, null)
        val colonIndex = indexOf(':', startIndex = keyIndex + 7)
        val arrayStart = if (colonIndex >= 0) indexOf('[', startIndex = colonIndex + 1) else -1
        if (arrayStart < 0) return BoundedCatalogPayload(this, null)

        val retainedItemLimit = (maxItems * CATALOG_PARSE_DUPLICATE_ALLOWANCE)
            .coerceAtLeast(maxItems)
            .coerceAtMost(CATALOG_PARSE_ITEM_LIMIT)
        var inString = false
        var escaped = false
        var nestedDepth = 0
        var itemHasContent = false
        var retainedEnd = -1
        var rawItemCount = 0
        var arrayEnd = -1
        var index = arrayStart + 1

        while (index < length) {
            val character = this[index]
            if (inString) {
                when {
                    escaped -> escaped = false
                    character == '\\' -> escaped = true
                    character == '"' -> inString = false
                }
                index += 1
                continue
            }

            when (character) {
                '"' -> {
                    inString = true
                    itemHasContent = true
                }
                '{', '[' -> {
                    nestedDepth += 1
                    itemHasContent = true
                }
                '}' -> if (nestedDepth > 0) nestedDepth -= 1
                ']' -> {
                    if (nestedDepth > 0) {
                        nestedDepth -= 1
                    } else {
                        if (itemHasContent) {
                            rawItemCount += 1
                            if (rawItemCount == retainedItemLimit && retainedEnd < 0) {
                                retainedEnd = index
                            }
                        }
                        arrayEnd = index
                        break
                    }
                }
                ',' -> if (nestedDepth == 0) {
                    if (itemHasContent) {
                        rawItemCount += 1
                        if (rawItemCount == retainedItemLimit && retainedEnd < 0) {
                            retainedEnd = index
                        }
                    }
                    itemHasContent = false
                }
                else -> if (!character.isWhitespace()) itemHasContent = true
            }
            index += 1
        }

        if (arrayEnd < 0) return BoundedCatalogPayload(this, null)
        val prefixEnd = if (retainedEnd >= 0) retainedEnd else arrayEnd
        val boundedPayload = buildString(prefixEnd - arrayStart + 12) {
            append("{\"metas\":[")
            append(this@boundMetasForParsing, arrayStart + 1, prefixEnd)
            append("]}")
        }
        return BoundedCatalogPayload(
            payload = boundedPayload,
            rawItemCount = rawItemCount,
        )
    }

    private fun JsonObject.string(name: String): String? =
        this[name]?.jsonPrimitive?.contentOrNull

    private fun JsonObject.array(name: String): JsonArray =
        this[name] as? JsonArray ?: JsonArray(emptyList())

    private fun String?.toPosterShape(): PosterShape =
        when (this?.lowercase()) {
            "square" -> PosterShape.Square
            "landscape" -> PosterShape.Landscape
            else -> PosterShape.Poster
        }

    private data class BoundedCatalogPayload(
        val payload: String,
        val rawItemCount: Int?,
    )

    private const val CATALOG_PARSE_DUPLICATE_ALLOWANCE = 3
    private const val CATALOG_PARSE_ITEM_LIMIT = 300
}

data class ParsedCatalogResponse(
    val items: List<MetaPreview>,
    val rawItemCount: Int,
)
