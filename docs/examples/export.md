# Multi-Platform Export

Compile a single HoloScript scene to 18+ platforms — game engines, web, robotics, IoT, and spatial computing.

## The Same Source, Everywhere

```holo
// scene.holo — write once
composition "Interactive Scene" {
  environment {
    skybox: "studio"
    ambient_light: 0.6
  }

  object "MagicOrb" {
    @grabbable
    @throwable
    @physics
    @glowing

    position: [0, 1.5, -2]
    color: "#00aaff"
    glow_intensity: 1.0

    on_grab {
      this.glow_intensity = 3.0
      haptic_feedback("dominant", 0.5, 80ms)
    }
  }

  object "Platform" {
    @collidable
    position: [0, 0, -2]
    scale: [4, 0.2, 4]
    color: "#333344"
  }
}
```

## Export Targets

### Game Engines

```bash
# Unity — C# MonoBehaviours
holoscript compile scene.holo --target unity --output ./UnityProject/Assets/

# Unreal Engine — C++ header + source
holoscript compile scene.holo --target unreal --output ./UnrealProject/Source/

# Godot 4 — GDScript
holoscript compile scene.holo --target godot --output ./GodotProject/scenes/
```

### Web / XR

```bash
# Three.js — JavaScript with WebXR
holoscript compile scene.holo --target threejs --output ./web/src/

# Babylon.js — TypeScript
holoscript compile scene.holo --target babylon --output ./babylon/src/

# WebGPU — TypeScript with WebGPU API
holoscript compile scene.holo --target webgpu --output ./webgpu/src/
```

### VR Platforms

```bash
# VRChat — UdonSharp scripts + prefabs
holoscript compile scene.holo --target vrchat --output ./VRChatWorld/Assets/

# visionOS — Swift/RealityKit
holoscript compile scene.holo --target visionos --output ./XcodeProject/

# Android XR — Kotlin/Jetpack XR
holoscript compile scene.holo --target androidxr --output ./AndroidProject/

# iOS AR — Swift/ARKit
holoscript compile scene.holo --target ios --output ./iOSProject/

# OpenXR — C++/OpenXR API
holoscript compile scene.holo --target openxr --output ./openxr/src/
```

### Robotics & Digital Twins

```bash
# URDF — ROS 2 robot description
holoscript compile scene.holo --target urdf --output ./ros2_ws/src/

# SDF — Gazebo simulation
holoscript compile scene.holo --target sdf --output ./gazebo/worlds/

# DTDL — Azure Digital Twins
holoscript compile scene.holo --target dtdl --output ./adt/models/

# W3C WoT — Thing Descriptions for IoT
holoscript compile scene.holo --target wot --output ./iot/td/

# USDA — Pixar/Apple/NVIDIA OpenUSD
holoscript compile scene.holo --target usda --output ./usd/

# WASM — WebAssembly binary
holoscript compile scene.holo --target wasm --output ./wasm/
```

## Programmatic Export

```typescript
import { HoloScriptPlusParser } from '@holoscript/core';
import { unityCompiler }   from '@holoscript/core';
import { godotCompiler }   from '@holoscript/core';
import { vrchatCompiler }  from '@holoscript/core';
import { urdfCompiler }    from '@holoscript/core';

const parser = new HoloScriptPlusParser();
const { ast } = parser.parse(source);

// Compile to multiple targets at once
const targets = [
  { name: 'unity',   fn: unityCompiler },
  { name: 'godot',   fn: godotCompiler },
  { name: 'vrchat',  fn: vrchatCompiler },
  { name: 'urdf',    fn: urdfCompiler },
];

for (const { name, fn } of targets) {
  const result = fn(ast);
  console.log(`${name}: compiled ${typeof result === 'string' ? result.length : 'ok'} chars`);
}
```

## Trait Coverage by Target

Not every trait maps to every platform. Here's a summary:

| Trait | Unity | VRChat | Three.js | URDF |
| --- | :---: | :---: | :---: | :---: |
| `@grabbable` | ✅ XRGrabInteractable | ✅ VRC_Pickup | ✅ | ❌ |
| `@physics` | ✅ Rigidbody | ✅ | ✅ Cannon.js | ✅ inertia |
| `@networked` | ✅ Netcode | ✅ UdonSynced | ✅ WebSockets | ❌ |
| `@glowing` | ✅ Emission | ✅ | ✅ | ❌ |
| `@spatial_audio` | ✅ AudioSource | ✅ VRC_Audio | ✅ Web Audio | ❌ |
| `@collidable` | ✅ Collider | ✅ | ✅ | ✅ collision |

## Batch Export Script

```bash
#!/bin/bash
# export-all.sh — compile to every target

SOURCE=$1
NAME=$(basename "$SOURCE" .holo)

targets=(unity unreal godot vrchat visionos threejs babylon webgpu androidxr urdf sdf dtdl wot usda wasm)

for target in "${targets[@]}"; do
  echo "Compiling to $target..."
  holoscript compile "$SOURCE" --target "$target" --output "./dist/$target/"
done

echo "Done! Output in ./dist/"
```

## Output File Types

| Target | Output Files |
| --- | --- |
| `unity` | `SceneName.cs` MonoBehaviours |
| `unreal` | `SceneName.h` + `SceneName.cpp` |
| `godot` | `SceneName.gd` |
| `vrchat` | `SceneName_UdonSharp.cs` + `.prefab` metadata |
| `visionos` | `SceneName.swift` |
| `threejs` | `SceneName.js` with Three.js setup |
| `babylon` | `SceneName.ts` |
| `webgpu` | `SceneName.ts` with WebGPU pipeline |
| `urdf` | `SceneName.urdf` |
| `sdf` | `SceneName.sdf` |
| `dtdl` | `SceneName.json` (DTDL v3) |
| `wot` | `SceneName.td.jsonld` (JSON-LD) |
| `usda` | `SceneName.usda` |
| `wasm` | `SceneName.wasm` + `SceneName.js` glue |

## See Also

- [Compilers Overview](/compilers/)
- [Unity Compiler](/compilers/unity)
- [VRChat Compiler](/compilers/vrchat)
- [URDF Compiler](/compilers/robotics/urdf)
- [DTDL / IoT](/compilers/iot/wot)
