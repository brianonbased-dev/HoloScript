/*
 * @generated from scanner.holo + logic/WorldPortal.logic.hs by the quest compiler
 * (compile_to_quest, surface: immersive_mr). DO NOT EDIT.
 *   - Behavior DATA (link patterns, auto-immerse) lives in scanner.holo's @world_portal trait.
 *   - Recognition/naming LOGIC (isWorldLink / worldId / worldName) is authored in
 *     logic/WorldPortal.logic.hs and compiled to the Kotlin below by the Rust/WASM
 *     compile_to_kotlin backend — change the .hs and recompile, never hand-edit here.
 *
 * World portal: a decoded QR whose text matches one of linkPatterns is a HoloScript WORLD link, not
 * a browser link. Instead of opening the Quest browser, the app immerses the user into that world
 * (passthrough off + a themed backdrop) while the passthrough camera keeps decoding — so real QRs
 * still scan inside the world. Scanning another world link hops worlds.
 *
 * Pure recognition/naming logic; the immerse transition lives in StarterSampleActivity (enter/leave)
 * and the in-world HUD in ScannerPanel. autoImmerse selects auto-enter vs. an "Enter world" card.
 */
package net.holoscript.qrscanner

object WorldPortal {
  /** Decoded-QR prefixes that mark a world link (from scanner.holo's world_portal.link_patterns). */
  val linkPatterns: List<String> = listOf("holoscript://world/", "https://holoscript.studio/w/", "https://hololand.holoscript.studio/")

  /** Enter the world automatically on a world-link read (vs. showing an "Enter world" card). */
  const val autoImmerse = false

  // ── @generated from logic/WorldPortal.logic.hs (compile_to_kotlin) ──────────────────────────
  fun isWorldLink(text: String): Boolean {
    val t = text.trim()
    val pat = matchedPattern(t)
    return pat != ""
  }

  fun worldId(text: String): String {
    val t = text.trim()
    val pat = matchedPattern(t)
    val afterPat = stripPrefixCI(t, pat)
    val noQuery = afterPat.substringBefore("?")
    val noFrag = noQuery.substringBefore("#")
    val unslashed = trimSlashes(noFrag)
    val seg = unslashed.substringBefore("/")
    if (seg == "") {
      return "world"
    } else {
      return seg
    }
  }

  fun worldName(text: String): String {
    val id = worldId(text)
    val name = titleCaseWords(id)
    if (name == "") {
      return "World"
    } else {
      return name
    }
  }

  // ── Irreducible Kotlin stdlib helpers the .hs logic above calls ─────────────────────────────
  // These are the lambda / Char-vararg idioms that have no .hs surface; the CONTROL FLOW that uses
  // them is authored in .hs. Behaviorally identical to the prior hand-written WorldPortal.

  /** The first linkPatterns prefix `text` starts with (case-insensitive), or "" if none match. */
  private fun matchedPattern(text: String): String =
      linkPatterns.firstOrNull { text.startsWith(it, ignoreCase = true) } ?: ""

  /** `text` with a leading `prefix` removed; `text` unchanged when `prefix` is empty. */
  private fun stripPrefixCI(text: String, prefix: String): String =
      if (prefix.isNotEmpty()) text.substring(prefix.length) else text

  /** `text` with leading/trailing '/' removed. */
  private fun trimSlashes(text: String): String = text.trim('/')

  /** "holo-land_2" → "Holo Land 2": split on -_. , drop blanks, capitalize each, join with spaces. */
  private fun titleCaseWords(id: String): String =
      id.split('-', '_', '.')
          .filter { it.isNotBlank() }
          .joinToString(" ") { w -> w.replaceFirstChar { c -> c.uppercaseChar() } }
}
