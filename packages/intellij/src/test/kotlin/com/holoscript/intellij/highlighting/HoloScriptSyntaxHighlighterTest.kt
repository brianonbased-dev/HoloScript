package com.holoscript.intellij.highlighting

import com.holoscript.intellij.lexer.HoloScriptTokenTypes
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

/**
 * Tests for HoloScriptSyntaxHighlighter and HoloScriptSyntaxHighlighterFactory.
 */
class HoloScriptSyntaxHighlighterTest {

    private val highlighter = HoloScriptSyntaxHighlighter()

    @Test
    fun `highlighter is instantiable`() {
        assertNotNull(highlighter)
    }

    @Test
    fun `factory creates highlighter`() {
        val factory = HoloScriptSyntaxHighlighterFactory()
        val created = factory.getSyntaxHighlighter(null, null)
        assertNotNull(created)
        assertTrue(created is HoloScriptSyntaxHighlighter)
    }

    @Test
    fun `KEYWORD token maps to KEYWORD attribute`() {
        val attrs = highlighter.getTokenHighlights(HoloScriptTokenTypes.KEYWORD)
        assertTrue(attrs.isNotEmpty())
        assertEquals(HoloScriptSyntaxHighlighter.KEYWORD, attrs[0])
    }

    @Test
    fun `TRAIT token maps to TRAIT attribute`() {
        val attrs = highlighter.getTokenHighlights(HoloScriptTokenTypes.TRAIT)
        assertTrue(attrs.isNotEmpty())
        assertEquals(HoloScriptSyntaxHighlighter.TRAIT, attrs[0])
    }

    @Test
    fun `STRING token maps to STRING attribute`() {
        val attrs = highlighter.getTokenHighlights(HoloScriptTokenTypes.STRING)
        assertEquals(HoloScriptSyntaxHighlighter.STRING, attrs[0])
    }

    @Test
    fun `NUMBER token maps to NUMBER attribute`() {
        val attrs = highlighter.getTokenHighlights(HoloScriptTokenTypes.NUMBER)
        assertEquals(HoloScriptSyntaxHighlighter.NUMBER, attrs[0])
    }

    @Test
    fun `LINE_COMMENT maps to COMMENT attribute`() {
        val attrs = highlighter.getTokenHighlights(HoloScriptTokenTypes.LINE_COMMENT)
        assertEquals(HoloScriptSyntaxHighlighter.COMMENT, attrs[0])
    }

    @Test
    fun `BLOCK_COMMENT maps to BLOCK_COMMENT attribute`() {
        val attrs = highlighter.getTokenHighlights(HoloScriptTokenTypes.BLOCK_COMMENT)
        assertEquals(HoloScriptSyntaxHighlighter.BLOCK_COMMENT, attrs[0])
    }

    @Test
    fun `LBRACE and RBRACE map to BRACES attribute`() {
        val lbrace = highlighter.getTokenHighlights(HoloScriptTokenTypes.LBRACE)
        val rbrace = highlighter.getTokenHighlights(HoloScriptTokenTypes.RBRACE)
        assertEquals(HoloScriptSyntaxHighlighter.BRACES, lbrace[0])
        assertEquals(HoloScriptSyntaxHighlighter.BRACES, rbrace[0])
    }

    @Test
    fun `OPERATOR maps to OPERATOR attribute`() {
        val attrs = highlighter.getTokenHighlights(HoloScriptTokenTypes.OPERATOR)
        assertEquals(HoloScriptSyntaxHighlighter.OPERATOR, attrs[0])
    }

    @Test
    fun `BAD_CHARACTER maps to BAD_CHARACTER attribute`() {
        val attrs = highlighter.getTokenHighlights(HoloScriptTokenTypes.BAD_CHARACTER)
        assertEquals(HoloScriptSyntaxHighlighter.BAD_CHARACTER, attrs[0])
    }

    @Test
    fun `null token returns empty array`() {
        val attrs = highlighter.getTokenHighlights(null)
        assertTrue(attrs.isEmpty())
    }

    @Test
    fun `color settings page is instantiable`() {
        val page = HoloScriptColorSettingsPage()
        assertNotNull(page)
        assertEquals("HoloScript", page.displayName)
        assertTrue(page.attributeDescriptors.isNotEmpty())
        assertTrue(page.colorDescriptors.isEmpty())
        assertTrue(page.demoText.isNotBlank())
    }

    @Test
    fun `color settings page has correct attribute count`() {
        val page = HoloScriptColorSettingsPage()
        // Should have 15 descriptor entries (keywords, literals, comments, identifiers, etc.)
        assertEquals(15, page.attributeDescriptors.size)
    }
}
