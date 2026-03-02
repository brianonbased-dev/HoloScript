# HoloScript File Types Reference

**Understanding `.holo`, `.hs`, `.hsplus`, and `.ts` - Three specialized languages**

HoloScript provides **three specialized file formats**, each designed for a distinct domain of spatial computing. These are **complementary tools, not layers** — each format is a complete language for its domain.

> **Key Insight**: Think of HoloScript as three languages in one platform:
> - **`.hs`** = Core Language — templates, agents, logic, IoT streams, and spatial awareness
> - **`.hsplus`** = TypeScript for XR — build complete spatial applications with modules and types
> - **`.holo`** = Scene Graph — compose immersive worlds with environments and networking
> - **`.ts`** = Infrastructure (parser implementations, tooling)

---

## Quick Reference

| Extension | Domain | Parser | Primary Use Case | Compilation Entry Point |
|-----------|--------|--------|------------------|------------------------|
| **`.holo`** | Scene Graph | `HoloCompositionParser` | Immersive worlds, environments, NPC dialogs, quests, networking | Yes - All 18+ platforms |
| **`.hsplus`** | TypeScript for XR | `HoloScriptPlusParser` | Full applications: modules, types, physics, state machines, async | Yes - All platforms |
| **`.hs`** | Core Language | `HoloScriptPlusParser` | Templates, agents, logic, IoT streams, spatial awareness, utilities | Yes - Importable or standalone |
| **`.ts`** | Infrastructure | TypeScript/Node | Parser implementations, CLI tools, build scripts | N/A - Tooling |

**Important**: Both `.hs` and `.hsplus` use the same `HoloScriptPlusParser` - the difference is semantic, not syntactic.

---

## Three Formats, One Platform

HoloScript's format system provides **three specialized languages** that can work independently or together:

```
┌──────────────────────────────────────────────────────────────┐
│                    .holo (Scene Graph)                        │
│   Declarative world compositions and immersive environments  │
│   NPC dialog trees, quest systems, multiplayer networking    │
│   Environment settings, spatial groups, portals, audio zones │
│   Compiles to 18+ targets (Unity, Unreal, WebXR, VRChat)    │
│   80+ examples: escape rooms, medical sims, art galleries    │
└───────────────┬──────────────────────────┬───────────────────┘
    imports     │                          │    imports
┌───────────────▼──────────────┐  ┌────────▼──────────────────────┐
│    .hs (Core Language)       │  │   .hsplus (TypeScript for XR)  │
│  Templates & components      │  │  Full programming language     │
│  Agent SDK & spatial queries │  │  Modules with import/export    │
│  IoT streams, gates, logic   │  │  Physics, joints, constraints  │
│  Zone systems, patrol AI     │  │  State machines, async/await   │
│  Reusable utilities          │  │  732-line pinball game         │
└──────────────────────────────┘  └────────────────────────────────┘

              All parsed by .ts (TypeScript infrastructure)
```

---

## Dual Parser Architecture

HoloScript provides **two parser implementations** that produce identical output:

### TypeScript Parser (Development & Tooling)
- **Location**: `packages/core/src/parser/`
- **Parsers**: `HoloCompositionParser.ts`, `HoloScriptPlusParser.ts`
- **Best for**: Development, debugging, IDE integration, tooling
- **Output**: JSON AST (universal bridge format)

### Rust/WASM Parser (Production Performance)
- **Location**: `packages/compiler-wasm/`
- **Speed**: **10x faster** than TypeScript
- **Output**: Identical JSON AST via serde
- **Best for**: Production builds, CI/CD, large-scale compilation

**Universal Bridge Format**: Both parsers output JSON AST, enabling any language to consume HoloScript (Python, Go, Java, etc.) without reimplementing the parser.

---

## `.holo` Files - Scene Graph

### What Are They?

`.holo` files define **immersive world compositions** using a declarative scene graph syntax. They handle world layout, environments, NPC dialogs, quest systems, multiplayer networking, portals, and audio zones. The primary entry point for compilation to 18+ targets.

