# Trait Map — Substrate Per-Handler Audit (proofStatus pass)

**Date:** 2026-06-24
**Author:** Claude (claude-opus-4-8, desktop seat — continuing the cloud handoff)
**Builds on:** `research/2026-06-24_trait-map-mixed-split-pass.md` (§5.1 names this audit) and the
founder-ruled substrate-vs-skin spine (`research/2026-06-24_trait-map-framework-substrate-vs-skin.md`).
**Method:** Deep-ratchet per-handler read (F.075). 4 parallel audit subagents read every
handler-backed candidate + the two ambiguous constants families (terrain-ocean, physical-affordances);
family rules applied to pure-vocabulary names; cross-referenced
`research/2026-05-24_deep-ratchet-trait-solver.md`. Verdicts are evidence-first (file:line), name-blind.
**Deliverable:** `research/2026-06-24_trait-map-substrate-inventory-AUDITED.json` (128 traits with
verified `proofStatus` + `auditEvidence`; the 84 overclaims carry `demotedTo: skin`).

---

## 1. Headline

The first-pass inventory listed **131 name-based "substrate" picks**. The audit found:

| | First pass (name-based) | After per-handler audit |
|---|---:|---:|
| Entries | 131 | **128 unique** (3 were duplicates) |
| **REAL** (genuine solver/computation + checkable contract) | — | **11** |
| **THIN** (real capability nearby; this name skeleton/delegated/config-mode) | — | **33** |
| **OVERCLAIMED** (vocabulary only / does nothing checkable) → demote to skin | — | **84** |

**The name-based pass overcounted substrate by ~3×.** Of 128 candidates, **84 (66%) prove nothing**
and are demoted to skin; only **11 are unambiguously proof-carrying** (~0.47% of the 2,352-name
catalog, ~8.6% of the candidate set). The "verified substrate floor" (REAL + THIN) is **44** — and even
that counts 33 traits whose proof lives in a parent solver, not the trait itself.

This is the honesty boundary made measurable, applied recursively to our own map (GOLD W.GOLD.534,
audit-as-calibration of one's own conclusions): the moat is **smaller and more precious** than the
name-based spine suggested. Surfacing exactly which 11 carry proof is the point.

> **Dup finding:** `holomap_reconstruct`, `holomap_camera_trajectory`, `holomap_anchor_context` were
> each listed twice in the first-pass inventory. The audited JSON dedups to 128.

---

## 2. The verified proof-carrying core (11 REAL)

These are the traits whose handler genuinely runs a solver/computation with a checkable contract:

| Trait | Frontier | What it actually proves (file:line) |
|---|---|---|
| `thermal_simulation` | causal | real thermal `SimulationSolver`, stepped, emits receipt (`SimulationTraitHandlers.ts:33-70`) |
| `structural_fem` | causal | real FEM solver, solves + receipt (`:85-123`) |
| `hydraulic_pipe` | causal | real hardy-cross solver, solves + receipt (`:139-179`) |
| `fluid` | physics | engine `MLSMPMFluid` GPU solver, stepped (`FluidTrait.ts:127-210`) — **conditional on `gpuDevice`** |
| `soft_body` | physics | engine `SoftBodySolver` PBD, stepped each frame (`SoftBodyTrait.ts:159-193`) |
| `buoyancy` | physics | Archimedes F=ρVg + submersion + drag in-handler (`BuoyancyTrait.ts:104-188`) |
| `destruction` | physics | fragment integration loop + damage model (`DestructionTrait.ts:166-230`) |
| `holomap_reconstruct` | geometry | drives real `HoloMapRuntime` end-to-end (encode/depth/pose/drift/loop-closure/provenance) |
| `eye_tracked` | measurement | gaze-ray geometry + dwell on WebXR rays (`EyeTrackedTrait.ts:78-147`) |
| `biofeedback` | measurement | calibrated normalization + timestamped sample + edge detection (`BiofeedbackTrait.ts:118-160`) |
| `twin_actuator` | causal | safety-envelope precondition gate + numeric bounds before actuation (`TwinActuatorTrait.ts:20-115`, D.044) |

---

## 3. Five generalizable anti-patterns (why 84 were overclaims)

The demotions are not random — they cluster into five named failure modes, each actionable:

1. **Dead-delegation (3 traits — the highest-ROI fix).** `fluid_simulation`, `granular_material`,
   `voronoi_fracture` each ship a *genuinely real solver class in the same file* (SPH with poly6/spiky
   kernels; DEM with spring contact + Coulomb friction; damage/crack propagation), but the handler's
   `onUpdate` calls `instance.onUpdate(node, ctx, dt)` while the System class only exposes `step(dt)` —
   so the guard is always false and the solver is **never stepped**. `fluid_simulation` is worse: it
   `new SpatialHash(config)`s the neighbor-hash helper instead of the solver. **These are ~1-line
   wiring fixes that would turn 3 overclaims into 3 REAL substrate traits** — a pure win the handoff's
   gap-trait list didn't name. (Distinct from deep-ratchet's "echo-stub" family: here the math exists
   but is unreachable.)
   > **SHIPPED (this commit):** `granular_material` is fixed and promoted to REAL — `onUpdate` now falls
   > back to `step(dt)` (with `step?` added to `TraitInstanceDelegate`), and `GranularMaterialTrait.test.ts`
   > proves a particle falls under gravity through the trait lifecycle. Verified count is now **12 REAL / 33
   > THIN / 83 OVERCLAIMED**. `fluid_simulation` (swap `new SpatialHash` → `new FluidSimulationSystem` + the
   > same step fallback) and the non-fix `voronoi_fracture` (event-driven + fake voronoi) remain queued.
