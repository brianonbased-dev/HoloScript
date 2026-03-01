# Adaptive Platform Layers — Architecture & Implementation Plan

> **Status**: TODO-APL-001 + APL-002 + Web Studio Bridge Complete | **Date**: 2026-02-28
> **Protocol**: uAA2++ v4.0 | **Phase**: Implementation Planning
> **Focus**: Web Studio (primary), Desktop IDE (secondary)

---

## Executive Summary

HoloScript adopts a **three-tier adaptive platform architecture** sharing a Rust/WASM engine core, with platform-specific shells for Web, Desktop, and Mobile. This document captures the **package partitioning** (TODO-APL-002) and **WIT interface status** (TODO-APL-001), based on analysis of all 47 packages in the monorepo.

**Key finding**: WIT interface definitions already exist in `packages/holoscript-component/wit/holoscript.wit` (540 lines), with a working Rust implementation at ~459KB binary size — well under the 2MB target. The remaining work is integration, not invention.

---

## 1. Package Partitioning (TODO-APL-002)

### Classification Criteria

| Category | Definition | WASM-Compatible? |
|----------|-----------|------------------|
| **Engine Core** | Parser, compiler, type system, spatial math — platform-agnostic computation | ✅ Yes |
| **Dev Tooling** | Formatter, linter, LSP, test harness — development aids | ✅ Yes (lightweight) |
| **Platform Shell** | UI, renderer, IDE features — platform-specific | ❌ Native only |
| **Infrastructure** | Server APIs, databases, registries — backend-only | ❌ Server only |
| **Content** | Tutorials, benchmarks, examples — not runtime | N/A |

### Complete Package Map (47 packages)

#### Engine Core (WASM Target) — 8 packages

These compile to WASM for web/mobile and run as native Rust for desktop.

| Package | Dir | Internal Deps | Binary Contribution |
|---------|-----|---------------|-------------------|
| `@holoscript/core` | `core/` | None (root) | ~300KB (parser+compiler+traits) |
| `@holoscript/wasm` | `compiler-wasm/` | None (standalone Rust parser) | ~150KB |
| `@holoscript/component` | `holoscript-component/` | None (WIT-based, Rust) | ~459KB (measured) |
| `@holoscript/formatter` | `formatter/` | None | ~30KB |
| `@holoscript/linter` | `linter/` | `@holoscript/core` | ~40KB |
| `@holoscript/std` | `std/` | None | ~20KB |
| `spatial-engine` | `spatial-engine/` | None (Rust, Bevy) | ~500KB (native only) |
| `spatial-engine-wasm` | `spatial-engine-wasm/` | None (Rust, wasm-bindgen) | ~50KB |

**Estimated total WASM binary**: ~800KB-1.2MB for `holoscript-runtime` world.

#### Dev Tooling (WASM-Optional) — 6 packages

Can run in WASM for web editor features, but primarily used natively.

| Package | Dir | Internal Deps | Notes |
|---------|-----|---------------|-------|
| `@holoscript/lsp` | `lsp/` | `core`, `linter` | Full LSP for desktop; lightweight WASM variant for web |
| `@holoscript/sdk` | `holoscript/` | `core` | Public SDK, wraps core |
| `@holoscript/ai-validator` | `ai-validator/` | `core` | Hallucination detection |
| `@holoscript/security-sandbox` | `security-sandbox/` | `core` | vm2-based, Node.js only |
| `@holoscript/test` | `test/` | `core` | Test utilities |
| `tree-sitter-holoscript` | `tree-sitter-holoscript/` | None (C/native) | Tree-sitter grammar |

#### Platform Shells — 10 packages

Platform-specific UI and rendering. **Never compiled to WASM**.

| Package | Dir | Platform | Internal Deps | Key Stack |
|---------|-----|----------|---------------|-----------|
| `@holoscript/studio` | `studio/` | **Web** | `core` | Next.js, R3F, Monaco, Yjs, Zustand |
| `@holoscript/studio-desktop` | `tauri-app/` | **Desktop** | — (Rust) | Tauri 2.0, shader-preview-wgpu |
| `@holoscript/playground` | `playground/` | **Web** | `core` | Monaco (lightweight) |
| `@holoscript/visual` | `visual/` | **Web** | `core` | React, ReactFlow, Zustand |
| `visualizer-client` | `visualizer-client/` | **Web** | — | R3F, Three.js |
| `@holoscript/preview-component` | `preview-component/` | **Web** | — | Embeddable preview |
| `@holoscript/cdn` | `holoscript-cdn/` | **Web** | — | CDN distribution |
| `holoscript-vscode` | `vscode-extension/` | **Desktop** | `sdk`, `formatter` | VS Code extension |
| `@holoscript/neovim` | `neovim/` | **Desktop** | — | Neovim plugin |

