# HoloLand TS-Only Package Classification

> **Audit date**: 2026-05-07
> **Auditor**: claudecode-claude-x402
> **Source task**: task_1778186605462_qikv
> **Scope**: All packages and examples with TypeScript source and zero `.holo`/`.hs`/`.hsplus` files

---

## Executive Summary

| Category | Packages | Examples | Total |
|----------|----------|----------|-------|
| **ts-bridge-only** | 43 | 2 | 45 |
| **needs-holoscript-source** | 14 | 6 | 20 |
| **archive** | 4 | 0 | 4 |
| **Total audited** | 61 | 8 | 69 |

**Note**: The task description referenced "39 packages/examples in covered domains." The ground-truth scan finds **69 TS-only items** (61 packages + 8 examples). The 39 figure may have referred to a subset scoped to a prior audit slice. This document classifies the **complete surface** so nothing is missed.

---

## 1. TS-Bridge-Only (45 items)

These are TypeScript-only **by design**. They are connectors, adapters, CLI tooling, dev infrastructure, wrappers around external services, or pure runtime bridges. They do not represent domain concepts that would be authored in `.holo` source.

### Infrastructure / Connectors (17)

| Package | Rationale |
|---------|-----------|
| `absorb-service` | Codebase intelligence daemon — external service integration |
| `adapter-postgres` | PostgreSQL adapter — bridge to external DB |
| `agent-protocol` | uAA2++ protocol spec (Type-only interfaces) — spec layer, not scene source |
| `ai-validator` | AI hallucination guard layer — runtime safety |
| `auth` | Shared JWT library — auth infrastructure |
| `connector-appstore` | App Store Connect / Google Play bridge |
| `connector-core` | Studio Integration Hub abstract interfaces |
| `connector-github` | GitHub MCP connector |
| `connector-moltbook` | Moltbook social platform connector |
| `connector-railway` | Railway MCP connector |
| `connector-upstash` | Upstash Redis / Vector / QStash connector |
| `connector-vscode` | VS Code extension connector |
| `graphql-api` | GraphQL API layer — server protocol |
| `llm-provider` | Unified LLM provider SDK — external API bridge |
| `marketplace-agentkit` | Coinbase AgentKit integration — external bridge |
| `marketplace-api` | Trait Marketplace API — server layer |
| `marketplace-web` | Marketplace Web UI — consumer frontend |

### Dev Tooling / CLI (8)

| Package | Rationale |
|---------|-----------|
| `cli` | Command-line interface — user tooling, not scene source |
| `comparative-benchmarks` | Performance benchmarks vs Unity/glTF — test harness |
| `compiler-wasm` | Rust→WASM parser — compiler infrastructure |
| `config` | Centralized platform config — env validation |
| `create-holoscript` | `npm create holoscript` scaffolding — generator |
| `devtools` | Developer tools — inspector/debugger |
| `holoscript-cdn` | Browser CDN distribution — deployment infra |
| `vscode-extension` | VS Code language support — editor tooling |

### Agent / Runtime Infra (10)

| Package | Rationale |
|---------|-----------|
| `aibrittney` | Interactive CLI agent — Ollama-backed assistant |
| `holoscript-agent` | Headless agent runtime — daemon process |
| `holo-vm` | HOLO VM bytecode execution — runtime engine |
| `security-sandbox` | VM-based sandbox — execution guard |
| `snn-webgpu` | WebGPU spiking neural networks — compute substrate |
| `std` | HoloScript Standard Library — core utilities |
| `studio-bridge` | Visual-to-AST bridge — editor infrastructure |
| `studio-plugin-sdk` | Studio plugin SDK — extensibility |
| `studio-ui-graph` | TSX→.holo emitter — reverse bridge |
| `uaal` | uAA2++ bytecode VM — protocol runtime |

### Re-export / Wrapper (3)

| Package | Rationale |
|---------|-----------|
| `core-types` | Pure type definitions — lightweight mirror of `@holoscript/core` |
| `partner-sdk` | Partner integration SDK — external bridge |
| `registry` | Package registry API — server layer |

### Examples — TS Bridge (2)

| Example | Rationale |
|---------|-----------|
| `circuit-breaker` | Single-file circuit-breaker demo — infrastructure pattern |
| `demos` | Generic demo harness — not domain scenes |

