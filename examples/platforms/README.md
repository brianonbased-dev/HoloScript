# Platform Examples

This directory contains example `.holo` files demonstrating HoloScript compilation for each supported platform.

## Available Examples

| File                                       | Platform         | Description                                  |
| ------------------------------------------ | ---------------- | -------------------------------------------- |
| [vrchat-world.holo](vrchat-world.holo)     | VRChat           | Social hub with grabbables, mirrors, portals |
| [unreal-scene.holo](unreal-scene.holo)     | Unreal Engine 5  | VR experience with physics, particles, audio |
| [ios-ar-app.holo](ios-ar-app.holo)         | iOS (ARKit)      | AR product showroom with gestures            |
| [android-ar-app.holo](android-ar-app.holo) | Android (ARCore) | AR furniture placement app                   |
| [visionos-app.holo](visionos-app.holo)     | visionOS         | Spatial productivity workspace               |
| [godot-scene.holo](godot-scene.holo)       | Godot 4          | Puzzle game with physics                     |
| [openxr-app.holo](openxr-app.holo)         | OpenXR           | VR training simulator                        |
| [androidxr-app.holo](androidxr-app.holo)   | Android XR       | Spatial gallery with panels                  |
| [webgpu-demo.holo](webgpu-demo.holo)       | WebGPU           | GPU compute particle system                  |

## Compiling Examples

```bash
# VRChat
holoscript compile vrchat-world.holo --target vrchat --output ./build/vrchat

# Unreal Engine
holoscript compile unreal-scene.holo --target unreal --output ./build/unreal

# iOS
holoscript compile ios-ar-app.holo --target ios --output ./build/ios

# Android
holoscript compile android-ar-app.holo --target android --output ./build/android

# visionOS
holoscript compile visionos-app.holo --target visionos --output ./build/visionos

# Godot
holoscript compile godot-scene.holo --target godot --output ./build/godot

# OpenXR
holoscript compile openxr-app.holo --target openxr --output ./build/openxr

# Android XR
holoscript compile androidxr-app.holo --target androidxr --output ./build/androidxr

# WebGPU
holoscript compile webgpu-demo.holo --target webgpu --output ./build/webgpu
```

## Output Files

Each target generates platform-specific files:

- **VRChat**: UdonSharp `.cs` files + prefab `.prefab`
- **Unreal**: C++ `.h`/`.cpp` files + Blueprint `.uasset`
- **iOS**: Swift `.swift` files + Xcode project
- **Android**: Kotlin `.kt` files + Gradle project
- **visionOS**: Swift `.swift` with RealityKit
- **Godot**: GDScript `.gd` + Scene `.tscn`
- **OpenXR**: C++ with OpenXR loader
- **Android XR**: Kotlin with Jetpack XR
- **WebGPU**: TypeScript with WGSL shaders

## Learn More

- [Platform Compilers Guide](../../docs/guides/PLATFORM_COMPILERS.md)
- [Traits Reference](../../docs/traits/index.md)
- [CLI Reference](../../docs/guides/CLI_REFERENCE.md)
