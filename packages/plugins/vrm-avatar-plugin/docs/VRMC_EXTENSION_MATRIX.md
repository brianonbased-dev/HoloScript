# VRM 1.0 Extension Coverage Matrix — HoloScript Compiler Targets

> **Canonical reference:** This file is the golden-file source-of-truth for which `VRMC_*` extensions are honored (preserved, emitted, or runtime-supported) by each HoloScript compiler target.
>
> **Status:** Draft v1.0 — 2026-05-09. Derived from live codebase audit (`packages/core/src/compiler/*`, `packages/core/src/assets/HumanoidLoader.ts`, `packages/plugins/vrm-avatar-plugin/`).
>
> **Maintenance rule:** When a compiler gains or loses support for a VRM extension, update this matrix in the **same commit** as the compiler change. Drift between implementation and this file is a matrix-integrity violation (see `docs/universal-ir-coverage.md` §2.2 demotion rule).

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | **Honored** — Compiler or runtime explicitly preserves / emits / executes the extension. CI contract tests cover it. |
| 🟡 | **Partial / Loader-only / Stub** — Data is ingested at load time (`HumanoidLoader`, `@pixiv/three-vrm`, or `mapVrmToAvatar`) but the compiler does **not** yet emit target-native code for it. Extension survives the trip to the runtime but may be ignored by the target engine's native pipeline. |
| 🔴 | **Not yet implemented** — No ingestion, no emission, no runtime support in this target. |
| N/A | **Not applicable** — Target architecture does not typically use this extension (e.g. MToon on non-rendering backends). |

## Matrix

| Extension | Specification | Unity | Unreal | WebGPU | R3F | Three.js | Godot | WebXR |
|-----------|---------------|-------|--------|--------|-----|----------|-------|-------|
| **VRMC_vrm** (humanoid bones + expressions + meta) | [VRM Consortium](https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm-1.0) | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| **VRMC_materials_mtoon** | [MToon 1.0](https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_materials_mtoon-1.0) | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| **VRMC_materials_hdr_emissiveMultiplier** | [HDR emissive](https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_materials_hdr_emissiveMultiplier-1.0) | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| **VRMC_springBone** | [SpringBone 1.0](https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_springBone-1.0) | 🔴 | 🔴 | 🔴 | 🟡 | 🟡 | 🔴 | 🟡 |
| **VRMC_node_constraint** | [Node constraint 1.0](https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_node_constraint-1.0) | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| **KHR_materials_unlit** (commonly paired) | [Khronos glTF](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_unlit) | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |

## Per-cell justification

### VRMC_vrm (core)

- **All targets — 🟡 Partial / Loader-only**
  - `HumanoidLoader.ts:820-846` extracts VRM bone names + expression names at runtime via `@pixiv/three-vrm`.
  - `vrm-avatar-plugin/src/index.ts:36-56` maps the 7 required-humanoid bones + expression presets to `@avatar_rig` / `@expression` HoloScript traits.
  - **What is missing for ✅:** No compiler emits target-native rigging code (Unity `Avatar`/`Animator`, Unreal `USkeletalMesh`, Godot `Skeleton3D`, WebGPU custom joint buffer, etc.). The data is lifted into traits but compilation to target-native skeleton/animation graphs is future work.

### VRMC_materials_mtoon

- **All targets — 🔴 Not yet implemented**
  - `HumanoidLoader.ts:209` exposes an `enableMToon` config flag, but no compiler generates MToon shader variants for any target.
  - `@pixiv/three-vrm` handles MToon at runtime for Three.js targets, but this is **loader/library** behavior, not **compiler** behavior. The matrix tracks compiler honor.

### VRMC_materials_hdr_emissiveMultiplier

- **All targets — 🔴 Not yet implemented**
  - No code references to this extension in any compiler or loader file.

### VRMC_springBone

- **R3F / Three.js / WebXR — 🟡 Partial / Loader-only**
  - `HumanoidLoader.ts:356,552` detects `springBoneManager` presence and sets `hasSpringBones` on state.
  - `@pixiv/three-vrm` executes spring-bone physics at runtime for Three.js-based targets.
  - **What is missing for ✅:** No compiler pre-bakes spring-bone setup into target-native physics (Unity `SpringJoint`, Unreal `PhysicsAsset`, Godot `SpringArm3D`, WebGPU compute shader, etc.).

- **Unity / Unreal / Godot / WebGPU — 🔴 Not yet implemented**
  - No spring-bone compilation path exists for native targets.

### VRMC_node_constraint

- **All targets — 🔴 Not yet implemented**
  - No code references in any compiler or loader file.

### KHR_materials_unlit

- **All targets — 🔴 Not yet implemented**
  - No unlit material emission path in any compiler. Standard PBR fallback is used everywhere.

## Target-specific notes

### WebGPU
- WebGPU compiler currently emits generic WebGPU rendering code with standard PBR shaders. No VRM-specific vertex skinning or MToon WGSL variant exists yet.
- Spring-bone physics would require a compute-pipeline implementation; stub only.

### Unity
- VRM ingestion today is via glTF + `HumanoidLoader` trait extraction. A true Unity-native path would require `UnityEngine.Avatar` builder + `VRMImporter` equivalent; not yet built.

### Unreal
- Same pattern as Unity: trait-level data only. No `USkeletalMesh` / `AnimInstance` codegen.

### Godot
- No `Skeleton3D` / `BoneAttachment3D` emission from the compiler yet.

## Next steps to promote cells from 🟡 → ✅

1. **VRMC_vrm core → Unity/Unreal/Godot**
   - Add `@avatar_rig` trait compiler pass for each target that emits native skeleton + animation graph boilerplate.
   - Golden tests: compile a `.holo` with `@avatar_rig` → verify target-native avatar class exists in output.

2. **VRMC_vrm core → WebGPU**
   - Implement joint-matrix upload + vertex-skinning WGSL in `WebGPUCompiler` or a dedicated `WebGPUAvatarCompiler`.

3. **VRMC_springBone → R3F/Three.js/WebXR**
   - Compiler pass that emits `VRMSpringBoneLoader` setup code instead of relying on runtime auto-detection.
   - Contract test: compiled scene contains explicit spring-bone joint configuration matching VRM spec.

4. **MToon / HDR / Unlit**
   - Material-trait compiler matrix: map HoloScript `@shader` / `@material` traits to target-native MToon variants. This is blocked on the broader shader-trait compiler work (see `packages/compiler/NIRCompiler.ts` and NodeToy mapping).

## Changelog

- **2026-05-09** — v1.0. Initial honest matrix. All cells 🟡 or 🔴. No target has full compiler-native VRM extension emission yet; loader/runtime support only for web targets.

## References

- `packages/core/src/assets/HumanoidLoader.ts` — runtime loader
- `packages/plugins/vrm-avatar-plugin/src/index.ts` — trait mapper stub
- `packages/plugins/vrm-avatar-plugin/src/__tests__/contract.test.ts` — contract gate
- VRM Consortium specs: <https://github.com/vrm-c/vrm-specification>
