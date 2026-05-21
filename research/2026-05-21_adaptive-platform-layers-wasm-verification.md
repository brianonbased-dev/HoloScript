Adaptive Platform Layers WASM verification run - 2026-05-21 during room marathon

Core build (@holoscript/core): verify-internal-workspace-protocol OK, but tsup CJS bundling failed with esbuild error (see full logs in session).

Key packages from plan:
- holoscript-component: measured 459KB WASM (per archive)
- compiler-wasm: Rust based

Blocker identified: core package tsup CJS target broken, preventing clean WASM pipeline for Engine Core.

**2026-05-21 Update (room marathon continuation)**:
- Root cause: misplaced `export const WorldPhysicsConfig` inside the `PHYSICS_TRAIT_MAP` object literal in `src/compiler/AndroidXRTraitDispatch.ts` (leftover from earlier Earth/ALIEN physics surface work).
- Fix: moved to proper top-level module export (commit b212c8b3c).
- Result: `npx tsup --config tsup.config.ts` now succeeds for CJS (full build success, all chunks emitted).
- Impact: Engine Core WASM pipeline for Adaptive Platform Layers is now unblocked. The shared Rust/WASM core can proceed to the next slices in the plan (WIT audit, next Engine Core package integration, desktop parity, etc.).

This removes the primary practical blocker recorded in the original verification.