---

## 2. Needs HoloScript Source (20 items)

These packages/examples define **domain concepts** (rendering, spatial, accessibility, animation, UI, world state) that **should** be expressible in `.holo`/`.hs` source. They are gaps in the "HoloScript-eats-everything" mandate.

### Rendering & Visual (6)

| Package | Classification | Gap Description |
|---------|---------------|-----------------|
| `r3f-renderer` | **needs-holoscript-source** | R3F renderer components are scene-definition surface. Should have `.holo` scene descriptors for common render pipelines. |
| `engine` | **needs-holoscript-source** | 677 TS files, 20+ subsystems. Core engine has zero `.holo` source. Domain concepts (ECS, physics config, animation graphs) should be declarative. |
| `runtime` | **needs-holoscript-source** | Browser runtime — `BrowserRuntime`, `PhysicsWorld`, `TraitSystem` are all runtime interpretations of `.holo` source. The runtime itself should expose `.holo` configuration schemas. |
| `visual` | **needs-holoscript-source** | Node-based visual programming interface. Nodes and edges are exactly `.holo` graph structures. |
| `visualizer-client` | **needs-holoscript-source** | Internal Three.js/R3F visualizer. Debug/preview scenes should be `.holo` composable. |
| `preview-component` | **needs-holoscript-source** | Standalone React component for embedding 3D previews. Should consume `.holo` directly, not TS props. |

### Spatial & World (4)

| Package | Classification | Gap Description |
|---------|---------------|-----------------|
| `spatial-index` | **needs-holoscript-source** | R-Tree spatial index for geospatial anchors. Anchor definitions, bounds, and persistence config should be `.holo`. |
| `crdt-spatial` | **needs-holoscript-source** | Spatial transform synchronization. Strategy C hybrid rotation is a protocol — should have `.hsplus` brain composition. |
| `hololand-platform` | **needs-holoscript-source** | Hololand VR Platform Services (Affective Memory, State, Byzantine consensus). World state schemas are core HoloLand domain. |
| `holomap` | **needs-holoscript-source** | HoloMap operator UX. Ingest profiles and scene-source probes are `.holo`-shaped data. |

### Interaction & Animation (3)

| Package | Classification | Gap Description |
|---------|---------------|-----------------|
| `animation-presets` | **needs-holoscript-source** | Pre-configured `@animated` trait parameter sets with Mixamo clip mapping. Presets are `.holo` template data. |
| `ui` | **needs-holoscript-source** | Shared HoloScript Native UI Components. UI layout and component trees are `.holo` graph structures. |
| `hologram-worker` | **needs-holoscript-source** | Render worker pipeline. ONNX depth, quilt, parallax are media pipelines — should be `.holo` configurable. |

### Examples — Domain Scenes (6)

| Example | Classification | Gap Description |
|---------|---------------|-----------------|
| `advanced-earthquake-demo` | **needs-holoscript-source** | Seismic simulation demo. Domain: physics + geology. Should be `.holo` with `@physics`, `@seismic` traits. |
| `avalanche-demo` | **needs-holoscript-source** | Snow/avalanche physics demo. Should be `.holo` with `@granular_material`, `@fluid_simulation`. |
| `earthquake-demo` | **needs-holoscript-source** | Seismic demo (simpler). Same gap as advanced-earthquake-demo. |
| `erosion-demo` | **needs-holoscript-source** | Terrain erosion demo. Domain: geology + procedural. Should be `.holo` with `@erosion`, `@terrain` traits. |
| `components` | **needs-holoscript-source** | Generic component examples. Should be `.holo` component library. |

### Core — Partial Gap (1)

| Package | Classification | Gap Description |
|---------|---------------|-----------------|
| `core` | **needs-holoscript-source** (partial) | 4149 TS files. The core has `.holo` parser/compiler but **zero `.holo` self-description**. The trait registry, compiler targets, and AST nodes themselves should be `.hsplus`-described for metacircular completeness. |

---

## 3. Archive (4 items)

