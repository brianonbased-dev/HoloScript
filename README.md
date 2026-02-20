# HoloScript v3.4.0

## The Universal Language for VR, AR, and 3D Experiences

Write once, deploy everywhere. HoloScript compiles to Unity, Unreal, Godot, WebXR, Quest, ARKit, ARCore, and 18+ platforms from a single codebase.

Perfect for corporate training, e-commerce AR, museums, games, robotics, and more.

![version-badge](https://img.shields.io/badge/version-v3.4.0-green?style=for-the-badge)
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

**All examples compile to Unity, Unreal, Godot, and WebXR from a single `.holo` file.**

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

**[View Full 5-Minute Tutorial →](./docs/getting-started/quickstart.md)**

---

## 🔥 Why HoloScript?

### Universal Compilation
Write **one** HoloScript file. Compile to:
- **Game Engines**: Unity, Unreal Engine, Godot
- **WebXR**: Three.js, Babylon.js (browser-based VR/AR)
- **Mobile AR**: ARKit (iOS), ARCore (Android), VisionOS
- **VR Platforms**: Quest (OpenXR), SteamVR, PSVR2
- **Social VR**: VRChat (Udon), Rec Room
- **Specialized**: Robotics (URDF/SDF), IoT (DTDL), Simulations

### Feature-Rich
- ✅ **1,800+ VR Traits** - `@grabbable`, `@physics`, `@ai_agent`, `@teleport`
- ✅ **600+ Visual Traits** - PBR materials, procedural textures, mood lighting
- ✅ **AI-Native** - Built for LLMs, real-time generation via MCP tools
- ✅ **Robotics** - 213 traits for URDF/SDF export (ROS2, Gazebo)
- ✅ **Production-Ready** - WebGPU rendering, CRDT state, resilience patterns

---

## 🏗️ 18+ Compile Targets

| Platform         | Target                                        | Support   |
| ---------------- | --------------------------------------------- | --------- |
| **VR Platforms** | VRChat (Udon), Quest (OpenXR), SteamVR        | ✅ Stable |
| **Game Engines** | Unreal Engine 5, Unity, Godot                 | ✅ Stable |
| **Mobile AR**    | iOS (ARKit), Android (ARCore), Vision Pro     | ✅ Stable |
| **Web**          | React Three Fiber, WebGPU, WebAssembly        | ✅ Stable |
| **Advanced**     | Robotics (URDF), Digital Twins (DTDL), Gazebo | ✅ Stable |

---

## 📚 Documentation

- 📗 **[Quickstart](./docs/getting-started/quickstart.md)** - Start building in minutes.
- 📘 **[Traits Reference](./docs/TRAITS_REFERENCE.md)** - Explore the massive library of 1,800+ VR traits.
- 📙 **[Academy](./docs/academy/README.md)** - Master HoloScript through interactive lessons.
- 📕 **[Troubleshooting](./docs/guides/troubleshooting.md)** - Solutions to common issues.
- 🔘 **[Architecture](./docs/architecture/README.md)** - Deep dive into the engine and compiler.

---

## 🛠️ Tooling

- **HoloScript Studio** - AI-powered 3D scene builder with templates (Enchanted Forest, Space Station, Art Gallery, Zen Garden, Neon City).
- **Plugin System** - Sandboxed plugin API with PluginLoader, ModRegistry, and permission-based asset/event access.
- **VS Code Extension** - Syntax highlighting and trait IntelliSense.
- **MCP Server** - Give your AI agents the power to build spatial worlds.
- **HoloScript CLI** - Parse, validate, and compile from your terminal.

### Companion Repositories

| Repository | Description | Version |
| --- | --- | --- |
| [`holoscript-compiler`](https://github.com/brianonbased-dev/holoscript-compiler) | Standalone `.hsplus` → USD/URDF/SDF/MJCF compiler for robotics (NVIDIA Isaac Sim) | v0.1.0 |
| [`holoscript-scientific-plugin`](https://github.com/brianonbased-dev/holoscript-scientific-plugin) | Narupa molecular dynamics + VR drug discovery plugin | v1.2.0 |

---

## � New in v3.4: Scientific Computing & Robotics

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

## �🤝 Contributing

HoloScript is **MIT licensed** and open-source. We welcome contributions to the core engine, compilers, and documentation.

```bash
git clone https://github.com/brianonbased-dev/HoloScript.git
cd HoloScript
pnpm install
pnpm test
```

---

[Website](https://holoscript.dev) | [Discord](https://discord.gg/holoscript) | [Twitter](https://twitter.com/holoscript)

© 2026 HoloScript Foundation.
