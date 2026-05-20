# VisionOS / RealityKit / Swift → HoloScript Integration Guide (D.007 BRIDGE)

**Classification**: BRIDGE (NMoS P2, 2026-05-20)  
**CG Task**: CG-005 / part of D.007 batch  
**Status**: Second D.007 bridge artifact (after ROS 2)

## One-line

Apple spatial data (RealityKit scenes, USDZ, ARKit anchors, SwiftUI 3D) → `.holo` with SimulationContract receipts → compile to HoloLand, R3F, or other targets.

## Why

VisionOS/RealityKit is a strong BRIDGE (gated distribution + specialized depth). Apple has excellent spatial authoring but no universal semantic layer. HoloScript bridges it so developers get .holo + receipts without abandoning their RealityKit investment.

## Prerequisites

- Existing USD/ARKit import paths in HoloScript (or via the core reconstruction layer)
- RealityKit USDZ → HoloScript geometry + anchors
- Receipt generation via SimulationContract (same as ROS 2 bridge)

## Step 1: Ingest RealityKit / USDZ into .holo

```bash
# Conceptual (extend existing USD/ARKit importers)
hs import-usdz myScene.usdz --output myScene.holo --with-receipt \
  --anchors arkit --preserve-transforms
```

Produces:
- Scene graph with entities, anchors, materials
- Spatial anchors as first-class HoloScript objects
- Receipt anchoring the import as a verifiable spatial model fragment

## Step 2: RealityKit Live Data → HoloScript Events

Map ARSession updates (camera pose, hand tracking, scene understanding) to HoloScript traits.

| RealityKit / ARKit          | HoloScript Trait/Event          | Notes |
|-----------------------------|---------------------------------|-------|
| ARCamera transform          | `pose_update` + `camera_trait`  | For HoloLand / NPC context |
| Hand / finger tracking      | `hand_tracking` + `poseable`    | Direct to character traits |
| Scene anchors / planes      | `spatial_anchor` + `plane`      | For world model grounding |
| Mesh reconstruction         | `geometry` + `sdf`              | For JEPA world models |

A thin Swift bridge (or RealityKit + HoloScript MCP interop) can emit these events live.

## Step 3: Receipt-Anchored Spatial World Model

Every imported or live-captured RealityKit scene should produce a WorldModelReceipt.

This directly feeds the AI Lab (D.054) and Paper 26 — spatial trajectories from real Apple devices become training data for action-conditioned JEPA models that can later run in HoloLand or on other platforms.

## Step 4: Example Composition

```holo
// visionos-living-room.holo
import "std/spatial"
import "realitykit/anchors"

entity livingRoom {
  geometry: usdz("room.usdz")
  traits: [
    spatial_anchors(from: arkit),
    hand_interaction,
    world_model_grounding
  ]
  simulation_contract: {
    solver: "realitykit-arkit",
    receipt: "sha256:..."
  }
}

compile_to_hololand(livingRoom, mode: "immersive")
```

## Quick Start (< 30 min for a VisionOS dev)

1. Export a RealityKit scene as USDZ.
2. Run the import step → get `.holo` + receipt.
3. Use the example composition.
4. Compile to HoloLand or web for preview.
5. The receipt appears on the public HoloMesh profile.

## Ties to the Ecosystem

- **D.055**: The resulting spatial agent gets a public profile with receipts.
- **Paper 26 / D.054**: Real device spatial data as JEPA training corpus.
- **HoloLand (D.050)**: Imported VisionOS scenes become immersive worlds with verifiable provenance.
- **Other bridges**: Same pattern as ROS 2 — any spatial data → .holo → any target.

## Next Polish

- First-class RealityKit + Swift interop plugin (similar to the ROS 2 bridge node).
- Direct ARKit anchor → HoloScript spatial trait mapping with live receipt streaming.
- Fidelity validation (CG-005 task) to ensure visual parity when round-tripping.

---

**Verification**: Second concrete D.007 BRIDGE artifact. Follows the exact NMoS mandate and the governing synthesis critical path.

**Next in batch**: DTDL/Azure, VRChat, Unreal (in progress on the D.007 execution task).