| Package | Rationale | Suggested Action |
|---------|-----------|----------------|
| `holoscript` | **DEPRECATED** — thin re-export shim. `package.json` explicitly says "Use `@holoscript/core` directly. Will be removed in a future major release." | Archive to `packages/archive/holoscript-compat/` |
| `plugins` | **EMPTY CONTAINER** — 298 TS files but zero `.holo`. The actual plugins are in `packages/plugins/<name>/`. The top-level `plugins` package appears to be a barrel or monorepo root with no standalone identity. | Verify if barrel-only; if so, merge into `packages/core` or archive |
| `mesh` | **AMBIGUOUS** — 165 TS files. Description in package.json is missing (empty). Overlaps with `packages/core/src/mesh/` and `packages/hololand-platform/src/collaboration/`. | Needs owner decision: merge into `core`, split, or archive |
| `platform` | **AMBIGUOUS** — 82 TS files. "Enterprise platform layer (security, web3, identity, registry)." Overlaps with `packages/hololand-platform/`. | Needs owner decision: merge into `hololand-platform`, or archive if supplanted |

---

## 4. Prioritized Follow-Up Tasks

Per task directive, prioritize these domains for HoloScript source creation.

### P1 — AR, Accessibility, Navigation (HoloLand UX Critical)

| Target | Current State | Action |
|--------|--------------|--------|
| `examples/ar` | Has `.holo` files (1) but TS helper files (if any) are unpaired | Audit `examples/ar/` for TS-only helpers; pair or convert |
| `examples/ar-foundation` | Has 7 `.holo` files | Verify all TS helpers have `.holo` counterparts |
| `examples/accessibility` | Has 1 `.holo` file | Expand to full WCAG scene library in `.holo` |
| `examples/domain-starters/navigation` | Has 1 `.holo` file | Build navigation trait suite: `@waypoint`, `@pathfinding`, `@spatial_nav` |
| `packages/ui` | 7 TS files, zero `.holo` | Create `.holo` UI component library |

### P2 — Gestures, Voice, Animation (Interaction Layer)

| Target | Current State | Action |
|--------|--------------|--------|
| `examples/affordances` | Has 2 `.holo` files | Add gesture trait suite: `@gesture_recognizer`, `@hand_tracking`, `@grabbable` |
| `packages/animation-presets` | 14 TS files, zero `.holo` | Convert Mixamo preset registry to `.holo` templates |
| `examples/audio` | Has `.holo` files | Add voice trait: `@voice_input`, `@spatial_voice` |
| `packages/hologram-worker` | 12 TS files, zero `.holo` | Pipeline config as `.holo`: depth, quilt, parallax stages |

### P3 — Engine, Runtime, Renderer (Core Stack)

| Target | Current State | Action |
|--------|--------------|--------|
| `packages/engine` | 677 TS files, zero `.holo` | ECS system definitions, physics config, animation graphs as `.holo` |
| `packages/runtime` | 39 TS files, zero `.holo` | Runtime environment schemas as `.holo` |
| `packages/r3f-renderer` | 26 TS files, zero `.holo` | Render pipeline descriptors as `.holo` |
| `packages/crdt-spatial` | 46 TS files, zero `.holo` | Strategy C protocol as `.hsplus` brain composition |

---

## 5. Verification Commands

```bash
# Reproduce this audit
cd /c/Users/Josep/Documents/GitHub/HoloScript

# Count TS-only packages
for dir in packages/*/; do
  has_ts=$(find "$dir" -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" | head -1)
  has_holo=$(find "$dir" -maxdepth 3 \( -name "*.holo" -o -name "*.hs" -o -name "*.hsplus" \) | head -1)
  [ -n "$has_ts" ] && [ -z "$has_holo" ] && echo "$(basename "$dir")"
done | wc -l

# Count TS-only examples
for dir in examples/*/; do
  has_ts=$(find "$dir" -maxdepth 3 -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" | head -1)
  has_holo=$(find "$dir" -maxdepth 3 \( -name "*.holo" -o -name "*.hs" -o -name "*.hsplus" \) | head -1)
  [ -n "$has_ts" ] && [ -z "$has_holo" ] && echo "$(basename "$dir")"
done | wc -l
```

---

## Appendix: Full Inventory

### TS-Only Packages (61)

