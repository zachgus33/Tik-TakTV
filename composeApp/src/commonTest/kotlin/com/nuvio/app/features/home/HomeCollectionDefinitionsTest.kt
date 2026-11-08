package com.nuvio.app.features.home

import com.nuvio.app.features.collection.Collection
import com.nuvio.app.features.collection.CollectionFolder
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HomeCollectionDefinitionsTest {
    @Test
    fun `visible home collections ignore duplicate IDs and empty collections`() {
        val visibleFolder = CollectionFolder(id = "folder", title = "Folder")
        val collections = listOf(
            Collection(id = "duplicate", title = "First", folders = listOf(visibleFolder)),
            Collection(id = "empty", title = "Empty"),
            Collection(id = "duplicate", title = "Second", folders = listOf(visibleFolder)),
            Collection(id = "other", title = "Other", folders = listOf(visibleFolder)),
        )

        val result = visibleCollectionsWithUniqueIds(collections)

        assertEquals(listOf("duplicate", "other"), result.map(Collection::id))
        assertEquals("First", result.first().title)
    }

    @Test
    fun `legacy TikTak showOnHome remains pinned on native TV`() {
        val legacy = Collection(
            id = "legacy",
            title = "Network",
            showOnHome = true,
            folders = listOf(CollectionFolder(id = "networks", title = "Networks")),
        )

        val definition = buildCollectionDefinitions(listOf(legacy)).single()

        assertTrue(definition.isPinnedToTop)
    }
}
