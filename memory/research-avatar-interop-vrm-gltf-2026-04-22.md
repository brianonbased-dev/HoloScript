# Avatar interoperability — VRM 1.0, glTF extensions, cross-engine avatars

**Board:** `task_1776640937112_tupm`  
**Source audit:** `2026-03-01_holoscript-studio-ide-audit.md`

## Standards landscape (public refs)

- **VRM 1.0** is defined as **glTF 2.0 + extensions** (VRMC_vrm family). Authoritative open specs live under the VRM Consortium repo, e.g. [`specification/VRMC_vrm-1.0`](https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm-1.0) and the [README entry point](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/README.md).
- **Khronos × VRM Consortium** collaboration (press): [Khronos announcement — VRM / glTF standardization](https://www.khronos.org/news/press/the-khronos-group-and-vrm-consortium-collaborate-to-advance-international-standardization-of-the-vrm-3d-avatar-file-format) — useful for *governance* narrative, not for implementation guarantees.
- **glTF ecosystem:** avatar pipelines commonly stack **KHR_* glTF extensions** with **VRMC_*** materials (e.g. MToon), spring bone, constraints — see extension lists in the VRM 1.0 spec tree.

*Caveat:* “RPM-only” or single-vendor avatar stacks are **not** interchangeable with full VRM1 expressiveness unless export settings preserve extensions HoloScript consumes.

## HoloScript / Studio anchors (code)

| Area | Location | Notes |
|------|----------|--------|
| VRM 1.0 bone / expression typing | `packages/core/src/assets/HumanoidLoader.ts` | Bone and expression name unions aligned to VRM 1.0 naming |
| VRM / GLB animation mixing | `packages/studio/src/lib/traits/viralPoseTrait.ts` | `AnimationMixer` hooks for clip playback |
| Product surface | Studio `/character`, marketplace `character` type | See `packages/studio/README.md`, `packages/studio/src/lib/marketplace/types.ts` |
| Export claims | Studio capabilities API | Lists GLTF / USD / VRM among export targets (`packages/studio/src/app/api/studio/capabilities/route.ts`) |

## Positioning

- **Interoperability story:** HoloScript targets **documented** VRM/glTF fields the loader understands; exotic extension stacks need **explicit** compiler/export tests per target (Unity, Unreal, WebGPU).
- **Risk:** marketing “we support VRM” must mean **which** VRMC extensions are honored in import **and** export — map gaps in a table before customer promises.

## Next steps (child tasks)

1. Matrix: **import** supported VRMC extensions vs **export** from each compiler target.
2. Golden file: one `.vrm` / `.glb` round-trip through `HumanoidLoader` + a minimal pose clip.