### Key Characteristics

- **Declarative scene graph**: Describe *what* you want, not *how* to build it
- **World-centric**: Complete environments with spatial groups, NPC dialogs, quest systems
- **Multiplayer primitives**: Networking, player sync, voice chat built-in
- **Portals and zones**: Audio zones, spatial triggers, portal systems for world linking
- **AI-optimized**: LLMs can easily generate and understand `.holo` syntax
- **Compilation entry point**: Compiles to 18+ targets; imports `.hs` agents and `.hsplus` components

### Syntax Overview

```holo
composition "VR Escape Room" {
  environment {
    skybox: "none"
    ambient_light: 0.1
    fog: { enabled: true, color: "#111122", density: 0.05 }
  }

  // Game state management
  state GameState {
    started: false
    timeRemaining: 3600
    puzzlesSolved: 0
    totalPuzzles: 5
  }

  // Spatial groups with puzzle logic
  spatial_group "Puzzle1_CombinationLock" {
    object "SafeBox" {
      geometry: "model/safe.glb"
      position: [-4, 1, -4]

      state {
        locked: true
        combination: [7, 2, 5]
        entered: [0, 0, 0]
      }
    }

    object "Dial1" {
      @clickable
      @rotatable
      geometry: "cylinder"
      position: [-4.2, 1.1, -3.7]

      onClick: {
        this.state.value = (this.state.value + 1) % 10
        SafeBox.state.entered[0] = this.state.value
        checkCombination()
      }
    }
  }

  // Pressure plate puzzles with triggers
  spatial_group "Puzzle2_PressurePlates" {
    template "PressurePlate" {
      @trigger
      @collidable
      geometry: "cube"
      scale: [0.8, 0.05, 0.8]

      onTriggerEnter: {
        this.state.pressed = true
        this.color = "#00ff00"
        checkPressurePlateOrder(this)
      }
    }

    object "Plate1" using "PressurePlate" { position: [3, 0.12, -2] }
    object "Plate2" using "PressurePlate" { position: [3, 0.12, 0] }
  }
}
```

*Based on the [escape-room.holo](../examples/real-world/escape-room.holo) example.*

### When to Use `.holo`

Use `.holo` when:
- Creating complete VR/AR scenes and environments
- Composing worlds with NPC dialogs, quests, and spatial groups
- Compiling to game engines (Unity, Unreal, Godot)
- Building multiplayer experiences with networking primitives
- Exporting to WebXR, Quest, VRChat
- Generating robotics simulations (URDF, SDF)
- Building IoT digital twins (DTDL)
- Working with AI agents to generate scenes

Don't use `.holo` for:
- Reusable agent behaviors (use `.hs`)
- Complex application logic with modules and types (use `.hsplus`)
- Utility functions and libraries (use `.hs` or `.hsplus`)

### Compilation Support

**All major platforms support `.holo` files:**
- Game Engines: Unity, Unreal, Godot, PlayCanvas
- WebXR: Three.js, Babylon.js, React Three Fiber
- Mobile AR: ARKit (iOS), ARCore (Android), VisionOS
- VR Platforms: Quest (OpenXR), SteamVR, VRChat
- Robotics: URDF, SDF, MJCF (MuJoCo)
- IoT: DTDL (Azure Digital Twins)
- WASM: WebAssembly compilation

---

## `.hs` Files - Core Language

### What Are They?

`.hs` files are the **core HoloScript language** — versatile files used for templates, components, agent behaviors, IoT streams, logic gates, utility functions, and reusable libraries. They serve as the building blocks that `.holo` compositions import and assemble.

`.hs` covers a wide range of use cases:
- **Templates & components**: Reusable object blueprints (buttons, doors, NPCs)
- **Agent SDK**: Multi-agent orchestration with spatial awareness, zones, patrol AI, and consensus (see the 381-line [v3.1-spatial-awareness.hs](../examples/v3.1-spatial-awareness.hs))
- **IoT & data**: Streams, gates, connections for sensor data and industrial automation
- **Logic & utilities**: Functions, state machines, scoring systems, shared libraries

