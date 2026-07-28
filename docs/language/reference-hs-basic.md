# Basic Syntax Reference (`.hs`)

Complete reference for HoloScript's basic `.hs` format - the simplest way to create 3D scenes.

## Overview

The `.hs` format is designed for:

- **Learning** - Easiest format to understand
- **Prototyping** - Quick scene creation
- **Static scenes** - Non-interactive visualizations
- **Declarative content** - Configuration-driven 3D

## Basic Object Declaration

The fundamental building block is the `object` keyword:

```holoscript
object "SimpleBox" {
  geometry: "box"
}
```

### With Position

```holoscript
object "PositionedSphere" {
  geometry: "sphere"
  position: { x: 2, y: 1, z: 0 }
}
```

### Full Transform

```holoscript
object "FullTransform" {
  geometry: "cylinder"
  position: { x: -2, y: 1, z: 0 }
  rotation: { x: 0, y: 45, z: 0 }
  scale: { x: 1, y: 2, z: 1 }
}
```

## Geometry Types

### Basic Primitives

```holoscript
object "Box" { geometry: "box" }
object "Sphere" { geometry: "sphere" }
object "Cylinder" { geometry: "cylinder" }
object "Cone" { geometry: "cone" }
object "Plane" { geometry: "plane" }
object "Torus" { geometry: "torus" }
object "Capsule" { geometry: "capsule" }
```

### Special Geometries

```holoscript
object "Heart" { geometry: "heart" }
object "Star" { geometry: "star" }
object "Crystal" { geometry: "crystal" }
object "Gem" { geometry: "gem" }
object "Gear" { geometry: "gear" }
object "Lightning" { geometry: "lightning" }
```

## Colors

### Named Colors

```holoscript
object "RedCube" {
  geometry: "box"
  color: "red"
}
```

### Hex Colors

```holoscript
object "BlueSphere" {
  geometry: "sphere"
  color: "#0088ff"
}
```

### Preset Colors

```holoscript
object "NeonBox" {
  geometry: "box"
  color: "neon"
}
```

Available presets: `neon`, `hologram`, `energy`, `ice`, `fire`, `forest`, and more.

## Materials

```holoscript
// Shiny metal
object "MetalSphere" {
  geometry: "sphere"
  material: "metal"
  color: "silver"
}

// Transparent glass
object "GlassBox" {
  geometry: "box"
  material: "glass"
  color: "#88ccff"
}
```

### Available Materials

- `standard` - Default material
- `metal` - Metallic surfaces
- `glass` - Transparent glass
- `plastic` - Plastic appearance
- `rubber` - Matte rubber
- `wood` - Wood grain
- `fabric` - Cloth texture
- `hologram` - Holographic effect
- `neon` - Neon glow

## Visual Effects

### Glow

```holoscript
object "GlowingSphere" {
  geometry: "sphere"
  color: "cyan"
  glow: true
}
```

### Emissive

```holoscript
object "EmissiveBox" {
  geometry: "box"
  color: "orange"
  emissive: true
  emissiveIntensity: 2.0
}
```

### Transparency

```holoscript
object "TransparentSphere" {
  geometry: "sphere"
  color: "blue"
  opacity: 0.5
}
```

### Wireframe

```holoscript
object "WireframeBox" {
  geometry: "box"
  wireframe: true
}
```

## Size Properties

### Box Dimensions

```holoscript
object "CustomBox" {
  geometry: "box"
  width: 2.0
  height: 1.0
  depth: 3.0
}
```

### Sphere Radius

```holoscript
object "LargeSphere" {
  geometry: "sphere"
  radius: 1.5
}
```

### Cylinder Dimensions

```holoscript
object "TallCylinder" {
  geometry: "cylinder"
  radius: 0.5
  height: 3.0
}
```

## Animations

### Basic Animation

```holoscript
object "SpinningCube" {
  geometry: "box"
  color: "purple"
  animate: "spin"
}
```

### Animation Types

- `pulse` - Scale pulse effect
- `float` - Up/down floating
- `bounce` - Bouncing motion
- `spin` - Rotation
- `flicker` - Opacity flicker
- `grow-shrink` - Size change
- `oscillate` - Back and forth

### Custom Animation Speed

```holoscript
// Fast spin (3x speed)
object "FastSpin" {
  geometry: "sphere"
  animate: "spin"
  animSpeed: 3.0
}

// Slow float (0.5x speed)
object "SlowFloat" {
  geometry: "sphere"
  animate: "float"
  animSpeed: 0.5
}
```

## Physics

```holoscript
object "PhysicsBox" {
  geometry: "box"
  physics: true
  mass: 10
}

object "HeavyBall" {
  geometry: "sphere"
  physics: true
  mass: 100
  friction: 0.8
  restitution: 0.3  // Bounciness
}
```

## Visibility

```holoscript
object "HiddenObject" {
  geometry: "box"
  visible: false
}
```

## Shadows and Lighting

```holoscript
object "ShadowCaster" {
  geometry: "box"
  castShadow: true
  receiveShadow: true
}
```

