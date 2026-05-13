# Capability Registry

> **Rule**: Every runtime, compiler, simulation, or service package in the monorepo MUST map to at least one active surface (paper program, product/API/CLI/MCP, tests) or an explicit retired-ledger entry.
> **Authority**: This doc.
> **Updates**: Append-only rows; never rewrite history. New packages add rows; retired packages move disposition to `retired` with ledger link.
> **Verification**: Run `node scripts/check-capability-registry.mjs` before any package-deletion commit.

## Why This Exists

The `c5887f4e7` incident (2026-04-01) deleted ~5,000 LOC of real Rust source under the framing "delete 11 ghost packages with zero source code." The commit was strategically correct for some packages (TS twin won for agent runtime) but the framing was wrong at the LOC layer, and the deletion happened because those packages had no canonical surface mapping making their value visible to the agent performing cleanup.

This registry makes capability value explicit and machine-checkable so that refactor scripts can flag unmapped packages before deletion.

## Active Surface Definitions

| Surface | Canonical Evidence | Where To Record |
|---|---|---|
| `paper` | Referenced in a paper program `.tex` or evidence memo | `research/paper-audit-matrix.md` row |
| `product` | Ships as API, CLI, MCP tool, Studio surface, or npm package | `docs/packages/<package>.md` + live deploy |
| `test` | Has non-trivial test suite in repo | `packages/<pkg>/src/__tests__/` or root `vitest.config.ts` pattern |
| `retired` | Explicitly documented in cross-language deletion ledger | `docs/cross-language-deletion-ledger.md` |

## Registry

### Language & Runtime Core

| Package | Paper | Product | Test | Ledger | Notes |
|---|---|---|---|---|---|
| `packages/core` | Paper 10 (HS Core), Paper 11 (HSPlus) | `npm @holoscript/core`, MCP `compile_to_*` | `packages/core/src/__tests__/` | — | AST, compilers, traits, identity, physics |
| `packages/runtime` | Paper 10 | `npm @holoscript/runtime` | `packages/runtime/src/__tests__/` | — | Scene execution runtime |
| `packages/engine` | Paper 8 (Unified Phys/Anim), Paper 9 (Verifiable Motion) | `npm @holoscript/engine` | `packages/engine/src/__tests__/` | — | Spatial engine, animation, ML motion-matching |
| `packages/std` | Paper 10 | `npm @holoscript/std` | `packages/std/src/__tests__/` | — | Standard library, fs primitives |
| `packages/holo-vm` | Paper 10 | `npm @holoscript/holo-vm` | `packages/holo-vm/src/__tests__/` | — | VM execution surface |
| `packages/compiler-wasm` | Paper 10 | `npm @holoscript/wasm` | `packages/compiler-wasm/src/__tests__/` | — | Rust WASM parser |

### Developer Tools

| Package | Paper | Product | Test | Ledger | Notes |
|---|---|---|---|---|---|
| `packages/cli` | Paper 10 | `npm @holoscript/cli`, `npx holoscript` | `packages/cli/src/__tests__/` | — | Command-line workflows |
| `packages/formatter` | Paper 11 | `npm @holoscript/formatter` | `packages/formatter/src/__tests__/` | — | Code formatting |
| `packages/linter` | Paper 11 | `npm @holoscript/linter` | `packages/linter/src/__tests__/` | — | Static analysis |
| `packages/lsp` | Paper 11 | `npm @holoscript/lsp`, VS Code + JetBrains | `packages/lsp/src/__tests__/` | — | Language Server Protocol |
| `packages/benchmark` | Paper 2, Paper 8 | `npm @holoscript/benchmark` | `packages/benchmark/src/__tests__/` | — | Internal perf benchmarking |
| `packages/comparative-benchmarks` | Paper 2, Paper 8 | `npm @holoscript/comparative-benchmarks` | `packages/comparative-benchmarks/src/__tests__/` | — | Cross-stack comparisons |
| `packages/tree-sitter-holoscript` | Paper 10 | Grammar distribution | `packages/tree-sitter-holoscript/__tests__/` | — | Tree-sitter grammar |

