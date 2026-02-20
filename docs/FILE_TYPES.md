# HoloScript File Types Reference

**Understanding `.holo`, `.hs`, `.hsplus`, and `.ts` - A layered architecture**

HoloScript uses a **four-file layered architecture** where each file type serves a distinct purpose. These are **not competing formats** - they form a separation-of-concerns architecture where each layer has specific responsibilities.

> **Key Insight**: File formats are complementary layers, not alternatives. Think MVC: Model (`.hs`), View (`.hsplus`), Controller (`.holo`), Infrastructure (`.ts`).

---

## 📋 Quick Reference

| Extension | Layer | Parser | Primary Use Case | Compilation Entry Point |
|-----------|-------|--------|------------------|------------------------|
| **`.holo`** | Composition Layer | `HoloCompositionParser` | Complete VR/AR worlds, AI-friendly declarative format | ✅ Yes - All platforms |
| **`.hsplus`** | Presentation Layer | `HoloScriptPlusParser` | 3D scenes with traits, visual properties, modules | ✅ Yes - Specialized targets |
| **`.hs`** | Logic Layer | `HoloScriptPlusParser` | Business logic, state machines, shared utilities | ❌ No - Import only |
| **`.ts`** | Infrastructure | TypeScript/Node | Parser implementations, CLI tools, build scripts | N/A - Tooling |

**Important**: Both `.hs` and `.hsplus` use the same `HoloScriptPlusParser` - the difference is semantic, not syntactic.

---

## 🏗️ The Layered Architecture

HoloScript's file system follows a **three-layer separation of concerns** (plus infrastructure):

```
┌─────────────────────────────────────────────────────────┐
│                .holo (Composition Layer)                 │
│   Complete worlds, templates, objects, actions, events  │
│   • 80+ examples (games, VR experiences, robotics)      │
│   • AI-friendly declarative syntax                      │
│   • Full scene definitions with state management        │
└─────────────────────┬───────────────────────────────────┘
                      │ uses
┌─────────────────────▼───────────────────────────────────┐
│              .hsplus (Presentation Layer)                │
│   3D objects, traits, templates, visual properties      │
│   • 21+ examples (pinball, vr-interactions, avatars)    │
│   • Trait system (@grabbable, @physics, @audio)         │
│   • TypeScript-like syntax with modules                 │
└─────────────────────┬───────────────────────────────────┘
                      │ uses
┌─────────────────────▼───────────────────────────────────┐
│                  .hs (Logic Layer)                       │
│   Business logic, state machines, AI behaviors          │
│   • 15+ examples (hello-world, ai-agent, neural-net)    │
│   • Protocol definitions and shared utilities           │
│   • Classic HoloScript syntax                           │
└─────────────────────────────────────────────────────────┘

      All parsed by .ts (TypeScript Infrastructure)
```

---

## 🔄 Dual Parser Architecture

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

## 🎯 `.holo` Files - Scene Compositions

### What Are They?

`.holo` files define **complete, self-contained scenes** using a declarative, composition-based syntax. They are the primary entry point for compilation and are designed to be AI-friendly and human-readable.

### Key Characteristics

- **Declarative format**: Describe *what* you want, not *how* to build it
- **Scene-centric**: Designed for complete environments, not individual components
- **AI-optimized**: LLMs can easily generate and understand `.holo` syntax
- **Compilation targets**: Required for most export targets (Unity, Unreal, WebXR, URDF, DTDL, etc.)

### Syntax Overview

```holo
composition "Scene Name" {
  // Objects with traits
  object "ObjectName" {
    @grabbable
    @physics
    @collidable

    geometry: "cube"
    position: [0, 1, 0]
    scale: 0.5
    color: "#ff6347"
  }

  // Multiple objects
  object "Ground" {
    @collidable
    geometry: "plane"
    position: [0, 0, 0]
    scale: [10, 1, 10]
    color: "#228b22"
  }
}
```

### When to Use `.holo`

✅ **Use `.holo` when:**
- Creating a complete VR/AR scene
- Compiling to game engines (Unity, Unreal, Godot)
- Exporting to WebXR, Quest, VRChat
- Generating robotics simulations (URDF, SDF)
- Building IoT digital twins (DTDL)
- Working with AI agents to generate scenes
- Creating examples and tutorials

❌ **Don't use `.holo` for:**
- Reusable component libraries
- Complex logic modules
- Utility functions
- Template definitions that will be imported

