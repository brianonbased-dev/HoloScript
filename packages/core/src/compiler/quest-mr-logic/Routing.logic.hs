// Scan-result ROUTING DECISION — authored in .hs, compiled to on-device Kotlin by compile_to_quest
// (compile_to_kotlin, Rust/WASM grammar). This is the canonical source for "what does a decoded QR
// become?"; the Kotlin in android-mr/.../StarterSampleActivity.kt (onDecoded) is @generated from
// THIS file and must not be hand-edited (F.126 native authoring; D.101 language work; F.014 single
// canonical parser).
//
// FUNCTIONAL-CORE / IMPERATIVE-SHELL split (the whole point): this is PURE boolean logic mapping the
// three decision inputs to one of four routes. NO side effects, NO state, NO host calls live here.
// ALL of that stays in the Kotlin shell onDecoded(): the Log/pauseScanning/playScanTone side effects,
// the WorldPortal.isWorldLink / classifyContent / WorldPortal.autoImmerse boolean computations, the
// ScannerState mutations, and the enterWorld() host call. The shell computes the three booleans, calls
// decideRoute() for the pure decision, and applies the returned Route in a `when`.
//
// The .hs enum subset: `enum Route { ... }` compiles to a Kotlin `enum class`; a function whose every
// return is `Route.<Member>` is typed as returning `Route`; params used only as bare `if` tests are
// typed Boolean by usage. Single-assignment, no loops, no mutable state.

// The four possible outcomes of a scan, in precedence order: world-link auto-immerse, world-link
// confirm card, openable content (browser), or a non-actionable result card.
enum Route { EnterWorld, PendingWorld, OpenUrl, ShowResult }

// Map the three boolean inputs to a route. World links take precedence (their own @world_portal
// patterns); a world link either auto-immerses or offers an "Enter world" card. A non-world payload
// is either an OPEN-action content type (browser) or a plain result card.
function decideRoute(isWorldLink, autoImmerse, isOpenAction) {
  if (isWorldLink) {
    if (autoImmerse) { return Route.EnterWorld } else { return Route.PendingWorld }
  } else {
    if (isOpenAction) { return Route.OpenUrl } else { return Route.ShowResult }
  }
}
