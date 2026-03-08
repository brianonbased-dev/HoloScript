# HoloScript Examples

This directory contains examples demonstrating HoloScript's versatility across different use cases and platforms.

## 🌟 NEW: Advanced Runtime Integration Examples

### Advanced Earthquake Demo (FEATURED)

**Files**: `advanced-earthquake-demo.ts` + `advanced-earthquake-demo.html`

**Complete integration** showcasing all new Runtime Integration features (Feb 2026):

**✨ Features**:

- 🌋 EarthquakeRuntimeExecutor - High-fidelity seismic simulation (Richter 7.5)
- ⚡ GPU Instancing - 100x performance (10K+ objects in 10 draw calls)
- 🎨 Post-Processing - SSAO, Bloom, TAA, Vignette (AAA quality)
- 🚀 Optimized Shaders - 5x faster particle rendering
- 🔍 Scene Inspector - Real-time FPS, memory, and performance monitoring

**Performance**: 60 FPS with 80K particles, 8 procedural buildings

**Controls**: `R` (Reset), `P` (Toggle Post-FX), `Q` (Cycle Quality), `B` (Bounding Boxes)

**Quick Start**:

```bash
# Open in browser
open advanced-earthquake-demo.html

# Or run with dev server
npm run dev
```

---

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
**Advanced examples for specific industries and platforms:**

- **[robotics/](specialized/robotics/)** - Industrial robot simulation (UR5)
  - Compiles to: URDF, SDF, Gazebo, ROS2
  - Use case: Manufacturing, automation, research

- **[iot/](specialized/iot/)** - Smart factory digital twin
  - Compiles to: DTDL, Azure Digital Twins
  - Use case: Industrial IoT, predictive maintenance

- **[multiplayer/](specialized/multiplayer/)** - Collaborative VR meeting space
  - Compiles to: Unity (Photon/Mirror), Unreal, WebRTC
  - Use case: Remote collaboration, social VR

- **[unity-quest/](specialized/unity-quest/)** - Platform-optimized obstacle course
  - Compiles to: Unity for Quest 2/3, PCVR
  - Use case: Mobile VR optimization, performance tuning

- **[vrchat/](specialized/vrchat/)** - Social hub world
  - Compiles to: Unity + VRChat SDK3 + Udon#
  - Use case: Social VR, user-generated content

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

- ✅ Robotics Simulation - Industrial robot arm (UR5), inverse kinematics, ROS2
- ✅ IoT Digital Twin - Smart factory with predictive maintenance
- ✅ Factory Visualization - Real-time telemetry and monitoring

### Film/Entertainment (Advanced Volumetric)

- ✅ **[Gaussian Splat Photogrammetry](volumetric-advanced/)** - Complete capture-to-3DGS pipeline, 64-camera dome, SfM/MVS, 30K training iterations
- ✅ **[Real-Time NeRF](volumetric-advanced/)** - Instant-NGP, multi-resolution hash encoding, 30 FPS interactive rendering
- ✅ **[Volumetric Video Streaming](volumetric-advanced/)** - 4D-MoDe compression, ABR streaming, DASH-style chunks, 50-200× compression
- ✅ **[LiDAR Point Cloud](volumetric-advanced/)** - 500M points, octree LOD, ASPRS classification, measurement tools
- ✅ **[Photogrammetry Workflow](volumetric-advanced/)** - End-to-end 8-stage pipeline (capture → SfM → MVS → 3DGS → VR → export to USD/Alembic/FBX)

### Platform-Specific

- ✅ Unity Quest - Mobile VR optimization (ASTC, LODs, foveated rendering)
- ✅ VRChat World - Social VR with mirrors, video players, Udon# scripting
- ✅ Multiplayer VR - Networked collaboration with voice chat

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
- [HoloScript Gallery](https://holoscript.net/gallery)
- [Community Showcase](https://github.com/holoscript/awesome-holoscript)
- [Discord Examples Channel](https://discord.gg/holoscript)

---

**HoloScript**: Write once, deploy everywhere. Build VR, AR, and 3D experiences that run on any platform.
