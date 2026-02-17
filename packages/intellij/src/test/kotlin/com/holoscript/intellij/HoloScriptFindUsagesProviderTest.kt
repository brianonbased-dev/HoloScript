package com.holoscript.intellij

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

/**
 * Tests for HoloScriptFindUsagesProvider.
 */
class HoloScriptFindUsagesProviderTest {

    private val provider = HoloScriptFindUsagesProvider()

    @Test
    fun `provider is instantiable`() {
        assertNotNull(provider)
    }

    @Test
    fun `words scanner is non-null`() {
        assertNotNull(provider.wordsScanner)
    }

    @Test
    fun `getHelpId returns null`() {
        assertNull(provider.getHelpId(dummyElement("test")))
    }

    @Test
    fun `getType returns composition for composition element`() {
        assertEquals("composition", provider.getType(dummyElement("composition demo { }")))
    }

    @Test
    fun `getType returns orb for orb element`() {
        assertEquals("orb", provider.getType(dummyElement("orb ball { }")))
    }

    @Test
    fun `getType returns template for template element`() {
        assertEquals("template", provider.getType(dummyElement("template Bouncy { }")))
    }

    @Test
    fun `getType returns symbol for unknown element`() {
        assertEquals("symbol", provider.getType(dummyElement("myProperty: 42")))
    }

    @Test
    fun `getDescriptiveName returns element text for non-named element`() {
        val text = "someIdentifier"
        val result = provider.getDescriptiveName(dummyElement(text))
        assertEquals(text, result)
    }

    // Minimal PsiElement stub for testing
    private fun dummyElement(text: String): com.intellij.psi.PsiElement {
        return object : com.intellij.psi.impl.FakePsiElement() {
            override fun getText(): String = text
            override fun getParent(): com.intellij.psi.PsiElement? = null
        }
    }
}
