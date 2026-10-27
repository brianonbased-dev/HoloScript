# Proposal: native rigging P0 - @rig and @skeleton { adjust } (A30)

Status: DRAFT, docs only. Nothing in this document is implemented. No code, no grammar change, no handler.
Date: 2026-10-26 (America/Phoenix, MST). Author: Avatar and Rigging; rulings by Chief Linguist.
Approval: A30 (2026-10-23 3:13 PM MST, Joseph): "Yes: add @rig, @skin_weights, @ik, @animation.retarget and the @skeleton adjust". Staged P0-P7 as gated draft PRs after A20 and Brian steps 0-2.
Design source: Documents\holo-specs\native-rigging-design-20261023.md (Chief Linguist). Accepted plan: C:\holo-dev\vision\specs\rigging-p0-plan-20261026.md.
Base: origin/main a4fdbacc4e0789d4612b7ebd6f1c4e4f4145d6e5 (code line numbers below are from that design doc and were not re-verified here).

## 1. Scope
P0 is the syntax and stdlib proposal for `@rig` and `@skeleton { adjust }` plus the conformance spec that P1 (rig-checks, tests written failing first) will encode. `@skin_weights`, `@ik` and `@animation.retarget` are approved by A30 but are out of scope for this document.
Out of scope: code, fixtures, handlers, grammar changes. P1 and later start only after A20 and Brian steps 0-2.

## 2. Surface
Traits on an existing `object` block. The grammar does not change; `@rig` is a new trait name and `@skeleton` gains an optional `adjust` field.

    object "Brian" {
      model: "assets/Brian_Flexing_001.glb"
      @rig { standard: "humanoid", bind_pose: "t_pose" }
      @skeleton { adjust { arm { length: 1.2 } } }
    }

`guide` is optional: `@rig { standard: "humanoid", guide: "assets/Brian_Body_Map.jpg" }`.
The design doc's original example (dotted keys, `bend`, `bind_pose: "auto"`) is superseded by the rulings in section 3.

| Field | Meaning | Validation |
|---|---|---|
| @rig.standard | template to fit; VRM-1.0 humanoid bone set, about 22 bones | only "humanoid" |
| @rig.guide | optional body-map image; landmarks project through UVs | no UVs: texture-dependent checks report unknown |
| @rig.bind_pose | t_pose or a_pose; defaults to t_pose or a_pose per ruling 5 | any other value is a compile error with a plain message |
| @rig.max_influences | max bones per vertex | 4 per the design doc tests |
| @skeleton.adjust.<bone>.length | bone length scale | 0.5-2.0; outside the range is a compile error |

Plain messages (proposed wording):
- `"arm.length" must be between 0.5 and 2.0; you wrote 3.`
- `bind_pose "auto" is not allowed; use t_pose or a_pose.`
- `Can't rig "Brian": no landmark confidence method is configured. Rig result: unknown.`

## 3. Chief Linguist rulings (reversible P0 defaults)
1. Adjust keys are nested: `adjust { arm { length: 1.2 } }`.
2. `place` is out of P0.
3. `bend` is out of P0. `length` is the only adjust property, range 0.5-2.0; outside the range is a compile error.
4. `rig: unknown` is both a .holo value and a diagnostic; by default the value carries the reason.
5. `standard` allows only humanoid. `bind_pose` defaults to t_pose|a_pose; any other value is a compile error with a plain message (same as an out-of-range adjust length).
6. `guide` is optional. With no UVs, weights still work and texture-dependent checks report unknown.
7. `adjust` applies after `@rig`. On an existing VRM skin it applies only when rig confidence is known; otherwise unknown.
8. The canonical skeletonHandler is SkeletonTrait.ts:747. The duplicate at VRTraitSystem.ts:1343 goes to Conformance as a card, unchanged in P0.
9. `load_humanoid_avatar` returns UNKNOWN until a builtin exists.
10. VRM-1.0 casing (leftUpperArm) is canonical; other casing (LeftUpperArm) is normalized with a warning that names both spellings.
11. The landmark confidence method is undefined: an open gap. A rig reads unknown until a method is chosen.
P0 stays docs only.