### Compilation Support

**All major platforms require `.holo` files:**
- Game Engines: Unity, Unreal, Godot, PlayCanvas
- WebXR: Three.js, Babylon.js, React Three Fiber
- Mobile AR: ARKit (iOS), ARCore (Android), VisionOS
- VR Platforms: Quest (OpenXR), SteamVR, VRChat
- Robotics: URDF, SDF, MJCF (MuJoCo)
- IoT: DTDL (Azure Digital Twins)
- WASM: WebAssembly compilation

---

## 🧩 `.hs` Files - Templates & Components

### What Are They?

`.hs` files define **reusable templates, components, and logic modules** that can be imported into `.holo` compositions. They use a code-centric syntax focused on modularity.

### Key Characteristics

- **Template-focused**: Define reusable object blueprints
- **Importable**: Can be loaded into `.holo` files
- **Component-based**: Encapsulate logic and properties
- **Not compilation targets**: Must be imported into `.holo` files for compilation

### Syntax Overview

```hs
// Template definition
template Button {
  geometry: "cylinder"
  scale: [0.2, 0.05, 0.2]
  rotation: [90, 0, 0]

  @clickable
  @pointable
  @glowing
}

// Function definition
function calculateDistance(a, b) {
  return sqrt((a.x - b.x)^2 + (a.y - b.y)^2 + (a.z - b.z)^2)
}

// Orb/object with logic
orb Player {
  position: [0, 1.6, 0]
  @teleportable
  @grab_controller

  on_move: {
    // Movement logic
  }
}

// Connections and gates
connect SensorA to MotorB as "control_signal"

gate SafetyCheck {
  condition: temperature < 100
  true_path: continue_operation
  false_path: emergency_shutdown
}

// Streams for data processing
stream TemperatureData from IoTSensor {
  filter: value > 0
  transform: celsius_to_fahrenheit
  aggregate: moving_average(window: 10)
}
```

### When to Use `.hs`

✅ **Use `.hs` when:**
- Creating reusable object templates (Button, Player, Door)
- Defining game logic components
- Building utility functions
- Creating importable libraries
- Organizing large projects into modules
- Sharing components across multiple scenes

❌ **Don't use `.hs` for:**
- Complete scenes you want to compile directly
- Final deliverables
- Standalone demonstrations

### Project Structure Pattern

```
my-vr-project/
├── main.holo              # Entry point (imports from templates/)
├── scenes/
│   ├── lobby.holo
│   └── game-level-1.holo
├── templates/
│   ├── ui/
│   │   ├── Button.hs
│   │   ├── Menu.hs
│   │   └── HUD.hs
│   ├── characters/
│   │   ├── Player.hs
│   │   └── NPC.hs
│   └── environment/
│       ├── Tree.hs
│       └── Building.hs
└── logic/
    ├── inventory.hs
    └── scoring.hs
```

### Import/Export System

```holo
// In main.holo - Import templates from .hs files
composition "Main Scene" {
  import { Button } from "./templates/ui.hs"
  import { Player } from "./templates/characters.hs"

  // Use imported templates
  object "StartButton" {
    ...Button  // Spread template properties
    position: [0, 1.5, -2]
    color: "#00ff00"
  }
}
```

---

## 🚀 `.hsplus` Files - Advanced Features & `.ts` Infrastructure

### What Are `.hsplus` Files?

`.hsplus` files provide **advanced language features** including modules, TypeScript integration, and enhanced syntax for specialized domains like robotics and scientific computing.

### What Are `.ts` Files?

`.ts` files are the **TypeScript infrastructure layer** that powers the entire HoloScript ecosystem:
- Parser implementations (HoloCompositionParser, HoloScriptPlusParser)
- CLI tools and build scripts
- Type definitions and AST structures
- Error handling and validation systems

**Important**: `.ts` files are NOT HoloScript - they are the implementation of HoloScript itself.

### Key Characteristics

- **Module system**: ES6-style imports/exports
- **TypeScript companion**: Can import TypeScript for complex logic
- **Expression interpolation**: `${...}` for dynamic values
- **Backward compatible**: All `.hs` syntax works in `.hsplus`
- **Robotics-focused**: Primary format for URDF/USD/SDF/MJCF export
- **Advanced compilation**: Supports specialized targets (NVIDIA Isaac Sim, MuJoCo)

### Syntax Overview

