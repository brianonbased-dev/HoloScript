// @generated from reader.holo @vocabulary_register acceptance contract. DO NOT EDIT.
package net.holoscript.holoread

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ContextEngineTest {
  @Test
  fun menuTermsConnectToIngredientContext() {
    val terms = ContextEngine.findTerms("Ramen with tahini")
    val insights = ContextEngine.analyzeMenu("Ramen with tahini")

    assertTrue(terms.contains("ramen"))
    assertTrue(terms.contains("tahini"))
    assertEquals(listOf("ramen", "tahini"), insights.map { it.term })
    assertTrue(insights.first().relationships.isNotEmpty())
  }

  @Test
  fun unknownWordsAbstainLocally() {
    assertEquals(null, ContextEngine.explain("not-a-menu-term"))
  }
}
