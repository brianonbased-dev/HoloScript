---
title: HoloScript Semantic Trait System — End-to-End Exploration
date: 2026-04-19
agent: claude-code
task: task_1776394509341_wu6f
source_todo: docs/research/2026-03-09_holoscript-impossible-doors-breakthrough-analysis.md (TODO #8)
status: research
classification: internal
---

# HoloScript Semantic Trait System — End-to-End Exploration

## 1. Scope & Method

Investigated how HoloScript represents, registers, validates, and extends "semantic traits" today. The original prompt (TODO #8 from `2026-03-09_holoscript-impossible-doors-breakthrough-analysis.md`) asked whether the trait system could serve as ground-truth labels for 3D scene understanding benchmarks (ScanNet, 3RScan, etc.). That question is downstream of a more pressing one — **what does the trait system actually look like right now** — so this memo answers that first, then evaluates the benchmark-labels angle in §6.

Method: file-system investigation across the surfaces below. No regex parsing of `.hs/.hsplus/.holo` (per F.014); examined TypeScript source, JSON registry, doc Markdown, and the trait-mappings generator script.

Surfaces inspected:
- `packages/core/src/traits/` — handler implementations (`*Trait.ts`)
- `packages/core/src/traits/VRTraitSystem.ts` — runtime registry (class `VRTraitRegistry`)
- `packages/core/src/traits/index.ts` — barrel
- `packages/core/src/traits/trait-registry.json` — declarative metadata
- `packages/core/src/traits/constants/` — category arrays
- `packages/core/src/semantics/` — `@semantic` directive + `SemanticValidator`
- `packages/plugins/*/src/` — domain plugins (medical, robotics, scientific, trait-audit, etc.)
- `docs/trait-mappings.md` (auto-generated) and `docs/traits/*.md` (hand-written reference)
- `scripts/generate-trait-mappings.mjs` and `scripts/audit-traits.ts`

## 2. The Five Surfaces (and how they relate)

The "trait system" is not one thing. It is five overlapping layers, each with its own source of truth:

| Layer | Location | Counted shape | Authority |
|------|----------|---------------|-----------|
| **L1 — Handler implementations** | `packages/core/src/traits/*Trait.ts` | 366 `*Trait.ts` files | Runtime behavior (lifecycle hooks) |
| **L2 — Runtime registry** | `VRTraitRegistry` constructor in `VRTraitSystem.ts` | 371 `this.register(...)` calls importing 326 files | What the engine actually instantiates |
| **L3 — Public barrel** | `packages/core/src/traits/index.ts` | 225 of 366 files re-exported | What downstream packages can import |
| **L4 — Category constants** | `traits/constants/<category>.ts` (115 categories) | 2,775 trait-name strings, 133 exported arrays | Compile-target dispatch + completion |
| **L5 — Declarative registry** | `traits/trait-registry.json` | 275 entries | Documentation, AI prompts (intended) |

These layers do not agree with each other — see §4.

The semantic surface adds a sixth layer:

- **L6 — `@semantic` directive** (`semantics/SemanticValidator.ts`) is a **separate** mechanism. It validates user-defined "semantic definitions" attached to AST nodes (required properties / required traits / required methods). It is not a trait registry — it is a contract checker on top of the trait system. The `SemanticAnnotation.ts` taxonomy (`identity | spatial | temporal | behavioral | visual | audio | physical | interactive | narrative | ai | network | performance | accessibility | custom`) has 14 categories — and shares **zero overlap** with the 115 category names in L4.

## 3. End-to-End Pipeline (when it works)

```
.holo / .hsplus source
  ├── @trait_name(prop: value)        ← decorator syntax
  └── @semantic(name, properties=...)  ← contract definition

      ↓  HoloScriptPlusParser
        produces directives[] on each HSPlusNode

          ↓  Compiler (target-specific)
            looks up trait in:
              (a) AndroidXRTraitMap.ts / VisionOSTraitMap.ts / NIRTraitMap.ts / AIGlassesTraitMap.ts (dedicated maps)
              (b) inline `case 'trait_name':` switch in 19 other compilers
            emits target-native code

              ↓  Runtime
                VRTraitRegistry.register() (eager, in constructor)
                handler.onAttach / onUpdate / onEvent / onDetach

                  ↓  SemanticValidator (optional pass)
                    confirms required traits + properties + methods present
```

Compile-target trait coverage is highly uneven (`docs/trait-mappings.md`, line 16-41):

- AndroidXR maps 174 traits (highest), VisionOS 101, AIGlasses 77, Unity 60, Babylon 59
- IOS maps 2, WASM 4, TSL 4, PhoneSleeveVR 3, Native2D 6
- Most categories have **zero compiler coverage** (e.g., `age-condition`, `cooking-food`, `creatures-mythical`, `gems-minerals`, `npc-roles`, `facial-expression` 75 traits → 0 compilers)

## 4. Key Findings (gaps that change agent behavior)

### G1. Handler/registry/barrel disagreement — three different "trait counts"

```
366 *Trait.ts source files
326 imported by VRTraitSystem.ts (40 orphaned at runtime)
225 re-exported through traits/index.ts (141 not part of public API)
275 entries in trait-registry.json
2,775 trait names in constants/<category>.ts files
```

There is no script that reconciles these. `scripts/audit-traits.ts` was built to find unregistered files but only reports — it does not fail CI. Result: "how many traits does HoloScript have?" has at least five legitimate answers, none reconciled. This is exactly the failure mode W.028/W.029 (zero hardcoded stats) was meant to prevent — and it is still happening **inside** the trait system.

### G2. `trait-registry.json` is a placeholder, not a declarative source of truth

275 entries, but:
- 235 / 275 (85%) have `category: "other"`
- 275 / 275 (100%) have `properties: []`
- 275 / 275 (100%) have `composable: []`
- 275 / 275 (100%) have `conflicts: []`

The JSON has the right *shape* for a real declarative registry (composability, conflicts, compile hints) but every meaningful field is empty. AI agents reading this file to "understand traits" learn nothing they could not learn from the file list.

### G3. `registerTrait` is documented but not exported

`docs/traits/extending.md:11-27` shows the canonical extension example:

```typescript
import { registerTrait } from '@holoscript/core';
registerTrait({ name: '@pulse_glow', defaultConfig: {...}, onAttach: ... });
```

`registerTrait` is **not exported** from `@holoscript/core` (verified via grep over `packages/core/src`). The actual mechanism is constructor registration inside `VRTraitRegistry`, which is closed for extension at runtime. To add a trait, a developer today must either:
1. Add a `this.register(...)` line in `VRTraitSystem.ts` (core code change), or
2. Patch the `VRTraitRegistry` instance after construction (no public API for this).

Neither matches the documented contract.

### G4. Plugins are not integrated with the trait runtime

Inspected `packages/plugins/*`:

- **medical-plugin** (375 lines `src/index.ts`): exports only `*Config` interfaces — no handlers, no registration call.
- **robotics-plugin** (`src/traits/types.ts`): defines the trait types as `unknown` stubs:
  ```typescript
  export type TraitContext = unknown;
  export type TraitHandler<_T> = unknown;
  ```
  i.e., the plugin does not even import `@holoscript/core` types.
- **trait-audit-plugin** (the only one that does it right) exports `pluginMeta + traitHandlers` array:
  ```typescript
  export const pluginMeta = { name: '@holoscript/plugin-trait-audit', version: '1.0.0', traits: ['interoperability_badge'] };
  export const traitHandlers = [createInteroperabilityBadgeHandler()];
  ```
  But nothing in core consumes that convention.

There is no `loadPlugin(plugin)` call anywhere in core that walks `traitHandlers` and registers them. The plugins exist as *type packages* and *codegen helpers* (URDF, USD, DICOM), not as runtime trait providers.

### G5. Semantic taxonomy is forked — `@semantic` (14 cats) vs. trait categories (115 cats)

`SemanticAnnotation.ts` defines 14 `SemanticCategory` values for the `@semantic` directive (identity, spatial, temporal, behavioral, visual, audio, physical, interactive, narrative, ai, network, performance, accessibility, custom).

`docs/trait-mappings.md` enumerates 115 category names from `traits/constants/<category>.ts` (accessibility, accessibility-extended, age-condition, animals, ... ).

These taxonomies do not map to each other. A trait registered in category `furniture-decor` (L4) cannot answer "what `SemanticCategory` am I?" without a hand-coded translation. The trait-registry.json `category` field would be the natural bridge, but per G2 it is mostly `"other"`.

### G6. Generator script regex-parses TypeScript to count traits

`scripts/generate-trait-mappings.mjs` regex-matches `'trait_name'` strings inside category files and `case 'trait_name':` in compilers (lines 31-95). This is the same pattern F.014 prohibits for `.hs/.hsplus/.holo` files; here it is applied to `.ts` files, which is technically allowed but creates the same kind of fragility:

- Renaming a trait in code without updating the string literal silently drops it from the docs.
- Any trait constant that uses computed names (template literals) is invisible.
- A trait declared in two compilers as different cases (e.g., `'grabbable'` and `'grabbable_v2'`) inflates the count by one.

A typed extraction (use `@holoscript/core`'s exported constants directly via `tsx scripts/generate-trait-mappings.ts`) would remove all three failure modes.

## 5. What is actually working well

- **Lifecycle contract** (`TraitHandler<TConfig>` in `TraitTypes.ts`) is clean and stable: `onAttach / onDetach / onUpdate / onEvent` with explicit `TraitContext` (vr, physics, audio, haptics, accessibility, host capabilities). Plugins that follow this pattern slot in cleanly when registration is done by hand.
- **Compile-target dispatch** via dedicated `*TraitMap.ts` files (AndroidXR, VisionOS, NIR, AIGlasses) is the right abstraction — separates trait *meaning* from target-native *emission*.
- **`SemanticValidator`** (independent of the trait registry) cleanly validates a node against a `@semantic` definition. It is a real contract checker and could become the foundation of L5 (the trait-registry).
- **Auto-generated `docs/trait-mappings.md`** is a good idea (single source-of-truth doc derived from code). The implementation just needs to be moved off regex (G6).

## 6. The Original Question — Trait System as Scene-Understanding Ground Truth

The prompt asked whether the system could serve as ground-truth labels for ScanNet / 3RScan / 3DSSG. Verdict:

**Not today, but the path is short if G1–G5 are fixed.**

What scene-understanding benchmarks need from a label system:
1. **Stable, enumerated label set** with categorical hierarchy (NYU40, Matterport, ScanNet 200).
2. **Object affordances** beyond category — graspable, sittable, openable, supports, contains.
3. **Inter-object relations** — supports / hangs-from / part-of / aligned-with.
4. **Multi-domain coverage** — furniture, appliances, structural, vegetation, text.

What HoloScript already has that maps:
- `@grabbable / @throwable / @pointable / @hoverable / @scalable / @rotatable / @stackable / @snappable / @breakable / @openable / @closable / @lockable / @sittable / @rideable / @driveable / @mountable` — these are exactly the affordance vocabulary 3D-scene-understanding papers reach for.
- Categories `furniture-decor` (36), `containers-storage` (30), `architecture-realestate` (37), `cooking-food` (39), `object-interaction` (25), `material-properties` (33) cover a large fraction of ScanNet 200.
- `@spatial_constraint`, `@anchor`, `@plane_detection`, `@mesh_detection`, `@scene_reconstruction` cover the spatial-relation primitives.

Blockers to using it as ground truth:
- **G2** — without populated `composable / conflicts / properties` in the registry, traits cannot be projected onto a benchmark label set programmatically.
- **G5** — the missing bridge between `SemanticCategory` (14) and trait categories (115) means there is no canonical "what does this trait mean" answer for a labeler.
- **No mapping table** from trait name → ScanNet/NYU40/Matterport/3RScan label exists. This would be net-new work, but small (one-time JSON of ~200 entries).

Recommendation: tag this as a downstream initiative, gated on G1+G2+G5. Don't do it before the registry is real.

## 7. Concrete Improvement Opportunities (prioritized)

These are scoped at "small enough to do in a single session." Listed by impact-per-hour, not by urgency.

| ID | Action | Effort | Unblocks |
|----|--------|--------|----------|
| **T1** | Add a CI check that fails when a `*Trait.ts` file is not imported by `VRTraitSystem.ts` AND not in the `index.ts` barrel. (G1) | ~30 min | Stops the 40-orphan / 141-unexported drift from getting worse. |
| **T2** | Export a real `registerTrait()` and `unregisterTrait()` from `@holoscript/core` that mutates a singleton `VRTraitRegistry` instance, and update `docs/traits/extending.md` if the API differs. (G3) | ~1 h | Plugins can extend the runtime. Docs become true. |
| **T3** | Replace `scripts/generate-trait-mappings.mjs` regex extraction with `tsx scripts/generate-trait-mappings.ts` that imports `traits/constants/index.ts` and uses the exported arrays directly. (G6) | ~1 h | Counts in `docs/trait-mappings.md` become correct under refactors. |
| **T4** | Add a `composable[] / conflicts[] / properties[]` migration: walk handler defaultConfig + handler imports to populate `trait-registry.json` per-trait. Even partial coverage (top-50 traits) makes the file useful. (G2) | ~3 h | AI agents reading the registry actually learn something. |
| **T5** | Define a `SemanticCategory → trait-category` mapping (14 → 115) as a JSON file, surface it in `SemanticValidator` so a `@semantic(category: "spatial")` definition can be checked against trait membership. (G5) | ~1 h | Closes the L4↔L6 fork. Foundation for §6. |
| **T6** | Add a `loadPlugin(pkg)` API to core that reads `pkg.traitHandlers` (the `trait-audit-plugin` convention) and calls `registerTrait` on each. Document the convention in `packages/plugins/README.md`. (G4) | ~2 h | Domain plugins become first-class trait providers. |

T1+T3 alone close the "we don't know how many traits we have" problem and require almost no design work. T2 closes the documented-but-missing API gap. T4+T5+T6 are the structural fixes that turn the trait system from a code convention into an actual platform.

## 8. Out of Scope (intentional)

- Did not propose a new trait taxonomy. The existing 115 categories are working.
- Did not benchmark trait dispatch performance.
- Did not survey 3rd-party "scene understanding" trait libraries for reuse.
- Did not modify any code — this is a research memo only.

## 9. References (file:line)

- `packages/core/src/traits/VRTraitSystem.ts:1412` — `class VRTraitRegistry`
- `packages/core/src/traits/VRTraitSystem.ts:1417-1888` — 371 `this.register(...)` calls
- `packages/core/src/traits/TraitTypes.ts:17-26` — `TraitHandler<TConfig>` interface
- `packages/core/src/traits/index.ts` — 225-file barrel
- `packages/core/src/traits/trait-registry.json` — 275 entries (85% `"other"`, 100% empty arrays)
- `packages/core/src/semantics/SemanticAnnotation.ts:12-26` — 14 `SemanticCategory` values
- `packages/core/src/semantics/SemanticValidator.ts:24-39` — `SemanticDefinition` shape
- `docs/traits/extending.md:11-27` — documents the missing `registerTrait` API
- `docs/traits/index.md:33-53` — hand-written category table (separate from `docs/trait-mappings.md`)
- `docs/trait-mappings.md` (auto-generated) — current compile-target coverage matrix
- `scripts/generate-trait-mappings.mjs:31-95` — regex-based extractor (the source of G6)
- `scripts/audit-traits.ts` — orphan finder (informational only, no CI gate)
- `packages/plugins/medical-plugin/src/index.ts` — config-only, no handlers
- `packages/plugins/robotics-plugin/src/traits/types.ts:1-4` — `unknown` type stubs
- `packages/plugins/trait-audit-plugin/src/index.ts:6-7` — `pluginMeta + traitHandlers` convention