### Editors, Authoring, and Previews

| Package | Paper | Product | Test | Ledger | Notes |
|---|---|---|---|---|---|
| `packages/studio` | Paper 12 (HoloLand), UI Capstone | `holoscript.studio` web app | `packages/studio/src/__tests__/` | — | Visual IDE and authoring |
| `packages/studio-bridge` | Paper 12 | `npm @holoscript/studio-bridge` | `packages/studio-bridge/src/__tests__/` | — | Visual-to-AST sync layer |
| `packages/studio-plugin-sdk` | Paper 12 | `npm @holoscript/studio-plugin-sdk` | `packages/studio-plugin-sdk/src/__tests__/` | — | Plugin SDK for Studio |
| `packages/tauri-app` | Paper 12 | `@holoscript/studio-desktop` Tauri shell | `packages/tauri-app/src/__tests__/` | — | Native desktop shell |
| `packages/vscode-extension` | Paper 11 | VS Code marketplace | `packages/vscode-extension/src/__tests__/` | — | VS Code extension |
| `packages/visual` | Paper 12 | `npm @holoscript/visual` | `packages/visual/src/__tests__/` | — | Node-based visual programming |
| `packages/preview-component` | UI Capstone | `npm @holoscript/preview-component` | `packages/preview-component/src/__tests__/` | — | Embeddable React preview |
| `packages/video-tutorials` | UI Capstone | `npm @holoscript/video-tutorials` | `packages/video-tutorials/src/__tests__/` | — | Programmatic tutorial generation |
| `packages/visualizer-client` | Paper 3 (Spatial CRDT) | Internal preview/debug client | `packages/visualizer-client/src/__tests__/` | — | Spatial preview client |

### Web, SDKs, and Platform Delivery

| Package | Paper | Product | Test | Ledger | Notes |
|---|---|---|---|---|---|
| `packages/holoscript` | Paper 10 | `npm @holoscript/holoscript` distribution | `packages/holoscript/src/__tests__/` | — | Consolidated SDK distribution |
| `packages/holoscript-cdn` | Paper 10 | CDN browser build | `packages/holoscript-cdn/src/__tests__/` | — | CDN-oriented embedding |
| `packages/mcp-server` | Paper 1 (MCP Trust) | `mcp.holoscript.net` REST + MCP | `packages/mcp-server/src/__tests__/` | — | MCP tools for AI agents |
| `packages/r3f-renderer` | Paper 12 | `npm @holoscript/r3f-renderer` | `packages/r3f-renderer/src/__tests__/` | — | React Three Fiber renderer |

### AI, Agents, and Virtual Machines

| Package | Paper | Product | Test | Ledger | Notes |
|---|---|---|---|---|---|
| `packages/llm-provider` | Paper 2 (SNN), agent papers | `npm @holoscript/llm-provider` | `packages/llm-provider/src/__tests__/` | — | Unified model-provider interface |
| `packages/ai-validator` | Paper 1 | `npm @holoscript/ai-validator` | `packages/ai-validator/src/__tests__/` | — | AI output validation |
| `packages/agent-protocol` | Paper 1, agent papers | `npm @holoscript/agent-protocol` | `packages/agent-protocol/src/__tests__/` | — | uAA2++ lifecycle framework |
| `packages/uaal` | Paper 1 | `npm @holoscript/uaal` | `packages/uaal/src/__tests__/` | — | Universal Autonomous Agent Language VM |
| `packages/react-agent-sdk` | UI Capstone | `npm @hololand/react-agent-sdk` | `packages/react-agent-sdk/src/__tests__/` | — | React hooks for agent UIs |
| `packages/holoscript-agent` | Paper 1 | `npm @holoscript/agent` CLI | `packages/holoscript-agent/src/__tests__/` | — | Headless agent runtime |
| `packages/aibrittney` | Paper 1 | AI assistant runtime | `packages/aibrittney/src/__tests__/` | — | Brittney AI assistant/agent |
| `packages/framework` | Paper 10, Paper 11 | `npm @holoscript/framework` | `packages/framework/src/__tests__/` | — | Agent framework, learning, memory |

