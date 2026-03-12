# File Formats

HoloScript has three file formats, each optimized for different use cases.

## Overview

| Extension | Style           | Parser     | Best For                   |
| --------- | --------------- | ---------- | -------------------------- |
| `.hs`     | Object-centric  | ✅ Working | Prototypes, learning       |
| `.hsplus` | Object + Traits | ✅ Working | Production VR/AR apps      |
| `.holo`   | Scene-centric   | ✅ Working | AI generation, full worlds |

## Format Selection Guide

| Use Case                        | Recommended Format |
| ------------------------------- | ------------------ |
| AI-friendly scene composition   | `.holo`            |
| Libraries, visual components    | `.hs`              |
| VR interactions, reactive state | `.hsplus` ✨       |
| Simple prototypes               | `.hs`              |
| Complete game levels            | `.holo`            |
| Multiplayer networking          | `.hsplus`          |

::: tip Recommended Default
**`.hsplus` is recommended for most use cases** with `@trait`, `@state`, `${interpolation}`, and `.ts` companion file support.
:::

## .hs - Classic HoloScript

The original format. Simple, focused on individual objects.

```hs
// Objects
composition player {
  position: { x: 0, y: 1.6, z: 0 }
  health: 100
  color: "#00ffff"
}

composition enemy {
  position: { x: 5, y: 0, z: 5 }
  health: 50
  color: "#ff0000"
}

// Functions
function attack(target) {
  target.health -= 10
  pulse target with duration 200
}

// Connections
connect inventory to player as "items"

// Execution
execute init
```

### When to Use .hs

- Learning HoloScript
- Quick prototypes
- Simple single-file demos
- Converting from other languages

### Key Features

- `orb` keyword defines objects
- `function` for reusable logic
- `connect` for object relationships
- `execute` to run functions

---

## .hsplus - HoloScript Plus

Extended format with VR traits and reactive state.

```hsplus
// Reactive state
@state {
  score: 0
  wave: 1
  gameActive: false
}

// Objects with VR traits
composition player {
  @collidable
  @physics
  @networked

  position: [0, 1.6, 0]

  state {
    health: 100
    isAlive: true
  }

  on_collision(other) {
    if (other.is_enemy) {
      this.state.health -= 10
    }
  }
}

composition weapon {
  @grabbable(snap_to_hand: true)
  @throwable(velocity_multiplier: 2.0)
  @glowing(color: "#00ffff")

  position: [1, 1, -2]

  on_grab: {
    haptic_feedback("dominant", 0.5)
    play_sound("pickup.wav")
  }

  on_throw: {
    enable_damage()
  }
}

// Networked objects
networked_object syncedPlayer {
  sync_rate: 20hz
  position: synced
  rotation: synced

  state {
    displayName: "Player"
    score: 0
  }
}
```

### When to Use .hsplus

- Production VR/AR applications
- Multiplayer games
- Complex physics interactions
- Any project needing VR traits

### Key Features

- All `.hs` features plus:
- `@trait` decorators for VR behavior
- `@state { }` for reactive global state
- `state { }` block for object-local state
- `networked_object` for multiplayer
- Trait parameters: `@grabbable(param: value)`

---

## .holo - Declarative Compositions

Scene-centric format designed for AI generation and visual tools.