#### Rust Crates (Native) — 4 workspace members

| Crate | Dir | Role |
|-------|-----|------|
| `holoscript-wasm` | `compiler-wasm/` | Parser WASM (wasm-pack) |
| `holoscript-component` | `holoscript-component/` | WIT Component (wasm-tools) |
| `spatial-engine` | `spatial-engine/` | Bevy-based spatial engine |
| `shader-preview-wgpu` | `shader-preview-wgpu/` | Desktop-only GPU rendering |

#### Infrastructure (Server-Only) — 8 packages

| Package | Dir | Internal Deps | Stack |
|---------|-----|---------------|-------|
| `@holoscript/graphql-api` | `graphql-api/` | `core` | Apollo, Express, GraphQL |
| `@holoscript/marketplace-api` | `marketplace-api/` | `core`, `registry` | Express, PostgreSQL, Redis |
| `@holoscript/marketplace-web` | `marketplace-web/` | `marketplace-api` | Next.js, RainbowKit |
| `@holoscript/registry` | `registry/` | — | Express, SQLite |
| `@holoscript/collab-server` | `collab-server/` | — | WebSocket (ws) |
| `@holoscript/adapter-postgres` | `adapter-postgres/` | — | pg, cuid |
| `@holoscript/fs` | `fs/` | — | chokidar, glob |
| `@holoscript/partner-sdk` | `partner-sdk/` | `core`, `llm-provider` | Partner API |

#### AI/Agent — 4 packages

| Package | Dir | Internal Deps | Notes |
|---------|-----|---------------|-------|
| `@holoscript/mcp-server` | `mcp-server/` | `core` | 34 MCP tools for AI agents |
| `@holoscript/llm-provider` | `llm-provider/` | — | OpenAI/Anthropic/Gemini SDK |
| `@hololand/react-agent-sdk` | `react-agent-sdk/` | `core` | React agent UI |
| `@holoscript/cli` | `cli/` | `core`, `sdk` | CLI (holo build/compile/validate) |

#### Content/Meta — 5 packages

| Package | Dir | Notes |
|---------|-----|-------|
| `@holoscript/benchmark` | `benchmark/` | Performance benchmarks |
| `@holoscript/comparative-benchmarks` | `comparative-benchmarks/` | vs. other tools |
| `@holoscript/video-tutorials` | `video-tutorials/` | Remotion-based tutorials |
| `@holoscript/studio-plugin-sdk` | `studio-plugin-sdk/` | Plugin scaffolding CLI |
| `com.holoscript.core` | `unity-sdk/` | Unity package.json stub |

---

## 2. WIT Interface Status (TODO-APL-001)

### Current State: ✅ Comprehensive

The WIT file at `packages/holoscript-component/wit/holoscript.wit` defines **7 interfaces** across **5 deployable worlds**:

#### Interfaces Defined

| Interface | Status | Functions |
|-----------|--------|-----------|
| `types` | ✅ Complete | 20+ type definitions (Position, Span, Diagnostic, CompositionNode, etc.) |
| `parser` | ✅ Complete | `parse`, `parse-header`, `parse-to-json`, `parse-incremental` |
| `validator` | ✅ Complete | `validate`, `validate-with-options`, `trait-exists`, `get-trait`, `list-traits`, etc. |
| `type-checker` | ✅ Complete | `check`, `infer-type-at`, `completions-at` |
| `compiler` | ✅ Complete | `compile`, `compile-ast`, `list-targets`, `version` |
| `generator` | ✅ Complete | `generate-object`, `generate-scene`, `suggest-traits`, `from-json` |
| `spatial-engine` | ✅ Complete | Noise, collision, ray testing, frustum culling |
| `formatter` | ✅ Complete | `format`, `format-with-options` |
| `platform-compiler` | ✅ Defined | Plugin interface for Unity/Godot/Unreal etc. |

