# USD Physics Compiler

Compiles HoloScript physics compositions to **USD Physics** — Pixar's Universal Scene Description physics extension used natively by Apple visionOS, NVIDIA Omniverse, and USD-based pipelines.

## Overview

The USD Physics compiler (`--target usd-physics`) generates `.usdz` / `.usda` files with embedded [USD Physics schema](https://openusd.org/release/wp_rigid_body_physics.html) — rigid body dynamics, collision geometry, joints, and forces. This is the native physics format for:

- **Apple visionOS** — RealityKit + Reality Composer Pro
- **NVIDIA Omniverse** — PhysX simulation in USD scenes
- **USDZ AR Quick Look** — Physics-enabled AR objects in iOS

```bash
holoscript compile physics.holo --target usd-physics --output ./usdz/
```

## Output Structure

```
usdz/
  scene.usdz          # Zip bundle for iOS/visionOS AR Quick Look
  scene.usda          # Human-readable USD ASCII (for Omniverse)
  meshes/             # Collision mesh data
  physics/
    rigidBodies.usda
    joints.usda
    forces.usda
```

## Trait → USD Physics Mapping

| HoloScript Trait  | USD Physics Prim             | Schema                        |
| ----------------- | ---------------------------- | ----------------------------- |
| `@physics`        | `PhysicsRigidBodyAPI`        | Mass, velocity, angular vel   |
| `@collidable`     | `PhysicsCollisionAPI`        | Shape approximation           |
| `@kinematic`      | `PhysicsRigidBodyAPI` (kinematic) | Script-driven motion    |
| `@gravity`        | `PhysicsScene` gravity field | Global gravity vector         |
| `@soft_body`      | `PhysicsDeformableBodyAPI`   | Deformable mesh               |
| `@trigger`        | `PhysicsTriggerAPI`          | Overlap detection only        |
| `@joint`          | `PhysicsJoint`               | Revolute, prismatic, fixed    |
| `@buoyancy`       | `ForceField` (fluid)         | Buoyancy simulation           |

## Example

```holo
composition "PhysicsDemo_visionOS" {
  environment {
    gravity: [0, -9.81, 0]
  }

  template "Stack" {
    @physics
    @collidable
    geometry: "cube"

    physics: {
      mass: 1.0
      restitution: 0.3
      friction: 0.7
    }
  }

  object "Box_1" using "Stack" {
    scale: [0.2, 0.2, 0.2]
    position: [0, 0.5, -1]
  }

  object "Box_2" using "Stack" {
    scale: [0.25, 0.25, 0.25]
    position: [0.05, 0.9, -1]
  }

  object "Floor" {
    @collidable
    geometry: "plane"
    physics: { type: "static" }
  }
}
```

```bash
holoscript compile demo.holo --target usd-physics
# → demo.usdz  (ready for visionOS AR Quick Look)
# → demo.usda  (ready for Omniverse)
```

## visionOS / RealityKit Integration

The `.usdz` output loads directly into:

```swift
// visionOS
import RealityKit
let entity = try await Entity.load(named: "demo", in: bundle)
```

Physics simulation starts automatically via RealityKit's PhysX integration. No additional setup required.

## Compiler Options

| Option                 | Default    | Description                              |
| ---------------------- | ---------- | ---------------------------------------- |
| `--usd-backend`        | `physx`    | Physics backend: `physx`, `bullet`       |
| `--usd-gravity`        | `0,-9.81,0`| Gravity vector (m/s²)                    |
| `--usd-precision`      | `float`    | Precision: `half`, `float`, `double`     |
| `--usd-format`         | `usdz`     | Output: `usdz` (iOS), `usda` (text), `usdc` (binary) |
| `--usd-metersPerUnit`  | `1.0`      | Scene scale                              |
| `--usd-upAxis`         | `Y`        | Up axis: `Y` or `Z`                      |

## See Also

- [visionOS Compiler](/compilers/vision-os) — Full Apple Vision Pro output
- [iOS Compiler](/compilers/ios) — ARKit with USD models
- [URDF Compiler](/compilers/robotics/urdf) — Physics for robotics
