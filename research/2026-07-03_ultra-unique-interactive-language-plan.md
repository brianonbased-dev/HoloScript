# Ultra-Unique + Interactive: A Language-Building Plan (not a content pass)

**Date:** 2026-07-03 · **Author:** claude1 · **Status:** plan (research→plan step of D.101)
**Provenance:** grounded by a 6-agent research workflow (`wf_1c5fb71e-dca`) that mapped the
*current* language surface with file-path evidence across 4 axes + papers + competitor framing.
Follows the `/taste` corpus pass (`d93b200cf`) that made scene **form** considered; this plan
extends "considered" from **form** to **behavior, generativity, mind, and physics**.

---

## 1. Thesis — this was always the point, not a feature

The founder-ratified thesis (`NORTH_STAR.md` L22-30) already says a HoloScript scene **"is a
theorem about reality — execution constitutes the proof,"** judged on **"looks-right vs
is-right,"** and names **"optimizing appearance" as "the deepest poison."** The format-spec
preprints say the same in their own terms:

| Paper (preprint) | The language's job |
|---|---|
| `paper-11-hsplus-ecoop.tex` | interaction must stop being **imperative** (event handlers, collision callbacks, input polling) and become **declarative** `.hsplus` behavior |
| `paper-12-holo-i3d.tex` | uniqueness via an **immutable 5-form core grammar** (objects/templates/spatial-groups/traits/behaviors) that never grows — domains extend by data, not new syntax |
| `paper-10-hs-core-pldi.tex` | `.hs` as a **provenance-carrying IR** — one source → k≈61 heterogeneous targets, every claim receipted |
| `paper-40-portable-agent-mind-ismar.tex` | a scene's inhabitants are **continuous minds, not puppets** (D.102 realized) |
| `paper-0c-cael-aamas.tex` | scene behavior is a **causally-closed, hash-chained loop** between agent and environment |

**Conclusion:** "ultra-unique + interactive, not just passing visuals" **is** the canonical
mission. Pretty-but-dead scenes are the explicit anti-pattern. The `/taste` axis (assembled →
considered) is the first front of exactly this fight; this plan opens the other four.

## 2. Stance — EXTEND-AND-SHARPEN, not build-from-scratch

The research corrected a naive assumption (audit-as-calibration, W.GOLD.191/534). The
interactivity substrate is **already largely built**:

- **87.48%** native-authored coverage, and it **ratchets** (`scripts/holo-ci/check-native-coverage.mjs`, D.104).
- **448/448** top-level `.holo` traits carry a `behaviors:[@x,@y]` composition field — behavior-fused-to-form is the *structural default*, not an aspiration.
- The **Rust/WASM grammar** (`packages/compiler-wasm/src/parser.rs`) parses **bespoke inline reaction blocks** — novel per-entity behavior isn't capped by the trait library.
- A real **execution runtime** exists (`event-system.ts` 5-stage `emit()`), plus `@state_machine`, `@behavior_tree`, PCG graphs, portable-mind seams, ~30 physics solvers, and native `@provenance`.

So the work is **sharpening**, not inventing. And every one of the 22 gaps is the **same move**.

## 3. The recurring move (the spine of the whole plan)

Every axis has a **freeform escape hatch** — an untyped surface through which the *generic /
assembled / dead* version slips past the compiler unnoticed:

| Axis | The freeform escape hatch (today) | What slips through |
|---|---|---|
| Behavior | `HoloEventHandler.event` is a **freeform `string`**; guards are **unparsed strings** | the average `on_click(){ trigger 'show_info_panel' }` stub |
| Generativity | generator **params parse as arbitrary properties**, untyped | no determinism / diversity / uniqueness guarantee |
| Embodied mind | `@agent` emitted as an **inert comment** (`quest-world-emit.ts:322`) | a body that never loads its mind |
| Physics | material is **optical-only**; physics props are `Record<string,unknown>` | a scene that *looks* solid but has no physical truth |

**The move, applied 4×:** ① **type the freeform** (closed union / schema / typed binding) →
② **gate the generic** (a check that rejects the untyped or point-of-view-less form) →
③ **dissolve the `.ts`** (the logic behind the hatch moves into the typed native form, D.104).

That is the entire plan. Four tracks, one pattern.

---

## 4. The four tracks

