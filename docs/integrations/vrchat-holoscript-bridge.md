# VRChat → HoloScript Integration Guide (D.007 BRIDGE)

**Classification**: BRIDGE (NMoS P2, high network-effect bar)  
**CG Task**: Part of D.007 batch execution (fourth guide)  
**Status**: Concrete execution of bringing the largest social VR platform into the HoloScript substrate

## One-line

VRChat worlds, avatars, social graphs, and physics events → `.holo` compositions with SimulationContract receipts → compile to HoloLand, R3F, or any other target for immersive review, JEPA training, or cross-platform deployment.

## Why This Matters

VRChat is currently the highest-signal social/embodied platform (149k+ CCU peaks, massive user-generated content, real social physics). It is one of the best sources of rich, noisy, multi-agent trajectory data in existence.

Bringing it into HoloScript gives:
- A huge corpus of social physics for Paper 26 JEPA training (far richer than synthetic ROS 2 trajectories alone).
- A way to import popular worlds/avatars into HoloLand as first-class, receipt-anchored digital twins.
- A bidirectional on-ramp for the millions of VRChat creators who want to move their work into a sovereign, receipt-based substrate without losing their existing audience.

This is the classic D.007 "any data → .holo → any device" promise applied to the largest current social VR network.

## Current Surface

- HoloScript already has strong support for importing glTF, FBX (via Unity export), and arbitrary graph data.
- The existing VRChat/Unity export guide covers the HoloScript → VRChat direction.
- What is missing is the high-fidelity ingest direction with provenance.

## Step 1: Ingest VRChat World / Avatar as .holo

Use the CLI or a small bridge script:

```bash
hs import-vrchat \
  --world "wrld_xxx" \
  --output my-vrchat-world.holo \
  --with-receipt \
  --include-social-graph \
  --sample-physics 30s
```

Produces:
- Scene graph as HoloScript entities + transforms
- Avatars as rigged characters with trait bundles
- Social interactions (proximity, voice, gestures) as time-series traits
- Physics events (collisions, locomotion) as solver trajectories
- A top-level SimulationContract receipt anchoring the entire import

## Step 2: Map VRChat Events to HoloScript Traits

| VRChat Event                  | HoloScript Trait / Event          | Notes |
|-------------------------------|-----------------------------------|-------|
| Player join / leave           | `agent_spawn`, `agent_despawn`    | Identity via VRChat user ID |
| Locomotion / IK               | `pose_stream` + `locomotion`      | Perfect for JEPA world models |
| Voice / gesture               | `social_intent`, `expression`     | Rich conditioning for NPCs |
| Object pickup / placement     | `interaction_event`               | Physics + intent data |
| World state changes           | `property_update` + `graph_delta` | For live twin syncing |

A small bridge service (or Udon script + webhook) can emit these as signed HoloScript events with embedded receipts.

## Step 3: Receipt-Anchored Social World Model

Every imported world or session produces a `WorldModelReceipt` that can be:
- Published to the creator's public HoloMesh profile (D.055)
- Used as training corpus for JEPA models that learn social physics
- Re-compiled into HoloLand for high-fidelity, provenance-tracked versions of popular VRChat spaces

This turns "I made a cool VRChat world" into "I have a verifiable, cross-platform, receipt-anchored digital twin."

## Example Composition

```holo
// vrchat-club.holo
import "std/graph"
import "vrchat/ingest"

entity clubMidnight {
  source: vrchat_world("wrld_xxx", version: "2026-05-20")
  avatars: live_social_graph()
  traits: [
    social_physics,
    crowd_dynamics,
    gesture_language
  ]
  simulation_contract: {
    solver: "vrchat-physics",
    receipt: "sha256:..."
  }
}

compile_to_hololand(clubMidnight, mode: "social_twin")
compile_to_unity(clubMidnight, target: "vrchat_sdk")
```

## Quick Start for a VRChat Creator

1. Export or grant access to a world/avatar you own.
2. Run the import command (or use the hosted bridge when available).
3. Get back `.holo` + receipt.
4. Use the example composition.
5. Compile to HoloLand for a sovereign version or back to Unity for VRChat updates.
6. The receipt appears on your public agent profile.

## Ties to the Ecosystem

- **D.055**: Imported worlds become first-class public assets with verifiable provenance.
- **Paper 26 / AI Lab**: Real social multi-agent trajectories become high-quality JEPA training data (far beyond synthetic or single-robot data).
- **HoloLand (D.050)**: Popular VRChat spaces can be experienced inside HoloLand with full receipt history.
- **Other bridges**: Same universal pattern — ingest from any high-signal source, emit receipts, compile anywhere.

## Next Polish

- First-class VRChat SDK plugin (Udon + webhook) that emits live events as HoloScript traits with receipts.
- Bidirectional sync (changes made in HoloLand can be pushed back to a VRChat world instance).
- Social JEPA models trained specifically on VRChat interaction data (huge differentiator for HoloLand NPCs).

---

**Verification**: Fourth concrete D.007 BRIDGE artifact following the NMoS mandate and the governing synthesis. The batch now has strong coverage across robotics (ROS 2), spatial computing (VisionOS), enterprise twins (DTDL), and social VR (VRChat).

**Remaining high-impact items in batch**: Unreal/Unity deeper integration, OpenXR, Babylon.js re-evaluation if needed.

**This guide directly increases the surface area for external creators to enter the HoloScript ecosystem while generating gold-grade training data for the AI Lab.**