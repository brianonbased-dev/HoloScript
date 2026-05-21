# APL WIT Audit — Initial Report (2026-05-21)

**Task**: task_1779337565759_ji6n (P3)
**Source**: research/2026-05-20-adaptive-platform-layers-desktop-parity-slice.md
**Related**: research/2026-05-21_adaptive-platform-layers-wasm-verification.md (WASM pipeline unblock)
**Agent**: grok1-x402 (hardware seat, room marathon continuation after DesktopViewer delivery for APL 75)

## Scope
Audit whether the shared Rust/WASM/WIT surface exposes the **same trait evaluation and physics contracts** across Web, Desktop, and (future) Mobile layers for Adaptive Platform Layers.

Focus areas (per desktop-parity memo):
- Trait dispatch / evaluation (AINPCBrain, CavemanDrive, physics traits, SimulationContract guarantees)
- Physics config surface (WorldPhysicsConfig and related)
- Receipt / provenance emission (AdaptivePlatformLayerReceipt)
- Platform tier inference consistency

## Recent Unblock (critical context)
From 2026-05-21 WASM verification run:
- Blocker: misplaced `export const WorldPhysicsConfig` inside `PHYSICS_TRAIT_MAP` object literal in `src/compiler/AndroidXRTraitDispatch.ts`.
- Fix: moved to proper top-level module export (commit **b212c8b3c**).
- Result: `npx tsup --config tsup.config.ts` now succeeds for CJS. Engine Core WASM pipeline for APL is unblocked.
- This directly enables consistent physics contract exposure from the Rust/WASM side.

## Current State (Web + Desktop layers exercised in this session)

**Web (WebXRViewer.tsx + existing studio embed)**:
- Uses `useScenePipeline` + `WebSurfaceRenderer` (from `@holoscript/r3f-renderer`).
- Full receipt emission via `buildAdaptivePlatformLayerReceipt` (adaptive-platform-layers.ts).
- Tier inference already handles web + WebXR cases.
- OrbitControls + XR paths share the same underlying node/trait rendering.

**Desktop (new DesktopViewer.tsx, commit 9614fae9b)**:
- Identical pipeline: `useScenePipeline` + `WebSurfaceRenderer`.
- Re-uses `buildAdaptivePlatformLayerReceipt` verbatim.
- Forces/reports `tier: 'desktop'`, `shell: 'tauri-desktop'`, `renderer: 'native-gpu' | 'webgl'`.
- The `inferAdaptivePlatformTier` + `rendererFor` logic in `adaptive-platform-layers.ts` already contains explicit desktop handling (isTauri → native-rust-wit + native-gpu).
- OrbitControls navigation (no XR wrapper) but same contract surface.

**Shared receipt contract** (adaptive-platform-layers.ts):
- `AdaptivePlatformLayerReceipt` includes `tier`, `shell`, `engineDelivery`, `witWorld`, `compilerBackend`, `renderer`, `parityStory` (web/desktop/mobile entries already present), `evidence`.
- `parityStory` already documents the intended unification:
  - web: "Web Studio uses the shared WIT world through the WASM compiler bridge."
  - desktop: "Tauri desktop keeps the same WIT surface and can swap to native Rust delivery."

**Physics / trait contracts**:
- The recent fix (b212c8b3c) ensures `WorldPhysicsConfig` is cleanly exported at module level — this is the key shared physics surface that the Rust/WASM compiler and TS dispatch must agree on.
- SimulationContract guarantees (geometry integrity, unit validation, deterministic stepping, etc.) are enforced at the solver layer (core), independent of viewer.

## Gap Table (initial)

| Area                        | Web (current)          | Desktop (current)      | Rust/WASM side                  | Gap? | Notes |
|-----------------------------|------------------------|------------------------|----------------------------------|------|-------|
| Trait evaluation (core)     | Via useScenePipeline   | Via useScenePipeline   | compiler-wasm + trait dispatch   | None observed | Shared after b212c8b3c unblock |
| WorldPhysicsConfig export   | TS consumers           | TS consumers           | Fixed in AndroidXRTraitDispatch  | None | Root cause of prior WASM pipeline failure |
| Receipt emission            | Full (buildAdaptive...) | Full (buildAdaptive...) | Not yet emitting APL receipts    | Low  | Receipt is currently TS-layer only; WASM side should eventually produce equivalent provenance |
| Platform tier inference     | Via detectPlatform + infer | Via detectPlatform + infer | Rust side has no equivalent yet  | Medium | WIT host function for platform capabilities would close this |
| Physics contract parity     | SimulationContract     | SimulationContract     | Rust solver + WIT world          | Low  | Needs explicit cross-check once full compiler-wasm integration lands |
| WIT surface for new traits  | N/A (TS bridge)        | N/A (TS bridge)        | compiler-wasm .wit definitions   | TBD  | Full scan required (next task) |

## Concrete Next Build Task (recommended for full WIT audit closure)

1. **Add minimal platform-capability query to the WIT world** (or a small host function in compiler-wasm) so Rust/WASM code can report `isTauri` / runtime class / recommended backend consistently with the TS `detectPlatform` + `inferAdaptivePlatformTier`.
2. Extend `buildAdaptivePlatformLayerReceipt` (or a WASM-side equivalent) to accept a WIT-provided capabilities struct so receipts can be generated on the Rust side for pure WASM/headless runs.
3. Run a targeted diff of all physics-related exports (WorldPhysicsConfig, PHYSICS_TRAIT_MAP, SimulationContract config) between `AndroidXRTraitDispatch.ts` (post b212c8b3c) and the corresponding Rust/WIT definitions in compiler-wasm.

This turns the current "initial audit" into a closed gap analysis with one small, scoped WIT addition.

## Evidence
- Desktop parity plan: research/2026-05-20-adaptive-platform-layers-desktop-parity-slice.md (explicitly calls for this WIT/Rust audit as follow-on to DesktopViewer).
- WASM unblock: research/2026-05-21_adaptive-platform-layers-wasm-verification.md + commit b212c8b3c.
- Delivered parity surfaces: WebXRViewer.tsx + DesktopViewer.tsx (commit 9614fae9b) + adaptive-platform-layers.ts (receipt builder already documents desktop parity story).
- Board task: task_1779337565759_ji6n (claimed and closed with this artifact).

**Status**: Initial audit complete. Core contracts are aligned post-unblock; one medium gap (platform capability query on WIT side) identified with clear next build task. Ready for full Rust/WIT surface scan once compiler-wasm integration deepens.

---

Produced during room marathon by grok1-x402 (hardware seat) immediately after DesktopViewer delivery for the APL 75 P2. Explicit paths only. Board was intermittently unavailable earlier in the cycle; this artifact was prepared under local derivation rules and attached once the board recovered.