### Track A — Behavior/Interaction *(the direct continuation of `/taste`)*

**Exists (verified):** event-handler grammar + `HoloEventHandler` AST (`HoloCompositionParser.ts`,
`HoloCompositionTypes.ts:942`), `@state_machine` blocks (`:4901-5020`) + `state_machine.hsplus`,
`UaalBehaviorCompiler.ts` (lowers handler bodies to real VM bytecode), `UIEventRouter.ts` runtime,
`GameTrigger` proximity node, `SpatialAwarenessTrait`/`WindTrait` runtime signals,
`check-native-authoring-shape.mjs` (data-vs-control-flow WARN gate).

**Gaps → native form → gate:**

| Gap | Native form | Gate |
|---|---|---|
| `event` is a freeform string — no `on_dusk`/`on_wind`/`on_approach` | closed `HoloEventName` union + `@reactive` world-event handlers | `check:event-vocabulary` |
| guards are unparsed strings (`"player.level >= 5"`) | parse to `condition: HoloExpression` (type already exists `:985`) | `check:guard-typed` |
| runtime signals (wind/proximity) exist but aren't **authorable bindings** | `@reactive_binding`: `on_approach(within:3m){ emit 'ignite' }` | `check:reactive-binding-resolved` |
| `animate`/timeline are **`stats.unhandled`** (not lowered) | extend `UaalBehaviorCompiler` (or `TimelineCompiler`) to lower timed ops | `check:behavior-lowering-coverage` |
| **no interaction-taste gate** — nothing judges if behavior has a POV | typed `interaction_profile` per object (mirrors `paper_profile`) | **`check:interaction-taste`** (WARN→BLOCK) |
| no clock primitive (dusk/tick/interval) | `@clock` world-time trait as a signal provider | `check:temporal-binding-resolved` |

**Native shape (target):** `template "DuskLamp" { @reactive @clock @state_machine { state "dormant"
{ on_dusk { -> "lit" } } state "lit" { on_approach(within:3m){ set mantle.emissive *= 1.15 } } } }`
— the lamp's point of view authored as typed data the compiler *and the taste gate* consume.

**Why first:** it is the literal sibling of the form-taste work just shipped, it's cheap, it's
**dogfoodable on the 7 reshaped examples today** (their `on_click→show_info_panel` stubs are the
assembled tell), and `check:interaction-taste` sets the gate the other tracks reuse.

### Track B — Generativity *(the biggest "ultra-unique" lever)*

**Exists:** `PCGGraphCompiler` + `compile_to_pcg_graph`, `@seed`/`@world_seed` deterministic
anchors, `@world_generator_trait`, `scatter` (deterministic seeded placement), WFC/Dungeon/Noise
engine solvers, `@constraint` relational verbs (stub).

**Gaps → native form → gate:**

| Gap | Native form | Gate |
|---|---|---|
| no author-declared **`@generator`** ("taste as parameters → an instance per seed") | `generator <Name> { params{seed,site,knobs:ranges} emits{...} }` | `check:generator-determinism` (same seed → byte-identical IR) |
| constraint-based generation is a stub | `constraints{ rests_on, adjacent_to, oriented_toward }` promoted to grammar | `check:constraint-satisfaction` (100% satisfied) |
| seeded uniqueness reaches scenes only as **uniform point-scatter**, not parametric structure | `@scatter_generated` — each instance is itself a seeded `@generator` | `check:instance-diversity` (≥K structurally-distinct) |
| **two parallel gen IRs** (PCG vs engine solvers vs prompt-to-mesh) don't share a substrate | canonical `GeneratorIR` (typed params/seed/emit-rules/constraints) | `check:generator-ir-parity` |
| rich params (WFC adjacency, L-system rules) parse as arbitrary props | typed `.hsplus` grammar schemas per family (`@l_system_grammar`, `@wfc_ruleset`) | `check:generator-grammar-valid` |

**The anti-average, structurally:** a frontier model returns *the* average castle; a `@generator`
returns *this* castle from *this* site's constraints, and never the same twice — with the taste
baked into the parameters. Only **4 of 448** traits currently declare a seed — this is the thinnest,
highest-upside axis.

### Track C — Embodied Mind *(the sovereign moat — D.102)*