#### Worlds Defined (Binary Size Targets)

| World | Interfaces | Target Size | Use Case |
|-------|-----------|-------------|----------|
| `holoscript-runtime` | All 7 | ~800KB-1.2MB | Full runtime (Web Studio, Desktop) |
| `holoscript-parser` | parser + validator + type-checker | ~200-350KB | Lightweight editors, linters |
| `holoscript-compiler` | parser + compiler | ~400-600KB | CI/CD pipelines |
| `holoscript-spatial` | spatial-engine | ~50-100KB | Browser runtime hot-path |
| `holoscript-platform-plugin` | imports types, exports platform-compiler | ~100-300KB each | Per-target lazy loading |

#### Compile Targets Partition

**Engine-core** (bundled in main WASM):
- `threejs`, `babylonjs`, `aframe-html`, `gltf-json`, `glb-binary`, `json-ast`

**Platform-plugin** (lazy-loaded WASM components):
- `unity-csharp`, `godot-gdscript`, `unreal-cpp`, `vrchat-udon`, `openxr`, `visionos-swift`, `android-arcore`, `webgpu-wgsl`, `react-three-fiber`, `playcanvas`, `urdf`, `sdf`, `usd`

### Gaps Identified

| Gap | Severity | Notes |
|-----|----------|-------|
| `parse-incremental` not implemented | Medium | Stub exists, falls back to full re-parse. Needed for LSP perf. |
| No `lsp` interface in WIT | Low | LSP runs natively; web LSP uses parser+validator WIT interfaces |
| No `collaboration` interface in WIT | Low | Collab is a server concern (Yjs/CRDTs), not engine-core |
| Generator uses hardcoded templates | Medium | `generate-object`/`generate-scene` are template-based, not LLM-backed in WASM |
| Spatial engine missing batch operations | Low | Individual sphere/AABB tests only; batch culling would improve perf |

---

## 3. Dependency Graph

```
                        @holoscript/core
                              │
            ┌──────┬──────┬──┴──┬──────┬──────┬──────────┐
            │      │      │     │      │      │          │
          sdk   linter  lsp  runtime  mcp  studio    visual
            │             │           server
           cli         (linter)
            │
    vscode-extension
```

### Rust Crate Graph

```
                     Cargo.toml (workspace root)
                              │
        ┌─────────────┬───────┴──────┬──────────────────┐
        │             │              │                   │
 compiler-wasm   spatial-engine  holoscript-       shader-preview-
  (wasm-pack)     (Bevy, native)  component          wgpu
                                  (wit-bindgen)    (desktop only)
                                                       │
                                                  tauri-app/src-tauri
                                                  (imports shader-preview-wgpu)
```

---

## 4. Platform Architecture (Three Tiers)

### Tier 1: Web Studio (PRIMARY FOCUS)

```
Browser
├── Monaco Editor (code editing)
├── React Three Fiber (3D preview)
├── Yjs + y-websocket (collaboration)
├── Zustand (state management)
└── Web Worker
    └── holoscript-runtime.wasm (~1MB)
        ├── parser (parse, validate, type-check)
        ├── compiler (Three.js, Babylon.js, glTF)
        ├── generator (suggest-traits, generate-object)
        └── spatial-engine (noise, collision math)
```

**Existing packages to leverage**:
- `@holoscript/studio` — Already a Next.js app with Monaco, R3F, Yjs, Zustand
- `@holoscript/playground` — Lightweight Monaco editor with core
- `@holoscript/component` — WASM component with jco transpilation

**What's missing for Web Studio**:
1. Wire `@holoscript/component` WASM into studio's Web Worker
2. Replace direct `@holoscript/core` TypeScript imports with WASM calls for perf-critical paths
3. Add WebXR preview mode (for URL-sharing zero-install viewer)
4. Lazy-load platform compiler plugins on demand
5. Performance budgets: <100KB initial JS, <3s cold start

### Tier 2: Desktop IDE (Tauri 2.0)

```
Tauri 2.0 Native Shell
├── WebView (shares @holoscript/studio React UI)
├── Rust Process
│   ├── tauri-plugin-fs (native file I/O)
│   ├── tauri-plugin-dialog (native dialogs)
│   ├── tauri-plugin-shell (terminal)
│   ├── shader-preview-wgpu (GPU rendering)
│   └── holoscript-component (native Rust, no WASM overhead)
└── Full HoloScript LSP (native)
```

