# HoloScript v5.0.0

## The Commons-Based Meta-Framework for Spatial Computing

> **Three languages. One platform. 25+ compile targets. 8 industry domains.** Write spatial experiences with a complete stack: scene graph + core language + TypeScript for XR.

HoloScript is a complete spatial computing stack: **three specialized file formats + runtime execution + multi-target compiler**. We built [Hololand](https://github.com/brianonbased-dev/Hololand) (our VR social platform) to prove it works—now you can build your own.

**Even playing field**: Hololand uses the same public APIs as everyone else. No privileged access, no lock-in.

Perfect for VR/AR platforms, corporate training, robotics, games, digital twins, and more.

![version-badge](https://img.shields.io/badge/version-v5.0.0-green?style=for-the-badge)
![Quickstart Badge](https://img.shields.io/badge/Quickstart-5_min-blue?style=for-the-badge)
![Traits Badge](https://img.shields.io/badge/traits-1800+-orange?style=for-the-badge)
[![codecov](https://codecov.io/gh/brianonbased-dev/HoloScript/branch/main/graph/badge.svg?style=for-the-badge)](https://codecov.io/gh/brianonbased-dev/HoloScript)
[![Known Vulnerabilities](https://snyk.io/test/github/brianonbased-dev/HoloScript/badge.svg?style=for-the-badge)](https://snyk.io/test/github/brianonbased-dev/HoloScript)
[![Security Rating](https://img.shields.io/badge/Security-A+-brightgreen?style=for-the-badge)](https://github.com/brianonbased-dev/HoloScript/security)

---

## 🎯 See It In Action

Jump straight to real-world examples:

| Use Case | Description | View Example |
|----------|-------------|--------------|
| 🏢 **Corporate Training** | VR safety training with interactive hazard identification | [VR Training Simulation →](./examples/general/vr-training-simulation/) |
| 🛋️ **E-Commerce AR** | "Try before you buy" furniture preview on mobile | [AR Furniture Preview →](./examples/general/ar-furniture-preview/) |
| 🎨 **Museums & Culture** | Virtual art gallery with audio guides | [Virtual Art Gallery →](./examples/general/virtual-art-gallery/) |
| 🎮 **Gaming** | Fast-paced VR shooter with physics and AI | [VR Game Demo →](./examples/general/vr-game-demo/) |
| 🤖 **Robotics** | Industrial robot arm with ROS2/Gazebo export | [Robotics Simulation →](./examples/specialized/robotics/) |
| 🏭 **IoT/Industry** | Smart factory digital twin with Azure integration | [IoT Digital Twin →](./examples/specialized/iot/) |
| 👥 **Multiplayer** | Collaborative VR meeting space with voice chat | [Multiplayer VR →](./examples/specialized/multiplayer/) |
| 📱 **Quest/Mobile** | Platform-optimized VR with Quest 2/3 features | [Unity Quest →](./examples/specialized/unity-quest/) |
| 🌐 **Social VR** | VRChat world with mirrors, video, and Udon# | [VRChat World →](./examples/specialized/vrchat/) |

**[View all 9 examples →](./examples/)** | **[Browse examples catalog →](./examples/INDEX.md)**

---

## 📦 Installation

Choose your preferred method:

### macOS (Homebrew)

```bash
brew tap brianonbased-dev/holoscript
brew install holoscript
```

### Windows (Chocolatey)

```bash
choco install holoscript
```

### npm (Cross-platform)

```bash
npm install -g @holoscript/cli
```

### Cargo (Rust)

```bash
cargo install holoscript-wasm
```

### Unity Package Manager

Add to your Unity project (2022.3+ or Unity 6):

```text
https://github.com/brianonbased-dev/HoloScript.git?path=/packages/unity-sdk
```

**[📘 Full Deployment Guide →](./DEPLOYMENT.md)**

---

## 🚀 Quick Start (30 Seconds)

1. **Install CLI** (see above)
2. **Create `hello.holo`:**

```holo
composition "Hello Holo" {
  object "Cube" {
    @grabbable
    @physics
    geometry: "box"
    position: [0, 1, 0]
  }
}
```

3. **Preview:** `holoscript preview hello.holo`
4. **Explore the other formats:**
   - Add agent behaviors with `.hs` files (spatial awareness, patrol routes, IoT streams)
   - Build full applications with `.hsplus` files (modules, types, physics, state machines)

**[View Full 5-Minute Tutorial →](./docs/getting-started/quickstart.md)**

---

## 🔧 Three Formats, One Stack

HoloScript provides **three specialized file formats** that work independently or together:

### `.holo` — Scene Graph

Declarative world compositions with environments, NPC dialogs, quests, and multiplayer networking.

```holo
composition "VR Escape Room" {
  environment {
    ambient_light: 0.1
    fog: { enabled: true, color: "#111122", density: 0.05 }
  }

  spatial_group "Puzzle1_CombinationLock" {
    object "SafeBox" {
      geometry: "model/safe.glb"
      state { locked: true, combination: [7, 2, 5] }
    }

    object "Dial1" {
      @clickable
      @rotatable
      onClick: {
        this.state.value = (this.state.value + 1) % 10
        checkCombination()
      }
    }
  }
}
```

### `.hs` — Core Language

Templates, agent behaviors with spatial awareness, IoT data streams, logic gates, and reusable components.

```hs
// Guard agent with spatial awareness and patrol
template "GuardAgent" {
  @agent { type: "guard", capabilities: ["patrol", "combat", "alert"] }
  @spatialAwareness { detection_radius: 15, track_agents: true }
  @patrol {
    zone: "TreasureRoom"
    waypoints: [[-45,1,-55], [-55,1,-55], [-55,1,-45], [-45,1,-45]]
    speed: 2
  }

  on entityNearby(entity, layer) {
    if (entity.type == "player" && !entity.hasAccess) {
      broadcast("guard_channel", { type: "intruder_detected", location: entity.position })
      moveTo(entity.position)
    }
  }
}

// IoT data pipeline
stream TemperatureData from IoTSensor {
  filter: value > 0
  transform: celsius_to_fahrenheit
  aggregate: moving_average(window: 10)
}
```

### `.hsplus` — TypeScript for XR

Full programming language with modules, types, physics, joints, state machines, and async/await.

```hsplus
module GameState {
  export let score: number = 0;
  export let ballsRemaining: number = 3;

  export function addScore(points: number) {
    score += points * multiplier;
    emit("score_changed", score);
  }
}

module PinballPhysics {
  const BALL_MASS = 0.08;          // kg
  const FLIPPER_SPEED = 1700;      // degrees/sec

  export interface BallState {
    position: Vector3;
    velocity: Vector3;
  }

  export function applyTableGravity(ball: BallState, dt: number) {
    ball.velocity.z += GRAVITY * Math.sin(tiltRad) * dt;
  }
}
```

### How They Work Together

```text
my-vr-game/
├── main.holo              # Scene graph — world composition (compile entry point)
├── agents/
│   ├── guard.hs           # Core language — patrol AI, spatial awareness
│   └── npc.hs             # Core language — NPC behaviors
├── components/
│   ├── combat.hsplus      # TypeScript for XR — physics, damage calculations
│   └── inventory.hsplus   # TypeScript for XR — state management
└── scenes/
    ├── arena.holo         # Scene graph — combat arena layout
    └── lobby.holo         # Scene graph — multiplayer lobby
```

**[📄 Full File Types Guide →](./docs/FILE_TYPES.md)**

---

## 🏆 vs Competitors

| vs | HoloScript Advantage |
|----|---------------------|
| **C# (Unity)** | Built-in spatial primitives, 25+ targets vs 1, agent SDK with spatial awareness |
| **Blueprints (Unreal)** | Text-based (version control friendly), three formats for different domains, cross-platform |
| **GDScript (Godot)** | Strong typing in `.hsplus`, module system, spatial query API, LSP tooling |
| **Swift (visionOS)** | Not locked to Apple, 25+ targets, agent choreography, IoT/robotics export |

---

## 🔥 Why HoloScript?

### 1. Three-Format Architecture

HoloScript provides **three specialized languages** that work together:

- **`.holo` (Scene Graph)**: Declarative world compositions — environments, NPC dialogs, quests, multiplayer networking, portals
- **`.hs` (Core Language)**: Templates, agent behaviors, spatial awareness, IoT streams, gates, utility functions
- **`.hsplus` (TypeScript for XR)**: Full programming language — modules, types, physics, joints, state machines, async/await

**Plus**: Runtime execution (ThreeJSRenderer, 120K particles, PBR materials, post-processing, weather systems) and multi-target compilation to 25+ platforms.

**Workflow**: Prototype in HoloScript runtime → compile to production platform

### 2. Even Playing Field (Commons-Based)
We built [Hololand](https://github.com/brianonbased-dev/Hololand)—a full VR social platform—using **only public HoloScript APIs**.

This proves:
- ✅ **You can build competing platforms** with equal access
- ✅ **No vendor lock-in** (compile to Unity/Unreal or run directly)
- ✅ **Commons governance** (HoloScript Foundation, community-driven roadmap)

Like Chromium (Chrome vs. Brave) or React (Instagram vs. Netflix)—**build your own Hololand**.

### 3. Universal Compilation
Write **one** HoloScript file. Compile to:
- **Game Engines**: Unity, Unreal Engine, Godot
- **WebXR**: Three.js, Babylon.js (browser-based VR/AR)
- **Mobile AR**: ARKit (iOS), ARCore (Android), VisionOS
- **VR Platforms**: Quest (OpenXR), SteamVR, PSVR2
- **Social VR**: VRChat (Udon), Rec Room
- **Specialized**: Robotics (URDF/SDF), IoT (DTDL), Healthcare, Education, Music, Architecture, Web3

### 4. Feature-Rich
- ✅ **1,800+ VR Traits** - `@grabbable`, `@physics`, `@ai_agent`, `@teleport`
- ✅ **600+ Visual Traits** - PBR materials, procedural textures, mood lighting
- ✅ **AI-Native** - Built for LLMs, real-time generation via MCP tools (Brittney agent)
- ✅ **8 Industry Domains** - IoT, Robotics, DataViz, Education, Healthcare, Music, Architecture, Web3
- ✅ **Simulation Layer** - Materials, particles, post-processing, weather, procedural terrain, navigation, physics
- ✅ **Production-Ready** - WebGPU rendering, CRDT state, resilience patterns, 45 packages

---

## 🏗️ 25+ Compile Targets

| Platform         | Target                                        | Support   |
| ---------------- | --------------------------------------------- | --------- |
| **VR Platforms** | VRChat (Udon), Quest (OpenXR), SteamVR        | ✅ Stable |
| **Game Engines** | Unreal Engine 5, Unity, Godot                 | ✅ Stable |
| **Mobile AR**    | iOS (ARKit), Android (ARCore), Vision Pro     | ✅ Stable |
| **Web**          | React Three Fiber, WebGPU, WebAssembly, PlayCanvas, Babylon.js | ✅ Stable |
| **Advanced**     | Robotics (URDF/SDF), Digital Twins (DTDL), USD, glTF | ✅ Stable |

---

## 📚 Documentation

### Getting Started

- 📗 **[Quickstart](./docs/getting-started/quickstart.md)** - Start building in minutes.
- 📄 **[File Types Guide](./docs/FILE_TYPES.md)** - Understanding `.holo`, `.hs`, `.hsplus`, and `.ts` files.
- 🚀 **[Installation Guide](./docs/INSTALLATION_GUIDE.md)** - Full install options (CLI, SDK, Unity, npm).

### Agents & AI

- 🤖 **[Agent API Reference](./docs/AGENT_API_REFERENCE.md)** - Complete public API for `LLMAgentTrait`, `MultiAgentTrait`, `ChoreographyEngine`, and `AgentRegistry`.
- 🔌 **[MCP Server Guide](./docs/MCP_SERVER_GUIDE.md)** - Configure Claude, Cursor, or any MCP-compatible agent to build HoloScript scenes.
- 🐦 **[Grok/X Integration](./docs/GROK_X_INTEGRATION_ROADMAP.md)** - Native X/Twitter AI tools: `explain_code`, scene generation from posts, real-time agent triggers.

### Reference & Advanced

- 📘 **[Traits Reference](./docs/TRAITS_REFERENCE.md)** - Explore the massive library of 1,800+ VR traits.
- 📙 **[Academy](./docs/academy/README.md)** - Master HoloScript through interactive lessons.
- 🎮 **[Game Engine Versioning](./docs/GAME_ENGINE_VERSIONING.md)** - Unity/Godot/Unreal version compatibility matrix for all 25+ compile targets.
- 📕 **[Troubleshooting](./docs/guides/troubleshooting.md)** - Solutions to common issues.
- 🔘 **[Architecture](./docs/architecture/README.md)** - Deep dive into the engine and compiler.

---

## ⚡ Protocols

### x402 Protocol — Machine Payments
HoloScript implements the **x402 Protocol**: HTTP-native micropayments for agent-to-agent and agent-to-service interactions.
- An AI agent can **pay per API call** to access premium HoloScript tools, spatial layers, or gated assets
- Payments are settled on-chain with no human in the loop
- Works with any MCP-capable agent out of the box

### StoryWeaver Protocol — Narrative Spatial Computing
**StoryWeaver Protocol** is HoloScript's declarative narrative layer — structured scene progression, branching dialogue, and quest/objective tracking as first-class spatial primitives:
```holo
narrative "Tutorial" {
  @storyweaver
  chapter "Arrival" {
    trigger: player_enters("SpawnZone")
    dialogue: brittney.say("Welcome to Hololand.")
    on_complete: chapter("Exploration")
  }
}
```
- Powers Brittney's in-world guidance system
- Replaces ad-hoc scripting with declarative, testable narrative graphs
- Exports to VRChat triggers, Unity Timeline, and Godot Cutscene nodes

---

## 🛠️ Tooling

- **HoloScript Studio** - AI-powered 3D scene builder with templates (Enchanted Forest, Space Station, Art Gallery, Zen Garden, Neon City).
- **Plugin System** - Sandboxed plugin API with PluginLoader, ModRegistry, and permission-based asset/event access.
- **VS Code Extension** - Syntax highlighting and trait IntelliSense.
- **MCP Server** - Give your AI agents the power to build spatial worlds (Default Orchestrator Port: `5567`). **[Full guide →](./docs/MCP_SERVER_GUIDE.md)**
- **HoloScript CLI** - Parse, validate, and compile from your terminal.

### Companion Repositories

| Repository | Description | Version |
| --- | --- | --- |
| [`holoscript-compiler`](https://github.com/brianonbased-dev/holoscript-compiler) | Standalone `.hsplus` → USD/URDF/SDF/MJCF compiler for robotics (NVIDIA Isaac Sim) | v0.1.0 |
| [`holoscript-scientific-plugin`](https://github.com/brianonbased-dev/holoscript-scientific-plugin) | Narupa molecular dynamics + VR drug discovery plugin | v1.2.0 |

---

## 🧠 Latest: v5.0 Autonomous Ecosystems + Simulation Layer

HoloScript v5.0.0 ships **Autonomous Agent Networks**, **Economic Primitives**, and the complete **Simulation Layer**:

### v4.2 — Simulation Layer
- **PBR Materials**: `pbr_material`, `glass_material`, `toon_material`, `subsurface_material` with texture maps and shader connections
- **Particle Systems**: `particle_block` with sub-emitters, color/size over life, emission shapes
- **Post-Processing**: `post_processing_block` — bloom, DOF, color grading, SSAO, motion blur, tone mapping
- **Weather**: `weather_block` with layers, fog, time-of-day, precipitation
- **Procedural Generation**: `procedural_block` with noise functions, biome rules
- **Navigation**: `navmesh`, `behavior_tree`, `crowd_manager`
- **Physics**: `rigidbody_block`, `collider_block`, `force_field_block`, `articulation_block` with joints
- **Built-In Test Framework**: `test` blocks with `assert`, `given/when/then` BDD syntax

### v4.0 — Multi-Domain Expansion
- **8 Industry Domains**: IoT, Robotics, DataViz, Education, Healthcare, Music, Architecture, Web3 — each with domain-specific keywords
- **HSPlus Constructs**: `module`, `struct`, `enum`, `interface`, `import/export`, `function`, `try/catch`, `switch/case`, `await`
- **Spatial Primitives**: `spawn_group`, `waypoints`, `constraint`, `terrain`, `dialog` with branching options
- **Extensible Blocks**: `custom_block` catch-all for community-defined domains

---

## 🔬 New in v3.4: Scientific Computing & Robotics

### Scientific Computing (24 traits)

HoloScript now supports VR-based drug discovery and molecular dynamics through `@holoscript/narupa-plugin`:

```holo
composition "Drug Discovery Lab" {
  object "Protein" {
    @protein_visualization
    @pdb_loader(file: "1ubq.pdb")
    @hydrogen_bonds
    @electrostatic_surface
  }

  object "Ligand" {
    @ligand_visualization
    @auto_dock(receptor: "Protein")
    @interactive_forces
    @binding_affinity
  }
}
```

### Robotics & Industrial (213 traits)

Declarative robot authoring with export to URDF, USD, SDF, and MJCF:

```holo
composition "Robot Arm" {
  object "Joint1" {
    @joint_revolute
    @position_controlled
    @harmonic_drive
    @force_torque_sensor
    @joint_safety_controller
  }
}
```

---

## 🏗️ Build Your Own Platform

HoloScript is a **meta-framework**—the foundation for building spatial computing platforms.

### Reference Implementation: Hololand
[Hololand](https://github.com/brianonbased-dev/Hololand) is a VR social platform ("Roblox for VR") built entirely on HoloScript:
- **43+ packages**: Multiplayer, physics, rendering, voice chat
- **Public APIs only**: No privileged access (proves others can compete)
- **Open architecture**: Source available as reference

### What You Can Build
- **VR Social Platforms**: Compete with Hololand, VRChat, Rec Room
- **Corporate Training**: Multi-platform VR safety training, onboarding
- **Robotics Platforms**: ROS2/Gazebo simulations with URDF/SDF export
- **AR E-Commerce**: "Try before you buy" apps (furniture, fashion)
- **Digital Twins**: IoT platforms with Azure Digital Twins (DTDL)
- **Games**: Compile to Unity/Unreal or run directly in WebXR

**[📘 Build Your Own Platform Guide →](./docs/BUILD_YOUR_OWN_PLATFORM.md)**

---

## 🤝 Contributing

HoloScript is **MIT licensed** and commons-based. We welcome contributions to the core engine, compilers, runtimes, and documentation.

```bash
git clone https://github.com/brianonbased-dev/HoloScript.git
cd HoloScript
pnpm install
pnpm test
```

### Governance
HoloScript is governed by the **HoloScript Foundation** (community-driven, neutral):
- **No owner advantage**: Hololand uses public APIs only
- **Community roadmap**: Major decisions via RFC process
- **Corporate sponsors**: Foundation funded by Meta, Unity, Epic (coming soon)

**[💰 Sponsor HoloScript →](./FUNDING.md)** | **[🗺️ Roadmap](./ROADMAP.md)** | **[🏛️ Foundation](./docs/FOUNDATION.md)** (coming soon)

---

[Website](https://holoscript.net) | [Discord](https://discord.gg/holoscript) | [Twitter](https://twitter.com/holoscript) | [Hololand](https://github.com/brianonbased-dev/Hololand)

© 2026 HoloScript Foundation.
