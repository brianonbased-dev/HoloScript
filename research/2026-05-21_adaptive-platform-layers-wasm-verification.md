Adaptive Platform Layers WASM verification run - 2026-05-21 during room marathon

Core build (@holoscript/core): verify-internal-workspace-protocol OK, but tsup CJS bundling failed with esbuild error (see full logs in session).

Key packages from plan:
- holoscript-component: measured 459KB WASM (per archive)
- compiler-wasm: Rust based

Blocker identified: core package tsup CJS target broken, preventing clean WASM pipeline for Engine Core.

Next: fix tsup config or entry points in packages/core.

This task verified the current state of the plan.