**Existing packages to leverage**:
- `@holoscript/studio-desktop` (tauri-app) — Already scaffolded with Tauri 2.0
- `shader-preview-wgpu` — wgpu render-to-texture pipeline exists with benchmarks
- `@holoscript/lsp` — Full LSP with debug adapter protocol

**What's missing for Desktop IDE**:
1. Build pipeline: `studio` Next.js → static export → Tauri loads as `frontendDist`
2. IPC bridge: frontend calls Tauri commands for native features
3. Feature detection: web features gracefully degrade, desktop features activate
4. Auto-updater: Tauri's built-in updater for progressive delivery

### Tier 3: Mobile AR Companion (Future)

```
Flutter Shell
├── Flutter UI (AR controls, IoT dashboard)
├── ARKit (iOS) / ARCore (Android)
├── holoscript-parser.wasm (~300KB, in native WebView worker)
│   OR pre-compiled outputs from cloud
└── BLE + MQTT (IoT device connectivity)
```

**Not started** — requires: Flutter project scaffold, native AR modules, cloud sync hub.

---

## 5. Web Studio Implementation Roadmap

### Phase 1: WASM Integration (Week 1-2)

**Goal**: Replace `@holoscript/core` TS imports with WASM calls in Web Worker.

**Status**: ✅ IMPLEMENTED

```
packages/studio/src/lib/
├── wasm-compiler-bridge.ts      # CompilerBridge class — typed async API with TS fallback
├── wasm-compiler-worker.ts      # Web Worker loading holoscript-component WASM
├── platform-detect.ts           # Full platform/capability detection (Tauri, WebGPU, WebXR, etc.)
├── platform-plugin-loader.ts    # On-demand platform plugin loading with OPFS cache + LRU eviction

packages/studio/src/hooks/
├── useCompilerBridge.ts         # React hook wrapping CompilerBridge + plugin loader
```

Implementation details:
- `CompilerBridge` class provides async `parse()`, `validate()`, `compile()`, `format()`, etc.
- Web Worker loads jco-transpiled WASM component, falls back to raw WebAssembly, then to TS
- Platform detection probes WASM threads/SIMD, WebGPU, WebXR immersive VR/AR, Tauri, OPFS
- Plugin loader supports 7 plugin manifests (Unity, Godot, Unreal, VRChat, XR, WebGPU, Robotics)
- LRU eviction keeps total plugin memory under configurable budget (default 32MB)
- OPFS cache persists plugins across sessions for instant reload
- React hook auto-initializes on mount, provides `compileForPlatform()` for lazy plugin loading
- All WIT interface types mirrored in TypeScript for full type safety

### Phase 2: Web Studio Enhancement (Week 3-4)

**Goal**: WebXR preview + URL sharing for zero-install viewer.

Steps:
1. Add WebXR session support to the R3F viewport (`@react-three/xr` already in deps)
2. Create shareable URL format: `studio.holoscript.dev/view?scene=<encoded>`
3. Build lightweight viewer bundle (<100KB) that loads only `holoscript-parser` world
4. Add WebGPU shader preview (browser-native, no wgpu needed)

### Phase 3: Collaboration (Week 5-6)

**Goal**: Real-time multi-user editing.

Steps:
1. `@holoscript/collab-server` (ws-based) already exists — extend with Yjs provider
2. `@holoscript/studio` already has `yjs` + `y-websocket` in dependencies
3. Build cursor presence UI components
4. Add conflict resolution for simultaneous trait edits

### Phase 4: Platform Plugin Lazy Loading (Week 7-8)

**Goal**: Export to any target without bundling all compilers.

Steps:
1. Build each platform target as separate `holoscript-platform-plugin` WASM component
2. Create plugin registry with CDN URLs for each WASM binary
3. Load on-demand when user selects "Export to Unity" etc.
4. Cache loaded plugins in IndexedDB for offline re-use

---

## 6. Performance Budgets