### Services, Data, and Collaboration

| Package | Paper | Product | Test | Ledger | Notes |
|---|---|---|---|---|---|
| `packages/auth` | Paper 1, Paper 4 | `npm @holoscript/auth` | `packages/auth/src/__tests__/` | — | Authentication and authorization |
| `packages/security-sandbox` | Paper 4 (Sandbox Contract) | `npm @holoscript/security-sandbox` | `packages/security-sandbox/src/__tests__/` | — | Safe execution for untrusted logic |
| `packages/partner-sdk` | Paper 1 | `npm @holoscript/partner-sdk` | `packages/partner-sdk/src/__tests__/` | — | Partner API, webhooks, analytics |
| `packages/registry` | Paper 10 | `npm @holoscript/registry` | `packages/registry/src/__tests__/` | — | Registry and workspace service |
| `packages/marketplace-api` | Paper 10 | `npm @holoscript/marketplace-api` | `packages/marketplace-api/src/__tests__/` | — | Marketplace backend |
| `packages/marketplace-web` | Paper 10 | `npm @holoscript/marketplace-web` | `packages/marketplace-web/src/__tests__/` | — | Marketplace web frontend |
| `packages/marketplace-agentkit` | Paper 10 | `npm @holoscript/marketplace-agentkit` | `packages/marketplace-agentkit/src/__tests__/` | — | Marketplace agent integration |
| `packages/graphql-api` | Paper 10 | `npm @holoscript/graphql-api` | `packages/graphql-api/src/__tests__/` | — | GraphQL service layer |
| `packages/adapter-postgres` | Paper 3 | `npm @holoscript/adapter-postgres` | `packages/adapter-postgres/src/__tests__/` | — | PostgreSQL adapter |
| `packages/crdt` | Paper 3 | `npm @holoscript/crdt` | `packages/crdt/src/__tests__/` | — | Distributed CRDT primitives |
| `packages/crdt-spatial` | Paper 3 | `npm @holoscript/crdt-spatial` | `packages/crdt-spatial/src/__tests__/` | — | Spatial CRDT synchronization |
| `packages/mvc-schema` | Paper 3 | `npm @holoscript/mvc-schema` | `packages/mvc-schema/src/__tests__/` | — | Context schema for agent state |
| `packages/absorb-service` | Paper 11 | Absorb ingestion service | `packages/absorb-service/src/__tests__/` | — | Repo absorption and indexing |
| `packages/mcp-server-adversarial` | Paper 1, Paper 4 | Adversarial MCP test server | `packages/mcp-server-adversarial/src/__tests__/` | — | Adversarial security testing |
| `packages/secrets-broker` | Paper 1 | Secrets management service | `packages/secrets-broker/src/__tests__/` | — | Secure credential brokering |

### Spatial, Animation, and Research

| Package | Paper | Product | Test | Ledger | Notes |
|---|---|---|---|---|---|
| `packages/spatial-index` | Paper 3 | `npm @holoscript/spatial-index` | `packages/spatial-index/src/__tests__/` | — | Spatial indexing and lookup |
| `packages/animation-presets` | Paper 8, Paper 9 | `npm @holoscript/animation-presets` | `packages/animation-presets/src/__tests__/` | — | Reusable animation bundles |
| `packages/snn-webgpu` | Paper 2 (SNN) | `npm @holoscript/snn-webgpu` | `packages/snn-webgpu/src/__tests__/` | — | WebGPU spiking neural compute |
| `packages/holomap` | Paper 12, I.008 | `npm @holoscript/holomap` | `packages/holomap/src/__tests__/` | — | 3D reconstruction from video |
| `packages/hologram-worker` | Paper 12, hologram pipeline | `npm @holoscript/hologram-worker` | `packages/hologram-worker/src/__tests__/` | — | 2D-to-3D hologram pipeline |