## Layering

```holoscript
object "ForegroundObject" {
  geometry: "box"
  layer: 1
  renderOrder: 10
}
```

## Parent-Child Grouping

```holoscript
object "ParentGroup" {
  geometry: "box"
  position: { x: 0, y: 0, z: 0 }

  child "ChildSphere" {
    geometry: "sphere"
    position: { x: 1, y: 1, z: 0 }  // Relative to parent
  }

  child "ChildCylinder" {
    geometry: "cylinder"
    position: { x: -1, y: 1, z: 0 }
  }
}
```

## Complete Example

```holoscript
object "FullyConfiguredObject" {
  // Identity
  id: "demo-object-001"
  name: "Demonstration Object"

  // Geometry
  geometry: "box"
  width: 2.0
  height: 1.0
  depth: 1.0

  // Transform
  position: { x: 0, y: 2, z: -5 }
  rotation: { x: 0, y: 45, z: 0 }
  scale: { x: 1, y: 1, z: 1 }

  // Appearance
  color: "#ff6b6b"
  material: "metal"
  opacity: 1.0

  // Visual effects
  glow: true
  emissive: true
  emissiveIntensity: 1.5

  // Animation
  animate: "float"
  animSpeed: 1.0

  // Physics
  physics: true
  mass: 10
  friction: 0.5
  restitution: 0.7

  // Rendering
  castShadow: true
  receiveShadow: true
  visible: true
  wireframe: false
  layer: 1
  renderOrder: 5
}
```

## Syntax Rules

For AI agents generating `.hs` code:

1. **Format**: Use `object "Name" { property: value }` syntax
2. **Properties**: camelCase property names
3. **Transforms**: Use `{ x, y, z }` objects for position/rotation/scale
4. **Colors**: Named colors or hex format `#RRGGBB`
5. **Names**: Always quote object names
6. **Booleans**: Use `true`/`false` (lowercase)
7. **Numbers**: Integers or floats (e.g., `1.0`, `10`)

## Limitations

The `.hs` format **does NOT support**:

- Interactivity (click handlers, VR grab)
- Templates/reusability

For templates, trait decorators, brain declarations, module imports, and hot-reload, use [`.hsplus`](./reference-hsplus-templates) or [`.holo`](./reference-holo-entity) formats.

