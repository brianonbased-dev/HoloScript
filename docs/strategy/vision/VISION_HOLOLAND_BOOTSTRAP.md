# Vision: Build Hololand in VR with Brittney

**Date**: February 15, 2026
**Status**: Planning
**Source of Truth**: This document (HoloScript repo) + TrainingMonkey

---

## The Vision

Put on a headset. Brittney is there. Tell her what you want. She writes HoloScript, it compiles, and the world materializes around you in real time.

Hololand stops being a TypeScript codebase maintained by hand. It becomes a **HoloScript application** that Brittney builds, modifies, and evolves — from inside VR.

```
You (in VR) → Voice/Gesture → Brittney (spatial AI agent)
                                    ↓
                              Generates .hsplus/.holo
                                    ↓
                              HoloScript Compiler (R3F target)
                                    ↓
                              Hololand Runtime (Three.js + WebXR)
                                    ↓
                              World updates live around you
```

---

## Current State Assessment

### What Works Today

| Component | Status | Details |
|-----------|--------|---------|
| HoloScript Parser | ✅ v3.4.0 | Lexer, parser, AST — handles `composition`, `template`, `object`, traits |
| 18 Compiler Targets | ✅ | R3F, Three.js, Unity, Unreal, WebGPU, USD, URDF, etc. |
| 1,800+ Traits | ✅ | 68 module files, scientific computing, robotics, VR interaction |
| Runtime Engine | ✅ | 50+ subsystems: physics, navigation, WebXR, voice, hot-reload |
| MCP Server | ✅ 35+ tools | Parse, validate, generate, graph, IDE features, browser control |
| Studio | ✅ v0.1.0 | Next.js scene builder with 5 templates, AI generation |
| Plugin System | ✅ | PluginAPI (sandboxed), PluginLoader, ModRegistry |
| Brittney Model | ✅ v4 | Fine-tuned on ~50K HoloScript examples, Ollama inference |
| Brittney MCP (IDE) | ✅ | Code generation, diagnostics, autocomplete, explain, fix |
| Hololand Platform | ✅ 43+ packages | Three.js/Babylon/PlayCanvas adapters, physics, networking, AR |
| TrainingMonkey | ✅ v1.0 | 8 MCP coordination tools, knowledge base, multi-agent protocol |

### What Hololand Is Today (The Legacy Problem)

Hololand Central is **~50 TypeScript/React files** that should be **~50 HoloScript files**. A migration spec exists ([HOLOSCRIPT_FIRST_MIGRATION.md](../Hololand/docs/specs/HOLOSCRIPT_FIRST_MIGRATION.md)) but hasn't been executed. The 43+ platform packages (`@hololand/*`) stay TypeScript — they're infrastructure. The application layer on top is what gets rebuilt.

### What's Missing

| # | Gap | Blocks | Severity |
|---|-----|--------|----------|
| G1 | **`system` keyword not in parser** | Migration spec uses `system TutorialSystem {}` everywhere | 🔴 Critical |
| G2 | **Inter-file `import` not supported** | Can't compose multi-file apps (`import { X } from "./Y.hsplus"`) | 🔴 Critical |
| G3 | **Browser execution not verified E2E** | `.hsplus` → compiled output → running in browser with WebXR | 🔴 Critical |
| G4 | **R3F compiler → Hololand bridge** | R3F compiler exists, Hololand uses R3F, but no confirmed connection | 🟡 High |
| G5 | **Brittney has no spatial/VR interface** | All tools are IDE-based MCP. No in-world agent presence. | 🟡 High |
| G6 | **No VR code workspace composition** | Nobody has written the `.holo` that defines a VR dev environment | 🟡 High |
| G7 | **Live hot-reload in WebXR** | HotReloader.ts exists but unverified with active VR sessions | 🟡 High |
| G8 | **`component` keyword for UI** | Migration spec uses `component MobileControls {}` — not in grammar | 🟡 Medium |
| G9 | **Hololand-specific training data** | TrainingMonkey has the plan but 4,200 examples not yet generated | 🟡 Medium |
| G10 | **Storage/device APIs** | `storage.get/set`, `device.isMobile` referenced but unimplemented | 🟠 Medium |

---

## Implementation Plan

### Phase 0: Language Foundations (Weeks 1-2)

**Goal**: HoloScript can express multi-file Hololand applications.

**Owner**: HoloScript repo (`packages/core`)

