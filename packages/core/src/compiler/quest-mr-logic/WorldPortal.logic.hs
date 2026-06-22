// WorldPortal link-parsing logic — authored in .hs, compiled to on-device Kotlin by
// compile_to_quest (compile_to_kotlin, Rust/WASM grammar). This is the canonical source
// for the recognition/naming transforms; the Kotlin in
// android-mr/.../WorldPortal.kt is @generated from THIS file's functions and must not be
// hand-edited (F.126 native authoring; D.101 language work; F.014 single canonical parser).
//
// The .hs logic subset is single-assignment (reassignment is a parse error), so each step
// is a fresh `let`. The declarative DATA (link_patterns, auto_immerse) stays in scanner.holo's
// @world_portal trait and is injected as the `linkPatterns` / `autoImmerse` members — these
// functions consume that member, they do not redeclare it.
//
// Helpers used (defined once in the WorldPortal Kotlin object, pure stdlib, no lambdas in .hs):
//   matchedPattern(text)        -> the first linkPatterns prefix `text` starts with (case-insensitive), or ""
//   stripPrefixCI(text, prefix) -> text with a leading `prefix` removed (case-insensitive)
//   trimSlashes(text)           -> text with leading/trailing '/' removed (Char-vararg trim idiom)
//   titleCaseWords(id)          -> "holo-land_2" -> "Holo Land 2" (split on -_. , capitalize, join)
// Each helper is an irreducible Kotlin stdlib idiom (lambda / extension); the recognition and
// naming CONTROL FLOW below is the part authored natively in .hs.

// True if the decoded text is a HoloScript world link.
function isWorldLink(text) {
  let t = text.trim()
  let pat = matchedPattern(t)
  return pat != ""
}

// The raw world id: path after the matched pattern, first segment, query/fragment stripped.
function worldId(text) {
  let t = text.trim()
  let pat = matchedPattern(t)
  let afterPat = stripPrefixCI(t, pat)
  let noQuery = afterPat.substringBefore("?")
  let noFrag = noQuery.substringBefore("#")
  let unslashed = trimSlashes(noFrag)
  let seg = unslashed.substringBefore("/")
  if (seg == "") {
    return "world"
  } else {
    return seg
  }
}

// A human-readable world name, e.g. "holo-land_2" -> "Holo Land 2".
function worldName(text) {
  let id = worldId(text)
  let name = titleCaseWords(id)
  if (name == "") {
    return "World"
  } else {
    return name
  }
}
