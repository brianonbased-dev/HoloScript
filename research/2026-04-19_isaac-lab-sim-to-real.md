# Isaac Lab Sim-to-Real: HoloScript Interop Memo

**Date:** 2026-04-19
**Author:** Claude (Opus 4.7, 1M context, full-surface agent)
**Task ID:** task_1776394509341_ki91 (HoloMesh board)
**Source TODO:** `2026-03-09_holoscript-impossible-doors-breakthrough-analysis.md` item 9
**Scope:** Narrow — sim-to-real transfer specifically. Not a full architecture overview (that exists at `~/.ai-ecosystem/research/2026-03-15_isaac-lab-holoscript-integration-research.md`).

---

## Why this memo (and not the prior one)

A 1165-line architecture memo dated **2026-03-15** already exists for general Isaac Lab/HoloScript integration. It covers the framework stack, ManagerBasedRLEnv pattern, USD schema gaps (PhysxArticulationAPI, drive attribute paths), and a 7-phase implementation roadmap.

This memo is **narrower** and assumes that prior context. It targets only what the board task asked: **sim-to-real transfer tooling** and **what HoloScript would need to interop with it specifically**. It also incorporates 2025-26 Isaac Lab releases (2.0 → 2.3) the prior memo predates: Isaac Lab Mimic, SkillGen, the new USD joint-friction schema, AMP tasks, delayed-PD actuator models.

Per W.070a (investigate before scoping) and F.017 (citation required) — every technical claim cites a file/URL.

---

## 1. What "sim-to-real" means inside Isaac Lab

