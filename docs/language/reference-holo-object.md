# Object-Template Pattern Reference (`.holo`)

Alternative `.holo` syntax using `object` and `template` keywords for reusability.

## Overview

The `.holo` format supports **two patterns**:

1. **Entity-Trait Pattern** - Each entity unique ([reference](./reference-holo-entity))
2. **Object-Template Pattern** - Reusable templates (THIS PAGE)

## Basic Template

```holoscript
composition Scene {
  template GrabbableBall {
    mesh: {
      type: "sphere",
      radius: 0.3
    }

    grabbable: {
      enabled: true,
      grab_type: "physics"
    }

    rigidbody: {
      mass: 1.0,
      gravity_enabled: true
    }
  }

  object RedBall using GrabbableBall {
    advanced_pbr: {
      base_color: [1.0, 0.0, 0.0]
    }

    transform: {
      position: [-1.0, 1.0, 0.0]
    }
  }

  object BlueBall using GrabbableBall {
    advanced_pbr: {
      base_color: [0.0, 0.0, 1.0]
    }

    transform: {
      position: [1.0, 1.0, 0.0]
    }
  }
}
```

## Template with Event Handlers

```holoscript
template InteractiveButton {
  mesh: {
    type: "box",
    width: 0.3,
    height: 0.1,
    depth: 0.3
  }

  pokeable: {
    enabled: true,
    press_depth: 0.02
  }

  on_poke_start(event) {
    this.onButtonPress();
  }

  onButtonPress() {
    // Override this in object instances
    console.log("Button pressed");
  }
}

object StartButton using InteractiveButton {
  transform: {
    position: [-1.0, 1.5, -3.0]
  }

  onButtonPress() {
    console.log("START button pressed!");
    // Custom logic for start button
  }
}
```

## Property Overrides

Objects can override any template property:

```holoscript
template BaseBall {
  mesh: {
    type: "sphere",
    radius: 0.5
  }

  advanced_pbr: {
    base_color: [1.0, 1.0, 1.0],
    metallic: 0.2,
    roughness: 0.6
  }
}

object LargeRedBall using BaseBall {
  // Override mesh radius
  mesh: {
    type: "sphere",
    radius: 1.0  // Override
  }

  // Override color
  advanced_pbr: {
    base_color: [1.0, 0.0, 0.0]  // Override
  }
}
```

## Complete Example

```holoscript
composition VRPlayground {
  template GrabbableBall {
    mesh: {
      type: "sphere",
      radius: 0.3
    }

    advanced_pbr: {
      base_color: [1.0, 1.0, 1.0],
      metallic: 0.2,
      roughness: 0.6
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
      console.log("Ball grabbed");
    }

    on_release(event) {
      console.log("Ball released");
    }
  }

  object Floor {
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

  object RedBall using GrabbableBall {
    advanced_pbr: {
      base_color: [1.0, 0.27, 0.27]
    }

    transform: {
      position: [-1.0, 1.0, -2.0]
    }
  }

  object GreenBall using GrabbableBall {
    advanced_pbr: {
      base_color: [0.27, 1.0, 0.27]
    }

    transform: {
      position: [0.0, 1.0, -2.0]
    }
  }

  object BlueBall using GrabbableBall {
    advanced_pbr: {
      base_color: [0.27, 0.27, 1.0]
    }

    transform: {
      position: [1.0, 1.0, -2.0]
    }
  }

  object MainLight {
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
}
```

## Entity vs Object Pattern

| Aspect | Entity Pattern | Object Pattern |
|--------|----------------|----------------|
| Reusability | Low | High |
| Clarity | High | Medium |
| Best for | Unique objects | Similar objects |
| Templates | No | Yes |
| Verbosity | Higher | Lower |

## When to Use Object Pattern

Use object+template pattern when:
- Many similar objects exist
- Template reusability is needed
- Migrating from `.hsplus` format
- Hybrid approach required (some templated, some unique)

## Next Steps

- [Entity-Trait Pattern](./reference-holo-entity)
- [Cross-Format Comparison](./comparison-simple-scene)
- [Templates & Decorators (`.hsplus`)](./reference-hsplus-templates)
