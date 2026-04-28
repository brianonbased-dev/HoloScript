# Audit: `.holo` Skeleton Schema vs Cascadeur-Recognized Standards

**Status:** Audit complete (task_1777366583512_um62)  
**Date:** 2026-04-28  
**Author:** github-copilot

## Scope

Compare HoloScript's current skeleton/rig interoperability surface with the standards referenced in Cascadeur docs/research tasking:
- UE4/UE5 Mannequin
- MetaHuman
- Mixamo
- Daz Genesis 8/9
- AutoRig Pro
- Character Creator 3 (CC3)
- Ready Player Me (RPM)
- VRM

## Evidence sampled

- `packages/core/src/traits/SkeletonTrait.ts` — generic humanoid/custom skeleton trait shape (bone map + blend trees)
- `packages/core/src/assets/HumanoidLoader.ts` — avatar import + bone mapping
- `packages/core/src/assets/index.ts` — exported humanoid loader surface
- `packages/core/src/assets/ModelImporter.ts` — model import format support
- `packages/core/src/assets/AssetMetadata.ts` — semantic rig tags

## Current support matrix

| Standard | Current status | Evidence | Notes |
|---|---|---|---|
| VRM | ✅ Strong | `HumanoidLoader` has `AvatarFormat` values `vrm|vrm0|vrm1`, `VRMBoneName`, `VRMExpressionName` | Best-supported named standard in code |
| Ready Player Me | ✅ Strong | `HumanoidLoader` docs + `AvatarFormat` includes `rpm`; `RPMMetadata` exists; assets barrel exports RPM/VRM types | Explicit RPM pipeline present |
| Mixamo | 🟡 Partial | `HumanoidLoader.BONE_NAME_MAP` includes many `mixamorig:*` remaps to VRM bone names | Bone-name normalization exists; no explicit end-to-end Mixamo validation fixture |
| UE4/UE5 Mannequin | 🟡 Partial | `BONE_NAME_MAP` includes common aliases (`pelvis`, `spine_01`, `clavicle_l`, etc.) compatible with Unreal-like naming | Not explicitly labeled "UE Mannequin" and no dedicated conformance tests |
| MetaHuman | ❌ Gap | No explicit `metahuman` mapping/type/tag surfaced in audited files | Needs canonical mapping profile + round-trip tests |
| Daz Genesis 8/9 | ❌ Gap | No explicit `daz`/`genesis` profile in audited files | Needs schema adapter + naming map |
| AutoRig Pro | ❌ Gap | No explicit `autorig` profile in audited files | Needs profile + validation suite |
| Character Creator 3 (CC3) | ❌ Gap | No explicit `cc3`/`character creator` profile in audited files | Needs profile + import/export validation |

## Key structural findings

1. **Core skeleton model is flexible enough**
   - `SkeletonTrait` supports both `custom` and `humanoid` rigs and a `HumanoidBoneMap` abstraction.
   - This means adding additional skeleton standards is primarily a mapping/profile problem, not a trait architecture blocker.

2. **Interop loader is VRM-first with RPM support**
   - `HumanoidLoader` is explicitly framed as VRM + Ready Player Me.
   - Mixamo support currently appears as name remapping (good), but not as a first-class profile with explicit conformance checks.

3. **Model import formats are broad, but skeletal conformance is not**
   - `ModelImporter` supports `gltf/glb`, `obj`, `fbx` at format level.
   - Format support ≠ skeleton standard conformance; profile-level mapping and test fixtures are missing for several standards.

4. **Semantic metadata is generic**
   - `AssetMetadata` includes `rig: 'humanoid' | 'quadruped' | 'biped' | 'custom' | 'none'`.
   - No source-standard field (e.g., `skeletonStandard: 'vrm'|'mixamo'|'metahuman'...`), which limits auditability and automated routing.

## Gap list (design backlog)

### G1 — Skeleton Standard Profiles
Add explicit profile constants + mapping packs for:
- `ue_mannequin`
- `metahuman`
- `mixamo` (promote from implicit map to explicit profile)
- `daz_genesis8`
- `daz_genesis9`
- `autorig_pro`
- `cc3`
- `rpm`
- `vrm`

### G2 — Standard-tagged metadata
Extend asset metadata to include source skeleton standard, e.g.:
- `skeletonStandard`
- `skeletonVersion`
- `mappingConfidence`

### G3 — Round-trip conformance fixtures
For each standard, add a canonical fixture and test:
- Input avatar + expected normalized bone set
- `.holo` import → normalized skeleton map
- export path (FBX/USD/GLB where applicable) preserves semantic bone identity

### G4 — MCP tooling for operator-facing mapping
Design `rig_match_skeleton(input_skeleton, candidate_templates)` MCP tool:
- Returns ranked candidates + confidence + unresolved bones
- Emits a **refusable diff** patch (D.027) instead of mutating source

### G5 — `physics_validate_animation` and `pose.predict` integration hooks
Both tools should consume normalized skeleton profiles and reject unknown/unmapped critical bones with actionable guidance.

## Suggested execution order

1. Promote existing VRM/RPM/Mixamo mappings into formal profile registry
2. Add `skeletonStandard` metadata + migration script
3. Add conformance tests for VRM, RPM, Mixamo, UE Mannequin
4. Add MetaHuman + Daz + AutoRig Pro + CC3 profiles incrementally
5. Land MCP `rig_match_skeleton` with D.027-style refusable output

## Brittney operator contract examples (D.027)

- "Use the Mixamo skeleton" → `rig_match_skeleton(..., candidate_templates=['mixamo'])` → returns suggested mapping patch + confidence
- "Convert this rig to VRM-compatible" → standardized mapping plan + unresolved-bones list + RefusableDiff payload
- "Why did this animation fail validation?" → reports missing canonical joints and suggested remap patch

## Conclusion

HoloScript already has a robust base for humanoid skeleton abstraction and strong VRM/RPM support, plus partial Mixamo/Unreal-style naming coverage. The main deficit is **explicit standard profiles + conformance tests** for MetaHuman, Daz, AutoRig Pro, and CC3. This is an interop-productization gap, not a runtime-architecture gap.
