// Scan-result ROUTING DECISION — authored in .hs, compiled to on-device Kotlin by compile_to_quest
// (compile_to_kotlin, Rust/WASM grammar). This is the canonical source for "what does a decoded QR
// become?"; the Kotlin in android-mr/.../StarterSampleActivity.kt (onDecoded) is @generated from
// THIS file and must not be hand-edited (F.126 native authoring; D.101 language work; F.014 single
// canonical parser).
//
// FUNCTIONAL-CORE / IMPERATIVE-SHELL split (the whole point): this is PURE logic for payload
// admission and mapping an inferred intent to one of five routes. NO side effects, state, or host
// calls live here.
// ALL of that stays in the Kotlin shell onDecoded(): the Log/pauseScanning/playScanTone side effects,
// the WorldPortal.isWorldLink / classifyContent / WorldPortal.autoImmerse boolean computations, the
// ScannerState mutations, and the enterWorld() host call. The shell computes host-library facts, calls
// these pure decisions, and applies the returned Route in a `when`.
//
// The .hs enum subset: `enum Route { ... }` compiles to a Kotlin `enum class`; a function whose every
// return is `Route.<Member>` is typed as returning `Route`; params used only as bare `if` tests are
// typed Boolean by usage. Single-assignment, no loops, no mutable state.

// The five possible outcomes of a scan: world-link auto-immerse, world-link confirm, browser,
// non-actionable result card, or fail-closed denial.
enum Route { EnterWorld, PendingWorld, OpenUrl, ShowResult, Deny }

// The decoded bytes are known, but their inferred semantic intent begins epistemically unknown.
// The Quest adapter may construct this field only with known(...) or unknown(...), and every read
// must supply a fail-closed fallback. Kotlin preserves this as Uncertain<String>.
struct ClassifiedIntent {
  @unknown inferred: string,
}

function resolveIntent(intent: ClassifiedIntent): string {
  return intent.inferred ?? "deny"
}

// Payload admission belongs to the language decision core. The Quest adapter computes only facts
// requiring the host string library; this function decides whether those facts establish a value
// safe enough to classify. A false result keeps inferred intent @unknown and therefore Deny.
function admissiblePayload(nonEmpty, withinLimit, controlsSafe, syntaxSafe) {
  if (nonEmpty) {
    if (withinLimit) {
      if (controlsSafe) {
        if (syntaxSafe) { return true } else { return false }
      } else {
        return false
      }
    } else {
      return false
    }
  } else {
    return false
  }
}

function decideRoute(intent, autoImmerse) {
  if (intent == "world") {
    if (autoImmerse) { return Route.EnterWorld } else { return Route.PendingWorld }
  } else {
    if (intent == "open") {
      return Route.OpenUrl
    } else {
      if (intent == "copy") { return Route.ShowResult } else { return Route.Deny }
    }
  }
}
