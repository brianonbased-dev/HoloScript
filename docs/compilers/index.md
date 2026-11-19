# Compiler Targets

HoloScript compiles a single `.holo` source file to multiple platform targets.

Canonical target keys are defined in `ExportTarget` (`packages/core/src/compiler/CircuitBreaker.ts`).

```bash
# SSOT: inspect registered target enum members
grep -n "export enum ExportTarget" -A 200 packages/core/src/compiler/CircuitBreaker.ts
```

## How ready is each target?

Not every target is equally proven. Each one carries a tier, and the tier is **earned from evidence, not declared**: a unit test (`packages/core/src/compiler/__tests__/target-tiers.test.ts`) checks every label against the files that prove it, and fails if a label claims more than its evidence (or less).

| Tier         | What it means                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| reference    | Proven on a real device. Its output is pinned byte-for-byte to a reference app that every change is checked against.        |
| production   | Its output is pinned by a passing golden test, and a real build tool or engine has accepted it. Not yet proven on a device. |
| preview      | Tests check the code, but nothing here shows its output running in the real engine yet.                                     |
| experimental | The code exists, but no test checks it yet.                                                                                 |
| format-only  | Writes a description or manifest for another system to read. There is no program to run.                                    |

The `list_export_targets` MCP tool returns the same tier and sentence for every target. The data lives in `packages/core/src/compiler/target-tiers.ts`; to move a target up, add the evidence there (a golden test, a quote from a build or device run, a reference app) and the test will confirm it.

<!-- prettier-ignore-start -->
<!-- target-tiers:start (checked by target-tiers.test.ts) -->
| Target | Tier | What it still lacks |
| --- | --- | --- |
| `android` | reference | No known gaps at this tier. |
| `android-xr` | production | It has not been run on a real device. |
| `3dgs` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `agent-inference` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `ai-glasses` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `audio` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `bot-swarm` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `canvas2d-game` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `character-webgpu` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `colyseus` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `desktop-gpu` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `dungeon-instance` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `edge` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `embodied-dataset` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `flutter` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `fmu` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `gaussian-train` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `godot` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `incremental` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `ios` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `lens-studio` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `llama-server` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `mcp-server` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `media` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `mjcf` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `mjx` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `multi-layer` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. Its VR layer still hands off to the Babylon bridge. |
| `nft-marketplace` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `nir` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `openxr` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `openxr-spatial-entities` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `pathtrace` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `pathtrace-cpu` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `pcg-graph` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `physics-sim` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `quest` | preview | A golden test pins its output, but nothing shows that output accepted by the real engine. The headset build is checked only by a pre-commit script; the core golden test pins the older 2D panel app, which has no recorded device run. |
| `r3f` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `sdf` | preview | A golden test pins its output, but nothing shows that output accepted by the real engine. |
| `sdk` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `state` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `svg` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `trait-composition` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `tsl` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `unity` | preview | A golden test pins its output, but nothing shows that output accepted by the real engine. |
| `unreal` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `urdf` | preview | A golden test pins its output, but nothing shows that output accepted by the real engine. |
| `usd` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `usdz` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `visionos` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `vrchat` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `wasm` | preview | A golden test pins its output, but nothing shows that output accepted by the real engine. |
| `webgpu` | preview | A golden test pins its output, but nothing shows that output accepted by the real engine. |
| `world-shard` | preview | No golden test pins its output; nothing shows its output accepted by the real engine. |
| `3dtiles` | format-only | No known gaps at this tier. |
| `a2a-agent-card` | format-only | No known gaps at this tier. |
| `daimon-seed` | format-only | No known gaps at this tier. |
| `dtdl` | format-only | No known gaps at this tier. |
| `omnigent-agent-yaml` | format-only | No known gaps at this tier. |
| `scm` | format-only | No known gaps at this tier. |
| `code-editor` | experimental | No test checks this compiler. |
| `holob` | experimental | No test checks this compiler. |
| `onnx` | experimental | No test checks this compiler. |
| `openapi` | experimental | No test checks this compiler. |
| `stl-export` | experimental | No test checks this compiler. |
<!-- target-tiers:end -->
<!-- prettier-ignore-end -->

