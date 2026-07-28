// @generated from reader.holo @vocabulary_register. DO NOT EDIT.
package net.holoscript.holoread

import java.util.Locale

data class VocabularyEntry(
    val term: String,
    val category: String,
    val definition: String,
    val relationships: List<String>,
    val allergenNotice: String,
)

object ContextEngine {
  const val allergenDisclaimer = "Recipes and preparation vary. For allergies, verify ingredients and cross-contact with the restaurant or packaging."
  private val entries =
      listOf(
    VocabularyEntry(
        term = "aioli",
        category = "sauce",
        definition = "A garlic-and-oil sauce; many modern versions also use egg.",
        relationships = listOf("often served with seafood, vegetables, or sandwiches", "egg may be present"),
        allergenNotice = "May contain egg.",
    ),
    VocabularyEntry(
        term = "pesto",
        category = "sauce",
        definition = "A sauce commonly made with basil, oil, hard cheese, garlic, and nuts.",
        relationships = listOf("commonly paired with pasta", "nuts and milk may be present"),
        allergenNotice = "Often contains tree nuts and milk.",
    ),
    VocabularyEntry(
        term = "carbonara",
        category = "pasta dish",
        definition = "An Italian pasta dish commonly made with egg, hard cheese, cured pork, and black pepper.",
        relationships = listOf("egg and cheese create the sauce", "preparation varies by restaurant"),
        allergenNotice = "Commonly contains egg, milk, and wheat.",
    ),
    VocabularyEntry(
        term = "ramen",
        category = "noodle dish",
        definition = "A Japanese noodle dish built from broth, wheat noodles, seasoning, and toppings.",
        relationships = listOf("broth, noodles, seasoning, and toppings form the dish", "broth and toppings vary widely"),
        allergenNotice = "May contain wheat, soy, egg, fish, shellfish, or sesame.",
    ),
    VocabularyEntry(
        term = "pad thai",
        category = "noodle dish",
        definition = "A Thai stir-fried rice-noodle dish commonly balancing sweet, sour, salty, and savory flavors.",
        relationships = listOf("often includes tamarind, egg, peanuts, and a protein", "ingredients vary"),
        allergenNotice = "May contain peanuts, egg, fish, shellfish, or soy.",
    ),
    VocabularyEntry(
        term = "tahini",
        category = "ingredient",
        definition = "A paste made from ground sesame seeds.",
        relationships = listOf("used in hummus, dressings, sauces, and desserts", "contributes richness and sesame flavor"),
        allergenNotice = "Contains sesame.",
    ),
    VocabularyEntry(
        term = "ceviche",
        category = "seafood dish",
        definition = "A dish of seafood cured in citrus juice and combined with seasonings.",
        relationships = listOf("citrus changes the seafood texture", "it is not a heat-cooking process"),
        allergenNotice = "Contains seafood; preparation and raw-food risk vary.",
    ),
    VocabularyEntry(
        term = "mole",
        category = "sauce",
        definition = "A family of Mexican sauces made from layered chiles, spices, and other ingredients.",
        relationships = listOf("recipes may include nuts, seeds, fruit, bread, or chocolate", "there is no single universal recipe"),
        allergenNotice = "May contain nuts, sesame, wheat, or other allergens.",
    )
      )

  fun findTerms(text: String): List<String> {
    val known = entries.filter { containsTerm(text, it.term) }.map { it.term }
    val words =
        normalized(text)
            .split(' ')
            .asSequence()
            .filter { it.length >= 3 }
            .filterNot { it in STOP_WORDS }
            .distinct()
            .take(12)
            .toList()
    return (known + words).distinct().take(12)
  }

  fun explain(term: String): VocabularyEntry? =
      entries.firstOrNull { normalized(it.term) == normalized(term) }

  fun analyzeMenu(text: String): List<VocabularyEntry> =
      entries.filter { containsTerm(text, it.term) }

  private fun containsTerm(text: String, term: String): Boolean =
      (" " + normalized(text) + " ").contains(" " + normalized(term) + " ")

  private fun normalized(value: String): String =
      value
          .lowercase(Locale.ROOT)
          .replace(Regex("[^\\p{L}\\p{M}\\p{N}]+"), " ")
          .trim()
          .replace(Regex("\\s+"), " ")

  private val STOP_WORDS =
      setOf("and", "the", "with", "from", "for", "your", "this", "that", "are", "our")
}
