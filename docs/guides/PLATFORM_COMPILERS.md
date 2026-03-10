# Platform Compilers Guide

HoloScript compiles to **18 different platforms** from a single `.holo` source file. This guide covers the new platform compilers added in v3.4.

## Memory Optimizations (v3.4+)

The HoloScript core compilers (`GLTFPipeline` and `R3FCompiler`) now utilize an **AST Node Object Pool** architecture. This avoids excessive instantiation and garbage collection when navigating large procedural compositions. Memory-intensive ArrayBuffers for geometry are also mapped directly out to WASM bindings instead of being serialized to Base64 via Node's string heap.

These changes allow processing 100MB+ `.holo` assets under a strict 512MB RAM constraint, preventing `v8::internal::V8::FatalProcessOutOfMemory` node crashes.

## Quick Reference

| Target        | Command                                            | Output             |
| ------------- | -------------------------------------------------- | ------------------ |
| VRChat        | `holoscript compile scene.holo --target vrchat`    | UdonSharp C#       |
| Unreal Engine | `holoscript compile scene.holo --target unreal`    | C++ / Blueprint    |
| iOS           | `holoscript compile scene.holo --target ios`       | Swift / ARKit      |
| Android       | `holoscript compile scene.holo --target android`   | Kotlin / ARCore    |
| Godot         | `holoscript compile scene.holo --target godot`     | GDScript           |
| VisionOS      | `holoscript compile scene.holo --target visionos`  | Swift / RealityKit |
| OpenXR        | `holoscript compile scene.holo --target openxr`    | C++                |
| AndroidXR     | `holoscript compile scene.holo --target androidxr` | Kotlin             |
| WebGPU        | `holoscript compile scene.holo --target webgpu`    | TypeScript         |

---

## VRChat Compiler

Compiles HoloScript to VRChat SDK3 worlds with UdonSharp scripts.

### Features

- UdonSharp C# scripts for interactions
- Unity scene structure compatible with VRChat SDK3
- VRC_Pickup, VRC_Trigger, VRC_ObjectSync components
- Avatar pedestals, mirrors, portals
- Spatial audio with VRC_SpatialAudioSource

### Usage

```bash
holoscript compile my-world.holo --target vrchat --output ./vrchat-output/
```

### Output Files

- `WorldSetup.cs` - Main world setup script
- `*_Udon.cs` - Individual Udon scripts for interactive objects
- `PrefabHierarchy.txt` - Unity prefab structure
- `WorldDescriptor.json` - VRChat world configuration

### Example

```holo
composition "VRChat Demo" {
  environment {
    skybox: "sunset"
    ambient_light: 0.4
  }

  object "PickupCube" {
    @grabbable
    @networked
    geometry: "cube"
    position: [0, 1, 0]
    color: "#ff6600"
  }

  object "WorldPortal" {
    @portal
    geometry: "torus"
    position: [5, 1.5, 0]
    destination: "wrld_12345678"
  }
}
```

---

## Unreal Engine Compiler

Compiles HoloScript to Unreal Engine 5 C++ code with Blueprint compatibility.

### Features

- AActor-derived C++ classes
- UPROPERTY/UFUNCTION macros for Blueprint exposure
- UStaticMeshComponent, UPointLightComponent, etc.
- Physics with UPhysicsConstraintComponent
- Enhanced Input for VR interactions
- Niagara particle system integration

### Usage

```bash
holoscript compile my-scene.holo --target unreal --output ./Source/Generated/
```

### Output Files

- `GeneratedScene.h` - Header file with class declaration
- `GeneratedScene.cpp` - Implementation with component setup
- `GeneratedScene_BP.json` - Blueprint data (when enabled)

### Options

```bash
# Generate Blueprint JSON
holoscript compile scene.holo --target unreal --blueprints

# Specify engine version
holoscript compile scene.holo --target unreal --engine-version 5.4
```

### Example

```holo
composition "Unreal Demo" {
  environment {
    skybox: "hdri_studio"
    ambient_light: 0.6
  }

  object "PhysicsCrate" {
    @physics
    @collidable
    geometry: "cube"
    position: [0, 200, 0]
    scale: [100, 100, 100]
    physics: {
      mass: 50.0
      restitution: 0.3
    }
  }

  light "SunLight" {
    type: "directional"
    color: "#ffffee"
    intensity: 3.0
    cast_shadows: true
  }
}
```

---

## iOS Compiler (ARKit)