```holo
composition "My Game Level" {
  // Environment setup
  environment {
    skybox: "nebula"
    ambient_light: 0.3
    gravity: -9.81
    fog: { color: "#000033", density: 0.02 }
  }

  // Reusable templates
  template "Enemy" {
    @physics
    @collidable
    @destructible

    state {
      health: 100
      speed: 5
    }

    action attack(target) {
      target.take_damage(10)
    }

    action die() {
      spawn "Explosion" at this.position
      Player.score += 10
      destroy this
    }
  }

  template "Collectible" {
    @grabbable
    @glowing

    on_grab: {
      Player.inventory.add(this.item_type)
      destroy this
    }
  }

  // Scene objects
  object "Player" {
    @collidable
    position: [0, 1.6, 0]

    state {
      score: 0
      inventory: []
    }
  }

  // Grouped objects
  spatial_group "EnemySpawns" {
    position: [0, 0, 50]

    object "Goblin_1" using "Enemy" {
      position: [0, 0, 0]
      color: "#00ff00"
    }

    object "Goblin_2" using "Enemy" {
      position: [5, 0, 0]
    }

    object "Goblin_3" using "Enemy" {
      position: [10, 0, 0]
    }
  }

  // Game logic
  logic {
    on_player_enter("BossRoom") {
      spawn "Boss" at [0, 0, 100]
      lock_doors()
    }

    on_all_enemies_dead {
      unlock_doors()
      spawn_loot()
    }

    every 30s {
      spawn_wave()
    }
  }
}
```

### When to Use .holo

- AI-generated scenes (Claude, GPT, Brittney)
- Visual scene editors
- Complete game levels
- Complex multi-object compositions
- Team collaboration

### Key Features

- `composition "Name" { }` wraps everything
- `environment { }` configures the world
- `template "Name" { }` defines reusable types
- `object "Name" { }` creates instances
- `object "Name" using "Template" { }` uses templates
- `spatial_group "Name" { }` groups objects
- `logic { }` defines game rules

---

## Format Comparison

| Feature        | .hs                   | .hsplus               | .holo                |
| -------------- | --------------------- | --------------------- | -------------------- |
| Objects        | `composition name {}` | `composition name {}` | `object "name" {}`   |
| Functions      | `function name() {}`  | `function name() {}`  | `action name() {}`   |
| VR Traits      | ❌                    | `@grabbable`          | `@grabbable`         |
| Reactive State | ❌                    | `@state {}`           | `state {}`           |
| Templates      | ❌                    | ❌                    | `template "Name" {}` |
| Environment    | ❌                    | ❌                    | `environment {}`     |
| Spatial Groups | ❌                    | ❌                    | `spatial_group {}`   |
| Logic Block    | ❌                    | ❌                    | `logic {}`           |

---

## Converting Between Formats

### .hs → .hsplus

Add VR traits as needed:

```hs
// Before (.hs)
composition ball {
  position: [0, 1, -2]
}
```

```hsplus
// After (.hsplus)
composition ball {
  @grabbable
  @physics
  position: [0, 1, -2]
}
```

### .hsplus → .holo

Wrap in composition, convert orbs to objects:

```hsplus
// Before (.hsplus)
composition ball {
  @grabbable
  position: [0, 1, -2]
}
```

```holo
// After (.holo)
composition "Ball Demo" {
  object "Ball" {
    @grabbable
    position: [0, 1, -2]
  }
}
```

---

## Combined Power

When using all three formats together:

| Capability        | Combined Value                  |
| ----------------- | ------------------------------- |
| VR Traits         | 1,800+ (stackable - 20+ per object) |
| Lifecycle Hooks   | 80+ (combinable)                |
| Builtin Functions | 90+                             |
| Import Chains     | Unlimited                       |
| Nesting Depth     | Unlimited (AST)                 |

### The Power Formula

```
COMBINED = .holo(∞ scene) × .hsplus(2,000+ traits + 80 hooks) × .ts(logic)
```

### Nesting Capabilities

```
.holo:   object { children: [object {...}] }  +  spatial_group { groups: [...] }
.hs:     composition { composition {...} }    +  scale/focus blocks
.hsplus: scene { panel { button {...} } }     +  @for loops for generation
```

---

## AI Generation

When using AI to generate HoloScript:

- **Use `.holo`** for scene generation
- **Use `.hsplus`** for component generation
- The MCP server's `generate_scene` tool outputs `.holo`
- The `generate_object` tool outputs `.hsplus`

```
User: "Create a marketplace with NPCs selling potions"
  ↓
AI generates: marketplace.holo
  ↓
Compiles to: Three.js, Unity, VRChat...
```
