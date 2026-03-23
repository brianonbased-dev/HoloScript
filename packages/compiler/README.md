# @holoscript/compiler

> Standalone HoloScript compiler — `.hsplus` to platform-specific code.

## Overview

The compiler package provides standalone compilation from HoloScript source to platform-specific output. It wraps the compiler infrastructure from `@holoscript/core` into a focused, importable API.

## Supported Targets

| Target | Platform | Output |
|--------|----------|--------|
| `unity` | Unity Engine | C# scripts |
| `unreal` | Unreal Engine 5 | C++ / Blueprints |
| `godot` | Godot 4 | GDScript |
| `r3f` | React Three Fiber | JSX components |
| `babylon` | Babylon.js | TypeScript |
| `visionos` | Apple Vision Pro | Swift / RealityKit |
| `webgpu` | WebGPU | WGSL shaders |
| `wasm` | WebAssembly | WAT / binary |
| `openxr` | OpenXR | C++ / Khronos |
| `android-xr` | Android XR | Kotlin |
| `ios` | iOS / ARKit | Swift |
| `android` | Android / ARCore | Kotlin |
| `vrchat` | VRChat | Udon# |
| `urdf` | Robotics | URDF XML |
| `sdf` | Robotics | SDF XML |
| `dtdl` | Digital Twins | DTDL JSON |
| `usd` | Universal Scene | USD |
| `gltf` | 3D Interchange | glTF JSON |

## Usage

```typescript
import { compile } from '@holoscript/compiler';

const output = await compile('./scene.holo', { target: 'unity' });
```

## CLI

```bash
holoscript compile scene.holo --target unity --output ./build/
holoscript compile agent.hsplus --target node --output ./dist/
```

## Adding a New Compiler Target

See [Contributing a New Compiler](../../docs/guides/contributing-new-compiler.md).

## Related

- [`@holoscript/core`](../core/) — Core compiler classes
- [`@holoscript/compiler-wasm`](../compiler-wasm/) — WASM-compiled compiler for browsers

## License

MIT
