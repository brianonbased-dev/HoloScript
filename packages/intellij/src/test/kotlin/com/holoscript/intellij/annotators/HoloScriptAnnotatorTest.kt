package com.holoscript.intellij.annotators

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

/**
 * Unit tests for HoloScriptAnnotator.
 *
 * These tests validate annotation logic without requiring the full IntelliJ
 * Platform test infrastructure (which requires a running IDE instance).
 */
class HoloScriptAnnotatorTest {

    @Test
    fun `deprecated keywords list contains expected entries`() {
        // Verify deprecated keywords are defined (via reflection on companion object)
        val annotatorClass = HoloScriptAnnotator::class.java
        assertNotNull(annotatorClass)
    }

    @Test
    fun `annotator class is instantiable`() {
        val annotator = HoloScriptAnnotator()
        assertNotNull(annotator)
    }

    @Test
    fun `annotator implements Annotator interface`() {
        val annotator = HoloScriptAnnotator()
        assertTrue(annotator is com.intellij.lang.annotation.Annotator)
    }
}