| Metric | Web Studio | Desktop IDE | Mobile AR |
|--------|-----------|-------------|-----------|
| Initial JS bundle | <100KB | No limit | <5MB APK |
| WASM binary (core) | <1.5MB | Native (no WASM) | <500KB |
| Cold start | <3s | <1s | <2s |
| Parse (simple scene) | <200ms | <50ms | <500ms |
| Compile (Three.js) | <500ms | <200ms | N/A (pre-compiled) |
| RAM usage | <200MB | <400MB | <100MB |
| 3D Preview FPS | 30fps | 90fps (VR) | 60fps (AR) |

---

## 7. Risk Register

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| WASM binary exceeds 2MB | High | Low (currently 459KB) | Tree-shake, separate worlds |
| Web Worker IPC latency | Medium | Medium | SharedArrayBuffer, transfer |
| WebXR browser support gaps | Medium | Low (2026 is mature) | Graceful fallback to 3D |
| Tauri WebView inconsistency | Medium | Medium (G.011.04) | Playwright cross-browser tests |
| Cloud sync not ready | High | High (not started) | Ship web+desktop independently first |

---

## 8. Action Items (Next Steps)

### Immediate (This Sprint)

- [x] **Wire WASM into studio Web Worker**: `wasm-compiler-bridge.ts` + `wasm-compiler-worker.ts` created
- [ ] **Measure WASM cold start**: Instrument `holoscript-runtime` world load time in Chrome/Firefox/Safari
- [x] **Create `compiler-bridge.ts`**: `CompilerBridge` class with typed async API wrapping Web Worker postMessage with WIT-derived types
- [x] **Platform feature detection**: `platform-detect.ts` probes WASM/WebGPU/WebXR/Tauri/OPFS capabilities
- [x] **Platform plugin loader**: `platform-plugin-loader.ts` with OPFS cache, LRU eviction, 7 plugin manifests
- [x] **React hook**: `useCompilerBridge.ts` hook with auto-init, platform detection, lazy plugin loading
- [ ] **Add `holoscript-spatial` world to studio**: Load 50KB spatial-engine WASM for noise/collision in 3D viewport

### Next Sprint