`.hs` **does** support functions, loops, conditionals, coroutines, agent process logic (`execute`, `yield`, `connect`), event handlers, and `emit` — see [Process Language](#process-language) below.

## Next Steps

- [Templates & Decorators (`.hsplus`)](./reference-hsplus-templates)
- [Process Language Reference (`.hs`)](./reference-hs-process)
- [Cross-Format Comparison](./comparison-simple-scene)
- [Examples Gallery](/examples/)

---

## Process Language

`.hs` is not only a declarative format — it is the **process and sequential agent logic** layer of HoloScript. Objects can contain functions, coroutines, state blocks, and event handlers. Top-level `execute` and `connect` statements wire agents together and start loops running.

The example below is drawn from `examples/agents/guard-patrol.hs`.

### Executing Loops

The `execute` statement runs a function or coroutine on an object. The `repeat forever` modifier keeps it running perpetually:

```holoscript
execute guard_captain.patrol() repeat forever
```

`execute` is `.hs`'s way of saying "run this process continuously." Without it, functions are defined but never started.

### Coroutine Yield

Inside a function, `yield` suspends execution and returns control to the engine for one frame. This is what makes `.hs` functions cooperative coroutines rather than blocking calls:

```holoscript
function patrol() {
  while (state.time_at_waypoint < state.wait_duration) {
    scan_area(15)
    state.time_at_waypoint += delta_time
    yield  // resume next frame
  }
}
```

Without `yield`, a `while` loop would block the entire engine until it finished.

### Functions and Control Flow

`.hs` functions are full procedural: `const`, `let`, `while`, `if/else`, `return`, and ternary expressions are all available. Functions live inside `object` blocks:

```holoscript
object "guard_captain" {
  function investigate(target) {
    const threat = assess_threat(target)

    if (threat.level > 0.7) {
      raise_alarm()
      state.alert_level = 3
    } else if (threat.level > 0.3) {
      emit("guard_warning", { target: target, message: "Halt! Identify yourself." })
      wait(3)
    }

    state.incidents_logged += 1
  }
}
```

State mutations use `state.<field>` references. Arithmetic operators (`+`, `-`, `*`, `/`, `%`) and comparisons (`>`, `<`, `==`, `!=`) work as expected.

### State Blocks

Objects declare their agent state in a `state` block. Fields are mutable by functions and event handlers throughout the object's lifetime:

```holoscript
object "guard_captain" {
  state {
    current_waypoint: 0
    alert_level: 0        // 0=calm, 1=cautious, 2=alert, 3=combat
    patrol_speed: 2.0
    investigation_target: null
    incidents_logged: 0
  }
}
```

### Agent Lifecycle Event Handlers

Objects receive events from the engine via `on_<event>` handlers. These interrupt or extend the running coroutine when the engine detects a matching condition:

```holoscript
object "guard_captain" {
  on_detect(entity) {
    if (entity.tag == "intruder" && state.alert_level < 2) {
      investigate(entity)
    }
  }

  on_damage(amount) {
    raise_alarm()
    face_toward(damage_source)
  }

  on_shift_end() {
    return_to_post()
    emit("shift_change", { guard: "guard_captain", post: "waypoint_gate" })
  }
}
```

### Emit Events

`emit` fires a named event into the scene's event bus. Other objects and systems can listen for it. An optional payload object is attached as the second argument:

```holoscript
emit("alarm_triggered")
emit("guard_warning", { target: target, message: "Halt! Identify yourself." })
emit("incident_logged", {
  location: target,
  threat_level: threat.level,
  time: current_time(),
  resolution: state.alert_level > 2 ? "alarm_raised" : "cleared"
})
```

### Connect Wiring

`connect` has two forms.

**Arrow-connect** — directly wires one callable to another without tight coupling. The left side does not need to know how the right side works:

```holoscript
connect guard_captain.raise_alarm -> alarm_bell.activate
```

**Assignment-connect** — wires an emitted event to a state mutation:

```holoscript
connect alarm_bell.alarm_triggered -> guard_captain.state.alert_level = 3
```

The `->` form is `.hs`'s decoupled wiring primitive. Objects reference each other by name; the engine resolves the binding at runtime.

### Built-In Agent Primitives

These functions are available inside any `.hs` object without import:

| Primitive                | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| `move_to(target, speed)` | Navigate to a target object or position               |
| `face_toward(target)`    | Rotate to face a target                               |
| `scan_area(radius)`      | Detect entities within a radius; triggers `on_detect` |
| `assess_threat(target)`  | Returns `{ level: 0.0–1.0 }`                          |
| `wait(seconds)`          | Suspend execution for N seconds                       |
| `find_nearest("tag")`    | Find the closest object with the given tag            |
| `index_of(obj)`          | Get the index of an object in an array                |
| `current_time()`         | Current scene time                                    |
| `delta_time`             | Time elapsed since the last frame                     |
| `max(a, b)`              | Numeric maximum                                       |

### Object Tagging

Any object can carry a `tag` field, which makes it queryable by `find_nearest` and detectable by `scan_area`:

```holoscript
object "waypoint_gate" {
  geometry: "cylinder"
  color: "#ffaa00"
  position: { x: 0, y: 0.1, z: -15 }
  tag: "waypoint"
}
```

`find_nearest("waypoint")` returns the closest object whose `tag` matches.

### Scene-Level Blocks

These blocks appear at the top level of a `.hs` file, outside any object. They configure global rendering and lighting.

**Environment:**

```holoscript
environment {
  skybox: "night"
  ambient_light: 0.15
  fog: { color: "#0a0a1e", density: 0.025 }
}
```

**Lights:**

```holoscript
light "MoonLight" {
  type: "directional"
  color: "#8899cc"
  intensity: 0.4
  rotation: [-50, 20, 0]
  cast_shadows: true
}

light "TorchGlow" {
  type: "point"
  color: "#ff8833"
  intensity: 0.6
  position: { x: 0, y: 3, z: -15 }
  range: 10
}
```

Light types: `directional`, `point`, `spot`, `area`, `ambient`.

**Post-processing:**

```holoscript
post_processing {
  bloom: {
    enabled: true
    intensity: 0.5
    threshold: 0.6
  }
  tone_mapping: {
    enabled: true
    type: "aces"
  }
}
```

### Complete Process Example

A minimal `.hs` agent that patrols between waypoints, detects intruders, and raises an alarm:

```holoscript
object "waypoint_a" {
  geometry: "cylinder"
  position: { x: 0, y: 0.1, z: -10 }
  tag: "waypoint"
}

object "waypoint_b" {
  geometry: "cylinder"
  position: { x: 10, y: 0.1, z: 0 }
  tag: "waypoint"
}

object "alarm_bell" {
  geometry: "sphere"
  color: "#ff0000"
  position: { x: 0, y: 5, z: 0 }

  state { active: false }

  function activate() {
    state.active = true
    emit("alarm_triggered")
  }
}

object "guard" {
  geometry: "capsule"
  position: { x: 0, y: 1, z: -10 }

  state {
    current_waypoint: 0
    alert_level: 0
    speed: 2.0
  }

  function patrol() {
    const waypoints = ["waypoint_a", "waypoint_b"]
    const target = waypoints[state.current_waypoint]

    move_to(target, state.speed)
    scan_area(12)
    yield

    state.current_waypoint = (state.current_waypoint + 1) % waypoints.length
  }

  on_detect(entity) {
    if (entity.tag == "intruder") {
      emit("guard_warning", { message: "Halt!" })
      const threat = assess_threat(entity)
      if (threat.level > 0.5) {
        alarm_bell.activate()
        state.alert_level = 3
      }
    }
  }
}

connect guard.alarm_triggered -> alarm_bell.activate

execute guard.patrol() repeat forever
```