| Task | Gap | Details |
|------|-----|---------|
| Add `system` keyword to parser | G1 | New AST node type. Systems are named trait+logic containers that auto-initialize. Syntax: `system Name { state {}, on_init() {}, on_update() {} }` |
| Add `component` keyword to parser | G8 | UI component declarations. Syntax: `component Name { props {}, render() {} }` |
| Add `import`/`export` module resolution | G2 | File-level imports: `import { X } from "./path.hsplus"`. Compiler resolves dependencies, bundles output. |
| Add `storage` and `device` built-in APIs | G10 | Runtime built-ins: `storage.get(key)`, `storage.set(key, val)`, `device.isMobile`, `device.prefersReducedMotion()` |

**Validation**: Parse and compile the migration spec's `app.hsplus` root composition without errors.

---

### Phase 1: End-to-End Pipeline (Weeks 3-4)

**Goal**: A `.hsplus` file compiles to working browser code via the R3F compiler and runs inside Hololand's runtime.

**Owner**: HoloScript repo (compiler) + Hololand repo (integration)

| Task | Gap | Details |
|------|-----|---------|
| Verify R3F compiler output | G3 | Compile a multi-object composition → verify valid React Three Fiber JSX output |
| Build Hololand runtime bridge | G4 | Connect R3F compiler output to `@hololand/core` runtime initialization. Entry point: `createRuntime(composition, { target, mode })` |
| Verify browser execution | G3 | Full loop: `.hsplus` → R3F → `@hololand/renderer` → Three.js scene in browser |
| Verify WebXR session | G3 | Same loop but entering immersive-vr mode via `@hololand/core`'s WebXR manager |
| Hot-reload in VR | G7 | `HotReloader.ts` watches `.hsplus` files, recompiles, patches scene graph without dropping WebXR session |

**Validation**: Edit a `.hsplus` file on disk, see the change reflected in a running VR session within 2 seconds.

---

### Phase 2: Brittney Training (Weeks 3-6, parallel with Phase 1)

**Goal**: Brittney can generate correct Hololand application code, not just generic HoloScript.

**Owner**: TrainingMonkey repo

| Task | Gap | Details |
|------|-----|---------|
| Implement `generate_hololand_training` MCP tool | G9 | TrainingMonkey enhancement #3: 9 categories, 4,200 examples target |
| Generate training data for Hololand patterns | G9 | World composition, multiplayer state, portal navigation, UI systems, NPC behaviors, quest chains |
| Include `system`/`component`/`import` patterns | G1,G2,G8 | Training data must reflect the new grammar additions from Phase 0 |
| Fine-tune Brittney v5 | G9 | Incorporate Hololand-specific training into next model version |
| Validate generation quality | G9 | Brittney generates valid multi-file Hololand apps that compile and run |

**Validation**: Prompt Brittney with "Create a multiplayer lobby with portals to 3 zones" → she generates valid `.hsplus` files that compile and render.

---

### Phase 3: Spatial Brittney (Weeks 5-8)

**Goal**: Brittney exists as an agent inside VR, not just in the IDE.

**Owner**: HoloScript repo (composition) + Hololand repo (integration)

| Task | Gap | Details |
|------|-----|---------|
| Create `brittney-workspace.holo` | G6 | Root composition: VR dev environment with code panels, 3D preview area, Brittney avatar, voice input zone |
| Implement voice → MCP pipeline | G5 | `SpeechRecognizer.ts` (exists) → intent extraction → MCP tool calls → result display in VR |
| Implement gesture → MCP pipeline | G5 | Point at object → `suggest_traits`. Grab + move → reposition. Pinch → scale. |
| Brittney avatar with spatial audio | G5 | Animated avatar using `@animated` `@spatial_audio` traits, lip-sync with TTS responses |
| Live code panel in VR | G6 | Floating `.hsplus` source view that updates as Brittney generates code. Uses `@billboard` trait. |
| Scene preview zone | G6 | Designated area where generated compositions render in real-time as Brittney writes them |

**Validation**: In VR, say "Brittney, add a glowing portal to the casino zone." Brittney's avatar responds verbally, a code panel shows the generated `.hsplus`, and a portal materializes in the preview zone.

---

### Phase 4: Migration Execution (Weeks 7-10)

**Goal**: Hololand Central rebuilt in HoloScript.

**Owner**: Hololand repo

| Task | Gap | Details |
|------|-----|---------|
| Migrate Main Plaza | — | `MainPlaza.tsx` → `main_plaza.hsplus` (per migration spec) |
| Migrate Casino zone | — | `Casino.tsx` → `casino.hsplus` |
| Migrate Tutorial system | — | `TutorialOverlay.tsx` → `systems/Tutorial.hsplus` |
| Migrate Easter Eggs | — | `EasterEggs.tsx` → `systems/EasterEggs.hsplus` |
| Migrate Themes | — | `themes/*.ts` → `systems/Themes.hsplus` |
| Migrate Multiplayer | — | Network state → `systems/Multiplayer.hsplus` |
| Migrate Mobile Controls | — | `MobileControls.tsx` → `components/MobileControls.hsplus` |
| Migrate Accessibility | — | Accessibility layer → `systems/Accessibility.hsplus` |
| Bootstrap entry point | — | Single `main.ts` + `app.hsplus` root composition |

