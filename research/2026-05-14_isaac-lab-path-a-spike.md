---
title: Isaac Lab Path A Spike
date: 2026-05-14
task_id: task_1778732219586_f8dp
source: research/2026-04-19_isaac-lab-sim-to-real.md
status: implemented
artifact_type: implementation-note
---

# Machine Summary (uAA2 COMPRESS)

- Implemented the smallest HoloScript to Isaac Lab Path A asset/export spike in `@holoscript/robotics-plugin`.
- Parser support now covers `domain_randomization` and `actuator_group` blocks plus both trait placements used by robotics fixtures.
- USD generation now emits unit assumptions, applied `PhysicsDriveAPI:*` schemas, current per-axis `PhysxJointAxisAPI:*` friction attributes, and HoloScript metadata for delayed actuator hints.
- Validation: `pnpm --filter @holoscript/robotics-plugin test` passed 9 tests; `pnpm --filter @holoscript/robotics-plugin build` passed. A full-root `pnpm build` was attempted afterward and timed out after 10 minutes without useful output.

# Isaac Lab Path A Spike

This is a build-first promotion from the Isaac Lab sim-to-real interop memo. The result is intentionally a spike, not an end-to-end Isaac Lab training pipeline. It establishes a deterministic asset/export path that can be validated locally without an Isaac Sim installation.

## Implemented Surface

The implementation lives in `packages/plugins/robotics-plugin`:

- `src/ast.ts`: adds `DomainRandomizationConfig` and `ActuatorGroupConfig`.
- `src/parser.ts`: parses composition/object-level `domain_randomization`, object-level `actuator_group`, and traits both before and inside object bodies.
- `src/usd-codegen.ts`: emits Isaac Lab-oriented USD with explicit units, articulation root schemas, drive schemas, per-axis PhysX friction attributes, and delayed actuator metadata.
- `examples/isaac-lab-sim-to-real.holo`: fixture for a two-link arm with PD gains, friction assumptions, actuator latency, and domain randomization.
- `src/__tests__/isaac-lab-interop.test.ts`: focused parser/codegen validation.

## Units And Schema Assumptions

HoloScript fixture values use meters, kilograms, seconds, radians, and radians per second. USD stage metadata is emitted as:

```usda
metersPerUnit = 1.0
kilogramsPerMass = 1.0
```

Angular joint limits and angular velocities are converted from HoloScript radians/radians-per-second to USD/PhysX degrees/degrees-per-second before export.

Drive control is represented with OpenUSD `PhysicsDriveAPI` multiple-apply schemas, for example:

```usda
prepend apiSchemas = ["PhysicsDriveAPI:angular", "PhysxJointAxisAPI:angular"]
float drive:angular:physics:stiffness = 100
float drive:angular:physics:damping = 10
float drive:angular:physics:maxForce = 50
uniform token drive:angular:physics:type = "force"
```

Joint friction is not emitted as `drive:angular:physics:friction`; that is not a `PhysicsDriveAPI` field. Per-axis friction assumptions are emitted through PhysX joint-axis attributes:

```usda
float physxJointAxis:angular:staticFrictionEffort = 0.05
float physxJointAxis:angular:dynamicFrictionEffort = 0.05
float physxJointAxis:angular:viscousFrictionCoefficient = 0.01
float physxJointAxis:angular:armature = 0.001
```

Actuator latency is exported as HoloScript metadata because Isaac Lab delayed actuators use task/config semantics rather than a standard USD drive field:

```usda
custom float holoscript:isaacLab:actuatorLatencySeconds = 0.005
```

## Validation Commands

```powershell
pnpm --filter @holoscript/robotics-plugin test
pnpm --filter @holoscript/robotics-plugin build
git diff --check -- packages/plugins/robotics-plugin/src/ast.ts packages/plugins/robotics-plugin/src/parser.ts packages/plugins/robotics-plugin/src/usd-codegen.ts packages/plugins/robotics-plugin/src/index.ts packages/plugins/robotics-plugin/src/__tests__/isaac-lab-interop.test.ts packages/plugins/robotics-plugin/examples/isaac-lab-sim-to-real.holo
```

Observed local result on 2026-05-14: all three focused commands passed.

## Deferred Work

- Generate Isaac Lab Python `@configclass` task files from the parsed domain randomization and actuator-group metadata.
- Validate the emitted USD inside Isaac Sim/Isaac Lab on a Linux GPU host.
- Add physical robot evidence before making any sim-to-real performance claim.

## Sources Checked

- OpenUSD `PhysicsDriveAPI`: https://openusd.org/docs/api/class_usd_physics_drive_a_p_i.html
- Omni Physics `PhysxJointAxisAPI`: https://docs.omniverse.nvidia.com/kit/docs/omni_physics/latest/dev_guide/joints/physx_joint_schema.html
- Omni Physics articulation joint friction notes: https://docs.omniverse.nvidia.com/kit/docs/omni_physics/110.0/dev_guide/rigid_bodies_articulations/articulations.html
- PhysX articulation root extension API: https://docs.omniverse.nvidia.com/kit/docs/omni_usd_schema_physics/latest/class_physx_schema_physx_articulation_a_p_i.html
- Isaac Lab delayed actuator config source docs: https://isaac-sim.github.io/IsaacLab/main/_modules/isaaclab/actuators/actuator_pd_cfg.html
