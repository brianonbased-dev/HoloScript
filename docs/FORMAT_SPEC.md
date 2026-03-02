# HoloScript Format Specification

> Version 4.0 — March 2026

## File Formats

| Extension | Name | Purpose | Parser |
|---|---|---|---|
| `.holo` | Composition | Declarative scenes, 3D spatial layouts | `HoloCompositionParser` |
| `.hsplus` | HoloScript+ | Imperative logic, modules, types | `HoloScriptPlusParser` |
| `.hs` | HoloScript | Simple scripting, event handlers | `HoloScriptCodeParser` |

## `.holo` (Composition Format)

Declarative, scene-centric. Used for world building, asset composition, and domain descriptions.

### Core Blocks

```holo
composition "MyScene" {
  environment { skybox: "sunset" gravity: 9.8 }
  state { score: 0 }
  object "Player" @collidable { position: [0, 1, 0] }
  spatial_group "Trees" { position: [10, 0, 0] }
  light "Sun" { type: "directional" intensity: 1.5 }
  template "Enemy" { health: 100 }
  logic { onUpdate { score += 1 } }
}
```

### Domain Blocks (v4.1)

Domain-specific blocks follow the pattern: `KEYWORD NAME @traits { properties }`.

#### IoT / Digital Twin
```holo
sensor "TempProbe" @telemetry { type: "thermocouple" interval: 1000 }
device "SmartLight" @networked { protocol: "matter" brightness: 100 }
digital_twin "Turbine" { asset: "turbine_v3" sync_rate: 500 }
```

#### Robotics
```holo
joint "Shoulder" @revolute { axis: [0,1,0] limits: [-90,90] }
actuator "Servo" @encoder { torque: 12.5 speed: 6000 }
controller "PID" @safety_rated { algorithm: "pid" kp: 1.5 }
```

#### Data Visualization
```holo
dashboard "Monitor" { layout: "grid" refresh: 5000 }
chart "Temp" { type: "line" x_axis: "time" y_axis: "celsius" }
```

#### Education / Healthcare / Music / Architecture / Web3
```holo
lesson "Anatomy" { objective: "Learn heart structure" duration: 45 }
procedure "Surgery" { steps: ["prep", "incision", "suture"] }
instrument "Piano" { type: "sampled" midi_channel: 1 }
floor_plan "Level1" { scale: "1:100" units: "meters" }
contract "NFT" { chain: "base" standard: "ERC-721" }
```

#### Extensible Custom Blocks
Any identifier can be a block keyword:
```holo
recipe "Pasta" { prep_time: 30 servings: 4 }
workflow "Deploy" { stages: ["build", "test", "deploy"] }
```

## `.hsplus` (HoloScript+ Format)

Imperative, module-centric. Used for reusable logic, type definitions, and typed programming.

```hsplus
module GameLogic {
  struct Vec3 { x: number, y: number, z: number }
  
  enum Direction { North, South, East, West }
  
  interface Damageable {
    health: number
    takeDamage(amount: number): void
  }
  
  export function distance(a: Vec3, b: Vec3): number {
    return sqrt((a.x - b.x)^2 + (a.y - b.y)^2 + (a.z - b.z)^2)
  }
}
```

## `.hs` (HoloScript Format)

Simple scripting for object behaviors and event handlers.

```hs
object "Button" @interactive {
  onClick(player) {
    emit "button_pressed"
    animate self { scale: [1.2, 1.2, 1.2] duration: 0.2 }
  }
}
```

## Trait Syntax

Traits are decorators prefixed with `@`:
```holo
object "Enemy" @collidable @animated @damageable { ... }
```

Traits with configuration:
```holo
object "NPC" @physics { mass: 50 friction: 0.3 } { ... }
```

## Value Types

| Type | Example |
|---|---|
| String | `"hello"` or `'hello'` |
| Number | `42`, `3.14`, `-1` |
| Boolean | `true`, `false` |
| Null | `null` |
| Array | `[1, 2, 3]`, `["a", "b"]` |
| Object | `{ x: 1, y: 2 }` |
| Bind | `bind(state.score)` |