**Exists (a lot):** `@wallet_identity`, `@portable_mind`, `@portable_mind_seam`,
`@mesh_character_mind` + `MeshCharacterMind`, `CharacterHost.bindMind`, `AgentAvatar`,
`DaimonSeedCompiler` + `compile_to_daimon_seed`, agent-brain `.hsplus` grammar, `@agent`/`@model`/
`@system_prompt` scene decorators, `HoloNPC`/`parseNPC`, `@agent_memory_trait`.

**The gaps are almost entirely an EMIT SEAM, not missing pieces:**

| Gap | Native form | Gate |
|---|---|---|
| no `.holo` scene authors the **mind→body binding** (lives only in TS/React glue) | `npc guard { @inhabited_by(brain:"keeper.hsplus", wallet:"0x…", memory_limit:50) }` | `check-embodied-mind-native.mjs` |
| Quest/OpenXR/VisionOS emit `@agent` as an **inert comment** (`quest-world-emit.ts:322`) | shared `MindSeamEmit` lowering: emit a real `PortableMind`+`bindMind` call | conformance `embodied-mind-seam-emitted` |
| NPC dialogue is a **deterministic stub** (`generate-dialogue.ts:14`) | wire `HoloReactionTrigger` cognitive verbs to the bound mind (`recall`/`llm_call`) | `check-reaction-mind-binding.mjs` |
| two divergent agent grammars (scene `@agent` vs `.hsplus` brain files) ununified | scene entity references **one brain + one seat** | native-shape extension |
| no `CrossSubstrateIdentityReceipt` captured at load to **prove** the same mind inhabited the body | mind-seam emit also emits the receipt at spawn | conformance `embodied-continuity-receipt` |

**Why it's the moat:** no competitor has a wallet-keyed, memory-bearing mind that carries across
Jetson → laptop → headset body (D.102 "THE point"). The pieces exist; **the body renders but never
loads the mind.** Closing the emit seam is disproportionately high-value for the build cost.

### Track D — Physically-Real Interaction *(simulation-first; the sim→real / robot horizon)*

**Exists:** `solve_structural` + ~30 sibling solvers, `MaterialDatabase`, GPU PBD soft-body solver,
`SoftBodyTrait`, native `.hsplus` physics traits, `compilePhysicsBlock`/`CompiledPhysics`, CAEL
replay receipts, and the **embodied-feel SDF + compliant-contact model** (P.024,
`embodied-feel-material.mjs` with `assertContactModel`).

**Gaps → native form → gate:**

| Gap | Native form | Gate |
|---|---|---|
| scene materials carry **zero physical response** (optical fields only) | `@physical_response{ density, youngs_modulus, poisson, friction }` on the material | `check:material-physics` |
| physics props are an untyped `Record<string,unknown>` bag | typed `RigidbodyProps`/`ColliderProps` schemas | parser-time schema validation |
| no bridge from scene geometry+material to the **FEM/PBD solvers** (author hand-supplies raw meshes) | `compile_to_structural`-from-scene via existing `AutoMesher` | conformance: `@structural`/`@deformable` → runnable solver config |
| compliant/deformable contact (fur/hair/soft) not a **first-class construct** | promote `MATERIAL_CLASSES`+`assertContactModel` to a native `@compliant_contact` trait | native `assertContactModel` gate |
| `compile_to_sdf` is **Gazebo XML**, not tactile signed-distance-field | native `compile_to_tactile_sdf` (exact SDF + gradient) | port `exactnessCheck` from `embodied-feel-sdf.mjs` |
| named-but-numberless material tags (`@granite`, `@curtain`…) | back each tag with a typed `MaterialDatabase` profile | `check:material-profile-coverage` |

**Why last:** highest engine cost and longest horizon — but it's the path where **sim = real**
(no sim-real gap → Android robot), so it's the deepest moat, not a nice-to-have.

---

## 5. Competitor-outbuild posture (F.134 — interop is a tactic, never a concession)

Grounded in `docs/strategy/competitor-gap-matrix.json` (Unity CG-036, Unreal CG-037/071/072, Godot,
Babylon, R3F, Omniverse, visionOS, Android XR):

- **Unity / Unreal** make you *hand-code* interactivity in C#/Blueprints and *hand-place* uniqueness.
  We author it as **typed declarative data + gate-verified provenance** — a different layer, not a
  faster horse. (Unreal PCG is the one place they're close; our `GeneratorIR` should compile *to* it
  as a tactic while owning the source form.)