### Connectors

| Package | Paper | Product | Test | Ledger | Notes |
|---|---|---|---|---|---|
| `packages/connector-core` | Paper 10 | `npm @holoscript/connector-core` | `packages/connector-core/src/__tests__/` | — | Connector base primitives |
| `packages/connector-appstore` | Paper 10 | App Store connector | `packages/connector-appstore/src/__tests__/` | — | App Store integration |
| `packages/connector-github` | Paper 10 | GitHub connector | `packages/connector-github/src/__tests__/` | — | GitHub integration |
| `packages/connector-moltbook` | Paper 10 | Moltbook connector | `packages/connector-moltbook/src/__tests__/` | — | Moltbook engagement connector |
| `packages/connector-railway` | Paper 10 | Railway connector | `packages/connector-railway/src/__tests__/` | — | Railway deployment connector |
| `packages/connector-upstash` | Paper 10 | Upstash connector | `packages/connector-upstash/src/__tests__/` | — | Redis/Upstash connector |
| `packages/connector-vscode` | Paper 10 | VS Code connector | `packages/connector-vscode/src/__tests__/` | — | VS Code marketplace connector |

### Platform & Infrastructure

| Package | Paper | Product | Test | Ledger | Notes |
|---|---|---|---|---|---|
| `packages/hololand-platform` | Paper 12 (HoloLand) | HoloLand platform substrate | `packages/hololand-platform/src/__tests__/` | — | VR/AR world platform |
| `packages/platform` | Paper 12 | Platform primitives | `packages/platform/src/__tests__/` | — | Shared platform types |
| `packages/mesh` | Paper 3 | `npm @holoscript/mesh` | `packages/mesh/src/__tests__/` | — | HoloMesh network layer |
| `packages/core-types` | Paper 10 | `npm @holoscript/core-types` | `packages/core-types/src/__tests__/` | — | Shared type definitions |
| `packages/config` | Paper 10 | `npm @holoscript/config` | `packages/config/src/__tests__/` | — | Shared configuration |
| `packages/ui` | UI Capstone | `npm @holoscript/ui` | `packages/ui/src/__tests__/` | — | Shared UI components |

### Scaffolding & Distribution

| Package | Paper | Product | Test | Ledger | Notes |
|---|---|---|---|---|---|
| `packages/create-holoscript` | Paper 10 | `npm create-holoscript` | `packages/create-holoscript/__tests__/` | — | Project scaffold |
| `packages/holoscript-cli` | Paper 10 | CLI distribution | `packages/holoscript-cli/src/__tests__/` | — | CLI distribution entry |

### Support & Internal

| Package | Paper | Product | Test | Ledger | Notes |
|---|---|---|---|---|---|
| `packages/fixtures` | — | Internal test fixtures | `packages/fixtures/src/__tests__/` | — | Shared test fixtures |
| `packages/devtools` | — | Internal dev tooling | `packages/devtools/src/__tests__/` | — | Developer utilities |
| `packages/studio-ui-graph` | Paper 12 | Studio UI graph analysis | `packages/studio-ui-graph/src/__tests__/` | — | Studio UI dependency graph |
| `packages/trait-inference` | Paper 11 | Trait inference engine | `packages/trait-inference/src/__tests__/` | — | ML trait inference |
| `packages/python-bindings` | Paper 10 | Python HoloScript bindings | `packages/python-bindings/tests/` | — | Python package source and tests |

### Domain Plugins (Incubator)

| Package | Paper | Product | Test | Ledger | Notes |
|---|---|---|---|---|---|
| `packages/plugins` | Paper 10 (plugin thesis) | Domain plugin incubator | `packages/plugins/*/src/__tests__/` | — | Robotics, medical, scientific, AlphaFold, web-preview |

## Retired / Ledgered Packages