## Common targets (non-exhaustive)

| Target Flag                | File                                             | Output                          | Platform                                     |
| -------------------------- | ------------------------------------------------ | ------------------------------- | -------------------------------------------- |
| `--target unity`           | [unity.md](/compilers/unity)                     | C# MonoBehaviour                | Unity Engine                                 |
| `--target unreal`          | [unreal.md](/compilers/unreal)                   | C++ / Blueprint                 | Unreal Engine 5                              |
| `--target godot`           | [godot.md](/compilers/godot)                     | GDScript                        | Godot Engine 4.x                             |
| `--target vrchat`          | [vrchat.md](/compilers/vrchat)                   | Legacy UdonSharp C#; Byte gated | VRChat SDK3                                  |
| `--target babylon`         | babylon.md                                       | JavaScript                      | Babylon.js                                   |
| `--target webgpu`          | [webgpu.md](/compilers/webgpu)                   | TypeScript                      | Modern Browsers                              |
| `--target ios`             | [ios.md](/compilers/ios)                         | Swift + ARKit                   | iOS 15+                                      |
| `--target visionos`        | [vision-os.md](/compilers/vision-os)             | Swift + RealityKit              | Apple Vision Pro                             |
| `--target android`         | [android.md](/compilers/android)                 | Kotlin + ARCore                 | Android SDK 26+                              |
| `--target androidxr`       | [android-xr.md](/compilers/android-xr)           | Kotlin                          | Android XR                                   |
| `--target openxr`          | [openxr.md](/compilers/openxr)                   | C++                             | Cross-platform XR                            |
| `--target threejs`         | three-js.md                                      | JavaScript                      | Three.js / Web                               |
| `--target gltf`            | gltf.md                                          | GLB/glTF                        | Universal 3D                                 |
| `--target wasm`            | [wasm.md](/compilers/wasm)                       | WASM binary                     | WebAssembly / WasmEdge / Wasmtime (IoT edge) |
| `--target urdf`            | [robotics/urdf.md](/compilers/robotics/urdf)     | URDF XML                        | ROS 2                                        |
| `--target sdf`             | [robotics/sdf.md](/compilers/robotics/sdf)       | SDF XML                         | Gazebo                                       |
| `--target dtdl`            | [iot/dtdl.md](/compilers/iot/dtdl)               | DTDL JSON                       | Azure Digital Twins                          |
| `--target wot`             | [iot/wot.md](/compilers/iot/wot)                 | WoT TD JSON                     | W3C Web of Things                            |
| `--target playcanvas`      | [playcanvas.md](/compilers/playcanvas)           | JavaScript                      | PlayCanvas Engine                            |
| `--target ar`              | [ar.md](/compilers/ar)                           | TypeScript                      | Browser WebXR AR                             |
| `--target tsl`             | [tsl.md](/compilers/tsl)                         | WGSL                            | Trait Shader Language                        |
| `--target neuromorphic`    | [neuromorphic.md](/compilers/neuromorphic)       | NIR bytecode                    | Loihi2 / SpiNNaker                           |
| `--target a2a`             | [a2a.md](/compilers/a2a)                         | JSON Agent Card                 | Google A2A Protocol                          |
| `--target scm`             | [scm.md](/compilers/scm)                         | Python + dowhy                  | Causal AI                                    |
| `--target usd-physics`     | [usd-physics.md](/compilers/usd-physics)         | USD Physics JSON                | visionOS / Omniverse                         |
| `--target openxr-spatial`  | [openxr-spatial.md](/compilers/openxr-spatial)   | OpenXR JSON                     | AR/VR Anchoring                              |
| `--target ai-glasses`      | [ai-glasses.md](/compilers/ai-glasses)           | Platform SDK                    | Meta / Snap / Apple Glasses                  |
| `--target vr-reality`      | [vr-reality.md](/compilers/vr-reality)           | Phoenix WebXR                   | VRR Digital Twins                            |
| `--target nft-marketplace` | [nft-marketplace.md](/compilers/nft-marketplace) | Solidity + JS                   | NFT / Web3                                   |

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
