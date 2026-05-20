# ROS 2 / Gazebo / URDF → HoloScript Integration Guide (D.007 BRIDGE)

**Classification**: BRIDGE (NMoS P2, 2026-05-20)  
**CG Task**: CG-055  
**Status**: First D.007 bridge artifact after D.055 public surface  
**Critical path**: D.055 (door) → this guide → developers ship robotics data → first external agents register on HoloMesh public

## One-line

Any robotics data (URDF, SDF, ROS 2 topics, Gazebo trajectories) → `.holo` composition with full SimulationContract receipts → compile to HoloLand NPCs, other engines, or verifiable world models (JEPA).

## Why this exists (D.007 + NMoS)

HoloScript's promise: **any data → .holo → any device**, with cryptographic provenance.

ROS 2 / Gazebo / URDF ecosystem is healthy (open-standard + network effect) but not sovereign inside HoloScript. We **bridge** it so robotics developers get the semantic + receipt layer without rewriting their sims.

This is the first of the five CG- BRIDGE guides (ROS 2, DTDL/Azure, VisionOS/RealityKit, VRChat, Unreal/Unity, OpenXR).

Cross-cutting rule (from NMoS): every bridge output **must** carry a SimulationContract receipt so the .holo remains the authoritative semantic source (feeds JEPAObjective, Paper 26, HoloLand dogfooding).

## Prerequisites (already in tree)

- HoloScript core + robotics-plugin (`packages/plugins/robotics-plugin/`)
- urdformer-plugin (URDF → HoloScript geometry)
- Existing Isaac Lab sim-to-real example: `packages/plugins/robotics-plugin/examples/isaac-lab-sim-to-real-bridge.holo`
- SimulationContract + WorldModelReceipt (JEPA stack, packages/core)
- HoloLand for embodied targets (D.050)

## Step 1: Ingest URDF / SDF into .holo

Use the urdformer or robotics plugin to parse a URDF.

```bash
# Example (conceptual — run via HoloScript CLI or MCP)
hs import-urdf robot.urdf --output robot.holo --with-receipt
```

The resulting `.holo` contains:

- Hierarchical geometry + joints (from URDF links)
- Physics properties (mass, inertia, collision)
- Optional: initial pose + constraints

**Receipt produced automatically** via SimulationContract (anchors the import as a verifiable world-model fragment).

## Step 2: ROS 2 Topic Bridge (live data → events)

Map ROS 2 topics to HoloScript events/traits.

Recommended pattern (lightweight, no heavy ROS deps in core):

1. Run a small bridge node (Python or C++) that subscribes to `/joint_states`, `/scan`, `/tf`, etc.
2. Emit HoloScript events (or write directly to a `.holo` live buffer via the robotics plugin).

Example mapping:

| ROS 2 Topic          | HoloScript Trait / Event          | Notes |
|----------------------|-----------------------------------|-------|
| `/joint_states`      | `joint_state_update` trait        | Drives animation + physics |
| `/scan` / `/lidar`   | `lidar_pointcloud` (point trait)  | Perception input for JEPA |
| `/tf` + `/odom`      | `pose_update` + `odometry`        | Ground-truth for receipts |
| `/cmd_vel`           | `intent_velocity` (action)        | For HoloLand NPC control |

The bridge can be a thin ROS 2 package that calls the HoloScript MCP `compile_to_*` or writes `.holo` fragments with embedded receipts.

## Step 3: Gazebo Trajectory → Verifiable World Model + Receipt

Run a Gazebo simulation, record trajectories (poses, joint states, contacts), then ingest as a training corpus for JEPAObjective or as a SimulationContract-anchored episode.

```python
# Pseudocode (extend the existing isaac_lab_bridge.py pattern)
import rospy
from holoscript_mcp import SimulationContract, generate_world_model_receipt

while sim_running:
    traj = gazebo.get_latest_trajectory()   # joint + pose + contact
    holo_fragment = urdf_to_holo(traj.robot) + trajectory_to_events(traj)
    receipt = generate_world_model_receipt(
        holo_fragment,
        solver="gazebo",
        ground_truth=traj,
        tolerance=0.01
    )
    publish_to_holomesh(holo_fragment, receipt)   # or write .holo + .receipt.json
```

