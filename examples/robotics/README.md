# HoloScript Robotics Examples

**Status**: ✅ Production Ready  
**Compilation Targets**: URDF (ROS 2), SDF (Gazebo), USD (Isaac Sim - Coming Soon)

## Overview

HoloScript provides a declarative, high-level language for defining robotic systems that compile to multiple industry-standard formats. This eliminates the need to manually write complex XML files while ensuring compatibility with major robotics platforms.

## Compilation Pipeline

```
HoloScript (.holo / .hsplus)
         │
         ├──→ URDFCompiler ──→ URDF XML (ROS 2 / Gazebo / Isaac)
         │
         ├──→ SDFCompiler  ──→ SDF XML (Gazebo Classic / Isaac)
         │
         └──→ [Coming] USDPhysicsEmitter ──→ USD (Isaac Sim Native)
```

## Features

### @joint Trait Support

HoloScript's `@joint` trait maps to URDF/SDF joint definitions:

| HoloScript Joint Type | URDF Type    | Use Case                      |
| --------------------- | ------------ | ----------------------------- |
| `hinge`               | `revolute`   | Rotational joints with limits |
| `slider`              | `prismatic`  | Linear actuators              |
| `ball`                | `floating`   | 3-DOF spherical joints        |
| `fixed`               | `fixed`      | Rigid connections             |
| `continuous`          | `continuous` | Unlimited rotation            |

### Joint Configuration

```hsplus
object "ShoulderJoint" {
  @joint {
    jointType: "hinge"
    connectedBody: "Base"           // Parent link
    axis: { x: 0, y: 0, z: 1 }      // Rotation axis
    limits: { min: -180, max: 180 } // Degrees (auto-converted to radians)
    damping: 0.1                    // Joint damping
    friction: 0.0                   // Joint friction
    motor: {                        // Motor configuration
      targetVelocity: 0
      maxForce: 100
    }
  }
}
```

### Physics Integration

- Automatic inertia calculation from geometry
- Mass specification via `@physics` trait
- Collision geometry generation
- Visual/collision mesh support

## Examples

### warehouse-production-workflow.holo

A full production workflow for a warehouse pick-and-place AGV fleet.
Upgrades the Studio `wizard-warehouse-robotics` template into a
HoloScript production pipeline with stage orchestration, safety
envelopes, performance budgets, and multi-target export.

- Fleet mission planning with priority queues
- Dynamic navmesh + A* pathfinding
- Sensor-fusion perception (LiDAR, camera, IMU)
- Pick/place gripper orchestration
- Safety monitoring (collision avoidance, emergency stop)
- Battery/charge management
- Verification station (barcode, weight, photo)
- Export to URDF, SDF, ROS 2, and USD (Isaac Sim)
- Quality validation + production metadata

Run:

```bash
holoc examples/robotics/warehouse-production-workflow.holo --target urdf
holoc examples/robotics/warehouse-production-workflow.holo --target sdf
```

### two-dof-robot-arm.holo

A simple 2-DOF robot arm demonstrating:

- Kinematic chain structure
- Revolute joint configuration
- Physics properties
- End effector

Run the demo:

```bash
npx tsx examples/robotics/demo-urdf-compilation.ts
```

Output:

- `output/two_dof_arm.urdf` - ROS 2 / Gazebo compatible
- `output/two_dof_arm.sdf` - Gazebo / Isaac Sim compatible

### Loading in Isaac Sim

```python
# Python snippet for Isaac Sim
from omni.isaac.core.utils.stage import add_reference_to_stage
add_reference_to_stage(usd_path="/path/to/robot.urdf", prim_path="/World/Robot")
```

## Supported Formats

| Format      | Status         | Use Case                             |
| ----------- | -------------- | ------------------------------------ |
| URDF        | ✅ Production  | ROS 2, Gazebo, Isaac Sim URDF import |
| SDF         | ✅ Production  | Gazebo Classic, Isaac Sim SDF import |
| USD Physics | 🚧 In Progress | Native Isaac Sim, Omniverse          |
| DTDL        | ✅ Production  | Azure Digital Twins                  |

## NVIDIA Isaac Sim Integration

### Current Support (via URDF/SDF import)

1. Export HoloScript to URDF or SDF
2. Import in Isaac Sim using Articulation importer
3. Full physics simulation with PhysX

### Roadmap: Native USD Physics

- USDPhysicsArticulationRootAPI emission
- USDPhysicsDriveAPI for joint motors
- USDPhysicsLimitAPI for joint limits
- OmniGraph integration for behavior trees

## Tests

```bash
# Run robotics compiler tests
pnpm test packages/core/src/compiler/URDFCompiler.test.ts
pnpm test packages/core/src/compiler/SDFCompiler.test.ts

# Test counts
# URDFCompiler: 44 tests
# SDFCompiler: 65 tests
```

## API Reference

### URDFCompiler

```typescript
import { URDFCompiler } from '@holoscript/core';

const compiler = new URDFCompiler({
  robotName: 'MyRobot',
  includeVisual: true,
  includeCollision: true,
  includeInertial: true,
  meshPathPrefix: 'package://meshes/',
});

const urdf = compiler.compile(composition);
```

### SDFCompiler

```typescript
import { SDFCompiler } from '@holoscript/core';

const compiler = new SDFCompiler({
  worldName: 'MyWorld',
  physicsEngine: 'ode', // 'ode' | 'bullet' | 'dart' | 'simbody'
  includePlugin: true,
});

const sdf = compiler.compile(composition);
```

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines on adding new robotics features.

## License

Apache 2.0 - See [LICENSE](../../LICENSE)
