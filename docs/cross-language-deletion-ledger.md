# Cross-Language Deletion Ledger

> Canonical record of removed package roots from the HoloScript monorepo.
> Authority: This file.
> Updates: Append-only; never rewrite history rows. New dispositions go at the bottom.
> Verification: See `research/2026-05-12_deleted-package-disposition-audit.md` § Appendix.

## Legend

| Disposition | Meaning |
|---|---|
| `retired` | Intentionally removed; no direct replacement. Capability may exist elsewhere in ecosystem. |
| `merged` | Absorbed into another in-repo package. Functionality preserved under new owner. |
| `migrated` | Moved to another repository (primarily Hololand platform repo). |
| `superseded` | Replaced by a newer or better-scoped package. Old API no longer valid. |
| `unfinished` | Incomplete or abandoned; removed to reduce surface area. |
| `bad-idea` | Deliberately discarded design. Not coming back. |
| `revive-candidate` | Viable to bring back if demand surfaces; no current replacement. |

## Ledger

| # | Package | Lang | Deletion Commit | Disposition | Replacement / Current Owner | Evidence |
|---|---|---|---|---|---|---|
| 1 | `packages/academy` | TS | `ec816e408` | merged | `packages/studio` / docs | "remove duplicated academy package" |
| 2 | `packages/accessibility` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 3 | `packages/agent-sdk` | TS | `ed3994213` | superseded | `packages/framework` | "remove deprecated @holoscript/agent-sdk (superseded by framework)" |
| 4 | `packages/agent-setup` | TS | `557be80b1` | merged | `packages/create-holoscript` | "merge @holoscript/agent-setup as second bin" |
| 5 | `packages/babylon-adapter` | TS | `284b55757` | migrated | Hololand platform repo | "Adapters moved to Hololand platform repo" |
| 6 | `packages/collab-server` | TS | `db10ea246` | merged | `packages/mcp-server` | "merge @holoscript/collab-server → mcp-server" |
| 7 | `packages/commerce` | TS | `d0a5317e0` | unfinished | — | "clean up incomplete packages and organize examples" |
| 8 | `packages/compiler` | TS | `52bc38eb3` | merged | `packages/core` | "delete 5 re-export shim packages (compiler, engine, parser, traits, compiler-utils)" |
| 9 | `packages/compiler-utils` | TS | `52bc38eb3` | merged | `packages/core` | "delete 5 re-export shim packages" |
| 10 | `packages/components` | `.holo` | `c5887f4e7` | unfinished | — | "delete 11 ghost packages with zero source code" |
| 11 | `packages/connectors` | TS | `3e473d117` | superseded | `packages/connector-*` | Monolithic split into 7 specialized connector packages |
| 12 | `packages/create-holoscript-app` | TS | `359e18348` | superseded | `packages/create-holoscript` | Scaffold replaced by newer package |
| 13 | `packages/creator-tools` | TS | `284b55757` | migrated | Hololand platform repo | "Adapters moved to Hololand platform repo" |
| 14 | `packages/demo-apps` | TS | `d0a5317e0` | unfinished | — | "clean up incomplete packages and organize examples" |
| 15 | `packages/fs` | TS | `5c02107e0` | merged | `packages/std` | `packages/std/src/fs/` now owns filesystem primitives |
| 16 | `packages/gestures` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 17 | `packages/gpu` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 18 | `packages/haptics` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 19 | `packages/holoscript-component` | TS | `c5887f4e7` | retired | — | Ghost package with zero source code |
| 20 | `packages/ik` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 21 | `packages/intelligence` | TS | `9ab9fa2f8` | unfinished | — | "delete empty stubs, fix circular deps" |
| 22 | `packages/intellij` | Kotlin/Gradle | `c5887f4e7` | retired | — | IntelliJ plugin; no current IDE plugin in repo |
| 23 | `packages/lod` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 24 | `packages/multiplayer` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 25 | `packages/navigation` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 26 | `packages/neovim` | TS | `c5887f4e7` | retired | — | Ghost package with zero source code |
| 27 | `packages/network` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 28 | `packages/parser` | TS | `52bc38eb3` | merged | `packages/core` | "delete 5 re-export shim packages" |
| 29 | `packages/pcg` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 30 | `packages/physics-joints` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 31 | `packages/playcanvas-adapter` | TS | `284b55757` | migrated | Hololand platform repo | "Adapters moved to Hololand platform repo" |
| 32 | `packages/playground` | TS | `5c02107e0` | merged | `packages/studio` | Deleted in platform consolidation; functionality absorbed |
| 33 | `packages/portals` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 34 | `packages/semantic-2d` | TS | `8822ef639` | merged | `packages/core` | "merge @holoscript/semantic-2d (and refuse marketplace-agentkit)" |
| 35 | `packages/shader-preview-wgpu` | TS/WGSL | `c5887f4e7` | retired | — | Ghost package with zero source code |
| 36 | `packages/snn-poc` | TS/WGSL | `3e473d117` | superseded | `packages/snn-webgpu` | POC replaced by production GPU implementation |
| 37 | `packages/spatial-audio` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 38 | `packages/spatial-engine` | Rust | `c5887f4e7` | retired | `packages/core` (TS engine) | Rust spatial engine retired; TS spatial engine lives in core. See Rust spatial-engine retirement audit in `docs/ecosystem`. |
| 39 | `packages/spatial-engine-wasm` | Rust/WASM | `c5887f4e7` | retired | — | WASM companion to `spatial-engine`; retired with it |
| 40 | `packages/state-sync` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 41 | `packages/store` | TS | `3e473d117` | superseded | `packages/marketplace-api` / `packages/core` | Store functionality absorbed into marketplace and core |
| 42 | `packages/streaming` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 43 | `packages/test` | TS | `c5887f4e7` | retired | Root vitest | Visual regression harness replaced by root-level vitest |
| 44 | `packages/three-adapter` | TS | `284b55757` | migrated | Hololand platform repo | "Adapters moved to Hololand platform repo" |
| 45 | `packages/traits` | TS | `52bc38eb3` | merged | `packages/core` | "delete 5 re-export shim packages" |
| 46 | `packages/uaa2-client` | TS | `2dddc5040` | superseded | `packages/holoscript-agent` | Renamed to `infinityassistant`, later migrated; now covered by `holoscript-agent` |
| 47 | `packages/unity-adapter` | TS | `284b55757` | migrated | Hololand platform repo | "Adapters moved to Hololand platform repo" |
| 48 | `packages/unity-sdk` | TS | `c5887f4e7` | retired | — | Ghost package with zero source code |
| 49 | `packages/vm-bridge` | TS | `81a037a6e` | bad-idea | `packages/compiler-wasm` / direct targets | VM bridge was abstraction leak; replaced by direct compiler targets |
| 50 | `packages/voice` | TS | `333bfe280` | migrated | Hololand platform repo | "migrate platform packages to Hololand repo" |
| 51 | `packages/vrchat-export` | TS | `284b55757` | revive-candidate | — | VRChat compiler target absent from current roster. Revivable under multi-target thesis. |
| 52 | `packages/vscode-holoscript` | TS | `9c2d0bf8d` | retired | `packages/vscode-extension` | Major repo consolidation; `vscode-extension` now owns VS Code surface |

