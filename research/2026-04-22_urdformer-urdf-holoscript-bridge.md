# URDFormer: from images to URDF — fit as a HoloScript bridge

**Date:** 2026-04-22  
**Scope:** Whether **URDFormer** (image → **URDF** articulated environment) can sit **between** perception output and **multi-engine** deployment, with HoloScript as an **intermediate** layer.

## What URDFormer is

- **URDFormer** (Chen et al.; RSS 2024; [arXiv:2405.11656](https://arxiv.org/abs/2405.11656), [project site](https://urdformer.github.io/)) predicts **URDF-structured** articulated scenes from **real-world images**, targeting **simulation** (e.g. manipulation research).
- It is a **learning pipeline** (synthetic / paired data, inverse mapping from image to structure), not a file converter API.

## HoloScript as “IR” in the middle

- **URDF** is a **robotics** articulation + link/inertial format; game engines and WebXR runtimes do not consume it **natively** everywhere.
- **HoloScript** can act as a **portable** scene + behavior description if you:
  1. **Ingest** URDF (or a tool-exported subset) as **data**, not as opaque blobs.
  2. **Map** links/joints to HoloScript **entities** and **joint** / **physics** traits.
  3. **Compile** to targets (Unity, Unreal, Godot, R3F) already supported by the HoloScript compiler family.

**Reality check:** URDFormer output will need **sanitization, scale calibration, and asset binding**; treat model output as a **draft** scene graph, like any ML-generated asset.

## Recommended integration shape (R&D)

- **Offline / batch:** image → URDFormer → **URDF + meshes** → converter script → **.holo** or ECS snapshot **+ validation**.
- **Do not** promise real-time, on-device URDFormer in Studio without a **GPU/edge** product decision and **latency** budget.

## Related internal docs

- `research/2026-04-21_assimp-fbx-obj-gltf-pipeline.md` — bringing **meshes** to glTF; URDF is complementary (kinematics tree).

## References

- URDFormer paper: https://arxiv.org/abs/2405.11656  
- Code (community): see paper / project page for the canonical repository.  
