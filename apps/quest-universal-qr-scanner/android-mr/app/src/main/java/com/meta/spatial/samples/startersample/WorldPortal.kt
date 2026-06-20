/*
 * @generated from scanner.holo by the quest compiler (compile_to_quest, surface: immersive_mr).
 * DO NOT EDIT — change behavior in scanner.holo's world_portal trait and recompile.
 *
 * World portal: a decoded QR whose text matches one of LINK_PATTERNS is a HoloScript WORLD link, not
 * a browser link. Instead of opening the Quest browser, the app immerses the user into that world
 * (passthrough off + a themed backdrop) while the passthrough camera keeps decoding — so real QRs
 * still scan inside the world. Scanning another world link hops worlds.
 *
 * Pure recognition/naming logic; the immerse transition lives in StarterSampleActivity (enter/leave)
 * and the in-world HUD in ScannerPanel. AUTO_IMMERSE selects auto-enter vs. an "Enter world" card.
 */
package com.meta.spatial.samples.startersample

object WorldPortal {
  /** Decoded-QR prefixes that mark a world link (from scanner.holo's world_portal.link_patterns). */
  val linkPatterns: List<String> = listOf("holoscript://world/", "https://holoscript.studio/w/", "https://hololand.holoscript.studio/")

  /** Enter the world automatically on a world-link read (vs. showing an "Enter world" card). */
  const val autoImmerse = true

  /** True if the decoded text is a HoloScript world link. */
  fun isWorldLink(text: String): Boolean {
    val t = text.trim()
    return linkPatterns.any { t.startsWith(it, ignoreCase = true) }
  }

  /** The raw world id (path after the matched pattern, first segment, query/fragment stripped). */
  fun worldId(text: String): String {
    val t = text.trim()
    val pat = linkPatterns.firstOrNull { t.startsWith(it, ignoreCase = true) }
    var rest = if (pat != null) t.substring(pat.length) else t
    rest = rest.substringBefore('?').substringBefore('#')
    rest = rest.trim('/').substringBefore('/')
    return if (rest.isBlank()) "world" else rest
  }

  /** A human-readable world name, e.g. "holo-land_2" → "Holo Land 2". */
  fun worldName(text: String): String {
    val id = worldId(text)
    return id
        .split('-', '_', '.')
        .filter { it.isNotBlank() }
        .joinToString(" ") { w -> w.replaceFirstChar { c -> c.uppercaseChar() } }
        .ifBlank { "World" }
  }
}