## Summary Statistics

| Disposition | Count | Packages |
|---|---|---|
| migrated | 21 | accessibility, babylon-adapter, creator-tools, gestures, gpu, haptics, ik, lod, multiplayer, navigation, network, pcg, physics-joints, playcanvas-adapter, portals, spatial-audio, state-sync, streaming, three-adapter, unity-adapter, voice |
| merged | 10 | academy, agent-setup, collab-server, compiler, compiler-utils, fs, parser, playground, semantic-2d, traits |
| superseded | 6 | agent-sdk, connectors, create-holoscript-app, snn-poc, store, uaa2-client |
| retired | 9 | holoscript-component, intellij, neovim, shader-preview-wgpu, spatial-engine, spatial-engine-wasm, test, unity-sdk, vscode-holoscript |
| unfinished | 4 | commerce, components, demo-apps, intelligence |
| bad-idea | 1 | vm-bridge |
| revive-candidate | 1 | vrchat-export |

**Total: 52**

## Verification Note

The canonical count of 52 removed package roots was derived by:
1. Computing all directories ever present under `packages/` from git add history.
2. Subtracting directories still present in `HEAD`.
3. Excluding two artifacts: `packages/.bench-logs` and `packages/README.md`.

A prior canary estimated 49; the 3 additional roots are `packages/demo-apps`, `packages/intelligence`, and `packages/unity-adapter`, which the canary filter omitted due to heuristic differences (zero package.json at time of deletion, or misclassified as sub-roots).