```hsplus
// Module exports
export module RobotArm {
  // Template with advanced features
  template Joint {
    @joint_revolute
    @position_controlled
    @force_torque_sensor

    // Expression interpolation
    max_velocity: ${config.maxVel * safety_factor}
    torque_limit: ${calculateTorque(mass, length)}
  }

  // TypeScript companion import
  import { calculateKinematics } from "./kinematics.ts"

  // State management
  @state {
    joint_angles: [0, 0, 0, 0, 0, 0]
    gripper_force: 0.0
  }

  // Advanced control flow
  @for (let i = 0; i < 6; i++) {
    object "Joint${i}" {
      ...Joint
      position: calculateKinematics(i)
    }
  }
}

// Scientific computing example
export template MolecularDynamics {
  @protein_visualization
  @pdb_loader(file: "1ubq.pdb")
  @hydrogen_bonds
  @electrostatic_surface
  @interactive_forces
}
```

### When to Use `.hsplus`

✅ **Use `.hsplus` when:**
- Building robotics simulations (ROS2, Gazebo, Isaac Sim)
- Integrating with TypeScript codebases
- Needing advanced module systems
- Using expression interpolation for dynamic values
- Working with scientific computing (molecular dynamics, drug discovery)
- Requiring state machines and complex logic
- Exporting to USD, URDF, SDF, MJCF formats

❌ **Don't use `.hsplus` for:**
- Simple VR/AR scenes (`.holo` is simpler)
- Projects that don't need advanced features
- Maximum portability (stick to `.holo` for broadest support)

### Specialized Compilation Targets

**Robotics & Simulation:**
```bash
# .hsplus → URDF (ROS2, Gazebo)
holoscript compile robot_arm.hsplus --target urdf

# .hsplus → USD (NVIDIA Omniverse, Isaac Sim)
holoscript compile factory.hsplus --target usd

# .hsplus → SDF (Gazebo)
holoscript compile warehouse.hsplus --target sdf

# .hsplus → MJCF (MuJoCo)
holoscript compile humanoid.hsplus --target mjcf
```

**Scientific Computing:**
```bash
# Molecular dynamics with Narupa integration
holoscript compile drug_discovery.hsplus --target narupa
```

---

## 🔄 How They Work Together

### Complete Project Example

```
corporate-training-vr/
├── main.holo                          # Entry point - compile this
├── scenes/
│   ├── safety-training.holo           # Complete scene
│   └── equipment-demo.holo            # Another scene
├── templates/
│   ├── ui/
│   │   ├── Button.hs                  # Reusable UI component
│   │   └── InfoPanel.hs
│   ├── hazards/
│   │   ├── WetFloor.hs                # Hazard templates
│   │   └── ExposedWiring.hs
│   └── equipment/
│       ├── FireExtinguisher.hs
│       └── FirstAidKit.hs
├── logic/
│   ├── scoring.hs                     # Game logic
│   └── tutorial.hs
└── robotics/
    ├── robot-arm.hsplus               # Advanced robotics (can compile independently)
    └── factory-twin.hsplus            # IoT digital twin
```

### Compilation Workflow

```bash
# Compile main scene (imports .hs templates automatically)
holoscript compile main.holo --target unity -o dist/unity/

# Compile VRChat version
holoscript compile main.holo --target vrchat -o dist/vrchat/

# Compile robotics simulation (direct .hsplus compilation)
holoscript compile robotics/robot-arm.hsplus --target urdf -o dist/ros2/

# Parse and validate
holoscript parse main.holo              # ✓ Validates composition
holoscript parse templates/ui/Button.hs # ✓ Validates template
holoscript parse robotics/robot-arm.hsplus # ✓ Validates module
```

---

## 📖 Syntax Comparison

### Object Definition

**.holo** (Declarative, composition-focused)
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

**.hs** (Template/code-focused)
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

**.hsplus** (Module-focused with advanced features)
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

## 🎓 Best Practices

### 1. File Extension Selection

**For VR/AR scenes → Use `.holo`**
- Simple, declarative syntax
- AI-friendly for generation
- Broadest compilation support
- Best for examples and tutorials

**For reusable components → Use `.hs`**
- Modular and importable
- Template-focused
- Good for team collaboration
- Organize large projects

**For advanced features → Use `.hsplus`**
- Robotics and scientific computing
- TypeScript integration needed
- Complex state management
- Module system required

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
│   └── *.holo                 # Scene files
├── templates/
│   └── *.hs                   # Shared components
└── assets/

