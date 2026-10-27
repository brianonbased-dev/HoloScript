# Proposal: native rigging P0 - @rig and @skeleton { adjust } (A30)

Status: DRAFT, docs only. Nothing in this document is implemented. No code, no grammar change, no handler.
Date: 2026-10-26 (America/Phoenix, MST). Author: Avatar and Rigging; rulings by Chief Linguist.
Approval: A30 (2026-10-23 3:13 PM MST, Joseph): "Yes: add @rig, @skin_weights, @ik, @animation.retarget and the @skeleton adjust". Staged P0-P7 as gated draft PRs after A20 and Brian steps 0-2.
Design source (local, not in repo): Documents\holo-specs\native-rigging-design-20261023.md (Chief Linguist). Accepted plan (local, not in repo): C:\holo-dev\vision\specs\rigging-p0-plan-20261026.md. Reviewers without this laptop cannot open either file.
Base: origin/main a4fdbacc4e0789d4612b7ebd6f1c4e4f4145d6e5. The code line numbers cited below were re-verified against that commit (see section 3a and the receipt).

## 0. What Joseph has approved and what is still a PROPOSAL
Approved by A30: only the NAMES `@rig` and `@skeleton` adjust (the `adjust` field on `@skeleton`).
Everything else in sections 2 and 3 is a PROPOSAL that needs Joseph's yes before P1 starts. The Chief Linguist rulings in section 3 are reversible P0 defaults, not Joseph approvals. The proposals are:
- the nested block form `adjust { arm { length: 1.2 } }`,
- the value `rig: unknown` (as a .holo value and a diagnostic),
- `@rig.guide`,
- `@rig.bind_pose` and its values 't-pose' and 'a-pose' (default 't-pose'),
- `@rig.max_influences`,
- the 0.5-2.0 range and the compile error for values outside it,
- VRM casing normalization (leftUpperArm canonical, other casing normalized with a warning).
Parser status: NOT verified. I have not checked that the current .holo parser accepts a nested `adjust { arm { length } }` block inside a trait. The claim "no grammar change" is an assumption until that is tested; if the parser rejects it, the form needs a different spelling or a grammar change, and either needs Joseph's yes.

## 1. Scope
P0 is the syntax and stdlib proposal for `@rig` and `@skeleton { adjust }` plus the conformance spec that P1 (rig-checks, tests written failing first) will encode. `@skin_weights`, `@ik` and `@animation.retarget` are approved by A30 but are out of scope for this document.
Out of scope: code, fixtures, handlers, grammar changes. P1 and later start only after A20 and Brian steps 0-2.

## 2. Surface (PROPOSAL, except the names @rig and @skeleton adjust)
Traits on an existing `object` block. The grammar is assumed not to change (not verified, see section 0); `@rig` is a new trait name and `@skeleton` gains an optional `adjust` field.

    object "Brian" {
      model: "assets/Brian_Flexing_001.glb"
      @rig { standard: "humanoid", bind_pose: "t-pose" }
      @skeleton { adjust { arm { length: 1.2 } } }
    }

`guide` is optional: `@rig { standard: "humanoid", guide: "assets/Brian_Body_Map.jpg" }`.
The design doc's original example (dotted keys, `bend`, `bind_pose: "auto"`) is superseded by the rulings in section 3.

| Field | Meaning | Validation | Status |
|---|---|---|---|
| @rig.standard | template to fit; VRM-1.0 humanoid bone set (size to be pinned, see section 3a) | only "humanoid" | PROPOSAL |
| @rig.guide | optional body-map image; landmarks project through UVs | no UVs: texture-dependent checks report unknown | PROPOSAL |
| @rig.bind_pose | 't-pose' or 'a-pose'; default 't-pose' (same strings and default as @auto_rig) | any other value is a compile error with a plain message | PROPOSAL |
| @rig.max_influences | max bones per vertex | 4 per the design doc tests (@auto_rig also uses 4) | PROPOSAL |
| @skeleton.adjust.<bone>.length | bone length scale | 0.5-2.0; outside the range is a compile error | PROPOSAL |