Sim-to-real in Isaac Lab is not one feature; it is a **bundle of techniques** layered into the env-config dataclass (`@configclass`). The framework explicitly names **the reality gap** as the modeling target ([NVIDIA Isaac Lab — What Is the Reality Gap?](https://docs.nvidia.com/learning/physical-ai/getting-started-with-isaac-lab/latest/transferring-robot-learning-policies-from-simulation-to-reality/02-the-reality-gap/index.html)). The bundle has four moving parts:

### 1.1 Domain randomization (DR) — applied via `EventTermCfg`

Isaac Lab applies DR at three lifecycles: `startup`, `reset`, `interval`. Randomized dimensions per the [NVIDIA Spot quadruped sim-to-real post](https://developer.nvidia.com/blog/closing-the-sim-to-real-gap-training-spot-quadruped-locomotion-with-nvidia-isaac-lab/) and the [Isaac Lab assembly post](https://developer.nvidia.com/blog/bridging-the-sim-to-real-gap-for-industrial-robotic-assembly-applications-using-nvidia-isaac-lab/):

- **Physics**: rigid-body mass scaling, friction (static/dynamic), joint damping, joint armature, PD-gain noise
- **Actuation**: torque limits, communication delay
- **Observation**: per-step Gaussian/uniform noise on joint pos/vel, IMU, camera
- **Initial state**: joint pose, root pose, object pose under uniform/Gaussian distributions
- **Disturbance**: external force/velocity pushes at random intervals
- **Rendering** (vision policies): light intensity/direction, texture swap via Replicator

DR functions live in `isaaclab.envs.mdp` and are referenced **by name** in `EventTermCfg(func=..., mode=..., params=...)`. This is the leverage point for HoloScript codegen — emit references, not implementations (key recommendation 3 in the prior memo, still correct).

### 1.2 Sensor noise + multi-rate sensor sim

The [Advanced sensor physics blog](https://developer.nvidia.com/blog/advanced-sensor-physics-customization-and-model-benchmarking-coming-to-nvidia-isaac-sim-and-nvidia-isaac-lab/) and the [Isaac Lab framework arXiv paper](https://arxiv.org/html/2511.04831v1) confirm Isaac Lab supports multi-frequency sensor simulation and adds noise terms via `ObservationTermCfg(noise=UniformNoiseCfg(...))`. Cameras have noise via Replicator; contact sensors and IMUs have explicit noise configs. This is fine-grained at the per-observation-term level, **not global** — HoloScript needs to emit noise declaratively per observation.

### 1.3 Actuator latency / non-ideal actuator models

This is the hardest gap to close in classic RL pipelines. Isaac Lab ships **explicit actuator models** ([Isaac Lab framework paper](https://arxiv.org/html/2511.04831v1)):

- `IdealPDActuator` — baseline, no real dynamics
- `DCMotorActuator` — four-quadrant torque-speed curves
- `DelayedPDActuator` — **simulates communication lag** (the key sim-to-real feature for networked actuators)
- `RemotizedPDActuator` — for tendon/cable-driven joints
- `ImplicitActuator` — solver-integrated, fastest but least realistic
- **Neural-network actuators** — learned residual dynamics (used in Spot training)

Each is wired into `ArticulationCfg.actuators={"group_name": ActuatorCfg(...)}` per joint group. HoloScript currently has a single `@actuator` trait with no group concept — this is a P0 blocker for any non-ideal sim-to-real workflow (already flagged in the March memo's Phase 4).

### 1.4 USD joint-friction schema (NEW in 2025-26)

The [Advanced sensor physics blog](https://developer.nvidia.com/blog/advanced-sensor-physics-customization-and-model-benchmarking-coming-to-nvidia-isaac-sim-and-nvidia-isaac-lab/) confirms a **new USD joint friction schema** that lets actuator + friction parameters travel inside the USD asset itself, "ensuring that the actuation of joints and motors in simulation closely mirrors actual behavior, reducing the simulation-to-real gap." This is an additive PhysX schema (likely `PhysxJointFrictionAPI` or similar — verify against the schema headers when implementing) that HoloScript's `USDPhysicsCompiler.ts` does not currently emit.

### 1.5 Imitation-learning data augmentation (Mimic / SkillGen)

[Isaac Lab Mimic](https://isaac-sim.github.io/IsaacLab/main/source/overview/imitation-learning/teleop_imitation.html) and the [SkillGen replacement](https://isaac-sim.github.io/IsaacLab/main/source/overview/imitation-learning/skillgen.html) are the **2.0+ workflow change** the March memo predates. Pipeline:

1. Human teleops a small number of demos (e.g., 10) in Isaac Sim.
2. Mimic/SkillGen decomposes each demo into object-centric subtask segments.
3. The system transforms segments to randomized scene configs and stitches them via linear interpolation.
4. Result: 1000+ trajectories from 10 demos. BC policy success: **40-85%** depending on data quality ([Isaac Lab Imitation docs](https://isaac-sim.github.io/IsaacLab/main/source/overview/imitation-learning/index.html)).

This is sim-to-real-adjacent (it produces policies that then go through standard DR + actuator-modeling for real deployment) and creates a **second integration surface**: `@subtask_decomposition` metadata on robot/object compositions. HoloScript today has no concept of object-centric subtasks for IL.

---

## 2. HoloScript current robotics surface (grounded inspection)

Per W.070a, I read the actual code, not memory:

| Surface | Path | What's there |
|---|---|---|
| Plugin entrypoint | `packages/plugins/robotics-plugin/src/index.ts` | URDF extraction from `HoloCompositionTreeLike`, joint/link/transmission types, `extractURDFFromHoloComposition()` |
| USD codegen | `packages/plugins/robotics-plugin/src/usd-codegen.ts` | Targets Isaac Sim with `PhysicsArticulationRootAPI`, `PhysicsRevoluteJoint`, `PhysicsRigidBodyAPI`. **Does not emit `PhysxArticulationAPI`, drive attributes, or PhysX joint-friction schema.** |
| ROS2 runtime trait | `packages/plugins/robotics-plugin/src/traits/ROS2HardwareLoopTrait.ts` | Bidirectional pub/sub bridge, fires `ros2:publish` on `scene:transform_change`, receives `ros2:telemetry` to drive virtual twin. Tracks `hardwareSyncDriftMs`. |
| Python ROS2 bridge | `packages/plugins/robotics-plugin/python/ros2_bridge.py` | `roslibpy` over rosbridge_server WebSocket, publishes `sensor_msgs/JointState` to `/joint_states`-style topics. |
| Contracted-sim binding | `packages/core/src/reconstruction/simulationContractBinding.ts` | `assertHoloMapManifestContract()` — enforces `replayFingerprint` ≥ 8 chars, `kind === HOLOMAP_SIMULATION_CONTRACT_KIND`, version `1.0.0`. **This is the trust-by-construction anchor.** |
| Examples | `packages/plugins/robotics-plugin/examples/robot-arm-complete.holo` | 2-DOF arm with `@ros_node`/`@gazebo_sim`/`@urdf_export` traits, twin-sync at 30 Hz, multi-format export (URDF/SDF/USD/MJCF). |

**Verified gaps for sim-to-real specifically** (a tighter subset than the March memo's full Isaac Lab gap list):

1. No `DelayedPDActuator`-equivalent trait. The `actuator: { type: "position", kp, kd }` block in `robot-arm-complete.holo` maps to ideal PD only.
2. No domain-randomization vocabulary. The `robotics-plugin` parser would not recognize `@randomize_mass` / `@push_force` / `@noise` traits today.
3. No PhysX joint-friction USD attributes in `usd-codegen.ts` (the new 2025-26 schema).
4. No subtask-decomposition metadata for Mimic/SkillGen interop.
5. ROS2 bridge is **outbound-only for sim-to-real**: it can replay HoloScript trajectories on a physical robot, but it does **not** consume a trained Isaac Lab policy checkpoint. Closing that loop requires either (a) ONNX export from Isaac Lab → HoloScript SNN runtime, or (b) Isaac Lab → HoloScript handoff via Mimic-generated trajectory dump.

---

## 3. Sim-to-real interop paths, ranked by effort/payoff

I rank by **payoff per engineering week**. All effort estimates assume one full-surface engineer (no Isaac Sim license blocker, since BSD-3 + free Isaac Sim individual license).

### Path A — "Feed Isaac Lab" (HoloScript → Isaac Lab assets)
**Payoff: High. Effort: 2-4 weeks. Risk: Low.**

HoloScript becomes the **declarative scene/robot authoring tool** for Isaac Lab. Compile `.holo` → Isaac-Lab-compatible USD + a Python `@configclass` task file.

- Phase 1 (USD fixup): emit `PhysxArticulationAPI` + `drive:angular:physics:*` attributes + new joint-friction schema in `usd-codegen.ts`. ~3 days. This alone makes existing HoloScript robot files **drop-in importable** to Isaac Sim.
- Phase 2 (Python codegen): new `IsaacLabCompiler.ts` emits `ManagerBasedRLEnvCfg` referencing `isaaclab.envs.mdp.*` functions by name. ~2 weeks.
- Phase 3 (DR vocabulary): add `domain_randomization { ... }` block to the parser, map to `EventTermCfg` list. ~3 days.

**Why first**: zero new infra needed on the HoloScript side. Pure codegen extension. Differentiator: nothing else auto-generates Isaac Lab task configs from a declarative DSL. Validated by the March memo's existing 7-phase plan; the new piece is just the joint-friction schema and DR-vocabulary scope tightening to sim-to-real.

### Path B — "Consume Isaac Lab policies" (trained checkpoint → HoloScript runtime)
**Payoff: Medium-high. Effort: 3-5 weeks. Risk: Medium.**

After Isaac Lab trains a policy (e.g., RSL-RL PPO checkpoint), export to **ONNX** and run inside HoloScript's SNN/r3f runtime as a `@policy_runtime` trait. Two sub-options:

- **B1** (browser runtime): ONNX → onnxruntime-web → fed at 60 Hz from HoloScript scene observations → outputs joint targets routed through existing `ROS2HardwareLoopTrait`. Bridges trained-in-Isaac to deployed-in-browser. ~3 weeks.
- **B2** (CRDT-replayable runtime): wrap policy inference in a SimulationContract so each inference call is fingerprinted and replayable. This makes Isaac-trained policies subject to HoloScript's "trust by construction" guarantee — a unique angle no Isaac Lab user has today. ~5 weeks (needs SimulationContract extension for non-deterministic ONNX runtimes; falls back to recording the I/O tape).

**Why second**: B2 is the strategic moat (`W.061: CAE gave up on deterministic replay — HoloScript Trust-by-Construction breaks that.`). It turns the sim-to-real boundary into a **provenance boundary** — every action a trained policy takes on the physical robot is replayable in the digital twin from a content-addressed fingerprint. This is the angle that connects to the 8-paper program's contracted-simulation thesis.

### Path C — "Mimic/SkillGen interop" (HoloScript scenes as IL data augmentation targets)
**Payoff: Medium. Effort: 4-6 weeks. Risk: Medium-high.**

Add subtask-decomposition metadata to HoloScript robot compositions so SkillGen can transform/stitch object-centric segments. Workflow:

1. User teleops in HoloScript (existing `@vr_control` trait already supports this).
2. HoloScript records demos as object-centric segments (NEW — needs an annotation pass).
3. Export as Isaac Lab Mimic-compatible HDF5.
4. SkillGen amplifies in Isaac Sim.
5. Resulting policy comes back via Path B.

**Why third**: depends on Path B for the return loop. The annotation pass is the riskiest piece — object-centric decomposition requires either heuristic segmentation or human labels per demo. Likely worth deferring until B is in place.

### Path D — "Full bidirectional digital twin" (live sim-to-real-to-sim loop)
**Payoff: High strategic, low immediate. Effort: 8-12 weeks. Risk: High.**

Extend `ROS2HardwareLoopTrait` so the same HoloScript scene drives **both** Isaac Lab simulation **and** the physical robot, with delta reconciliation pushed back through SimulationContract. This is the "spatial sovereignty" pillar (W.060) realized for robotics. Defer until Paths A and B prove integration mechanics.

---

## 4. Concrete next-step ranking (do these in order)

| Order | Action | Effort | Unlock |
|---|---|---|---|
| 1 | Patch `usd-codegen.ts` to emit `PhysxArticulationAPI` + `drive:angular:physics:*` attributes | 2 days | Existing HoloScript USDA loads cleanly into Isaac Sim |
| 2 | Add new PhysX joint-friction schema attributes | 1 day | Sim-to-real friction modeling per 2025-26 schema |
| 3 | Add `domain_randomization { ... }` parser block + `EventTermCfg` codegen | 3 days | Standard DR pipeline available from `.holo` |
| 4 | Add actuator-group concept + `DelayedPDActuator` trait | 2 days | Latency-aware sim-to-real for networked actuators |
| 5 | Build `IsaacLabCompiler.ts` (Python `@configclass` codegen) | 2 weeks | End-to-end `.holo` → Isaac Lab task |
| 6 | ONNX policy runtime trait (Path B1) | 3 weeks | Isaac-trained policies deployable in HoloScript runtime |
| 7 | SimulationContract-wrapped policy runtime (Path B2) | +2 weeks on top of step 6 | Trust-by-construction for trained policies — paper-grade differentiator |

Steps 1-4 are **~8 days total** and unlock the bulk of practical sim-to-real value. Steps 5-7 build the strategic moat.

---

## 5. Risks and gaps

1. **Schema-name uncertainty**: the new USD joint-friction schema is announced in NVIDIA's blog but the exact attribute namespace (`physxJointFriction:*` vs `physxArticulation:friction:*`) needs confirmation from the Kit 106+ schema headers. Don't hardcode names from blog prose; pull them from the actual schema USDA.
2. **Isaac Lab API churn**: 2.0 → 2.3 changed Mimic internals (MimicGen → SkillGen). Any code targeting `isaaclab.envs.mdp.*` should pin to a specific Isaac Lab release. Recommend pinning to the latest stable at codegen time and emitting a comment header `# Generated for IsaacLab vX.Y.Z`.
3. **No real GPU validation**: this memo is desk-research. Validating generated USD + Python actually loads in Isaac Sim requires a Linux GPU box with Isaac Sim installed — not currently in the team's CI. Founder review needed before allocating compute.
4. **Sim-to-real claims are not testable from HoloScript alone**: a "we close the sim-to-real gap" claim requires actual physical robot deployment evidence. Don't write the marketing copy until at least one Path A + Path B round-trip is demonstrated end-to-end. This is **W.066 territory** (production > tests, only external oracle = real-world deployment).
5. **F.017 citation discipline**: every NVIDIA-blog claim above is cited. Implementation PRs should re-verify against actual Isaac Lab source at the pinned version, not against blog prose.

---

## Sources

- [Isaac Lab — What Is the Reality Gap?](https://docs.nvidia.com/learning/physical-ai/getting-started-with-isaac-lab/latest/transferring-robot-learning-policies-from-simulation-to-reality/02-the-reality-gap/index.html)
- [Bridging the Sim-to-Real Gap for Industrial Robotic Assembly Applications Using NVIDIA Isaac Lab](https://developer.nvidia.com/blog/bridging-the-sim-to-real-gap-for-industrial-robotic-assembly-applications-using-nvidia-isaac-lab/)
- [Closing the Sim-to-Real Gap: Training Spot Quadruped Locomotion with NVIDIA Isaac Lab](https://developer.nvidia.com/blog/closing-the-sim-to-real-gap-training-spot-quadruped-locomotion-with-nvidia-isaac-lab/)
- [Advanced Sensor Physics, Customization, and Model Benchmarking Coming to NVIDIA Isaac Sim and NVIDIA Isaac Lab](https://developer.nvidia.com/blog/advanced-sensor-physics-customization-and-model-benchmarking-coming-to-nvidia-isaac-sim-and-nvidia-isaac-lab/)
- [Isaac Lab: A GPU-Accelerated Simulation Framework for Multi-Modal Robot Learning (arXiv 2511.04831)](https://arxiv.org/html/2511.04831v1)
- [Isaac Lab Imitation Learning — Teleoperation and Mimic](https://isaac-sim.github.io/IsaacLab/main/source/overview/imitation-learning/teleop_imitation.html)
- [SkillGen for Automated Demonstration Generation](https://isaac-sim.github.io/IsaacLab/main/source/overview/imitation-learning/skillgen.html)
- [Streamline Robot Learning with Whole-Body Control and Enhanced Teleoperation in NVIDIA Isaac Lab 2.3](https://developer.nvidia.com/blog/streamline-robot-learning-with-whole-body-control-and-enhanced-teleoperation-in-nvidia-isaac-lab-2-3/)
- [Isaac Lab Releases on GitHub](https://github.com/isaac-sim/IsaacLab/releases/)
- [Robot Configuration in Isaac Lab](https://docs.nvidia.com/learning/physical-ai/getting-started-with-isaac-lab/latest/train-your-second-robot-with-isaac-lab/02-robot-configuration-in-isaac-lab.html)

## Internal references

- Prior memo (architecture overview, still authoritative for non-S2R aspects): `~/.ai-ecosystem/research/2026-03-15_isaac-lab-holoscript-integration-research.md`
- Plugin code: `packages/plugins/robotics-plugin/src/{index.ts,usd-codegen.ts}`, `packages/plugins/robotics-plugin/src/traits/ROS2HardwareLoopTrait.ts`
- Contracted-simulation anchor: `packages/core/src/reconstruction/simulationContractBinding.ts`
- Source TODO trail: `~/.ai-ecosystem/research/2026-03-09_holoscript-impossible-doors-breakthrough-analysis.md` item 9