### Key Characteristics

- **Templates**: Define reusable object blueprints with traits and properties
- **Agent SDK**: Multi-agent choreography with spatial awareness, zones, patrol routes
- **Spatial queries**: `rayCast()`, `queryBox()`, `queryFrustum()`, `findPath()`, `getZoneAt()`
- **IoT primitives**: Streams, gates, connections for data pipelines
- **Functions & logic**: Utility functions, state management, game logic
- **Importable or standalone**: Use in `.holo` compositions or run standalone

### Syntax Overview

```hs
// ── Templates & Components ──────────────────────────────
template Button {
  geometry: "cylinder"
  scale: [0.2, 0.05, 0.2]
  rotation: [90, 0, 0]
  @clickable
  @pointable
  @glowing
}

// Functions and utilities
function calculateDistance(a, b) {
  return sqrt((a.x - b.x)^2 + (a.y - b.y)^2 + (a.z - b.z)^2)
}

// IoT streams and data processing
stream TemperatureData from IoTSensor {
  filter: value > 0
  transform: celsius_to_fahrenheit
  aggregate: moving_average(window: 10)
}

// Logic gates for automation
gate SafetyCheck {
  condition: temperature < 100
  true_path: continue_operation
  false_path: emergency_shutdown
}

// Connections between components
connect SensorA to MotorB as "control_signal"

// ── Agent SDK ───────────────────────────────────────────
// Zone definitions with behaviors
zone "TreasureRoom" {
  shape: "sphere"
  center: [-50, 5, -50]
  radius: 15
  type: "treasure"
  properties: {
    access_level: "key_required"
    guards_enabled: true
    loot_table: "legendary"
  }
}

// Player agent with spatial awareness layers
template "PlayerAgent" {
  @agent {
    type: "player"
    capabilities: ["movement", "combat", "interaction"]
  }

  @spatialAwareness {
    detection_radius: 20
    track_entities: true
    track_zones: true
    layers: [
      { name: "immediate", radius: 3 },
      { name: "nearby", radius: 10 },
      { name: "distant", radius: 20 }
    ]
  }

  state {
    position: [0, 1, 0]
    health: 100
    current_zone: null
    is_in_combat: false
  }

  on zoneEnter(zone) {
    switch (zone.type) {
      case "safe":
        startHealing(zone.properties.healing_rate)
        break
      case "combat":
        notify("Entering combat zone - PvP enabled!")
        break
      case "hazard":
        startEnvironmentalDamage(zone.properties.damage_per_second)
        break
      case "treasure":
        if (!hasKey("treasure_key")) {
          eject([0, 1, 0])
          notify("You need a key to enter!")
        }
        break
    }
  }

  on entityNearby(entity, layer) {
    if (layer == "immediate" && entity.type == "enemy") {
      enterCombat(entity)
    }
  }
}

// Guard agent with patrol and alert system
template "GuardAgent" {
  @agent {
    type: "guard"
    capabilities: ["patrol", "combat", "alert"]
  }

  @spatialAwareness {
    detection_radius: 15
    track_agents: true
    alert_on: ["player", "intruder"]
  }

  @patrol {
    zone: "TreasureRoom"
    waypoints: [[-45,1,-55], [-55,1,-55], [-55,1,-45], [-45,1,-45]]
    speed: 2
    pause_at_waypoints: 3000
  }

  state {
    mode: "patrol"
    alert_level: 0
    target: null
  }

  on entityNearby(entity, layer) {
    if (entity.type == "player" && !entity.hasAccess) {
      this.state.mode = "alert"
      broadcast("guard_channel", {
        type: "intruder_detected",
        location: entity.position,
        intruder: entity.id
      })
      moveTo(entity.position)
      engageTarget(entity)
    }
  }

  on channel.message("guard_channel", msg) {
    if (msg.type == "intruder_detected") {
      this.state.alert_level = 1
      moveToSupport(msg.location)
    }
  }
}
```