| # | Package | TS Files | Classification |
|---|---------|----------|----------------|
| 1 | absorb-service | 140 | ts-bridge-only |
| 2 | adapter-postgres | 6 | ts-bridge-only |
| 3 | agent-protocol | 25 | ts-bridge-only |
| 4 | aibrittney | 11 | ts-bridge-only |
| 5 | ai-validator | 6 | ts-bridge-only |
| 6 | animation-presets | 14 | needs-holoscript-source |
| 7 | auth | 4 | ts-bridge-only |
| 8 | cli | 111 | ts-bridge-only |
| 9 | comparative-benchmarks | 13 | ts-bridge-only |
| 10 | compiler-wasm | 7 | ts-bridge-only |
| 11 | config | 7 | ts-bridge-only |
| 12 | connector-appstore | 13 | ts-bridge-only |
| 13 | connector-core | 12 | ts-bridge-only |
| 14 | connector-github | 6 | ts-bridge-only |
| 15 | connector-moltbook | 7 | ts-bridge-only |
| 16 | connector-railway | 7 | ts-bridge-only |
| 17 | connector-upstash | 13 | ts-bridge-only |
| 18 | connector-vscode | 6 | ts-bridge-only |
| 19 | core | 4149 | needs-holoscript-source (partial) |
| 20 | core-types | 11 | ts-bridge-only |
| 21 | crdt | 18 | ts-bridge-only |
| 22 | crdt-spatial | 46 | needs-holoscript-source |
| 23 | create-holoscript | 9 | ts-bridge-only |
| 24 | devtools | 30 | ts-bridge-only |
| 25 | engine | 677 | needs-holoscript-source |
| 26 | framework | 408 | ts-bridge-only |
| 27 | graphql-api | 18 | ts-bridge-only |
| 28 | hologram-worker | 12 | needs-holoscript-source |
| 29 | hololand-platform | 14 | needs-holoscript-source |
| 30 | holomap | 10 | needs-holoscript-source |
| 31 | holoscript | 12 | archive |
| 32 | holoscript-agent | 34 | ts-bridge-only |
| 33 | holoscript-cdn | 9 | ts-bridge-only |
| 34 | holo-vm | 7 | ts-bridge-only |
| 35 | llm-provider | 45 | ts-bridge-only |
| 36 | marketplace-agentkit | 6 | ts-bridge-only |
| 37 | marketplace-api | 81 | ts-bridge-only |
| 38 | marketplace-web | 10 | ts-bridge-only |
| 39 | mesh | 165 | archive |
| 40 | mvc-schema | 18 | ts-bridge-only |
| 41 | partner-sdk | 24 | ts-bridge-only |
| 42 | platform | 82 | archive |
| 43 | plugins | 298 | archive |
| 44 | preview-component | 10 | needs-holoscript-source |
| 45 | r3f-renderer | 26 | needs-holoscript-source |
| 46 | react-agent-sdk | 18 | ts-bridge-only |
| 47 | registry | 21 | ts-bridge-only |
| 48 | runtime | 39 | needs-holoscript-source |
| 49 | security-sandbox | 9 | ts-bridge-only |
| 50 | snn-webgpu | 96 | ts-bridge-only |
| 51 | spatial-index | 10 | needs-holoscript-source |
| 52 | std | 48 | ts-bridge-only |
| 53 | studio-bridge | 11 | ts-bridge-only |
| 54 | studio-plugin-sdk | 30 | ts-bridge-only |
| 55 | studio-ui-graph | 8 | ts-bridge-only |
| 56 | uaal | 11 | ts-bridge-only |
| 57 | ui | 7 | needs-holoscript-source |
| 58 | video-tutorials | 23 | ts-bridge-only |
| 59 | visual | 11 | needs-holoscript-source |
| 60 | visualizer-client | 12 | needs-holoscript-source |
| 61 | vscode-extension | 28 | ts-bridge-only |

### TS-Only Examples (8)

| # | Example | TS Files | Classification |
|---|---------|----------|----------------|
| 1 | advanced-earthquake-demo | 4 | needs-holoscript-source |
| 2 | avalanche-demo | 12 | needs-holoscript-source |
| 3 | circuit-breaker | 1 | ts-bridge-only |
| 4 | components | 2 | needs-holoscript-source |
| 5 | demos | 6 | ts-bridge-only |
| 6 | earthquake-demo | 12 | needs-holoscript-source |
| 7 | erosion-demo | 15 | needs-holoscript-source |

---

*End of classification. Follow-up tasks for P1–P3 gaps should be filed on the HoloMesh board per F.025 (file-as-task).*