Open: what `arm` means. `arm` is neither a VRM bone name (leftUpperArm) nor a repo bone name (left_upper_arm); which bones and which side it scales is undefined in the design doc and here.

Plain messages (proposed wording):
- `"arm.length" must be between 0.5 and 2.0; you wrote 3.`
- `bind_pose "auto" is not allowed; use 't-pose' or 'a-pose'.`
- `Can't rig "Brian": no landmark confidence method is configured. Rig result: unknown.`

## 3. Chief Linguist rulings (reversible P0 defaults; each is a PROPOSAL until Joseph says yes)
1. Adjust keys are nested: `adjust { arm { length: 1.2 } }`. (Parser acceptance not verified.)
2. `place` is out of P0.
3. `bend` is out of P0. `length` is the only adjust property, range 0.5-2.0; outside the range is a compile error.
4. `rig: unknown` is both a .holo value and a diagnostic; by default the value carries the reason.
5. `standard` allows only humanoid. `bind_pose` allows 't-pose' or 'a-pose' and defaults to 't-pose'; any other value is a compile error with a plain message (same as an out-of-range adjust length).
6. `guide` is optional. With no UVs, weights still work and texture-dependent checks report unknown.
7. `adjust` applies after `@rig`. On an existing VRM skin it applies only when rig confidence is known; otherwise unknown.
8. The canonical skeletonHandler is SkeletonTrait.ts:747. The duplicate at VRTraitSystem.ts:1343 goes to Conformance as a card, unchanged in P0.
9. `load_humanoid_avatar` returns UNKNOWN until a builtin exists.
10. VRM-1.0 casing (leftUpperArm) is canonical; other casing (LeftUpperArm) is normalized with a warning that names both spellings. (See section 3a: the repo's own bone names are snake_case.)
11. The landmark confidence method is undefined: an open gap. A rig reads unknown until a method is chosen.
P0 stays docs only.

## 3a. Relation to existing code (read at a4fdbacc; nothing was run)
@auto_rig already exists (packages/core/src/traits/AutoRigTrait.ts):
- It already uses 't-pose' and 'a-pose' (AutoRigPose, L5-7) and defaults to 't-pose' (createNativeAutoRigPlan, L202-236). So `@rig.bind_pose` takes the same hyphenated values and the same default; this document no longer uses t_pose or a_pose.
- It seeds a 21-bone skeleton (standard 'HoloScriptHumanoid21', createHumanoidBones L98-188), with weighting solver 'heat-diffusion-seed', maxInfluences 4 and status 'seeded'. A 7-bone custom scaffold exists too (L190-199). As read, it has no pass/fail/unknown result and no confidence gate.
- Open question for Chief Linguist and Joseph: does `@rig` replace, wrap or sit beside @auto_rig? Not decided here. Not checked: whether any shipped .holo composition uses @auto_rig today.

Bone counts: the repo currently shows 55, 21 and about 22-25, and they are not the same set:
- 55 bones: HUMANOID_BONE_NAMES (packages/engine/src/character/HumanoidSkeleton.ts:36-103). I counted 55 entries with a script. BONE_ORDER in packages/engine/src/character-render/AgentAvatarMesh.ts:567 is set equal to it, and skeleton.holo describes a "55-bone BONE_ORDER". Names are snake_case: root, hips, spine, spine1, spine2, neck, head, left_shoulder, left_upper_arm, left_forearm, left_hand, 15 finger bones per hand (left_thumb_proximal ...), left_upper_leg, left_lower_leg, left_foot, left_toes, left_toe_end, and the right-side equivalents. The same file's title and comments say "65-bone", and SkeletonStandardRegistry.ts calls its canonical set "65-bone" (id holoscript_65); the array has 55 entries. I did not trace whether the registry's HumanoidBoneName type is exactly this array's type (it appears to be imported from it; unverified).
- 21 bones: @auto_rig's seeded humanoid. Its HOLOSCRIPT_HUMANOID_BONE_MAP (L57-79) maps VRM-style camelCase keys (hips, spine, chest, leftUpperArm, leftLowerArm ...) to snake_case names such as left_lower_arm. The 55-bone set instead uses left_forearm and spine2, so the 21-bone names and the 55-bone names are not the same vocabulary (for example left_lower_arm vs left_forearm, chest vs spine2).
- About 22 bones: this document's earlier "about 22 VRM bones" was an estimate and is NOT verified against the VRM spec. What I can state from the repo: the vrm1 profile in SkeletonStandardRegistry.ts maps 51 of the 55 canonical bones (21 body bones plus 30 finger bones, counted by script) to VRM camelCase names, for example spine2 -> chest, left_forearm -> leftLowerArm, left_pinky_proximal -> leftLittleProximal. Unmapped to VRM 1.0 in that profile: root, spine1, left_toe_end, right_toe_end. The VRM 1.0 spec's own bone list was not re-read here.
- Proposed consequence (needs a decision): T1 ("exact bone set vs VRM-1.0 humanoid") must say which set it checks (21, about 22-25 body bones, or the 55-bone canonical) and which casing the adjust keys use. Ruling 10 makes VRM camelCase canonical, while the repo's canonical internal names are snake_case and go through the registry's mapping.

Overlap with `standard:`:
- packages/engine/src/character/SkeletonStandardRegistry.ts defines profile ids vrm1, vrm0, rpm, mixamo, ue_mannequin, metahuman, daz_genesis8, daz_genesis9, autorig_pro, cc3 and holoscript_65, with mappingConfidence, boneMap, resolveProfileBone and matchSkeletonStandard. Ruling 5 allows only `standard: "humanoid"`; whether "humanoid" should be an alias for a registry id (vrm1 or holoscript_65) or whether `standard` should accept registry ids is open.
- The MCP tool rig_match_skeleton (packages/mcp-server/src/tools/rig_match_skeleton.ts, handler at handlers.ts:999-1001) ranks standards by bone-name overlap and returns a refusable diff against the 65-bone canonical with per-bone refusal below a threshold. The handbook (docs/handbooks/srnh-sim-and-realism-native-holoscript.md:176) marks it REAL as name-matching, not retarget execution. It measures name overlap, not landmark confidence, so by itself it does not settle ruling 11; whether to reuse it is not evaluated here.
- SkeletonTrait.ts has no `adjust` field today (grep found no match); BoneDefinition is at :51, HumanoidBoneMap at :71, SkeletonConfig at :225.

Code line anchors re-verified at a4fdbacc (the cited line holds the cited symbol): HoloScriptRuntime.ts:568 registerTrait; SkeletonTrait.ts:729 createSkeletonTrait and :747 skeletonHandler; VRTraitSystem.ts:1343 skeletonHandler; HumanoidLoader.ts:373; gltf-importer.ts:899 importGltf and :976 importGltfToFile; CharacterWebGPUCompiler.ts:127; MorphTrait.ts:851; the IKSolver is packages/engine/src/animation/IKSolver.ts. Not re-verified: the design doc's behavioural claims about those symbols.

## 4. Brian working definitions (reversible)
- Step 0: provenance (identity spec, #643). Done: Trust ruled Brian synthetic (A33).
- Step 1: import Brian's .glb only behind the sha256 gate, with fallback and refusal tests for other .glb files (#646).
- Step 2: make Brian a customizable .holo character via A35's optional agent/unknowns fields on `@avatar_embodiment`, with no grammar change.
**Gap: Brian step 1 is not done. #646 only records a sha256 per GLB in a manifest; it has no sha256 import gate and no refusal tests for other .glb files. P0 uses fixture Brian_Flexing_001.glb until that lands.**
Fixture note: #646 (head bd55b08a639b5041ee10181566214a60e9984041, branch feat/brian-import-turntable, draft, OPEN, confirmed with gh on 2026-10-26) adds an import report and turntable under scripts/brian/ that records sha256 per GLB in a manifest; as read it does not itself contain a sha256 gate or refusal tests. Until a gate lands, conformance cases that need a Brian .glb reference a fixture .glb and say so in the receipt.
Fixture facts (measured): there are 4 canonical Brian .glb files, each a single frozen pose. Each file has 1 mesh (named Brian_01), 2 nodes, no skins and no animations. So "4 static pose meshes" means 4 files with 1 mesh each, not 4 meshes in one file. How I know: I read the GLB JSON chunk of Brian_Flexing_001.glb, Brian_Boxing.glb and Brian_Situps.glb on the Work laptop (read-only) and found meshes=1, nodes=2, no `skins` key and no `animations` key in each. The fourth file, Bicycle Crunch.glb, was not found in the Pictures folder, so its count is taken from the identity spec ("static x4", one pose mesh each) and is unverified. Today Brian reads "static mesh x4 poses, no skeleton = unknown rig".

### 4a. Brian_Flexing_001.glb is NOT in the repo: BLOCKER for conformance work
- Not in this repo at a4fdbacc (git ls-files finds no Brian .glb).
- Local source: C:\Users\josep\OneDrive\Pictures\Brian_Flexing_001.glb (local, not in repo), 2586716 bytes, modified 2026-01-18.
- sha256: 587ce59f7e164bb355930a6c3a3e9ed3fbd070ad6c7ca9cc0f3f4e11a2a987fe (computed locally; it matches the sha256 in the identity spec brian.identity.json on branch docs/brian-identity-spec, commit 98288a389, which is NOT merged to origin/main at the time of writing).
- Source and provenance: the identity spec says the file is Joseph's original character, synthetic (A33), exported from 3ds Max with the Autodesk glTF exporter. That exporter claim comes from the export logs of Brian_Boxing.glb and Brian_Situps.glb only; Brian_Flexing_001.glb has no log and its own glTF asset block carries no generator or copyright field, so its exporter is unverified.
- License: none found. No LICENSE file or license field accompanies the file. The creator is Joseph, but a license for committing it to a public repo is not stated and needs Joseph's decision.
- Other Brian files, same sha256 rule: Brian_Boxing.glb e5f990c9a6ae3d89f247416436ab33a66decb18b6e72e5b8288fa79f0652730b; Brian_Situps.glb 5e6437543aae8081cb1643d45473e92fa103404c66383cf7686fa8274c69fc1e; Bicycle Crunch.glb 7278d1c17a60cb2b406101f5e39e2cd11032ff31948fc9462c9072fe7ced4934 (the last one not found locally, hash taken from the identity spec).
- Planned committed path (proposal, not done): tests/fixtures/rigging/brian/Brian_Flexing_001.glb with a sibling Brian_Flexing_001.glb.sha256 file holding the hash above, added only after Joseph decides on license and repo size (about 2.6 MB), and after #643 and #646 land. Until then P1 conformance cases that need the real file stay blocked; cases that only need a mesh can use a synthetic fixture.

## 5. Honesty contract: rig: unknown (never fake a rig) (PROPOSAL)
`@rig` yields pass, fail or unknown with reasons. It yields unknown when:
- the landmark confidence method is undefined (ruling 11; true today, so every rig is unknown),
- any landmark confidence is below 0.80,
- the mesh does not look like a standing humanoid,
- any required check fails or cannot run (for example texture checks with no UVs).
On unknown, no skin, joints or weights go downstream, and the .holo value carries the reason (ruling 4).

## 6. Measured thresholds (confirmed by Chief Linguist)
| # | Check | Threshold | How measured |
|---|---|---|---|
| T1 | Topology | exact bone set, parent tree and names vs VRM-1.0 humanoid (which set: see section 3a); deterministic | template compare; run twice, identical skeleton hash |
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
- Adjust: nested length in range scales only that bone; length 3 is a compile error; `bend` or `place` is a compile error (out of P0); unknown bone gives a plain error; adjust on an unknown rig gives unknown with its reason; adjust on a VRM skin only with known rig confidence; `LeftUpperArm` normalizes to `leftUpperArm` with a warning. A parse test for the nested block comes first, because parser acceptance is unverified.
- bind_pose: 't-pose' and 'a-pose' accepted (same strings as @auto_rig); omitted means 't-pose'; any other value (including t_pose and a_pose with underscores) is a compile error with a plain message.
- `load_humanoid_avatar` returns UNKNOWN.
- Brian: the fixture .glb (1 mesh, 2 nodes, 0 skins, 0 animations; blocked until section 4a is resolved) reads unknown, never a pass.
- Back-compat: existing @skeleton tests (SkeletonTrait) stay green unchanged; @auto_rig behaviour is unchanged by P0.
- Every PR is a draft with a Mapping seat and the Release gate.

## 8. Dependencies
| Dep | Status |
|---|---|
| A20 | standing-approvals.md L85-86 (local, not in repo): the parser rejects parameter defaults in .holo logic functions with a clear error (option A); draft PR via the merge gate. |
| Brian step 0 | provenance / identity spec #643; A33 (synthetic). The identity spec is not on origin/main yet. |
| Brian step 1 | #646, head bd55b08a639b5041ee10181566214a60e9984041 (draft, OPEN); sha256 gate and refusal tests per the working definition are not in it as read. |
| Brian step 2 | A35 optional agent/unknowns fields on @avatar_embodiment (feat/avatar-embodiment-agent-unknowns). |
| Brian_Flexing_001.glb | BLOCKER for conformance work, see section 4a. |
| Code anchors | HoloScriptRuntime.ts:568 registerTrait; SkeletonTrait.ts:729/747; VRTraitSystem.ts:1343; HumanoidLoader.ts:373; gltf-importer.ts:899/976; engine IKSolver; CharacterWebGPUCompiler.ts:127 (re-verified at a4fdbacc) |

## 9. Risks
- No landmark confidence method means every rig is unknown; P2 cannot pass until one is chosen.
- Casing normalization may hide typos; the warning must name both spellings.
- The duplicate skeletonHandler stays live until Conformance acts on the card.
- The Blender reference is a single manual rig (n=1).
- Pose meshes may not share topology, so retarget (P5) would be unknown.
- Overclaims (playground.holo "skeleton", GLTFPipelineMCPTool "animations") stay live until P6.
- The repo has three bone vocabularies (21, 55 and VRM camelCase) and a "65-bone" label on a 55-entry array; P1 can pass or fail T1 depending on which is chosen.
- The nested adjust block may not parse today.
- Code line numbers were re-verified at a4fdbacc but will drift as main moves.

## 10. Receipt
Proven from the files read: the design doc surface and P0-P7 staging; thresholds (confirmed by Chief Linguist); the 0.80 unknown rule; the A20 text and A30 scope; the code line anchors in section 3a (read at a4fdbacc); the AutoRigTrait, HumanoidSkeleton, SkeletonStandardRegistry and rig_match_skeleton facts in section 3a (read, counts by script); the GLB mesh, node, skin and animation counts and sha256 of three Brian files (computed locally); #646 head bd55b08a639b5041ee10181566214a60e9984041 (gh, 2026-10-26).
Assumptions: the design doc's behavioural claims about the cited code are accurate; the Brian working definitions are as given by Chief Linguist and reversible; the fourth Brian file matches the identity spec.
Not proven: any runtime behaviour; that the parser accepts a nested adjust block; the VRM 1.0 spec bone count (the earlier "about 22" is unverified); a confidence method; that #646 contains a sha256 gate or refusal tests (as read it does not); the contents of A35's fields; the exporter and license of Brian_Flexing_001.glb; Bicycle Crunch.glb's counts; current origin/main beyond a4fdbacc.