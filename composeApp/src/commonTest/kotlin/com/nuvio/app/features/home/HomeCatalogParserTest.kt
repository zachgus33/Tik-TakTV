package com.nuvio.app.features.home

import kotlin.test.Test
import kotlin.test.assertEquals

class HomeCatalogParserTest {

    @Test
    fun `parse catalog response de-duplicates repeated metas but preserves raw count`() {
        val result = HomeCatalogParser.parseCatalogResponse(
            """
            {
              "metas": [
                { "id": "mal:62516", "type": "series", "name": "A" },
                { "id": "mal:62516", "type": "series", "name": "A duplicate" },
                { "id": "mal:1", "type": "movie", "name": "B" }
              ]
            }
            """.trimIndent(),
        )

        assertEquals(3, result.rawItemCount)
        assertEquals(
            listOf("series:mal:62516", "movie:mal:1"),
            result.items.map { it.stableKey() },
        )
        assertEquals("A", result.items.first().name)
    }

    @Test
    fun `parse catalog response respects max item cap without losing raw count`() {
        val result = HomeCatalogParser.parseCatalogResponse(
            payload = """
                {
                  "metas": [
                    { "id": "tt1", "type": "movie", "name": "One" },
                    { "id": "tt1", "type": "movie", "name": "One duplicate" },
                    { "id": "tt2", "type": "movie", "name": "Two" },
                    { "id": "tt3", "type": "movie", "name": "Three" }
                  ]
                }
            """.trimIndent(),
            maxItems = 2,
        )

        assertEquals(4, result.rawItemCount)
        assertEquals(
            listOf("movie:tt1", "movie:tt2"),
            result.items.map { it.stableKey() },
        )
    }

    @Test
    fun `bounded parsing handles nested arrays strings and counts the full catalog`() {
        val result = HomeCatalogParser.parseCatalogResponse(
            payload = """
                {
                  "metas": [
                    { "id": "tt1", "type": "movie", "name": "One, [extended]", "genres": ["Drama", "Comedy"] },
                    { "id": "tt2", "type": "movie", "name": "Two with \"quotes\"", "description": "escaped \\ bracket ]" },
                    { "id": "tt3", "type": "series", "name": "Three", "genres": ["Sci-Fi"] },
                    { "id": "tt4", "type": "movie", "name": "Four" },
                    { "id": "tt5", "type": "movie", "name": "Five" },
                    { "id": "tt6", "type": "movie", "name": "Six" },
                    { "id": "tt7", "type": "movie", "name": "Seven" }
                  ]
                }
            """.trimIndent(),
            maxItems = 2,
        )

        assertEquals(7, result.rawItemCount)
        assertEquals(listOf("tt1", "tt2"), result.items.map { it.id })
        assertEquals(listOf("Drama", "Comedy"), result.items.first().genres)
    }

    @Test
    fun `parse catalog response keeps raw released date for unreleased filtering`() {
        val result = HomeCatalogParser.parseCatalogResponse(
            payload = """
                {
                  "metas": [
                    {
                      "id": "tt1",
                      "type": "movie",
                      "name": "Future Movie",
                      "releaseInfo": "2027",
                      "released": "2027-05-12T00:00:00.000Z"
                    }
                  ]
                }
            """.trimIndent(),
        )

        assertEquals("2027", result.items.single().releaseInfo)
        assertEquals("2027-05-12T00:00:00.000Z", result.items.single().rawReleaseDate)
    }
}
