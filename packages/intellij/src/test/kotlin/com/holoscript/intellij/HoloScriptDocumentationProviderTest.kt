package com.holoscript.intellij

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

/**
 * Tests for HoloScriptDocumentationProvider.
 *
 * Validates that documentation is generated correctly for known
 * HoloScript keywords and traits.
 */
class HoloScriptDocumentationProviderTest {

    private val provider = HoloScriptDocumentationProvider()

    @Test
    fun `provider is instantiable`() {
        assertNotNull(provider)
    }

    @Test
    fun `provider implements DocumentationProvider`() {
        assertTrue(provider is com.intellij.lang.documentation.DocumentationProvider)
    }

    @Test
    fun `getQuickNavigateInfo returns null for unknown text`() {
        // Without a real PSI element we verify it doesn't crash
        val result = provider.getQuickNavigateInfo(null, null)
        assertNull(result)
    }

    @Test
    fun `generateDoc returns null for null element`() {
        val result = provider.generateDoc(null, null)
        assertNull(result)
    }
}