*Based on the [v3.1-spatial-awareness.hs](../examples/v3.1-spatial-awareness.hs) example.*

### When to Use `.hs`

Use `.hs` when:
- Creating reusable templates and component blueprints (Button, Player, Door)
- Building utility functions and importable libraries
- IoT data pipelines with streams, gates, and connections
- Multi-agent systems (guards, NPCs, autonomous entities)
- Spatial awareness and proximity detection
- Zone-based behaviors (safe zones, combat arenas, treasure rooms)
- Patrol routes, navigation, and agent communication
- Organizing large projects into shared modules

Don't use `.hs` for:
- Complete scenes with environments and spatial groups (use `.holo`)
- Applications needing modules, typed functions, or async/await (use `.hsplus`)

### Project Structure Pattern

```
my-vr-project/
├── main.holo              # Entry point (imports agents and templates)
├── scenes/
│   ├── lobby.holo
│   └── game-level-1.holo
├── agents/
│   ├── guard.hs           # Guard AI with patrol and alerts
│   ├── npc.hs             # NPC behaviors and interactions
│   └── player.hs          # Player spatial awareness
├── templates/
│   ├── ui/
│   │   ├── Button.hs
│   │   └── HUD.hs
│   └── environment/
│       ├── Tree.hs
│       └── Building.hs
└── logic/
    ├── inventory.hs
    └── scoring.hs
```

### Import/Export System

```holo
// In main.holo - Import agents and templates from .hs files
composition "Main Scene" {
  import { GuardAgent } from "./agents/guard.hs"
  import { Button } from "./templates/ui/Button.hs"

  // Use imported templates
  object "StartButton" {
    ...Button
    position: [0, 1.5, -2]
    color: "#00ff00"
  }
}
```

---

## `.hsplus` Files - TypeScript for XR

### What Are `.hsplus` Files?

`.hsplus` is a **full programming language** — think TypeScript designed specifically for spatial computing. It provides modules, types, physics primitives, state machines, joints, event handlers, and async/await. Not an "advanced" version of HoloScript — it's a complete language for building complex interactive experiences.

**Not just modules** — `.hsplus` files contain complete games (732-line [pinball.hsplus](../examples/pinball.hsplus)), physics simulations, and interactive applications with professional-grade features.

### What Are `.ts` Files?

`.ts` files are the **TypeScript infrastructure layer** that powers the entire HoloScript ecosystem:
- Parser implementations (HoloCompositionParser, HoloScriptPlusParser)
- CLI tools and build scripts
- Type definitions and AST structures
- Error handling and validation systems

**Important**: `.ts` files are NOT HoloScript - they are the implementation of HoloScript itself.

### Key Characteristics

- **Full programming language**: Not a DSL — complete language with types, modules, functions
- **TypeScript-like syntax**: `export let score: number`, `import { utils } from "./lib"`
- **Physics primitives**: Joints, constraints, collision handling, impulses
- **State machines**: Reactive state with `@on_event`, `@on_collision`, `@on_update`
- **Async/await**: `await moveTo(target)`, Promise-based APIs
- **Arrow functions**: `(active) => { this.rotation.y = active ? 45 : 15 }`
- **Interfaces and types**: `export interface BallState { position: Vector3; velocity: Vector3 }`
- **Backward compatible**: All `.hs` syntax works in `.hsplus`
- **Robotics export**: URDF, USD, SDF, MJCF for ROS2, Gazebo, Isaac Sim

### Syntax Overview