**Validation**: Hololand Central runs from `app.hsplus` root composition. ~5 TypeScript files remain (bootstrap only). All content, logic, and behavior is HoloScript.

---

### Phase 5: Self-Building World (Weeks 9-12)

**Goal**: Brittney can modify the running Hololand from inside it.

**Owner**: All repos

| Task | Details |
|------|---------|
| Brittney writes to `.hsplus` files on disk from VR | Voice command → generate code → write file → hot-reload picks it up |
| Version control integration | Each Brittney edit creates a git commit with descriptive message |
| Rollback mechanism | "Brittney, undo that last change" → git revert → hot-reload |
| Collaborative editing | Multiple users in VR, each with Brittney, non-conflicting edits via CRDT |
| Self-improvement loop | Brittney logs failed generations → TrainingMonkey harvests them → next fine-tune improves |

**Validation**: In VR, tell Brittney to add a new zone. She generates the files, the zone appears, you walk into it. Tell her to change the skybox — it changes. Tell her to undo — it reverts. All without leaving VR.

---

## Dependency Graph

```
Phase 0 (Language)
    │
    ├──→ Phase 1 (Pipeline) ──→ Phase 4 (Migration) ──→ Phase 5 (Self-Building)
    │                                                         ↑
    └──→ Phase 2 (Training) ──→ Phase 3 (Spatial Brittney) ──┘
```

- Phase 0 is prerequisite for everything
- Phase 1 and Phase 2 can run in parallel
- Phase 3 needs Phase 2 (trained model) + Phase 1 (working pipeline)
- Phase 4 can start after Phase 1, doesn't need Brittney
- Phase 5 needs Phase 3 (spatial Brittney) + Phase 4 (migrated Hololand)

---

## Success Criteria

| Milestone | Metric |
|-----------|--------|
| **"It Parses"** | `app.hsplus` from migration spec parses without errors (Phase 0) |
| **"It Runs"** | Multi-file `.hsplus` app renders in browser with WebXR (Phase 1) |
| **"She Knows"** | Brittney generates valid Hololand-specific code (Phase 2) |
| **"She's Here"** | Brittney exists as a spatial agent in VR (Phase 3) |
| **"Dogfooding"** | Hololand Central runs from HoloScript root composition (Phase 4) |
| **"The Dream"** | Build Hololand from inside Hololand, with Brittney, in VR (Phase 5) |

---

## Repository Responsibilities

| Repo | Role |
|------|------|
| **HoloScript** | Language features (Phase 0), compiler pipeline (Phase 1), spatial compositions (Phase 3) |
| **TrainingMonkey** | Training data generation (Phase 2), quality validation, knowledge base |
| **Hololand** | Runtime bridge (Phase 1), migration execution (Phase 4), platform packages |
| **AI_Workspace** | Brittney model fine-tuning (Phase 2), uAA2++ protocol coordination |

---

## Key Principles

1. **Hololand's 43+ platform packages stay TypeScript.** They're infrastructure. Only the application layer migrates.
2. **HoloScript is the source of truth for language capabilities.** If the parser can't handle it, the migration can't happen.
3. **TrainingMonkey is the source of truth for training data.** Brittney's quality depends on what TrainingMonkey generates.
4. **Don't migrate before the pipeline works.** Phase 1 must be validated before Phase 4 begins.
5. **Brittney builds Hololand, not humans.** Phase 5 is the end state — manual migration in Phase 4 is temporary scaffolding.

---

## References

- [HoloScript ROADMAP.md](ROADMAP.md) — Language milestones
- [HoloScript ARCHITECTURE.md](ARCHITECTURE.md) — Repo structure and package relationships
- [Hololand HOLOSCRIPT_FIRST_MIGRATION.md](../Hololand/docs/specs/HOLOSCRIPT_FIRST_MIGRATION.md) — Detailed migration spec (800 lines)
- [Hololand AI_ARCHITECTURE.md](../Hololand/AI_ARCHITECTURE.md) — Self-building world vision
- [Hololand ECOSYSTEM_STATUS.md](../Hololand/ECOSYSTEM_STATUS.md) — All 43+ packages
- [TrainingMonkey ENHANCEMENT_PLAN_AGENTS.md](../TrainingMonkey/ENHANCEMENT_PLAN_AGENTS.md) — Training data generation plan
- [TrainingMonkey ARCHITECTURE_COMPLETE.md](../TrainingMonkey/ARCHITECTURE_COMPLETE.md) — Multi-agent coordination