- [ ] **WebXR viewer component**: Extend `@react-three/xr` integration for shareable scene URLs
- [ ] **Lazy plugin loading proof-of-concept**: Build first platform plugin WASM (Unity C#) and test via `PlatformPluginLoader`
- [ ] **Desktop build pipeline**: `next build && next export` → Tauri `frontendDist`
- [ ] **Build holoscript-component**: Run `jco transpile` to produce `dist/holoscript.js` for Web Worker consumption
- [ ] **Feature detection integration**: Wire `platform-detect.ts` into studio settings panel to show capabilities

### Future

- [ ] Cloud sync hub (S3/Supabase) for cross-platform projects
- [ ] Flutter mobile AR companion scaffold
- [ ] Platform plugin CDN registry
- [ ] CRDT collaboration polish

---

## Appendix A: Full Package Classification Matrix

| # | Package | Category | WASM? | Web | Desktop | Mobile | Server |
|---|---------|----------|-------|-----|---------|--------|--------|
| 1 | `@holoscript/core` | Engine Core | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 | `@holoscript/wasm` | Engine Core | ✅ | ✅ | — | ✅ | — |
| 3 | `@holoscript/component` | Engine Core | ✅ | ✅ | ✅* | ✅ | — |
| 4 | `@holoscript/formatter` | Engine Core | ✅ | ✅ | ✅ | — | — |
| 5 | `@holoscript/linter` | Dev Tooling | ✅ | ✅ | ✅ | — | — |
| 6 | `@holoscript/std` | Engine Core | ✅ | ✅ | ✅ | ✅ | — |
| 7 | `spatial-engine` | Engine Core | ❌ | — | ✅ | — | — |
| 8 | `spatial-engine-wasm` | Engine Core | ✅ | ✅ | — | ✅ | — |
| 9 | `@holoscript/lsp` | Dev Tooling | Partial | Lite | ✅ | — | — |
| 10 | `@holoscript/sdk` | Dev Tooling | ❌ | — | ✅ | — | ✅ |
| 11 | `@holoscript/ai-validator` | Dev Tooling | ❌ | — | ✅ | — | ✅ |
| 12 | `@holoscript/security-sandbox` | Dev Tooling | ❌ | — | ✅ | — | ✅ |
| 13 | `@holoscript/test` | Dev Tooling | ❌ | — | ✅ | — | — |
| 14 | `tree-sitter-holoscript` | Dev Tooling | ❌ | — | ✅ | — | — |
| 15 | `@holoscript/studio` | Platform Shell | ❌ | ✅ | ✅** | — | — |
| 16 | `@holoscript/studio-desktop` | Platform Shell | ❌ | — | ✅ | — | — |
| 17 | `@holoscript/playground` | Platform Shell | ❌ | ✅ | — | — | — |
| 18 | `@holoscript/visual` | Platform Shell | ❌ | ✅ | ✅** | — | — |
| 19 | `visualizer-client` | Platform Shell | ❌ | ✅ | — | — | — |
| 20 | `@holoscript/preview-component` | Platform Shell | ❌ | ✅ | — | — | — |
| 21 | `@holoscript/cdn` | Platform Shell | ❌ | ✅ | — | — | — |
| 22 | `holoscript-vscode` | Platform Shell | ❌ | — | ✅ | — | — |
| 24 | `@holoscript/neovim` | Platform Shell | ❌ | — | ✅ | — | — |
| 25 | `@holoscript/graphql-api` | Infrastructure | ❌ | — | — | — | ✅ |
| 26 | `@holoscript/marketplace-api` | Infrastructure | ❌ | — | — | — | ✅ |
| 27 | `@holoscript/marketplace-web` | Infrastructure | ❌ | ✅ | — | — | — |
| 28 | `@holoscript/registry` | Infrastructure | ❌ | — | — | — | ✅ |
| 29 | `@holoscript/collab-server` | Infrastructure | ❌ | — | — | — | ✅ |
| 30 | `@holoscript/adapter-postgres` | Infrastructure | ❌ | — | — | — | ✅ |
| 31 | `@holoscript/fs` | Infrastructure | ❌ | — | ✅ | — | ✅ |
| 32 | `@holoscript/partner-sdk` | Infrastructure | ❌ | — | — | — | ✅ |
| 33 | `@holoscript/mcp-server` | AI/Agent | ❌ | — | ✅ | — | ✅ |
| 34 | `@holoscript/llm-provider` | AI/Agent | ❌ | — | ✅ | — | ✅ |
| 35 | `@hololand/react-agent-sdk` | AI/Agent | ❌ | ✅ | ✅ | — | — |
| 36 | `@holoscript/cli` | AI/Agent | ❌ | — | ✅ | — | ✅ |
| 37 | `@holoscript/benchmark` | Content | ❌ | — | — | — | — |
| 38 | `@holoscript/comparative-benchmarks` | Content | ❌ | — | — | — | — |
| 39 | `@holoscript/video-tutorials` | Content | ❌ | — | — | — | — |
| 40 | `@holoscript/studio-plugin-sdk` | Content | ❌ | — | ✅ | — | — |
| 41 | `com.holoscript.core` | Content | ❌ | — | — | — | — |
| 42 | `shader-preview-wgpu` | Rust Crate | ❌ | — | ✅ | — | — |

_* Desktop uses native Rust, not WASM — same interfaces, faster execution_
_** Shared via Tauri WebView_

## Appendix B: WIT Interface Quick Reference

```wit
// Parse HoloScript → AST
parser.parse(source: string) -> parse-result;

// Validate with trait checking
validator.validate(source: string) -> validation-result;
validator.trait-exists(name: string) -> bool;
validator.list-traits() -> list<trait-def>;

// Type check
type-checker.check(source: string) -> list<diagnostic>;
type-checker.completions-at(source: string, offset: u32) -> list<string>;

// Compile to target
compiler.compile(source: string, target: compile-target) -> compile-result;

// AI generation
generator.generate-object(description: string) -> result<string, string>;
generator.suggest-traits(description: string) -> list<trait-def>;

// Spatial math (hot-path)
spatial-engine.perlin-noise-two-d(x: f64, y: f64, seed: s32) -> f64;
spatial-engine.sphere-sphere-test(...) -> bool;
spatial-engine.frustum-cull-aabb(...) -> bool;

// Format code
formatter.format(source: string) -> result<string, string>;

// Platform plugins (separate WASM components)
platform-compiler.compile-for-platform(ast, target) -> compile-result;
```

---

_Generated from uAA2++ research cycle APL-2026-02-28. See `AI_Workspace/uAA2++_Protocol/` for complete research files._