Packages below have been removed from the monorepo and are recorded in the canonical [Cross-Language Deletion Ledger](../cross-language-deletion-ledger.md). They do NOT need capability-registry rows because their disposition is explicitly ledgered.

| Package | Ledger Row | Disposition |
|---|---|---|
| `packages/spatial-engine` | 38 | retired |
| `packages/spatial-engine-wasm` | 39 | retired |
| `packages/holoscript-component` | 19 | retired |
| `packages/shader-preview-wgpu` | 35 | retired |
| `packages/neovim` | 26 | retired |
| `packages/test` | 43 | retired |
| `packages/unity-sdk` | 48 | retired |
| `packages/vscode-holoscript` | 52 | retired |
| `packages/intellij` | 22 | retired |
| `packages/vm-bridge` | 49 | bad-idea |
| `packages/intelligence` | 21 | unfinished |
| `packages/commerce` | 7 | unfinished |
| `packages/components` | 10 | unfinished |
| `packages/demo-apps` | 14 | unfinished |
| `packages/vrchat-export` | 51 | revive-candidate |
| `packages/snn-poc` | 36 | superseded |
| `packages/agent-sdk` | 3 | superseded |
| `packages/connectors` | 11 | superseded |
| `packages/create-holoscript-app` | 12 | superseded |
| `packages/store` | 41 | superseded |
| `packages/uaa2-client` | 46 | superseded |
| `packages/unity-adapter` | 47 | superseded |
| `packages/academy` | 1 | merged |
| `packages/agent-setup` | 4 | merged |
| `packages/collab-server` | 6 | merged |
| `packages/compiler` | 8 | merged |
| `packages/compiler-utils` | 9 | merged |
| `packages/fs` | 15 | merged |
| `packages/parser` | 28 | merged |
| `packages/playground` | 32 | merged |
| `packages/semantic-2d` | 34 | merged |
| `packages/traits` | 45 | merged |
| `packages/accessibility` | 2 | migrated |
| `packages/babylon-adapter` | 5 | migrated |
| `packages/creator-tools` | 13 | migrated |
| `packages/gestures` | 16 | migrated |
| `packages/gpu` | 17 | migrated |
| `packages/haptics` | 18 | migrated |
| `packages/ik` | 20 | migrated |
| `packages/lod` | 23 | migrated |
| `packages/multiplayer` | 24 | migrated |
| `packages/navigation` | 25 | migrated |
| `packages/network` | 27 | migrated |
| `packages/pcg` | 29 | migrated |
| `packages/physics-joints` | 30 | migrated |
| `packages/playcanvas-adapter` | 31 | migrated |
| `packages/portals` | 33 | migrated |
| `packages/spatial-audio` | 37 | migrated |
| `packages/state-sync` | 40 | migrated |
| `packages/streaming` | 42 | migrated |
| `packages/three-adapter` | 44 | migrated |
| `packages/voice` | 50 | migrated |

## Verification

Run the check manually:

```bash
node scripts/check-capability-registry.mjs
```

Run as a pre-commit gate (automatic when packages are deleted):

```bash
# The pre-commit hook runs this automatically when git diff shows deleted
# package directories. See .git/hooks/pre-commit Gate 3.9.
```

## Rule Summary

1. **No package may be deleted** from `packages/` without either:
   - A capability-registry row mapping it to an active surface (paper, product, test), OR
   - A cross-language-deletion-ledger entry with explicit disposition.
2. **Deletion commits must name the ledger row** or registry row they rely on.
3. **"Zero source code" claims** on deletion commits require cross-language LOC audit (`git diff --stat | grep -E '\.(rs|py|holo|toml|cs|cpp|wgsl)\b'`).
4. **Revive-candidate packages** (e.g., `vrchat-export`) keep their ledger row but MUST be evaluated for revival before any new package with overlapping purpose is created.

## Changelog

- **2026-05-12** — Created. Maps 69 active package roots + 52 retired ledger entries. Closes canary `task_1778613011699_quhf`.