```hsplus
// Module system with TypeScript types
module GameState {
  export let score: number = 0;
  export let ballsRemaining: number = 3;
  export let multiplier: number = 1;

  export function addScore(points: number) {
    score += points * multiplier;
    emit("score_changed", score);
  }

  export function loseBall() {
    ballsRemaining--;
    ballLaunched = false;
    emit("ball_lost", ballsRemaining);
    if (ballsRemaining <= 0) {
      emit("game_over", score);
    }
  }
}

// Physics module with interfaces and constants
module PinballPhysics {
  const GRAVITY = 9.8;
  const TABLE_TILT = 6.5;            // degrees
  const BALL_MASS = 0.08;            // kg (standard steel ball)
  const FLIPPER_SPEED = 1700;        // degrees/sec

  export interface BallState {
    position: Vector3;
    velocity: Vector3;
  }

  export function applyTableGravity(ball: BallState, dt: number) {
    const tiltRad = TABLE_TILT * Math.PI / 180;
    ball.velocity.z += GRAVITY * Math.sin(tiltRad) * dt;
  }

  export function checkBumperCollision(
    ball: BallState, bumperPos: Vector3, radius: number
  ): boolean {
    const dx = ball.position.x - bumperPos.x;
    const dz = ball.position.z - bumperPos.z;
    return Math.sqrt(dx * dx + dz * dz) < (BALL_RADIUS + radius);
  }
}

// Physics objects with joints and event handlers
template "Flipper" {
  @kinematic
  @collidable
  geometry: "box"

  joint: {
    type: "hinge"
    anchor: [-0.75, 0.25, 2.2]
    axis: [0, 1, 0]
    limits: [-30, 30]
    motor_speed: 1700
  }

  @on_event("flipper_left"): (active) => {
    this.rotation.y = active ? 45 : 15;
    play_sound("flipper_up");
  }
}

// Robotics module with advanced features
export module RobotArm {
  template Joint {
    @joint_revolute
    @position_controlled
    @force_torque_sensor

    max_velocity: ${config.maxVel * safety_factor}
    torque_limit: ${calculateTorque(mass, length)}
  }

  import { calculateKinematics } from "./kinematics.ts"

  @for (let i = 0; i < 6; i++) {
    object "Joint${i}" {
      ...Joint
      position: calculateKinematics(i)
    }
  }
}
```

*Based on the [pinball.hsplus](../examples/pinball.hsplus) example (732 lines).*

### When to Use `.hsplus`

Use `.hsplus` when:
- Building complete games with physics (pinball, shooters, puzzle games)
- Needing module systems and code organization (`export`/`import`)
- Writing complex state machines with reactive updates
- Implementing physics simulations (joints, constraints, collision handlers)
- Working with typed variables and functions (TypeScript-like safety)
- Using async/await for pathfinding, animations, or network calls
- Building robotics simulations (URDF, USD, SDF, MJCF export)
- Scientific computing (molecular dynamics, drug discovery)

Don't use `.hsplus` for:
- Simple VR/AR scenes without complex logic (`.holo` is simpler)
- Pure agent behaviors without application logic (`.hs` is more focused)

### Specialized Compilation Targets

**Robotics & Simulation:**
```bash
# .hsplus -> URDF (ROS2, Gazebo)
holoscript compile robot_arm.hsplus --target urdf

# .hsplus -> USD (NVIDIA Omniverse, Isaac Sim)
holoscript compile factory.hsplus --target usd

# .hsplus -> SDF (Gazebo)
holoscript compile warehouse.hsplus --target sdf

# .hsplus -> MJCF (MuJoCo)
holoscript compile humanoid.hsplus --target mjcf
```

**Scientific Computing:**
```bash
# Molecular dynamics with Narupa integration
holoscript compile drug_discovery.hsplus --target narupa
```

---

## How They Work Together

### Complete Project Example

```
vr-adventure-game/
├── main.holo                          # Scene graph - compile this
├── scenes/
│   ├── dungeon.holo                   # World composition
│   └── boss-arena.holo                # Another world
├── agents/
│   ├── guard.hs                       # Agent SDK - patrol AI
│   ├── boss.hs                        # Agent SDK - boss behavior
│   └── companion.hs                   # Agent SDK - follower AI
├── components/
│   ├── combat.hsplus                  # TypeScript for XR - damage, physics
│   ├── inventory.hsplus               # TypeScript for XR - item management
│   └── ui.hsplus                      # TypeScript for XR - HUD, menus
├── templates/
│   ├── weapons/
│   │   ├── Sword.hs                   # Reusable weapon template
│   │   └── Shield.hs
│   └── environment/
│       ├── Torch.hs
│       └── Door.hs
└── robotics/
    └── robot-arm.hsplus               # Robotics (can compile independently)
```