This directly dogfoods the JEPA + Paper 26 path (action-conditioned world models from sim trajectories, not mocap).

## Step 4: Example .holo Composition (ROS 2 robot in HoloLand)

```holo
// ros2-turtlebot-bridge.holo
import "std/physics"
import "std/simulation"
import "robotics/urdformer" as urdf

entity turtlebot {
  geometry: urdf("turtlebot3.urdf")
  traits: [
    joint_state_update(from: ros_topic("/joint_states")),
    lidar_perception(from: ros_topic("/scan")),
    intent_velocity(from: ros_topic("/cmd_vel"))
  ]
  simulation_contract: {
    solver: "gazebo",
    receipt: "sha256:..."   // anchored
  }
}

// Compile target: HoloLand NPC (action-conditioned)
compile_to_hololand(turtlebot, mode: "npc", policy: "jepa")
```

Compile with the existing robotics or hololand targets.

## Step 5: Provenance & Trust (non-negotiable)

Every artifact produced by this bridge **must** include:

- GistPublicationManifest (or equivalent)
- SimulationContract receipt (cryptographic anchor + ground-truth match)
- Source attribution (ROS 2 package name + Gazebo world + timestamp)

This is what makes the bridge valuable for Paper 26, HoloLand JEPA dogfooding (D.050), and external developer trust.

## Quick Start for a Robotics Developer (< 30 min)

1. Clone HoloScript + enable robotics + urdformer plugins.
2. Take your existing URDF.
3. Run the import step (Step 1) → get `robot.holo` + receipt.
4. Drop the example composition (Step 4) into your project.
5. Point a thin ROS 2 listener at your `/joint_states` and emit events.
6. Compile to HoloLand or R3F for visualization.
7. Inspect the receipt on the agent's public HoloMesh profile (D.055).

You now have a verifiable, semantic, multi-target robotics asset instead of siloed URDF + Gazebo.

## Ties to the Rest of the Ecosystem

- **D.050 / HoloLand JEPA**: Gazebo trajectories become the training corpus for action-conditioned world models on HoloLand NPCs.
- **Paper 26**: The receipt + ground-truth match is exactly the benchmark evidence needed (solver pair → loss curve → anchored receipt).
- **D.055**: The resulting agent (your ROS 2 robot controller) gets a public profile with the receipts visible.
- **Future CG- bridges**: Same pattern (receipt + semantic .holo layer) applies to DTDL, RealityKit scenes, VRChat avatars, etc.

## compile_to_ros2_deploy — One-Shot Deployment Bundle (2026-05-20)

The `compile_to_ros2_deploy` MCP tool wraps URDF + launch file + controllers YAML into a
single deployable bundle:

```json
{
  "tool": "compile_to_ros2_deploy",
  "code": "<holo composition>",
  "packageName": "my_robot",
  "options": { "gazebo": true, "rviz": true, "controllers": ["arm_controller"] }
}
```

Returns:
```json
{
  "urdf": "...",
  "launchFile": "...",
  "controllersYaml": "...",
  "packageName": "my_robot",
  "urdfFilename": "my_robot.urdf"
}
```

Save each field to the corresponding file in your ROS 2 package and run:
```bash
ros2 launch my_robot robot.launch.py
```

The `launchFile` includes `joint_state_publisher_gui`, `robot_state_publisher`, optional Gazebo
spawn, and optional RViz — all generated from the `.holo` composition.

## Open Questions / Next Polish

- Full open-source ROS 2 bridge node (thin wrapper) — can be contributed under the robotics-plugin.
- Direct SDF (Gazebo native) parser (URDF is already strong via urdformer).
- End-to-end test: Gazebo episode → JEPA train → HoloLand NPC deployment with receipt.

---

**Verification for this artifact**:
- Written from the live NMoS table + robotics-plugin sources + SimulationContract/JEPA stack.
- Follows the exact "produce one integration guide / adapter per vertical" mandate.
- First concrete D.007 BRIDGE execution after the D.055 door.

**Next CG- bridges in queue** (per synthesis): DTDL/Azure, VisionOS/RealityKit, VRChat, Unreal, Unity.

This guide makes the "any data → .holo" promise real for robotics today.