Compiles HoloScript to Swift code for iOS augmented reality apps.

### Features

- SwiftUI + ARKit integration
- ARSCNView with SceneKit nodes
- Automatic plane detection and hit testing
- World tracking configuration
- Gesture recognizers for interaction
- Spatial audio with SceneKit

### Usage

```bash
holoscript compile ar-scene.holo --target ios --output ./HoloApp/
```

### Output Files

- `GeneratedARSceneView.swift` - SwiftUI view with AR session
- `GeneratedARScene.swift` - SceneKit scene setup
- `GeneratedARSceneState.swift` - ObservableObject state management
- `Info.plist` - Required permissions (camera, etc.)

### Requirements

- iOS 15.0+ (ARKit 5)
- iOS 17.0+ recommended for latest features

### Example

```holo
composition "iOS AR Demo" {
  environment {
    plane_detection: true
    light_estimation: true
  }

  object "ARCube" {
    @anchor
    @clickable
    geometry: "cube"
    position: [0, 0, -0.5]
    scale: [0.1, 0.1, 0.1]
    color: "#00ff00"
  }

  object "InfoPanel" {
    @billboard
    geometry: "plane"
    position: [0, 0.2, -0.5]
    texture: "info-panel.png"
  }
}
```

---

## Android Compiler (ARCore)

Compiles HoloScript to Kotlin code for Android augmented reality apps.

### Features

- Kotlin Activity with ARCore Session
- Sceneform or Filament rendering
- Plane detection and hit testing
- Touch gesture handling
- Jetpack Compose UI integration
- Spatial audio integration

### Usage

```bash
holoscript compile ar-scene.holo --target android --output ./app/src/main/java/
```

### Output Files

- `GeneratedARSceneActivity.kt` - Main Activity with AR session
- `GeneratedARSceneState.kt` - ViewModel state management
- `NodeFactory.kt` - Sceneform node creation
- `AndroidManifest.xml` - Permissions and ARCore metadata
- `build.gradle.kts` - Dependencies

### Requirements

- Android SDK 26+ (ARCore 1.0)
- Android SDK 34 recommended

### Example

```holo
composition "Android AR Demo" {
  environment {
    plane_detection: true
    depth_mode: "automatic"
  }

  object "PlacedModel" {
    @anchor
    @draggable
    geometry: "model/robot.glb"
    position: [0, 0, 0]
    scale: [0.5, 0.5, 0.5]
  }

  object "InfoBubble" {
    @billboard
    geometry: "sphere"
    position: [0, 0.3, 0]
    color: "#0088ff"
    opacity: 0.8
  }
}
```

---

## Godot Compiler

Compiles HoloScript to GDScript for Godot Engine 4.x.

### Usage

```bash
holoscript compile scene.holo --target godot --output ./scenes/
```

### Output

- GDScript files with XR support
- .tscn scene resources (planned)

---

## VisionOS Compiler

Compiles HoloScript to Swift/RealityKit for Apple Vision Pro.

### Usage

```bash
holoscript compile scene.holo --target visionos --output ./VisionApp/
```

### Features

- RealityKit entities and components
- Immersive space support
- Hand tracking integration
- Spatial audio

---

## OpenXR Compiler

Compiles HoloScript to C++ with OpenXR runtime bindings.

### Usage

```bash
holoscript compile scene.holo --target openxr --output ./src/
```

### Features

- Cross-platform XR support
- Hand tracking extensions
- Passthrough support

---

## AndroidXR Compiler

Compiles HoloScript to Kotlin targeting Android XR headsets.

### Usage

```bash
holoscript compile scene.holo --target androidxr --output ./app/src/
```

---

## WebGPU Compiler

Compiles HoloScript to TypeScript with WebGPU rendering.

### Usage

```bash
holoscript compile scene.holo --target webgpu --output ./src/
```

### Features

- Modern WebGPU API
- PBR materials
- Shadow mapping
- Compute shaders for physics

---

## Common Options

All compilers support these options:

| Option            | Description                             |
| ----------------- | --------------------------------------- |
| `--output <path>` | Output directory                        |
| `--verbose`       | Show detailed compilation info          |
| `--watch`         | Recompile on file changes               |
| `--sourcemap`     | Generate source maps (where applicable) |

---

## See Also

- [CLI Reference](./CLI_REFERENCE.md)
- [Trait Reference](../TRAITS_REFERENCE.md)
- [Platform Examples](../../examples/)
