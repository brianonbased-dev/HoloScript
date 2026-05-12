# Rust Spatial Stack History

This page records the former Rust spatial-engine stack so future audits do not
infer that Rust agent or simulation work never existed. The current decision is
intentional retirement, not restoration.

## Current Decision

As of 2026-05-12, do not restore the deleted Rust spatial-engine stack verbatim.
The production agent runtime is `@holoscript/holoscript-agent` in TypeScript and
Node. The live Rust workspace is limited to `packages/compiler-wasm` and
`packages/tauri-app/src-tauri`.

If HoloScript needs native spatial simulation again, create a new minimal crate
with a deterministic test and a clear owner instead of reviving the old package
tree wholesale.

## Timeline

| Date | Commit | What happened |
| --- | --- | --- |
| 2026-02-27 | `49ad07561` | Added `packages/spatial-engine` with action execution, planner, agent components, perception, networking, event store, Redis/Postgres/Neo4j/Pinecone clients, replay, and Z3 world-generation solver code. |
| 2026-02-28 | `48839322d` | Added `packages/spatial-engine-wasm` and `packages/shader-preview-wgpu`; expanded `packages/holoscript-component` WIT/component code. |
| 2026-04-01 | `c5887f4e7` | Deleted the old Rust support package trees as ghost packages, including committed build artifacts. |
| 2026-04-05 | `79bf360b8` | Removed the retired package entries from the Cargo workspace and lockfile during the Phase-2 AI extraction and swarm removal. |

## Per-Package Disposition

| Historical package | Decision | Rationale | Re-entry bar |
| --- | --- | --- | --- |
| `packages/spatial-engine` | Retired and archived in git history | It mixed prototype agent runtime, persistence, networking, perception, and solver concerns without a current cargo-checkable product owner. | New crate must start with one deterministic agent/simulation test and only the minimum runtime surface needed by a current product. |
| `packages/spatial-engine-wasm` | Retired; rewrite only for a named hot path | Current Web/WASM support lives in `packages/compiler-wasm` plus TypeScript runtime bridges. | New WASM crate must be in `Cargo.toml`, build in CI, and expose a small typed API consumed by Studio or core. |
| `packages/shader-preview-wgpu` | Retired; rewrite only if native Studio preview returns | Studio currently has web-side shader and render tooling; the old native preview crate is not a live package. | New native preview must have a cargo-checkable crate, golden preview test, and Studio integration owner. |
| `packages/holoscript-component` | Retired as a package | The component-model direction remains plausible, but the package tree is absent from main. Current portable parsing support is `@holoscript/wasm` / `packages/compiler-wasm`. | Recreate as a fresh workspace member with WIT, WASI build, package manifest, and smoke instantiation test. |

## Audit Rule

When scanning HoloScript history, state the distinction precisely:

- Rust spatial/agent/simulation prototypes existed in early 2026.
- They were retired from the live workspace in April 2026.
- They are not the current headless agent runtime.
- Current Rust support is `compiler-wasm` and the Tauri app only.