# Large projects (20+ scenes)
project/
├── main.holo
├── scenes/
│   └── *.holo
├── templates/
│   ├── ui/*.hs
│   ├── characters/*.hs
│   └── environment/*.hs
├── logic/
│   └── *.hs
├── advanced/
│   └── *.hsplus               # Robotics, specialized
└── assets/
```

### 3. Import Patterns

```holo
// Good - Clear imports at the top
composition "Main" {
  import { Button, Menu } from "./templates/ui.hs"
  import { Player } from "./templates/characters.hs"

  // Use templates
  object "UI" {
    ...Menu
  }
}

// Avoid - Inline file mixing
// Don't put template definitions directly in .holo files
// Use .hs files and import them instead
```

---

## 🛠️ CLI Commands by File Type

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
holoscript parse Button.hs                     # Validate template
# Note: .hs files cannot be compiled directly
# They must be imported into a .holo file
```

### `.hsplus` Files
```bash
holoscript parse robot.hsplus                  # Validate module
holoscript compile robot.hsplus --target urdf  # Robotics export
holoscript compile robot.hsplus --target usd   # USD export
```

---

## ⚡ Performance Considerations

### Parser Performance

| File Type | Parser | Relative Speed | Memory Usage |
|-----------|--------|----------------|--------------|
| `.holo` | `HoloCompositionParser` | Fastest | Lowest |
| `.hs` | `HoloScriptCodeParser` | Fast | Medium |
| `.hsplus` | `HoloScriptPlusParser` | Medium | Higher (module resolution) |

**Recommendation**: Use `.holo` for maximum parsing speed and lowest memory footprint in production.

---

## 🔍 Common Mistakes

### ❌ Mistake 1: Trying to compile `.hs` files directly
```bash
# WRONG - .hs files cannot be compiled directly
holoscript compile Button.hs --target unity  # ❌ Error

# CORRECT - Import into .holo first
holoscript compile main.holo --target unity  # ✅ main.holo imports Button.hs
```

### ❌ Mistake 2: Using wrong comment syntax
```holo
# WRONG - This is Python/Ruby syntax
# composition "Scene" {}  # ❌ Syntax error

// CORRECT - HoloScript uses // for comments
// composition "Scene" {}  // ✅ Valid
composition "Scene" {}
```

### ❌ Mistake 3: Mixing syntax styles in `.holo`
```holo
// WRONG - Don't mix .hs syntax in .holo files
composition "Scene" {
  orb#myCube {  // ❌ This is .hs syntax
    position: [0, 1, 0]
  }
}

// CORRECT - Use .holo object syntax
composition "Scene" {
  object "MyCube" {  // ✅ Correct .holo syntax
    geometry: "cube"
    position: [0, 1, 0]
  }
}
```

### ❌ Mistake 4: Using `.hsplus` when `.holo` would suffice
```hsplus
// OVERCOMPLICATED - Unnecessary module system
export module SimpleScene {
  composition "My Scene" {
    object "Cube" {
      geometry: "cube"
    }
  }
}
```

```holo
// BETTER - Simple .holo file
composition "My Scene" {
  object "Cube" {
    geometry: "cube"
  }
}
```

---

## 📚 Additional Resources

- **[Quickstart Guide](./getting-started/quickstart.md)** - Get started with `.holo` in 5 minutes
- **[Examples Gallery](./EXAMPLES_GALLERY.md)** - Real-world `.holo` examples
- **[Template Guide](./academy/level-1-fundamentals/08-templates.md)** - Working with `.hs` templates
- **[Project Structure](./academy/level-1-fundamentals/09-project-structure.md)** - Organizing large projects
- **[Robotics Guide](./guides/robotics.md)** - Using `.hsplus` for URDF/USD export
- **[API Reference](./api/)** - Parser APIs for each file type

---

## 🎯 Quick Decision Tree

```
Need to create →
  │
  ├─ Complete scene for game engine/WebXR/VR? → .holo
  │
  ├─ Reusable component library? → .hs
  │
  ├─ Robotics simulation (URDF/USD)? → .hsplus
  │
  ├─ IoT digital twin? → .holo (or .hsplus for advanced)
  │
  ├─ TypeScript integration needed? → .hsplus
  │
  └─ Maximum portability & simplicity? → .holo
```

---

**Last Updated**: 2026-02-20
**HoloScript Version**: v3.4.0
**CLI Version**: v2.5.0
