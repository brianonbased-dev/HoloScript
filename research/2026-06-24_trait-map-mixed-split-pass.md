# Trait Map — MIXED Trait-Level Split (Pass 1)

**Date:** 2026-06-24
**Author:** Claude (claude-opus-4-8, branch `claude/holoscript-traits-research-x8003q`)
**Builds on:** `research/2026-06-24_trait-map-framework-substrate-vs-skin.md` (founder-ruled
substrate-vs-skin spine, §7.1 names this pass).
**Deliverable:** `research/2026-06-24_trait-map-substrate-inventory.json` (machine-readable
SUBSTRATE inventory, 131 traits with frontier + contract roles).
**Method:** Name-based application of the framework §3 decision rules to all 442 names in the 20
MIXED categories. Strict honesty boundary: **SUBSTRATE = falsifiable against external physical
reality**; formal-but-unfalsifiable models (affect ODEs, behavior trees) and theme labels are skin.

---

## 1. Result

The trait-level split of the 442 MIXED names extracts **49 substrate traits**; the remaining 393
resolve to skin. Combined with the 82 from the original substrate categories:

|               | Before pass |     After pass |
| ------------- | ----------: | -------------: |
| **SUBSTRATE** |   82 (3.4%) | **131 (5.5%)** |
| SKIN          |           — |  2,269 (94.5%) |

The proof-carrying core roughly **doubled** but is still **~5.5% of the catalog**. That is the
honest, vision-aligned finding: the moat is small, precious, and was buried under theme-sorting.

**Substrate by provable frontier (131 total):** physics 40 · measurement 31 · causal 28 ·
geometry 21 · kinematics 11.

---

## 2. Per-Category Resolution (the 20 MIXED categories)

| Category                  |   n | → SUBSTRATE | Substrate extractions                                                                                                                                                                            |
| ------------------------- | --: | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **physical-affordances**  |  22 |      **11** | pendulum, spring*loaded, ratchet, gear_mechanism, pulley, hinge, piston, fulcrum, balance, crank, bellows — \_mechanical elements obey checkable kinematic/dynamic law*                          |
| **fabrication-devices**   |  10 |       **9** | printable, fdm*target, resin_target, laser_cuttable, cnc_millable, embroiderable, vinyl_cuttable, printability_feedback, fabrication_ready — \_manufacturability = geometric/physical invariant* |
| **healthcare-medical**    |  32 |       **7** | vital*signs, ecg, biofeedback, x_ray_scan, mri_scan, ct_scan, ultrasound — \_measurement/imaging of a real body*                                                                                 |
| **terrain-ocean**         |  20 |       **5** | terrain*hydraulic_erosion, terrain_thermal_erosion, ocean_fft, ocean_gerstner, ocean_buoyancy — \_erosion/wave/buoyancy physics*                                                                 |
| **iot-autonomous-agents** |  36 |       **5** | sensor, telemetry, digital*twin, twin_sync, twin_actuator — \_measurement + twin-fidelity-to-physical*                                                                                           |
| **audio**                 |  10 |       **4** | hrtf, audio*occlusion, ambisonics, reverb_zone — \_acoustic propagation physics*                                                                                                                 |
| **geospatial-web3**       |  10 |       **4** | geospatial*anchor, terrain_anchor, rooftop_anchor, vps — \_position fix against real world*                                                                                                      |
| **humanoid-avatar**       |  19 |       **3** | pose*estimation, hand_tracking, eye_tracked — \_measurement of real body pose*                                                                                                                   |
| **intelligence-behavior** |  41 |       **1** | pathfinding — _graph-search correctness is checkable_                                                                                                                                            |
| material-properties       |  33 |           0 | material _identity_ = skin; physical-constants companion is a **gap** (§4)                                                                                                                       |
| fabric-cloth              |  31 |           0 | cloth _objects/animations_ = skin; cloth-sim lives in `ClothTrait`/`SoftBody`                                                                                                                    |
| weather-phenomena         |  28 |           0 | phenomena as _spectacle_ = skin; seismic/flood/avalanche **sim is a gap** (§4)                                                                                                                   |
| object-interaction        |  25 |           0 | affordances; physics is in `@rigidbody`                                                                                                                                                          |
| construction-building     |  25 |           0 | building _objects_ = skin; structural-load wiring is a **gap** (§4)                                                                                                                              |
| safety-boundaries         |  15 |           0 | game zones = skin/operational; robotics safety-envelope-as-invariant is a **gap** (§4)                                                                                                           |
| affinity                  |  15 |           0 | affect ODEs are well-defined _math_ but **not falsifiable against physical reality** → skin (honesty boundary)                                                                                   |
| locomotion-movement       |  14 |           0 | affordances; navmesh/kinematics live in solvers                                                                                                                                                  |
| core-vr-interaction       |  14 |           0 | interaction affordances; throw/fracture physics in `@rigidbody`/`@destruction`                                                                                                                   |
| transportation-vehicles   |  12 |           0 | vehicle parts/affordances; dynamics in `@rigidbody`/`@buoyancy`                                                                                                                                  |
| maritime-naval            |  30 |           0 | naval objects/parts; buoyancy in `@ocean_buoyancy`/`BuoyancyTrait`                                                                                                                               |