### Compilation Workflow

```bash
# Compile main scene (imports .hs agents and .hsplus components automatically)
holoscript compile main.holo --target unity -o dist/unity/

# Compile VRChat version
holoscript compile main.holo --target vrchat -o dist/vrchat/

# Compile robotics simulation (direct .hsplus compilation)
holoscript compile robotics/robot-arm.hsplus --target urdf -o dist/ros2/

# Parse and validate any format
holoscript parse main.holo                  # Validates scene graph
holoscript parse agents/guard.hs            # Validates agent
holoscript parse components/combat.hsplus   # Validates module
```

---

## Syntax Comparison

### Object Definition

**.holo** (Declarative scene graph)
```holo
composition "My Scene" {
  object "Cube" {
    @grabbable
    @physics
    geometry: "cube"
    position: [0, 1, 0]
    scale: 0.5
  }
}
```

**.hs** (Agent/template-focused)
```hs
template Cube {
  geometry: "cube"
  scale: 0.5
  @grabbable
  @physics
}

orb#myCube {
  ...Cube
  position: [0, 1, 0]
}
```

**.hsplus** (Module-focused with types)
```hsplus
export module Primitives {
  template Cube {
    geometry: "cube"
    scale: 0.5
    @grabbable
    @physics
  }
}

import { Cube } from "./primitives.hsplus"

composition "Scene" {
  object "MyCube" {
    ...Cube
    position: ${calculatePosition()}
  }
}
```

---

## Best Practices

### 1. File Extension Selection

**For immersive worlds and environments -> Use `.holo`**
- Declarative scene graph syntax
- NPC dialogs, quests, spatial groups
- AI-friendly for generation
- Broadest compilation support (18+ targets)

**For templates, agents, and logic -> Use `.hs`**
- Reusable templates and components
- Agent orchestration with spatial awareness
- IoT streams, gates, and data pipelines
- Utility functions and shared libraries

**For complex applications with logic -> Use `.hsplus`**
- Full programming language with types
- Physics, joints, state machines
- Module system with import/export
- Games, robotics, scientific computing

### 2. Project Organization

```
# Small projects (< 5 scenes)
project/
├── main.holo                  # Everything in one file
└── assets/

# Medium projects (5-20 scenes)
project/
├── main.holo                  # Entry point
├── scenes/
│   └── *.holo                 # World compositions
├── agents/
│   └── *.hs                   # Agent behaviors
├── templates/
│   └── *.hs                   # Shared components
└── assets/

# Large projects (20+ scenes)
project/
├── main.holo
├── scenes/
│   └── *.holo
├── agents/
│   └── *.hs                   # Agent SDK behaviors
├── components/
│   └── *.hsplus               # Application logic
├── templates/
│   ├── ui/*.hs
│   ├── characters/*.hs
│   └── environment/*.hs
├── logic/
│   └── *.hs
└── assets/
```

### 3. Import Patterns

```holo
// Good - Clear imports at the top
composition "Main" {
  import { GuardAgent } from "./agents/guard.hs"
  import { Button, Menu } from "./templates/ui.hs"
  import { CombatSystem } from "./components/combat.hsplus"

  // Use imported templates
  object "UI" {
    ...Menu
  }
}

// Avoid - Inline file mixing
// Don't put template definitions directly in .holo files
// Use .hs files for templates and .hsplus for complex logic
```

---

## CLI Commands by File Type