2. **Deprecated dead stub, zero listeners** (`cloth`, `chain`). `cloth` self-declares DEPRECATED in its
   header; `chain.onUpdate` is an explicit no-op. Emit-only shells; real engines exist elsewhere, unwired.
3. **Visualization-as-substrate** (`scalar_field_overlay`, `colormap_jet/viridis/turbo/inferno/coolwarm`).
   These are presentation (a renderer reads the config) mislabeled substrate because they sit in the
   `simulation-domains` category. Pure skin/presentation.
4. **Vocabulary-as-substrate** (the bulk: 19 water-fluid adjectives, 17 measurement-sensing labels, 6
   healthcare-imaging labels, 10 physical-affordance mechanisms, 9 fabrication labels, 2 ocean spectral
   names, …). Names with **no handler at all** — the parser accepts them, nothing computes. The
   honesty-boundary core of the demotion.
5. **Config-mode-as-trait** (the 33 THIN). `thermal_conduction`, `structural_static`, `hydraulic_valve`,
   `terrain_thermal_erosion`, `ocean_buoyancy`, `hinge` — a **real parent solver exists** (thermal/
   structural/hydraulic/ErosionSim/buoyancy/joint) but this specific name has no dedicated handler/
   contract; it is a parameter mode of the parent. Kept as THIN (not demoted): the proof is reachable,
   just not via this name.

---

## 4. What this hands the next phases

- **Gap traits (handoff §2b) — confirmed and extended.** The audit confirms the three named gaps each
  turn an overclaimed family into a provable composition: `@material_constants` (material-properties are
  all skin labels), `@load_bearing` (`structural_load` is THIN — parent FEM solver exists, the building
  objects aren't wired to it), `@acoustic_material` (audio absorption is skin; `hrtf`/`ambisonics` are
  overclaimed). **Add a fourth pure win the audit surfaced:** the 3 dead-delegation wiring fixes (§3.1)
  — cheaper than any new trait and each yields a REAL solver.
- **The gate (handoff §2c) — the demotion list IS the gate's first catch.** `class:skin ∧
  contractRoles≠∅ → error` would fire on all 84 demoted traits had they kept their illustrative
  contractRoles. The audited JSON has already cleared `contractRoles` on the 84, so the gate's initial
  state is clean; the gate's job is to keep it that way (block re-introduction).
- **Map emission (handoff §2d).** The AUDITED JSON is the substrate half of the registry the
  `generate-trait-registry.ts` rewrite should emit, now with verified `proofStatus`.

---

## 5. What remains (completeness gaps — honest)

- **`fabrication-devices` (9) classified by family rule, not per-handler read.** No handler matched in
  the name→handler map, so they were ruled overclaimed; a dedicated printability/geometry checker (if one
  exists under a non-obvious name) would make them real. Contestable — flagged, not individually opened.
- **THIN is a holding class, not a verdict.** The 33 THIN traits deserve a follow-up: either wire the
  name to its parent solver (promote to REAL) or fold it into the parent and demote the bare name.
- **Skin is still undifferentiated.** The 84 demoted + the original 2,269 skin are not split
  presentation vs operational; that navigational pass is still pending.
- **No code shipped this pass.** This is the audit artifact (JSON + this doc). The gate is specified,
  not wired; the gap traits are specified, not built; the dead-delegation fixes are diagnosed, not applied.
- **Boundary calls inherited from the first pass** (affinity→skin, flocking→skin, digital_twin→substrate)
  were not re-litigated here; `digital_twin` audited to THIN (real divergence metric, thin contract).
