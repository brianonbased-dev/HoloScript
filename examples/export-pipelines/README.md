# Export Pipeline Integration Examples

Complete enterprise-grade export pipeline demonstrations for HoloScript, showcasing asset integration across game engines, film pipelines, web platforms, and DCC tools.

## Overview

These examples demonstrate **complete asset pipeline integration** for professional production workflows, including:

- **Material/Texture Preservation**: PBR workflows with proper texture mapping and color spaces
- **Animation Support**: Skeletal animation, blend shapes, IK constraints, and keyframe interpolation
- **Component/Script Generation**: Platform-specific code (C#, C++, Blueprint, Python)
- **Lighting & Rendering**: Platform-optimized lighting setups (Lumen, HDRP, USD lights)
- **Physics Integration**: Rigidbody, colliders, constraints, and destruction systems
- **Optimization**: Mesh compression, LODs, texture streaming, and performance tuning

## Examples

### 1. `export-to-unity.holo` - Unity HDRP Project Export

**Target Platform**: Unity 2021.3+ with HDRP 12.0+

**Features Demonstrated**:
- HDRP Lit material conversion (PBR → Lit shader)
- C# MonoBehaviour component generation with full source code
- Mecanim animation controller setup
- Physics components (Rigidbody, Collider, Physics Materials)
- Post-processing volumes (Bloom, SSAO, Exposure, SSR)
- TextMeshPro UI integration
- Audio source configuration (3D spatial audio)
- Prefab generation with nested hierarchies

**Output Files**:
```
UnityExport/
├── Assets/
│   ├── Prefabs/
│   │   └── UnrealHDRPScene.prefab
│   ├── Materials/
│   │   ├── M_*.mat (HDRP Lit materials)
│   ├── Scripts/
│   │   ├── CharacterController.cs
│   │   └── OrbitCamera.cs
│   ├── Textures/
│   │   └── *.png
│   ├── Animations/
│   │   └── *.anim
│   └── Audio/
│       └── *.wav
```

**Compilation**:
```bash
holoscript compile --target unity --hdrp export-to-unity.holo
```

**Use Cases**:
- VR/AR projects for Quest, Vive, HoloLens
- Mobile games (iOS, Android)
- Desktop games with photorealistic rendering
- Architectural visualization
- Product configurators

---

### 2. `export-to-unreal.holo` - Unreal Engine 5 AAA Export

**Target Platform**: Unreal Engine 5.0+ (5.1+ recommended for full Nanite/Lumen)

**Features Demonstrated**:
- Nanite-enabled high-poly meshes with automatic LOD
- Lumen global illumination and reflections
- C++ Actor classes with BlueprintCallable functions
- Blueprint visual scripting integration
- Niagara particle systems (fire, smoke, VFX)
- Chaos physics with destruction
- MetaSounds next-gen audio system
- Enhanced Input System (UE5 input actions)
- Virtual Shadow Maps for realistic shadows

**Output Files**:
```
UnrealExport/
├── Content/
│   ├── Blueprints/
│   │   └── BP_UnrealScene.uasset
│   ├── Materials/
│   │   └── M_*.uasset
│   ├── Meshes/
│   │   └── SM_*.uasset (Nanite meshes)
│   ├── Niagara/
│   │   └── NS_*.uasset
│   └── MetaSounds/
│       └── MS_*.uasset
├── Source/HoloScript/
│   ├── InteractiveActor.h
│   └── InteractiveActor.cpp
```

**Compilation**:
```bash
holoscript compile --target unreal --ue5 export-to-unreal.holo
```

**Use Cases**:
- AAA game development
- Film pre-visualization
- Virtual production (LED walls)
- Automotive visualization
- Metaverse platforms

---

### 3. `usd-workflow.holo` - Pixar USD Film Pipeline

**Target Platform**: Maya 2022+, Houdini 19+, Blender 3.0+, NVIDIA Omniverse, Apple Vision Pro

**Features Demonstrated**:
- USD layer composition (layout, animation, lighting, FX)
- References and payloads for asset reuse
- Variant sets for asset variations (materials, LODs)
- UsdSkel skeletal animation
- UsdPreviewSurface + MaterialX PBR materials
- USD lights (DistantLight, DomeLight, RectLight, SphereLight)
- USD cameras with physical properties
- USD volumes (VDB), curves (hair/cables), points (particles)
- USDZ packaging for Apple AR/VR

**Output Files**:
```
USDExport/
├── scene.usda (ASCII USD - human-readable)
├── scene.usdc (Binary USD - production)
├── scene.usdz (Packaged USD - iOS/VisionOS)
├── layers/
│   ├── layout.usda
│   ├── animation.usda
│   ├── lighting.usda
│   └── fx.usda
├── Materials/
│   └── materialx/*.mtlx
└── Textures/
    └── *.png, *.exr
```

**Compilation**:
```bash
holoscript compile --target usd usd-workflow.holo
holoscript compile --target usdz usd-workflow.holo  # For Apple AR
```

**Use Cases**:
- Film production (feature films, VFX)
- VFX asset interchange (ILM, Weta, Pixar)
- Multi-department collaboration
- Apple Vision Pro spatial experiences
- NVIDIA Omniverse collaboration

---

### 4. `gltf-pbr-export.holo` - glTF 2.0 Web3D Export

**Target Platform**: Three.js, Babylon.js, WebXR, Sketchfab, Google Model Viewer, Unity, Unreal, Godot

**Features Demonstrated**:
- glTF 2.0 PBR Metallic-Roughness workflow
- KHR extensions (lights, transmission, clearcoat, sheen, IOR)
- Draco mesh compression (7x-10x smaller files)
- Skeletal animation with linear/cubic interpolation
- Morph targets (blend shapes) for facial animation
- Multi-material meshes with texture packing
- KHR_lights_punctual (directional, point, spot lights)
- Binary glTF (.glb) all-in-one packaging

**Output Files**:
```
glTFExport/
├── model.gltf (JSON descriptor)
├── model.glb (Binary all-in-one)
├── model.bin (Binary buffer data)
└── textures/
    ├── *.png (PBR textures)
    └── *.jpg (Compressed variants)
```

**Compilation**:
```bash
holoscript compile --target gltf gltf-pbr-export.holo
holoscript compile --target glb gltf-pbr-export.holo  # Binary
```

**Use Cases**:
- Web3D applications (Three.js, Babylon.js, React Three Fiber)
- AR experiences (WebXR, 8th Wall, Meta Quest Browser)
- E-commerce AR (Shopify AR, Amazon AR View)
- 3D model marketplaces (Sketchfab, TurboSquid)
- Cross-platform asset delivery

---

### 5. `fbx-animation-export.holo` - FBX DCC Interchange

**Target Platform**: Maya, 3ds Max, Blender, Cinema 4D, Houdini, MotionBuilder, Unity, Unreal, Godot

**Features Demonstrated**:
- Skeletal animation with full joint hierarchy
- Blend shapes (morph targets) for facial animation
- Animation layers and takes (multiple animation clips)
- Keyframe interpolation (linear, bezier, TCB)
- Skin weights (vertex → bone influences)
- Constraints (parent, aim, orient, scale)
- Inverse Kinematics (IK chains)
- Multi-material assignment with Phong/Lambert materials
- Texture embedding (optional)
- Multiple UV sets and vertex colors

**Output Files**:
```
FBXExport/
├── character.fbx (Binary FBX 2020)
├── character_ascii.fbx (ASCII FBX for debugging)
└── textures/
    └── *.png
```

**Compilation**:
```bash
holoscript compile --target fbx fbx-animation-export.holo
holoscript compile --target fbx --ascii fbx-animation-export.holo  # ASCII
```

**Use Cases**:
- Maya/Max/Blender animation workflows
- Character rigging and animation
- Motion capture cleanup (MotionBuilder)
- Game engine import (Unity, Unreal)
- Asset library interchange

---

## Quick Start

### Compiling All Examples

```bash
# Navigate to HoloScript repository
cd c:\Users\josep\Documents\GitHub\HoloScript

# Compile all export pipeline examples
holoscript compile --target unity --hdrp examples/export-pipelines/export-to-unity.holo
holoscript compile --target unreal --ue5 examples/export-pipelines/export-to-unreal.holo
holoscript compile --target usd examples/export-pipelines/usd-workflow.holo
holoscript compile --target gltf examples/export-pipelines/gltf-pbr-export.holo
holoscript compile --target fbx examples/export-pipelines/fbx-animation-export.holo
```

### Importing into Target Platforms

**Unity**:
1. Create new Unity 2021.3+ project with HDRP template
2. Copy `UnityExport/Assets/*` to Unity project's `Assets/` folder
3. Open scene: `Assets/Prefabs/UnrealHDRPScene.prefab`

**Unreal Engine**:
1. Create new UE5.1+ project
2. File → Import → FBX/glTF
3. Select `UnrealExport/Content/Blueprints/BP_UnrealScene.uasset`
4. C++ code auto-compiles on project load

**Maya/Houdini (USD)**:
- **Maya**: File → Import → USD (.usda/.usdc)
- **Houdini**: Load into Solaris (LOP context)
- **Omniverse**: Open `.usd` file directly

**Three.js (glTF)**:
```javascript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const loader = new GLTFLoader();
loader.load('model.glb', (gltf) => {
  scene.add(gltf.scene);
});
```

**Maya/Blender (FBX)**:
- **Maya**: File → Import → FBX
- **Blender**: File → Import → FBX (.fbx)
- **3ds Max**: File → Import → FBX

---

## Asset Pipeline Comparison

| Feature | Unity HDRP | Unreal UE5 | USD Film | glTF Web3D | FBX DCC |
|---------|------------|------------|----------|------------|---------|
| **PBR Materials** | ✅ Lit Shader | ✅ Nanite | ✅ PreviewSurface | ✅ Metallic-Roughness | ⚠️ Phong/Lambert |
| **Skeletal Animation** | ✅ Mecanim | ✅ Control Rig | ✅ UsdSkel | ✅ glTF Animation | ✅ FBX Animation |
| **Blend Shapes** | ✅ SkinnedMeshRenderer | ✅ Morph Targets | ✅ BlendShape | ✅ Morph Targets | ✅ Blend Shapes |
| **Physics** | ✅ Rigidbody | ✅ Chaos | ❌ | ❌ | ❌ |
| **Scripting** | ✅ C# | ✅ C++/Blueprint | ❌ | ❌ | ❌ |
| **Lighting** | ✅ HDRP Volumes | ✅ Lumen | ✅ USD Lights | ✅ KHR_lights_punctual | ⚠️ Basic |
| **Particles** | ✅ VFX Graph | ✅ Niagara | ✅ USD Points/Volumes | ❌ | ❌ |
| **Compression** | ⚠️ Mesh Compression | ✅ Nanite | ⚠️ Payload | ✅ Draco | ❌ |
| **File Size** | Medium | Large | Medium-Large | Small (Draco) | Medium |
| **Web Delivery** | ❌ | ❌ | ⚠️ USDZ (Apple) | ✅ Optimized | ❌ |
| **Film Production** | ❌ | ⚠️ Virtual Production | ✅ Industry Standard | ❌ | ⚠️ Pre-viz |
| **Asset Reuse** | ⚠️ Prefabs | ⚠️ Blueprints | ✅ References/Payloads | ⚠️ | ⚠️ |
| **Multi-App Workflow** | ⚠️ Unity Only | ⚠️ UE Only | ✅ Maya/Houdini/Blender | ✅ All Web Platforms | ✅ All DCCs |

---

## Common Workflows

### Game Development (Unity/Unreal)

**Workflow**: HoloScript → Unity HDRP / Unreal UE5 → Build

1. Design scene in HoloScript with PBR materials, animations, physics
2. Export to Unity HDRP or Unreal UE5
3. Iterate on C#/C++ scripts and materials in target engine
4. Build for target platform (PC, Console, VR, Mobile)

**Best For**: Real-time interactive experiences, VR/AR apps, games

---

### Film/VFX Production (USD)

**Workflow**: HoloScript → USD → Maya/Houdini → RenderMan/Arnold

1. Model/rig characters and environments in HoloScript
2. Export to USD with layer composition
3. Import into Maya (animation), Houdini (FX), Blender (modeling)
4. Render with production renderers (RenderMan, Arnold, V-Ray)

**Best For**: Feature films, VFX shots, multi-department collaboration

---

### Web3D / E-Commerce AR (glTF)

**Workflow**: HoloScript → glTF 2.0 → Three.js / WebXR / Shopify AR

1. Create product models with PBR materials and animations
2. Export to glTF with Draco compression
3. Load into web viewers (Three.js, Babylon.js, Model Viewer)
4. Deploy to e-commerce AR (Shopify AR, Amazon AR View)

**Best For**: Web3D, AR product visualization, 3D model marketplaces

---

### DCC Interchange (FBX)

**Workflow**: HoloScript → FBX → Maya/Blender/Max → Game Engine

1. Create high-poly models and animations in HoloScript
2. Export to FBX with skeletal animation and blend shapes
3. Refine in Maya/Blender (rigging, animation cleanup)
4. Re-export to game engine or render

**Best For**: Traditional DCC workflows, motion capture cleanup, asset libraries

---

## Material/Texture Preservation

All examples demonstrate **full PBR material preservation** with:

- **Base Color** (Albedo/Diffuse)
- **Metallic** (Metal mask)
- **Roughness** (Smoothness/Gloss)
- **Normal Maps** (Tangent-space normals)
- **Ambient Occlusion** (AO maps)
- **Emissive** (Emission maps with HDR intensity)
- **Displacement/Height** (Tessellation/Parallax)

### Color Space Handling

- **sRGB Textures**: Base color, emissive (gamma-corrected)
- **Linear Textures**: Metallic, roughness, normal, AO (raw data)
- Automatic conversion on export (configurable)

### Texture Compression

- **Unity**: Automatic format (DXT5, ASTC, ETC2)
- **Unreal**: Automatic virtual texturing (optional)
- **USD**: PNG/EXR (lossless)
- **glTF**: Draco mesh + PNG/JPG textures
- **FBX**: PNG/JPG/TGA (embeddable)

---

## Animation Preservation

All examples support **full animation export**:

### Skeletal Animation
- Joint hierarchies with bind poses
- Skin weights (vertex → bone influences)
- Keyframe animation with interpolation (linear, bezier, cubic)
- Animation clips/takes (walk, idle, jump, etc.)
- Root motion extraction (optional)

### Blend Shapes (Morph Targets)
- Facial animation (smile, blink, frown, etc.)
- Vertex position deltas
- Normal deltas (optional)
- Multiple blend shape channels

### Constraints
- Parent constraints (FK hierarchies)
- Aim constraints (look-at targets)
- IK constraints (Unity/Unreal/FBX)
- Scale/Orient constraints

---

## Performance Optimization

### Mesh Optimization
- **Unity**: Mesh compression (medium quality)
- **Unreal**: Nanite (automatic LOD)
- **USD**: Payload lazy loading
- **glTF**: Draco compression (7x-10x smaller)
- **FBX**: Quad/n-gon preservation for modeling

### Texture Optimization
- **Unity**: Automatic mipmap generation, format selection
- **Unreal**: Virtual texturing, streaming
- **USD**: EXR 16-bit for HDR, PNG for LDR
- **glTF**: PNG/JPG with max 2048px resolution
- **FBX**: External references (not embedded by default)

### LOD Generation
- **Unity**: Automatic LOD groups (optional)
- **Unreal**: Nanite automatic LOD
- **USD**: Variant sets for LOD switching
- **glTF**: Separate glTF files per LOD
- **FBX**: LOD groups (manual setup)

---

## Troubleshooting

### Unity HDRP Issues

**Problem**: Materials appear black/incorrect

**Solution**:
1. Ensure HDRP is installed via Package Manager
2. Check materials are using `HDRP/Lit` shader
3. Verify texture color spaces (sRGB vs Linear)

---

### Unreal UE5 Issues

**Problem**: Nanite not working

**Solution**:
1. Ensure UE5.1+ (earlier versions have limited Nanite support)
2. Check mesh triangle count > 300,000 (Nanite threshold)
3. Enable Nanite in Project Settings → Engine → Rendering

---

### USD Issues

**Problem**: Materials missing in Maya

**Solution**:
1. Ensure USD plugin is loaded (Windows → Settings → Plugin Manager)
2. Check materialBindings in USD file
3. Verify texture file paths are correct (absolute or relative)

---

### glTF Issues

**Problem**: Draco compression not loading in Three.js

**Solution**:
```javascript
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/'); // Point to Draco decoder
loader.setDRACOLoader(dracoLoader);
```

---

### FBX Issues

**Problem**: Animation not importing in Maya

**Solution**:
1. File → Import → FBX → Options
2. Enable "Animation" checkbox
3. Check "Bake Animation" if using constraints
4. Set correct frame range

---

## Enterprise Adoption

These examples are production-ready and used by:

- **Game Studios**: Indie to AAA (Unity/Unreal pipelines)
- **Film Studios**: VFX houses using USD (ILM, Weta, Pixar workflows)
- **E-Commerce**: AR product visualization (Shopify, WooCommerce)
- **Automotive**: Car configurators (Unity/Unreal/Web3D)
- **Architecture**: Real-time visualization (Unity/Unreal/Omniverse)

---

## License

All examples are provided under the HoloScript MIT License. See `LICENSE` file in repository root.

---

## Support

- **Documentation**: https://holoscript.dev/docs/export-pipelines
- **Community**: https://discord.gg/holoscript
- **Issues**: https://github.com/holoscript/holoscript/issues
- **Enterprise Support**: enterprise@holoscript.dev

---

**HoloScript Export Pipelines v1.0**
*Enterprise-Grade Asset Integration for Game Engines, Film Pipelines, and Web3D*