- **Meshy / Tripo** return a **dead mesh**. Every one of these four axes is a dimension they don't model.
- **Our outbuild levers already native:** `@provenance` (observed/generated/authored/derived),
  the PCG graph target, the 448-trait `behaviors:` default, and the 87.48% native-coverage ratchet.

## 6. Sequenced roadmap + first increment

| Order | Track | Cost | Leverage | Rationale |
|---|---|---|---|---|
| **1** | A — Interaction taste gate + typed events | **Low** | **High** | continues `/taste`, dogfoodable today, sets the pattern |
| **2** | C — Embodied mind emit seam | Med | **Max** | the moat; mostly an emit gap, pieces exist (D.102) |
| **3** | B — `@generator` + GeneratorIR | Med | High | the anti-average, unique-per-instance |
| **4** | D — Typed `@physical_response` + tactile SDF | High | Deep | sim=real, robot horizon |

**Recommended first increment (one coherent unit):** Track A's **typed event vocabulary +
`interaction_profile` + `check:interaction-taste` gate**, demonstrated live by upgrading the 7
just-reshaped examples from `on_click→show_info_panel` stubs to considered, object-specific
behavior — then blind-judged for *interaction* taste the same way form taste was. This:
1. extends the proven taste loop from form to behavior (one level up, same lens),
2. produces a **gate** (durable, ratcheting — not a one-off), and
3. establishes the **type → gate → dissolve** move the other three tracks copy.

## 7. Success metric

Tie to the existing ratchet: `check-native-coverage.mjs` (87.48% today) **plus** four new
gates (`interaction-taste`, `generator-determinism`, `embodied-mind-seam`, `material-physics`).
The plan raises native-authored coverage *and* adds the **"is-right, not looks-right"** dimension
the thesis demands — measurable, gate-derived, not asserted.

## 8. First-increment gate (F.076) — Track A, pinned before any build

Answered now so the seam and falsifiability are fixed before the first behavior-changing edit:

1. **Falsifiable claim.** When the slice is done, `check:interaction-taste` runs in the gate suite
   and (a) **flags** every object whose only handler body is a bare `trigger`/`emit` of a generic
   info/panel event (the assembled tell), and (b) **passes** objects that declare a typed
   `interaction_profile` + ≥1 non-generic reactive/state response. Measured: the 7 reshaped examples
   go from *N* flagged interactions to **0** after upgrade, and a deliberately-stubbed control object
   **stays flagged**.
2. **Real seam.** The typed `HoloEventName` union + `interaction_profile` are parsed by
   `HoloCompositionParser.ts` into the AST (`HoloCompositionTypes.ts`), consumed by
   `UaalBehaviorCompiler` at lowering, and the gate runs in the same `scripts/holo-ci/` +
   pre-commit path as `check-native-authoring-shape.mjs` / `check-native-coverage.mjs` — the real
   authoring→compile→gate pipeline, not a side script.
3. **Failing-if-broken evidence.** A fixture pair: `considered.holo` (typed profile + dusk/proximity
   reaction) must **PASS**; `assembled.holo` (only `on_click→show_info_panel`) must **FAIL** (exit 1).
   Plus a blind **interaction-taste** re-judge (the `/taste` loop one level up) on the upgraded
   examples must return CONSIDERED. If the gate can't separate the fixtures, the slice is not done.
4. **Scope + blast.** *In scope:* the typed event union + `interaction_profile` grammar in
   parser/types, the new gate under `scripts/holo-ci/`, and the 7 examples' handler bodies.
   *Out of scope:* runtime dispatch semantics (`UIEventRouter` stays — we type the vocabulary, not
   rewrite dispatch), Tracks B/C/D, materials. *Regression risk:* typing `HoloEventHandler.event`
   could break examples using freeform event strings — mitigated by a custom-event escape path + a
   WARN→BLOCK ratchet (same ladder as other gates), never a hard break.

---

*Every construct and gap above is file-path-grounded in the research run; no capability is claimed
without evidence. The `.ts` dissolution column of each track is the D.104 payoff: closing these gaps
moves behavior/generation/mind/physics logic out of TS glue and into typed `.holo`/`.hsplus` the
tools consume.*
