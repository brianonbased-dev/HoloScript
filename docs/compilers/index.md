# Compiler Targets

HoloScript compiles a single `.holo` source file to multiple platform targets.

Canonical target keys are defined in `ExportTarget` (`packages/core/src/compiler/CircuitBreaker.ts`).

```bash
# SSOT: inspect registered target enum members
grep -n "export enum ExportTarget" -A 200 packages/core/src/compiler/CircuitBreaker.ts
```

## Common targets (non-exhaustive)

| Target Flag                | File                                             | Output             | Platform                    |
| -------------------------- | ------------------------------------------------ | ------------------ | --------------------------- |
| `--target unity`           | [unity.md](/compilers/unity)                     | C# MonoBehaviour   | Unity Engine                |
| `--target unreal`          | [unreal.md](/compilers/unreal)                   | C++ / Blueprint    | Unreal Engine 5             |
| `--target godot`           | [godot.md](/compilers/godot)                     | GDScript           | Godot Engine 4.x            |
| `--target vrchat`          | [vrchat.md](/compilers/vrchat)                   | UdonSharp C#       | VRChat SDK3                 |
| `--target babylon`         | babylon.md                                       | JavaScript         | Babylon.js                  |
| `--target webgpu`          | [webgpu.md](/compilers/webgpu)                   | TypeScript         | Modern Browsers             |
| `--target ios`             | [ios.md](/compilers/ios)                         | Swift + ARKit      | iOS 15+                     |
| `--target visionos`        | [vision-os.md](/compilers/vision-os)             | Swift + RealityKit | Apple Vision Pro            |
| `--target android`         | [android.md](/compilers/android)                 | Kotlin + ARCore    | Android SDK 26+             |
| `--target androidxr`       | [android-xr.md](/compilers/android-xr)           | Kotlin             | Android XR                  |
| `--target openxr`          | [openxr.md](/compilers/openxr)                   | C++                | Cross-platform XR           |
| `--target threejs`         | three-js.md                                      | JavaScript         | Three.js / Web              |
| `--target gltf`            | gltf.md                                          | GLB/glTF           | Universal 3D                |
| `--target wasm`            | wasm.md                                          | WASM binary        | WebAssembly                 |
| `--target urdf`            | [robotics/urdf.md](/compilers/robotics/urdf)     | URDF XML           | ROS 2                       |
| `--target sdf`             | [robotics/sdf.md](/compilers/robotics/sdf)       | SDF XML            | Gazebo                      |
| `--target dtdl`            | [iot/dtdl.md](/compilers/iot/dtdl)               | DTDL JSON          | Azure Digital Twins         |
| `--target wot`             | [iot/wot.md](/compilers/iot/wot)                 | WoT TD JSON        | W3C Web of Things           |
| `--target playcanvas`      | [playcanvas.md](/compilers/playcanvas)           | JavaScript         | PlayCanvas Engine           |
| `--target ar`              | [ar.md](/compilers/ar)                           | TypeScript         | Browser WebXR AR            |
| `--target tsl`             | [tsl.md](/compilers/tsl)                         | WGSL               | Trait Shader Language       |
| `--target neuromorphic`    | [neuromorphic.md](/compilers/neuromorphic)       | NIR bytecode       | Loihi2 / SpiNNaker          |
| `--target a2a`             | [a2a.md](/compilers/a2a)                         | JSON Agent Card    | Google A2A Protocol         |
| `--target scm`             | [scm.md](/compilers/scm)                         | Python + dowhy     | Causal AI                   |
| `--target usd-physics`     | [usd-physics.md](/compilers/usd-physics)         | USD Physics JSON   | visionOS / Omniverse        |
| `--target openxr-spatial`  | [openxr-spatial.md](/compilers/openxr-spatial)   | OpenXR JSON        | AR/VR Anchoring             |
| `--target ai-glasses`      | [ai-glasses.md](/compilers/ai-glasses)           | Platform SDK       | Meta / Snap / Apple Glasses |
| `--target vr-reality`      | [vr-reality.md](/compilers/vr-reality)           | Phoenix WebXR      | VRR Digital Twins           |
| `--target nft-marketplace` | [nft-marketplace.md](/compilers/nft-marketplace) | Solidity + JS      | NFT / Web3                  |

## Common Compiler Options

All compilers support:

| Option            | Description                             |
| ----------------- | --------------------------------------- |
| `--output <path>` | Output directory                        |
| `--verbose`       | Show detailed compilation info          |
| `--watch`         | Recompile on file changes               |
| `--sourcemap`     | Generate source maps (where applicable) |

## Usage

```bash
# Compile to a specific target
holoscript compile scene.holo --target unity --output ./Assets/Generated/

# Compile to multiple targets
holoscript compile scene.holo --target unity --target godot --output ./builds/

# Watch mode
holoscript compile scene.holo --target webgpu --watch
```

## Groupings

### Game Engines

[Unity](/compilers/unity) · [Unreal](/compilers/unreal) · [Godot](/compilers/godot) · [VRChat](/compilers/vrchat)

### Web & Browser

[WebGPU](/compilers/webgpu) · Three.js · Babylon.js · GLTF · WASM

### Mobile & XR

[iOS ARKit](/compilers/ios) · [visionOS](/compilers/vision-os) · [Android ARCore](/compilers/android) · [Android XR](/compilers/android-xr) · [OpenXR](/compilers/openxr)

### Robotics

[URDF (ROS 2)](/compilers/robotics/urdf) · [SDF (Gazebo)](/compilers/robotics/sdf)

### IoT & Digital Twins

[DTDL (Azure)](/compilers/iot/dtdl) · [WoT (W3C)](/compilers/iot/wot)

## Utility Surface (beyond rendering)

Not every utility capability is a compiler target. HoloScript also provides:

| Capability                     | Where to look                                                             |
| ------------------------------ | ------------------------------------------------------------------------- |
| Data/service pipelines         | `.hs` flows and Node/service-oriented targets (for runtime orchestration) |
| Agent interoperability         | [A2A target](/compilers/a2a) and protocol docs in `docs/agents/`          |
| Schema mapping / digital twins | [DTDL](/compilers/iot/dtdl), [WoT](/compilers/iot/wot), Absorb docs       |
| Observability and tracing      | Telemetry/tracing paths in core/runtime + platform docs                   |
| Knowledge market and team ops  | HoloMesh and orchestrator APIs (not compiler outputs)                     |

Use compiler docs for output artifacts, and use runtime/service docs for orchestration, observability, and marketplace flows.

## See Also

- [Publishing & platform terms](/guides/publishing-platform-terms) — VRChat, Unity, and other hosts: official terms before you publish
- [Traits Reference](/traits/) — Trait → platform mapping
- [CLI Reference](/guides/) — Full compiler CLI options
- [Python Bindings](/guides/python-bindings) — Compile from Python