## 4. Brian working definitions (reversible)
- Step 0: provenance (identity spec, #643). Done: Trust ruled Brian synthetic (A33).
- Step 1: import Brian's .glb only behind the sha256 gate, with fallback and refusal tests for other .glb files (#646).
- Step 2: make Brian a customizable .holo character via A35's optional agent/unknowns fields on `@avatar_embodiment`, with no grammar change.
**Gap: Brian step 1 is not done. #646 only records a sha256 per GLB in a manifest; it has no sha256 import gate and no refusal tests for other .glb files. P0 uses fixture Brian_Flexing_001.glb until that lands.**
Fixture note: #646 was OPEN (not merged) when this was written, and as read it adds an import report and turntable under scripts/brian/ that records sha256 per GLB in a manifest; it does not itself contain a sha256 gate or refusal tests. Until a gate lands, conformance cases that need a Brian .glb reference a fixture .glb (Brian_Flexing_001.glb: 0 skins, 0 animations, 1 mesh) and say so in the receipt. Today Brian reads "static mesh x4 poses, no skeleton = unknown rig".

## 5. Honesty contract: rig: unknown (never fake a rig)
`@rig` yields pass, fail or unknown with reasons. It yields unknown when:
- the landmark confidence method is undefined (ruling 11; true today, so every rig is unknown),
- any landmark confidence is below 0.80,
- the mesh does not look like a standing humanoid,
- any required check fails or cannot run (for example texture checks with no UVs).
On unknown, no skin, joints or weights go downstream, and the .holo value carries the reason (ruling 4).

## 6. Measured thresholds (confirmed by Chief Linguist)
| # | Check | Threshold | How measured |
|---|---|---|---|
| T1 | Topology | exact bone set, parent tree and names vs VRM-1.0 humanoid; deterministic | template compare; run twice, identical skeleton hash |
| T2 | Landmark confidence | >= 0.80 each, else unknown | METHOD UNDEFINED (ruling 11) -> unknown |
| T3 | Joint placement | within 3% of body height | about 15 hand-annotated points (wrists, elbows, shoulders, hips, knees, ankles, neck, head top) in a fixture JSON |
| T4 | Weights | per-vertex sum = 1 +/- 1e-5; <= 4 influences; 0 orphans; cross-limb bleed < 0.01 | per-vertex scan |
| T5 | Deformation | volume change <= 10%; self-intersection <= 0.5% of triangles (elbow/knee 90 deg, forearm 90 deg twist) | signed volume of the limb segment; triangle intersection test |
| T6 | Round trip | glTF-Validator 0 errors; re-import bones and weights match | Khronos validator plus gltf-importer diff |
| T7 | Blender reference | joints within 2% of body height; mean weight L1 <= 0.15 | one-time Blender hand-rig of Flexing stored as a fixture (Blender is not a dependency) |
| T8 | Adjust range | length in 0.5-2.0 | compile-time check |
P0 gates for this slice: T1, T2, T3, T8. T4-T7 belong to P3/P4 but share the same rig-checks receipt.

## 7. Conformance cases (spec only; written failing in P1)
- rig-checks module: input (mesh, skeleton, weights, optional ground-truth JSON); output a JSON receipt with metrics, thresholds, pass/fail/unknown, input hashes and commit SHA.
- Negative fixtures: dragon.glb (studio/public/models) must return unknown; a mesh with no UVs returns unknown for texture checks while weight checks still run; with the confidence method undefined, every rig returns unknown.
- Adjust: nested length in range scales only that bone; length 3 is a compile error; `bend` or `place` is a compile error (out of P0); unknown bone gives a plain error; adjust on an unknown rig gives unknown with its reason; adjust on a VRM skin only with known rig confidence; `LeftUpperArm` normalizes to `leftUpperArm` with a warning.
- bind_pose: t_pose and a_pose accepted; any other value is a compile error with a plain message.
- `load_humanoid_avatar` returns UNKNOWN.
- Brian: the fixture .glb (4 static pose meshes, 0 skins) reads unknown, never a pass.
- Back-compat: existing @skeleton tests (SkeletonTrait) stay green unchanged.
- Every PR is a draft with a Mapping seat and the Release gate.

## 8. Dependencies
| Dep | Status |
|---|---|
| A20 | standing-approvals.md L85-86: the parser rejects parameter defaults in .holo logic functions with a clear error (option A); draft PR via the merge gate. |
| Brian step 0 | provenance / identity spec #643; A33 (synthetic). |
| Brian step 1 | #646 (OPEN when written); sha256 gate and refusal tests per the working definition. |
| Brian step 2 | A35 optional agent/unknowns fields on @avatar_embodiment (feat/avatar-embodiment-agent-unknowns). |
| Code anchors (design doc) | HoloScriptRuntime.ts:568 registerTrait; SkeletonTrait.ts:729/747; VRTraitSystem.ts:1343; HumanoidLoader.ts:373; gltf-importer.ts:899/976; engine IKSolver; CharacterWebGPUCompiler.ts:127 |

## 9. Risks
- No landmark confidence method means every rig is unknown; P2 cannot pass until one is chosen.
- Casing normalization may hide typos; the warning must name both spellings.
- The duplicate skeletonHandler stays live until Conformance acts on the card.
- The Blender reference is a single manual rig (n=1).
- Pose meshes may not share topology, so retarget (P5) would be unknown.
- Overclaims (playground.holo "skeleton", GLTFPipelineMCPTool "animations") stay live until P6.
- Code line numbers are from the design doc and may have drifted.

## 10. Receipt
Proven from the files read: the design doc surface and P0-P7 staging; thresholds (confirmed by Chief Linguist); the 0.80 unknown rule; the A20 text and A30 scope; #646 title, state and file list as shown by gh.
Assumptions: the design doc's code citations are accurate (the doc states nothing was built or run); the Brian working definitions are as given by Chief Linguist and reversible.
Not proven: any runtime behaviour; a confidence method; that #646 contains a sha256 gate or refusal tests (as read it does not); the contents of A35's fields; current origin/main beyond a4fdbacc.