# HoloScript Examples

This directory contains examples demonstrating HoloScript's versatility across different use cases and platforms.

## 📁 Directory Structure

### General Examples (`general/`)
**Universal VR/AR examples showcasing HoloScript's broad applicability:**

- **[vr-training-simulation/](general/vr-training-simulation/)** - Corporate training scenario
  - Compiles to: Unity, Unreal, WebXR
  - Use case: Employee onboarding, safety training

- **[ar-furniture-preview/](general/ar-furniture-preview/)** - E-commerce AR preview
  - Compiles to: WebXR AR, ARKit, ARCore
  - Use case: Retail, interior design

- **[virtual-art-gallery/](general/virtual-art-gallery/)** - Cultural/museum VR experience
  - Compiles to: Babylon.js, WebXR, Quest
  - Use case: Museums, galleries, education

- **[vr-game-demo/](general/vr-game-demo/)** - Simple VR game
  - Compiles to: Unity, Godot, VRChat
  - Use case: Gaming, entertainment

### Platform-Specific (`platforms/`)
**Examples targeting specific platforms:**
- Unity integration examples
- Unreal Engine examples
- Godot examples
- WebXR examples
- VRChat world examples

### Specialized Domains (`specialized/`)
- **[robotics/](robotics/)** - URDF/SDF robot simulations
- **[iot/](iot/)** - Digital twins, DTDL schemas
- **[multiplayer/](multiplayer/)** - Networked VR/AR experiences

### Hololand Platform (`hololand/`)
**Examples for the Hololand metaverse platform:**
- VRR (Virtual Reality Reality) twins
- AR entry points
- Business quests
- AI agent integration

## 🚀 Quick Start

### 1. Choose an Example
Pick an example based on your use case:

```bash
# Corporate training
cd general/vr-training-simulation

# E-commerce AR
cd general/ar-furniture-preview

# Cultural/museum
cd general/virtual-art-gallery

# Gaming
cd general/vr-game-demo
```

### 2. Compile to Your Target Platform

```bash
# Compile to Unity
holoscript compile example.holo --target unity --output output/

# Compile to WebXR
holoscript compile example.holo --target webxr --output output/

# Compile to Unreal
holoscript compile example.holo --target unreal --output output/
```

### 3. Run the Output
Each example includes platform-specific instructions in its README.

## 📚 Learning Path

**New to HoloScript?** Follow this progression:

1. **Start Simple**: `general/vr-training-simulation/` (basic concepts)
2. **Add Interaction**: `general/virtual-art-gallery/` (user input, navigation)
3. **Go Mobile**: `general/ar-furniture-preview/` (AR, mobile optimization)
4. **Build Games**: `general/vr-game-demo/` (game mechanics, physics)
5. **Explore Specialized**: `robotics/` or `iot/` (domain-specific features)
6. **Platform Deep-Dive**: `platforms/` (platform-specific features)

## 🎯 Examples by Use Case

### Corporate/Enterprise
- ✅ VR Training Simulation - Employee onboarding, safety training
- ✅ Virtual Meeting Room - Remote collaboration
- ✅ Product Visualization - Design reviews, prototyping

### E-Commerce/Retail
- ✅ AR Furniture Preview - "Try before you buy"
- ✅ Virtual Showroom - Product browsing in VR
- ✅ AR Product Viewer - Scan packaging for 3D preview

### Education/Culture
- ✅ Virtual Art Gallery - Museum experiences
- ✅ Historical Reconstruction - Educational VR
- ✅ Science Visualization - Interactive learning

### Entertainment/Gaming
- ✅ VR Game Demo - Basic game mechanics
- ✅ Multiplayer Arena - Networked gameplay
- ✅ Social VR World - VRChat/Rec Room integration

### Industrial/Technical
- ✅ Robotics Simulation - URDF/SDF robot modeling
- ✅ IoT Digital Twins - Real-time device mirroring
- ✅ Factory Visualization - Industrial design

### Platform-Specific
- ✅ Hololand Integration - Ready Player One-style metaverse

## 🔧 Example Structure

Each example follows this structure:

```
example-name/
├── README.md           # Example description, learning objectives
├── example.holo        # HoloScript source code
├── compiled/           # Compiled outputs for different platforms
│   ├── unity/          # Unity C# scripts
│   ├── unreal/         # Unreal C++ code
│   ├── webxr/          # Three.js/Babylon code
│   └── godot/          # GDScript code
├── assets/             # 3D models, textures, audio
└── docs/               # Additional documentation
    ├── TUTORIAL.md     # Step-by-step tutorial
    └── ARCHITECTURE.md # Technical architecture
```

## 📖 Documentation

- **[Getting Started](../docs/GETTING_STARTED.md)** - HoloScript basics
- **[Language Reference](../docs/LANGUAGE_REFERENCE.md)** - Complete syntax guide
- **[Platform Guides](../docs/platforms/)** - Platform-specific integration
- **[Best Practices](../docs/BEST_PRACTICES.md)** - Tips and patterns

## 🤝 Contributing Examples

We welcome new examples! Guidelines:

1. **General over Specific**: Prefer examples with broad applicability
2. **Documented**: Include README with clear learning objectives
3. **Tested**: Verify compilation to at least 2 platforms
4. **Standalone**: Should work without external dependencies
5. **Educational**: Teach one clear concept

See [CONTRIBUTING.md](../CONTRIBUTING.md) for details.

## 🌐 Community Examples

Find more examples from the community:
- [HoloScript Gallery](https://holoscript.dev/gallery)
- [Community Showcase](https://github.com/holoscript/awesome-holoscript)
- [Discord Examples Channel](https://discord.gg/holoscript)

---

**HoloScript**: Write once, deploy everywhere. Build VR, AR, and 3D experiences that run on any platform.
