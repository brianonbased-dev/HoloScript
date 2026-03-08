# Cross-Format Comparison: Simple VR Scene

The same VR scene implemented in all three HoloScript formats.

## Scene Description

- Floor (20×20 plane)
- 3 grabbable balls (red, green, blue)
- Point light
- VR camera

## `.hs` - Basic Format

```holoscript
// Simple, declarative, no VR interaction

environment {
  backgroundColor: "#1a1a2e"
  ambient: 0.6
  shadows: true
}

object "Floor" {
  geometry: "plane"
  color: "#2a2a3a"
  width: 20
  height: 20
  position: { x: 0, y: 0, z: 0 }
}

object "RedBall" {
  geometry: "sphere"
  color: "#ff4444"
  radius: 0.3
  position: { x: -1, y: 1, z: -2 }
  physics: true
  mass: 1.0
}

object "GreenBall" {
  geometry: "sphere"
  color: "#44ff44"
  radius: 0.3
  position: { x: 0, y: 1, z: -2 }
  physics: true
  mass: 1.0
}

object "BlueBall" {
  geometry: "sphere"
  color: "#4444ff"
  radius: 0.3
  position: { x: 1, y: 1, z: -2 }
  physics: true
  mass: 1.0
}

object "Light" {
  type: "light"
  lightType: "point"
  color: "#ffffff"
  intensity: 1.0
  position: { x: 0, y: 3, z: 0 }
}
```

**Limitations**:
- No VR interaction (balls not actually grabbable)
- No templates (code duplication)
- No event handlers

## `.hsplus` - Extended Format

```holoscript
// Template reusability + VR decorators

composition "InteractiveVRRoom" {
  environment {
    backgroundColor: "#1a1a2e"
    ambient: 0.6
    shadows: true
  }

  // Reusable template
  template "GrabbableBall" {
    @grabbable {
      hand: "both"
      haptic: true
    }
    @throwable {
      velocity: 5.0
    }
    @physics {
      mass: 1.0
      friction: 0.5
      restitution: 0.7
    }
    @collidable

    geometry: "sphere"
    radius: 0.3
  }

  object "Floor" {
    geometry: "plane"
    color: "#2a2a3a"
    width: 20
    height: 20
    position: { x: 0, y: 0, z: 0 }
  }

  // Use template 3 times
  object "RedBall" using "GrabbableBall" {
    color: "#ff4444"
    position: { x: -1, y: 1, z: -2 }
  }

  object "GreenBall" using "GrabbableBall" {
    color: "#44ff44"
    position: { x: 0, y: 1, z: -2 }
  }

  object "BlueBall" using "GrabbableBall" {
    color: "#4444ff"
    position: { x: 1, y: 1, z: -2 }
  }

  object "Light" {
    type: "light"
    lightType: "point"
    color: "#ffffff"
    intensity: 1.0
    position: { x: 0, y: 3, z: 0 }
  }
}
```

**Advantages**:
- ✅ VR interaction works (`@grabbable`, `@throwable`)
- ✅ Template reusability (less code duplication)
- ✅ Decorator parameters for fine control
- ✅ Proper physics configuration

## `.holo` - Advanced Format

```holoscript
// Fine-grained trait control + event handlers

composition InteractiveVRRoom {
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
      size: [20.0, 0.1, 20.0]
    }
  }

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

  // GreenBall and BlueBall similar...

  entity Light {
    light: {
      type: "point",
      color: [1.0, 1.0, 1.0],
      intensity: 1.0,
      range: 20.0,
      cast_shadows: true
    }

    transform: {
      position: [0.0, 3.0, 0.0]
    }
  }
}
```

**Advantages**:
- ✅ Fine-grained trait control
- ✅ Event handlers (`on_grab`, `on_release`)
- ✅ Advanced PBR materials
- ✅ Explicit physics configuration
- ✅ Full control over all properties

**Disadvantages**:
- ❌ More verbose (no templates in entity pattern)
- ❌ Code duplication (3 similar ball entities)

::: tip
The `.holo` format also supports the [object+template pattern](./reference-holo-object) for reusability!
:::

## Key Differences Summary

| Feature | `.hs` | `.hsplus` | `.holo` |
|---------|-------|-----------|---------|
| VR interaction | ✗ | ✓ | ✓ |
| Templates | ✗ | ✓ | ✓ (object pattern) |
| Event handlers | ✗ | ✓ | ✓ |
| Trait configs | ✗ | ✗ | ✓ |
| PBR materials | ✗ | ✗ | ✓ |
| Lines of code | ~70 | ~80 | ~220 |

## When to Use Each Format

- **Use `.hs`** - Learning, static scenes, quick prototypes
- **Use `.hsplus`** - Interactive apps, games, state-driven experiences
- **Use `.holo`** - Advanced VR/AR, fine-grained control, complex spatial computing

## Next Steps

- [Interactive Game Comparison](./comparison-interactive-game)
- [Format-Specific References](./reference)
- [Examples Gallery](/examples/)