### `.holo` Files
```bash
holoscript parse scene.holo                    # Validate syntax
holoscript compile scene.holo --target unity   # Compile to Unity
holoscript build scene.holo -w                 # Watch mode
holoscript preview scene.holo                  # Live preview
holoscript screenshot scene.holo               # Generate preview image
```

### `.hs` Files
```bash
holoscript parse guard.hs                      # Validate agent/template
holoscript parse Button.hs                     # Validate component
# .hs files are typically imported into .holo for compilation
```

### `.hsplus` Files
```bash
holoscript parse game.hsplus                   # Validate module
holoscript compile game.hsplus --target unity   # Compile application
holoscript compile robot.hsplus --target urdf   # Robotics export
holoscript compile robot.hsplus --target usd    # USD export
```

---

## Performance Considerations

### Parser Performance

| File Type | Parser | Relative Speed | Memory Usage |
|-----------|--------|----------------|--------------|
| `.holo` | `HoloCompositionParser` | Fastest | Lowest |
| `.hs` | `HoloScriptPlusParser` | Fast | Medium |
| `.hsplus` | `HoloScriptPlusParser` | Medium | Higher (module resolution) |

**Recommendation**: Use `.holo` for maximum parsing speed and lowest memory footprint in production.

---

## Common Mistakes

### Mistake 1: Using wrong comment syntax
```holo
# WRONG - This is Python/Ruby syntax
# composition "Scene" {}  # Syntax error

// CORRECT - HoloScript uses // for comments
composition "Scene" {}
```

### Mistake 2: Mixing syntax styles in `.holo`
```holo
// WRONG - Don't mix .hs syntax in .holo files
composition "Scene" {
  orb#myCube {  // This is .hs syntax
    position: [0, 1, 0]
  }
}

// CORRECT - Use .holo object syntax
composition "Scene" {
  object "MyCube" {
    geometry: "cube"
    position: [0, 1, 0]
  }
}
```

### Mistake 3: Using `.hsplus` when `.holo` would suffice
```hsplus
// OVERCOMPLICATED - Unnecessary module system
export module SimpleScene {
  composition "My Scene" {
    object "Cube" { geometry: "cube" }
  }
}
```

```holo
// BETTER - Simple .holo file
composition "My Scene" {
  object "Cube" { geometry: "cube" }
}
```

### Mistake 4: Putting agent logic in `.holo` instead of `.hs`
```holo
// WRONG - Complex agent logic belongs in .hs files
composition "Scene" {
  // 200 lines of agent behavior...
}
```

```hs
// BETTER - Agent SDK in .hs, imported into .holo
template "GuardAgent" {
  @agent { type: "guard" }
  @spatialAwareness { detection_radius: 15 }
  // Agent logic here
}
```

---

## Additional Resources

- **[Quickstart Guide](./getting-started/quickstart.md)** - Get started with `.holo` in 5 minutes
- **[Examples Gallery](./EXAMPLES_GALLERY.md)** - Real-world examples across all formats
- **[Template Guide](./academy/level-1-fundamentals/08-templates.md)** - Working with `.hs` templates
- **[Project Structure](./academy/level-1-fundamentals/09-project-structure.md)** - Organizing large projects
- **[Robotics Guide](./guides/robotics.md)** - Using `.hsplus` for URDF/USD export
- **[API Reference](./api/)** - Parser APIs for each file type

---

## Quick Decision Tree

```
Need to create ->
  |
  +-- Immersive world, environment, or scene? -> .holo
  |
  +-- Reusable template or component? -> .hs
  |
  +-- Agent AI, spatial awareness, or patrol? -> .hs
  |
  +-- IoT streams, gates, or data pipelines? -> .hs
  |
  +-- Game with physics, modules, or types? -> .hsplus
  |
  +-- Robotics simulation (URDF/USD)? -> .hsplus
  |
  +-- IoT digital twin? -> .holo (or .hsplus for advanced)
  |
  +-- Maximum portability & simplicity? -> .holo
```

---

**Last Updated**: 2026-03-01
**HoloScript Version**: v3.43.0
**CLI Version**: v2.5.0
