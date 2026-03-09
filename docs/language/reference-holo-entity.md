# Entity-Trait Pattern Reference (`.holo`)

Complete reference for HoloScript's advanced `.holo` format using the entity-trait pattern.

## Overview

The `.holo` entity pattern provides:

- **Trait-based architecture** - Fine-grained component configuration
- **Advanced features** - Complex VR/AR spatial computing
- **Entity-component system** - Modular, composable design
- **Type safety** - Explicit trait declarations

## Basic Entity

```holoscript
composition SimpleScene {
  entity Floor {
    mesh: {
      type: "plane",
      width: 20.0,
      height: 20.0
    }

    transform: {
      position: [0.0, 0.0, 0.0],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0]
    }
  }
}
```

**Key differences from `.hs`/`.hsplus`:**

- No quotes around entity names
- Properties use `:` with object syntax `{ }`
- Arrays use `[  ]` instead of `{ }`
- Traits are explicit configurations

## Common Traits

### `mesh` - Visual Geometry

```holoscript
entity Sphere {
  mesh: {
    type: "sphere",
    radius: 0.5
  }
}

entity Box {
  mesh: {
    type: "box",
    width: 1.0,
    height: 1.0,
    depth: 1.0
  }
}
```

### `advanced_pbr` - PBR Materials

```holoscript
entity MetallicSphere {
  mesh: {
    type: "sphere",
    radius: 0.5
  }

  advanced_pbr: {
    base_color: [0.8, 0.8, 0.8],
    metallic: 1.0,
    roughness: 0.2,
    emissive: [0.0, 0.0, 0.0],
    emissive_intensity: 0.0
  }
}
```

### `transform` - Position, Rotation, Scale

```holoscript
entity PositionedObject {
  mesh: {
    type: "box"
  }

  transform: {
    position: [2.0, 1.0, -3.0],
    rotation: [0.0, 45.0, 0.0],
    scale: [1.0, 1.0, 1.0]
  }
}
```

### `rigidbody` - Physics Simulation

```holoscript
entity PhysicsBall {
  mesh: {
    type: "sphere",
    radius: 0.3
  }

  rigidbody: {
    mass: 1.0,
    gravity_enabled: true,
    linear_drag: 0.05,
    angular_drag: 0.05,
    constraints: {
      freeze_rotation_x: false,
      freeze_rotation_y: false,
      freeze_rotation_z: false
    }
  }
}
```

### `collider` - Collision Detection

```holoscript
entity Wall {
  mesh: {
    type: "box"
  }

  collider: {
    type: "box",
    is_trigger: false,
    size: [10.0, 2.0, 0.5],
    material: {
      friction: 0.6,
      bounciness: 0.3,
      friction_combine: "average",
      bounce_combine: "maximum"
    }
  }
}
```

### `grabbable` - VR Interaction

```holoscript
entity VRBall {
  mesh: {
    type: "sphere",
    radius: 0.3
  }

  grabbable: {
    enabled: true,
    grab_type: "physics",
    haptic_on_grab: true,
    haptic_intensity: 0.5,
    release_velocity_scale: 5.0,
    attach_point: "center",
    two_handed: false
  }

  on_grab(event) {
    console.log("Grabbed by", event.hand);
  }

  on_release(event) {
    console.log("Released");
  }
}
```

### `light` - Lighting

```holoscript
entity PointLight {
  light: {
    type: "point",
    color: [1.0, 1.0, 1.0],
    intensity: 1.0,
    range: 20.0,
    cast_shadows: true,
    shadow_resolution: 2048
  }

  transform: {
    position: [0.0, 3.0, 0.0]
  }
}
```

## Complete Example

```holoscript
composition VRScene {
  // Floor
  entity Floor {
    mesh: {
      type: "plane",
      width: 20.0,
      height: 20.0
    }

    advanced_pbr: {
      base_color: [0.16, 0.16, 0.23],
      metallic: 0.0,
      roughness: 0.9
    }

    transform: {
      position: [0.0, 0.0, 0.0]
    }

    collider: {
      type: "box",
      is_trigger: false,
      size: [20.0, 0.1, 20.0]
    }
  }

  // Grabbable Ball
  entity RedBall {
    mesh: {
      type: "sphere",
      radius: 0.3
    }

    advanced_pbr: {
      base_color: [1.0, 0.27, 0.27],
      metallic: 0.2,
      roughness: 0.6
    }

    transform: {
      position: [-1.0, 1.0, -2.0]
    }

    rigidbody: {
      mass: 1.0,
      gravity_enabled: true,
      linear_drag: 0.05,
      angular_drag: 0.05
    }

    collider: {
      type: "sphere",
      is_trigger: false,
      material: {
        friction: 0.5,
        bounciness: 0.7
      }
    }

    grabbable: {
      enabled: true,
      grab_type: "physics",
      haptic_on_grab: true,
      release_velocity_scale: 5.0
    }

    on_grab(event) {
      console.log("Red ball grabbed");
    }

    on_release(event) {
      console.log("Red ball released");
    }
  }

  // Lighting
  entity MainLight {
    light: {
      type: "point",
      color: [1.0, 1.0, 1.0],
      intensity: 1.0,
      range: 20.0,
      cast_shadows: true
    }

    transform: {
      position: [0.0, 4.0, 0.0]
    }
  }

  // VR Camera
  entity VRCamera {
    camera: {
      type: "vr",
      field_of_view: 90.0,
      near_clip: 0.01,
      far_clip: 1000.0
    }

    transform: {
      position: [0.0, 1.7, 0.0]
    }

    vr_controllers: {
      left: {
        model: "oculus_touch_left",
        haptics_enabled: true
      },
      right: {
        model: "oculus_touch_right",
        haptics_enabled: true
      }
    }
  }
}
```

## When to Use Entity Pattern

Use the entity-trait pattern when:

- Each object is unique with specific configurations
- You need fine-grained control over traits
- Building advanced VR/AR/XR experiences
- Maximum clarity is prioritized over reusability

For reusability, see the [Object-Template Pattern](./reference-holo-object).

## Next Steps

- [Object-Template Pattern](./reference-holo-object)
- [Cross-Format Comparison](./comparison-simple-scene)
- [Interactive Game Comparison](./comparison-interactive-game)
