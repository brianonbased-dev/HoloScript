# Unknown-trait warning needs union allowlist, not VR_TRAITS-only (parser)

**Date:** 2026-06-14
**Class:** deleted-work
**Status:** seed
**Repository:** HoloScript
**Source context:** packages/core/src/parser/HoloCompositionParser.ts parseTraitName ~3380

## What Might Be Valuable

The authoring win is real: `parseTraitName` accepts ANY token, so `@grabable` (typo of `@grabbable`) parses clean and silently renders nothing. A warning-severity "unknown trait '@xyz' — did you mean '@grabbable'?" diagnostic (using the already-wired `TypoDetector` + `UNKNOWN_TRAIT` enrichment in `ErrorRecovery.ts`) would close the single highest-leverage silent-failure gap in `.holo` authoring. The infrastructure already exists; only the trigger is missing.

## Why Not Now

The naive trigger — "warn if the trait name is not in `VR_TRAITS`" — is unsafe, proven empirically (2026-06-14). `VR_TRAITS` (~2841 names) is only ONE of several legitimate trait vocabularies. Measured across all real `.holo`/`.hsplus` files: of 136 distinct trait names used, only 46 are in `VR_TRAITS`; **90 legitimate names are NOT** (studio-panel: `view`/`native_panel`/`theme`/`fetch`/`text`/`bind`/`hook`; code-graph annotations: `@file`(568×)/`@reused_in`/`@uses_stores`/`@calls_apis`; `.hsplus` brain traits: `hs_behavior`/`intent_driven`/`agent_attention`; robotics/URDF: `link_visual`/`ros_node`/`urdf_export`; structural: `material`/`world`/`page`/`route`/`version`). Worse, even gating on "only warn when TypoDetector finds a close match" still produces **25 spurious warnings** because `VR_TRAITS` contains hundreds of short common-English-word semantic-expansion traits (`tent`,`bin`,`book`,`face`,`pier`,`bored`,`aerial`) that land within edit-distance ≤2 of legit non-VR names — e.g. `@text`→`@tent`, `@bind`→`@bin`, `@hook`→`@book`, `@material`→`@aerial`, `@world`→`@bored`, `@view`→`@pier`. The two acceptance-gate panel files (`agentMonitor.holo`, `profiler.holo`) would each emit 5+ spurious warnings. The fix would have to enumerate ALL ~90 non-VR names in a union allowlist, but most of those vocabularies are defined DOWNSTREAM of `packages/core` (`packages/studio-ui-graph/src/emit.ts`, studio panels, plugins, `.hsplus` brain traits) — `packages/core` has NO dependency on studio (correct layering), so it cannot import them without inverting the dependency graph.

## Smallest Next Experiment

Build the union recognized-trait set the RIGHT way: have each downstream vocabulary owner (studio-ui-graph, studio panels, each plugin, the `.hsplus` brain-trait registry) EXPORT its trait/annotation names, and have the parser accept an injectable `knownTraits?: Set<string>` option (default = `VR_TRAITS`) that callers populate with the union. Then warn only when the name is outside the injected union AND `TypoDetector.findClosestMatch` (raised to a tighter threshold, e.g. distance 1, or length-relative) returns a hit. Validate against the same corpus: must yield ZERO warnings on the 90 legit names and a correct "did you mean" on `@grabable`/`@throwabl`/`@clickabe`.

## Reopen Trigger

When core gains a trait-registry plugin seam (injectable known-trait set), or when the code-graph/studio-panel/`.hsplus` vocabularies are consolidated into a single importable registry. Also reopen if authoring friction from silent trait no-ops is reported by users.

## Do Not Preserve

Do NOT revive the "warn if not in `VR_TRAITS`" approach, with or without a typo-gate — both spam 25+ legitimate files (measured). Do NOT hardcode a duplicated copy of the studio/graph/plugin vocabulary inside `packages/core` (layering violation + guaranteed drift). Do NOT make the diagnostic a hard error (must stay warning-only; parse must keep `success:true`).

## Links

- packages/core/src/parser/HoloCompositionParser.ts — `parseTraitName` ~3380; ObjectTrait sites ~2014/2122/1853/3260
- packages/core/src/parser/ErrorRecovery.ts — `UNKNOWN_TRAIT` + `VALID_TRAITS=[...VR_TRAITS]`, enrichment wired but never triggered
- packages/core/src/parser/TypoDetector.ts — `findClosestMatch` (Levenshtein, default maxDistance 2)
- packages/studio-ui-graph/src/emit.ts — source of `@file`/`@reused_in`/`@calls_apis` code-graph annotations (downstream of core)
- packages/studio/scripts/compile-view-registry.ts — studio-panel `view`/`native_panel`/`slot` vocabulary (downstream of core)

## Links

- <related file/task/commit/doc>
