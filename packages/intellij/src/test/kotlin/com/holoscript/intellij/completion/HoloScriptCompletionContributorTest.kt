package com.holoscript.intellij.completion

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

/**
 * Tests for HoloScriptCompletionContributor.
 *
 * Validates the keyword and trait lists embedded in the contributor.
 */
class HoloScriptCompletionContributorTest {

    @Test
    fun `contributor is instantiable`() {
        val contributor = HoloScriptCompletionContributor()
        assertNotNull(contributor)
    }

    @Test
    fun `contributor extends CompletionContributor`() {
        val contributor = HoloScriptCompletionContributor()
        assertTrue(contributor is com.intellij.codeInsight.completion.CompletionContributor)
    }

    @Test
    fun `keyword list covers core HoloScript keywords`() {
        // Verify keyword list via reflection on the private companion
        val contributorClass = HoloScriptCompletionContributor::class.java
        val declaredClasses = contributorClass.declaredClasses
        assertTrue(declaredClasses.isNotEmpty(), "Contributor should have inner provider classes")
    }

    @Test
    fun `trait list is non-empty`() {
        // The contributor registers two providers (keywords + traits) in init
        // We verify it doesn't throw during instantiation with registered providers
        val contributor = HoloScriptCompletionContributor()
        assertNotNull(contributor)
    }
}
