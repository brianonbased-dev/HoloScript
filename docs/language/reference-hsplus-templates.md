# Templates & Decorators Reference (`.hsplus`)

Complete reference for HoloScript's extended `.hsplus` format templates and decorators.

## Overview

The `.hsplus` format adds:
- **Templates** - Reusable component definitions
- **Decorators** - Behavioral modifiers with `@` syntax
- **Compositions** - Scene container blocks
- **Object instances** - Create objects from templates

## Basic Template

```holoscript
composition "MyScene" {
  template "Ball" {
    geometry: "sphere"
    radius: 0.5
    color: "red"
  }

  object "Ball1" using "Ball" {
    position: { x: 0, y: 1, z: 0 }
  }

  object "Ball2" using "Ball" {
    position: { x: 2, y: 1, z: 0 }
  }
}
```

## Decorators

### `@grabbable` - VR Grab Interaction

```holoscript
template "GrabbableObject" {
  @grabbable {
    hand: "both"
    haptic: true
  }

  geometry: "box"
}
```

**Parameters:**
- `hand`: `"left"` | `"right"` | `"both"`
- `haptic`: `true` | `false`

### `@throwable` - Physics Throwing

```holoscript
template "ThrowableBall" {
  @grabbable
  @throwable {
    velocity: 5.0
  }

  geometry: "sphere"
}
```

**Parameters:**
- `velocity`: Throw velocity multiplier

### `@collidable` - Collision Detection

```holoscript
template "Wall" {
  @collidable

  geometry: "box"
}
```

### `@physics` - Physics Simulation

```holoscript
template "PhysicsObject" {
  @physics {
    mass: 10
    friction: 0.5
    restitution: 0.7
  }

  geometry: "sphere"
}
```

**Parameters:**
- `mass`: Object mass
- `friction`: Surface friction (0-1)
- `restitution`: Bounciness (0-1)

### `@interactive` - Click/Pointer Events

```holoscript
template "Button" {
  @interactive

  geometry: "box"
}
```

### `@networked` - Multiplayer Sync

```holoscript
template "SharedObject" {
  @networked {
    sync: "transform"
    authority: "owner"
  }

  geometry: "sphere"
}
```

**Parameters:**
- `sync`: `"transform"` | `"physics"` | `"all"`
- `authority`: `"server"` | `"owner"` | `"client"`

## Complete Example

```holoscript
composition "VRPlayground" {
  // Environment configuration
  environment {
    backgroundColor: "#1a1a2e"
    ambient: 0.6
    shadows: true
  }

  // Reusable template with decorators
  template "InteractiveBall" {
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

  // Floor
  object "Floor" {
    geometry: "plane"
    width: 20
    height: 20
    color: "#2a2a3a"
  }

  // Balls using template
  object "RedBall" using "InteractiveBall" {
    color: "#ff4444"
    position: { x: -1, y: 1, z: -2 }
  }

  object "GreenBall" using "InteractiveBall" {
    color: "#44ff44"
    position: { x: 0, y: 1, z: -2 }
  }

  object "BlueBall" using "InteractiveBall" {
    color: "#4444ff"
    position: { x: 1, y: 1, z: -2 }
  }

  // Lighting
  object "Light" {
    type: "light"
    lightType: "point"
    color: "#ffffff"
    intensity: 1.0
    position: { x: 0, y: 3, z: 0 }
  }
}
```

## All Decorators

| Decorator | Purpose | Parameters |
|-----------|---------|------------|
| `@grabbable` | VR hand grab | `hand`, `haptic` |
| `@throwable` | Physics throw | `velocity` |
| `@collidable` | Collision detection | None |
| `@physics` | Physics simulation | `mass`, `friction`, `restitution` |
| `@interactive` | Click/pointer events | None |
| `@networked` | Multiplayer sync | `sync`, `authority` |
| `@pokeable` | VR finger poke | `threshold` |
| `@teleportable` | VR teleport target | `type` |

## Decorator Stacking

Decorators can be combined:

```holoscript
template "CompleteVRObject" {
  @grabbable
  @throwable
  @physics
  @collidable
  @networked

  geometry: "box"
}
```

## Template Inheritance

```holoscript
template "BaseObject" {
  @collidable
  geometry: "box"
}

template "GrabbableBox" extends "BaseObject" {
  @grabbable
  // Inherits @collidable and geometry from BaseObject
}
```

## Property Overrides

Objects can override template properties:

```holoscript
template "DefaultBall" {
  geometry: "sphere"
  radius: 0.5
  color: "white"
}

object "LargeRedBall" using "DefaultBall" {
  radius: 1.0      // Override
  color: "red"     // Override
  // geometry inherited
}
```

## Environment Block

```holoscript
composition "Scene" {
  environment {
    backgroundColor: "#1a1a2e"
    ambient: 0.6
    shadows: true
    fog: {
      enabled: true
      color: "#ffffff"
      near: 10
      far: 100
    }
  }
}
```

## Next Steps

- [State & Actions Reference](./reference-hsplus-state)
- [Event Handlers Reference](./reference-hsplus-events)
- [Modules & Imports Reference](./reference-hsplus-modules)
- [Cross-Format Comparison](./comparison-simple-scene)