**The dominant pattern:** most MIXED categories are skin _over_ a substrate solver that already
exists elsewhere (cloth, fracture, buoyancy, navmesh). The split correctly leaves them as skin —
the proof lives in the solver trait they compose with, not in the affordance label.

### Boundary calls worth flagging for review

- **affinity → skin (all 15).** `affinity_ode` is a real numerical model, but "love = this ODE" is
  not falsifiable against physical reality, so classifying it substrate would be the exact overclaim
  the thesis forbids. Kept skin. Contestable; founder may rule "causal/dynamical" frontier admits it.
- **flocking/swarming → skin.** Collective-motion models are well-defined but not physical-law
  falsifiable; kept skin alongside `behavior_tree`/`goal_oriented`.
- **digital_twin → substrate.** Admitted because a twin carries a _checkable invariant_: deviation
  from the physical it mirrors. Its proof is fidelity, and that is measurable.

---

## 3. Contract-Role Assignment (Axis 2)

Each substrate trait in the inventory carries illustrative `contractRoles` by frontier:

- **measurement** (sensors, imaging, pose, position) → `[precondition, receipt]` — calibrated
  inputs in, timestamped reading + uncertainty out.
- **physics / causal / kinematics** (solvers, mechanics, twins) → `[precondition, invariant,
receipt]` — valid envelope, maintained law, verifier output.
- **geometry** (manufacturability, reconstruction) → `[precondition, invariant]` / `[receipt]`.

These are name-derived and marked `proofStatus: "unverified"` — the per-handler audit (§5) is what
upgrades each to real / thin / overclaimed.

---

## 4. Substrate GAPS Surfaced by the Split (feeds "missing traits")

Five MIXED categories resolved to "skin exists, the substrate-half is **missing**." These are
genuinely-absent proof-carrying traits the catalog implies but never built — they connect directly
to the missing-traits survey (`research/2026-06-24_holoscript-traits-survey-and-missing-traits.md`):

1. **Material physical-constants trait.** `@wooden`/`@concrete_reinforced` name a look; nothing
   carries density / Young's modulus / friction / thermal conductivity into the structural/thermal
   solvers. A `@material_constants` substrate trait would make material identity _prove_ under sim.
2. **Structural-load trait for buildings.** `@wall`/`@bridge`/`@foundation` exist as objects; the
   (real) Structural solver is never wired to them. A `@load_bearing` trait (invariant: stress <
   yield) closes it.
3. **Seismic / hydrological event sim.** `@earthquake`/`@tsunami`/`@flood`/`@avalanche` are
   spectacle; no solver discharges them. Granular/fluid solvers exist — wiring is the gap.
4. **Robotics safety-envelope-as-invariant.** `safety-boundaries` are game zones; the Twin-Earth
   safety-envelope (actuation-stays-in-bound _invariant_) is the substrate version and isn't a
   catalog trait.
5. **Acoustic-material absorption.** `audio_material` is presentation; its substrate-half (absorption
   coefficients feeding the acoustic solver) is implied but absent.

---

## 5. Next Steps

1. **Per-handler audit** of the 131 substrate traits → set `proofStatus` to real / thin /
   overclaimed (deep-ratchet method, F.075). This is where overclaims get caught.
2. **Skin sub-tag pass** (presentation vs operational) on the 2,269 skin traits — navigational, lower
   priority; needed before the map fully replaces the registry.
3. **Build the four gap traits** in §4 that are pure wins (material_constants, load_bearing wiring,
   acoustic_material) — small, and each turns an existing skin into a provable composition.
4. **Wire the gate** (`class: skin ∧ contractRoles≠∅ → error`) and emit the map from
   `scripts/generate-trait-registry.ts`.

---

## 6. What Remains After This Plan (Completeness Gaps)

- **Name-based, not handler-verified.** Every substrate pick is from the trait _name_. The per-handler
  audit (§5.1) will likely demote some to skin (a "substrate" trait with no checkable contract is an
  overclaim) — so 131 is an _upper_ estimate of the name-plausible substrate, not a verified count.
- **`contractRoles` are illustrative, not read from handlers.** Assigned by frontier heuristic.
- **Skin is undifferentiated.** The 2,269 skin traits are not yet split presentation vs operational.
- **Boundary calls not individually ratified.** affinity→skin, flocking→skin, digital_twin→substrate
  are defensible but a few may move on founder/handler review (§2).
- **Gap traits in §4 are specs, not built.** No code shipped this pass; the inventory JSON and these
  docs are the artifacts.
