# HoloScript Language Interoperability Architecture

> **HoloScript is a 22-connection language interop hub** that compiles from a single source language to 15+ target languages/formats spanning VR/AR/XR, web, mobile, robotics, IoT, and AI ecosystems.

---

## Executive Summary

HoloScript's architecture mirrors the best patterns from the broader language interop world:

| Pattern                        | Industry Parallel                | HoloScript Implementation           |
| ------------------------------ | -------------------------------- | ----------------------------------- |
| Write once, compile everywhere | Slang (shader cross-compilation) | Single AST → 15+ platform compilers |
| Universal scene interchange    | OpenUSD, glTF                    | JSON AST as bridge format           |
| Polyglot composition           | WASM Component Model             | Rust/WASM + TypeScript dual parser  |
| AI tool integration            | MCP Protocol                     | `@holoscript/mcp-server` package    |
| Editor integration             | Language Server Protocol         | `@holoscript/lsp` package           |

---

## The Seven Interop Dimensions

### 1. Game Engine Compilation (VR/Gaming)

| Compiler         | Target Language | Target Platform       | Output                                     |
| ---------------- | --------------- | --------------------- | ------------------------------------------ |
| `UnityCompiler`  | C#              | Unity (URP)           | MonoBehaviour, GameObjects, DOTween        |
| `UnrealCompiler` | C++             | Unreal Engine 5.0-5.4 | AActor, UPROPERTY, Niagara, Enhanced Input |
| `GodotCompiler`  | GDScript        | Godot 4.0-4.3         | Node3D, MeshInstance3D, RigidBody3D        |
| `VRChatCompiler` | UdonSharp/C#    | VRChat SDK3           | Udon scripts, VRC_Pickup, Prefabs          |

**Location:** `packages/core/src/compiler/`

### 2. Web/Graphics Runtime (Browser)

| Compiler          | Target                | Output                                       |
| ----------------- | --------------------- | -------------------------------------------- |
| `BabylonCompiler` | Babylon.js/TypeScript | Scene, MeshBuilder, PBRMaterial, XR setup    |
| `WebGPUCompiler`  | WebGPU/WGSL           | Device init, WGSL shaders, compute pipelines |
| `BrowserRuntime`  | Three.js              | Live execution with 50+ trait handlers       |

**Location:** `packages/core/src/compiler/`, `packages/runtime/src/browser/`

### 3. Apple/Android XR (Mobile Platforms)

| Compiler            | Target Language | Framework                               |
| ------------------- | --------------- | --------------------------------------- |
| `VisionOSCompiler`  | Swift           | RealityKit, ImmersiveSpace, ModelEntity |
| `AndroidXRCompiler` | Kotlin          | Jetpack XR, ARCore, SceneCore, Filament |

**Location:** `packages/core/src/compiler/`

### 4. Industrial/Robotics (Beyond VR)

| Compiler       | Target Format | Domain                               |
| -------------- | ------------- | ------------------------------------ |
| `URDFCompiler` | URDF XML      | ROS 2 / Gazebo robotics simulation   |
| `SDFCompiler`  | SDF XML       | Gazebo simulation (richer than URDF) |
| `DTDLCompiler` | DTDL v3 JSON  | Azure Digital Twins                  |

**Key Insight:** HoloScript reaches beyond VR/AR/XR into the industrial ecosystem:

- **URDF**: Objects → robot links, physics traits → inertial properties, constraints → joints
- **SDF**: Full world export with physics engine selection (ODE, Bullet, DART)
- **DTDL**: Templates → Interfaces, state → Properties, event handlers → Commands

**Location:** `packages/core/src/compiler/`

### 5. 3D Standards Interchange

| Pipeline       | Target Format | Consumers                                         |
| -------------- | ------------- | ------------------------------------------------- |
| `USDZPipeline` | USDA (ASCII)  | Apple ecosystem, Pixar, Autodesk, OpenUSD readers |

**Pipeline:** `HoloScript AST → USDA text → usdz_converter → .usdz`

**Location:** `packages/core/src/compiler/USDZPipeline.ts`

### 6. AI/Agent Integration

| System                   | Technology             | Purpose                                      |
| ------------------------ | ---------------------- | -------------------------------------------- |
| `@holoscript/mcp-server` | Model Context Protocol | AI agents parse/validate/generate HoloScript |
| AI Adapters              | OpenAI, Anthropic APIs | LLM-powered code generation                  |
| `SemanticSearchService`  | Vector search          | Semantic code search                         |
| `TrainingDataGenerator`  | JSONL output           | Fine-tuning data generation                  |

**Location:** `packages/mcp-server/`, `packages/core/src/ai/`

### 7. IoT/Protocol Layer

| System                      | Standard        | Purpose                      |
| --------------------------- | --------------- | ---------------------------- |
| `ThingDescriptionGenerator` | W3C WoT TD v1.1 | Export objects as IoT Things |
| `MQTTClient`                | MQTT 3.1.1/5.0  | Pub/sub messaging for IoT    |
| `DTDLCompiler`              | Azure DTDL v3   | Digital twin models          |

**Location:** `packages/core/src/wot/`, `packages/core/src/runtime/protocols/`

---

## Complete Language Interop Matrix

### Outbound Compilation (HoloScript → Target)

| Source     | Target      | Mechanism                 | Location                                          |
| ---------- | ----------- | ------------------------- | ------------------------------------------------- |
| HoloScript | C#          | UnityCompiler             | `packages/core/src/compiler/UnityCompiler.ts`     |
| HoloScript | C++         | UnrealCompiler            | `packages/core/src/compiler/UnrealCompiler.ts`    |
| HoloScript | Swift       | VisionOSCompiler          | `packages/core/src/compiler/VisionOSCompiler.ts`  |
| HoloScript | Kotlin      | AndroidXRCompiler         | `packages/core/src/compiler/AndroidXRCompiler.ts` |
| HoloScript | GDScript    | GodotCompiler             | `packages/core/src/compiler/GodotCompiler.ts`     |
| HoloScript | UdonSharp   | VRChatCompiler            | `packages/core/src/compiler/VRChatCompiler.ts`    |
| HoloScript | TypeScript  | BabylonCompiler           | `packages/core/src/compiler/BabylonCompiler.ts`   |
| HoloScript | WGSL        | WebGPUCompiler            | `packages/core/src/compiler/WebGPUCompiler.ts`    |
| HoloScript | WAT/WASM    | WASMCompiler              | `packages/compiler-wasm/`                         |
| HoloScript | USDA        | USDZPipeline              | `packages/core/src/compiler/USDZPipeline.ts`      |
| HoloScript | URDF XML    | URDFCompiler              | `packages/core/src/compiler/URDFCompiler.ts`      |
| HoloScript | SDF XML     | SDFCompiler               | `packages/core/src/compiler/SDFCompiler.ts`       |
| HoloScript | DTDL JSON   | DTDLCompiler              | `packages/core/src/compiler/DTDLCompiler.ts`      |
| HoloScript | WoT TD JSON | ThingDescriptionGenerator | `packages/core/src/wot/`                          |
| HoloScript | JSON AST    | Parser (TS + Rust)        | `packages/core/`, `packages/compiler-wasm/`       |

### Bidirectional Integrations

| Integration     | Protocol           | Direction         | Location                               |
| --------------- | ------------------ | ----------------- | -------------------------------------- |
| TypeScript API  | `@holoscript/core` | ↔️ Bidirectional  | `packages/core/`                       |
| Rust/WASM       | `@holoscript/wasm` | ↔️ Parse/Validate | `packages/compiler-wasm/`              |
| AI Agents       | MCP Protocol       | ↔️ Tool-based     | `packages/mcp-server/`                 |
| IDE Integration | LSP                | ↔️ Full IDE       | `packages/lsp/`                        |
| Database        | PostgreSQL         | ↔️ Persistence    | `packages/adapter-postgres/`           |
| IoT Messaging   | MQTT               | ↔️ Pub/Sub        | `packages/core/src/runtime/protocols/` |
| Live Runtime    | Three.js           | ↔️ Execution      | `packages/runtime/src/browser/`        |

**Total unique language/format connections: 22**

---

## Dual Parser Architecture

```
HoloScript Source (.hs / .hsplus / .holo)
         │
    ┌────┴────┐
    │         │
TypeScript   Rust/WASM
  Parser      Parser
    │         │
    ▼         ▼
HoloComposition   JSON AST
    AST       (serde)
    │         │
    └────┬────┘
         │
    JSON AST (Universal Bridge)
         │
    ┌────┼────┬────┬────┬────┐
    │    │    │    │    │    │
  Unity Unreal WebGPU URDF DTDL ... (15+ targets)
```

**Key Implementation Details:**

1. **TypeScript Parser** (`packages/core/src/parser/`): Primary parser, full feature support
2. **Rust/WASM Parser** (`packages/compiler-wasm/`): 10x faster, JSON output via `serde`
3. **Universal Bridge**: JSON AST enables any language to consume HoloScript parse results

### WASM Parser API

```rust
// packages/compiler-wasm/src/lib.rs
#[wasm_bindgen]
pub fn parse(source: &str) -> String;       // Returns JSON AST

#[wasm_bindgen]
pub fn parse_pretty(source: &str) -> String; // Pretty-printed JSON

#[wasm_bindgen]
pub fn validate(source: &str) -> String;     // Validation result

#[wasm_bindgen]
pub fn validate_detailed(source: &str) -> String; // Detailed diagnostics
```

---

## Trait-to-Platform Mapping

Abstract traits map to platform-specific implementations:

| HoloScript Trait | Unity                | visionOS                | Godot               | URDF/ROS 2    |
| ---------------- | -------------------- | ----------------------- | ------------------- | ------------- |
| `@physics`       | Rigidbody            | PhysicsBodyComponent    | RigidBody3D         | `<inertial>`  |
| `@grabbable`     | XR_Grab_Interactable | DragGesture             | XRController3D      | —             |
| `@audio`         | AudioSource          | AudioFileResource       | AudioStreamPlayer3D | —             |
| `@material`      | Material(URP)        | PhysicallyBasedMaterial | StandardMaterial3D  | —             |
| `@collision`     | Collider             | CollisionComponent      | CollisionShape3D    | `<collision>` |

---

## Package Ecosystem

| Package                       | Purpose                  | Interop Role         |
| ----------------------------- | ------------------------ | -------------------- |
| `@holoscript/core`            | Parser, compilers, AST   | Source of truth      |
| `@holoscript/runtime`         | Execution engines        | Live runtime         |
| `@holoscript/cli`             | Command-line interface   | Build orchestration  |
| `@holoscript/lsp`             | Language Server          | IDE integration      |
| `@holoscript/mcp-server`      | AI tool server           | Agent integration    |
| `@holoscript/compiler-wasm`   | Rust/WASM parser         | 10x performance      |
| `@holoscript/partner-sdk`     | API, webhooks, analytics | Partner integration  |
| `@holoscript/std`             | Standard library         | Trait definitions    |
| `@holoscript/marketplace-api` | Trait registry           | Package distribution |

---

## Industry Alignment

| HoloScript Pattern                 | Industry Parallel             | Similarity                    |
| ---------------------------------- | ----------------------------- | ----------------------------- |
| Single source → multiple compilers | Slang shader language         | Write once, deploy everywhere |
| Scene graph AST as interchange     | OpenUSD / glTF                | Universal scene description   |
| WASM parser for polyglot embedding | WASM Component Model          | Language-neutral computation  |
| MCP server for AI integration      | Model Context Protocol        | Tool-use interface for agents |
| LSP for editor support             | Language Server Protocol      | Universal IDE integration     |
| Trait-based composition            | ECS (Flecs, Bevy, Unity DOTS) | Component over inheritance    |

---

## Expansion Vectors (Roadmap)

### Priority 1: glTF/GLB Export

- **Gap**: No direct glTF export despite being the web's universal 3D format
- **Solution**: Add `GLTFPipeline` using `@gltf-transform/core`
- **Impact**: Three.js, Babylon.js, A-Frame, PlayCanvas, Cesium

### Priority 2: Python Bindings

- **Gap**: Robotics/ML workflows heavily use Python
- **Solution**: Expose `@holoscript/wasm` via Python's `wasmer` or `wasmtime`
- **Impact**: ROS 2, PyBullet, Isaac Sim, Jupyter notebooks

### Priority 3: Tree-sitter Grammar

- **Gap**: LSP covers VS Code/Neovim but not Zed, Helix, Emacs
- **Solution**: Write `tree-sitter-holoscript` grammar
- **Impact**: 10+ additional editors, Semgrep SAST

### Priority 4: Bidirectional Import

- **Gap**: All compilation is HoloScript → target, never reverse
- **Solution**: Unity `.unity` / Godot `.tscn` / glTF → HoloScript converters
- **Impact**: Migration path for existing projects

### Priority 5: WASM Component Model

- **Gap**: Current WASM compiler emits WAT; no Component Model support
- **Solution**: WASI Preview 3 + WIT interfaces
- **Impact**: True polyglot composition

---

## Key Insights

### W.001: AST is the Keystone

HoloScript's power is in its AST - a single parsed representation fans out to 15+ compilation targets spanning VR, web, mobile, robotics, IoT, and AI.

### W.002: JSON AST Bridge

The JSON AST is the universal bridge - TypeScript emits it, Rust/WASM emits it, and any consumer language can read it. This is the interop keystone.

### W.003: Beyond VR/XR

HoloScript reaches far beyond VR/AR/XR:

- **Robotics**: URDF/SDF for ROS 2/Gazebo
- **Industrial IoT**: DTDL for Azure Digital Twins, WoT for W3C, MQTT for messaging
- **AI**: MCP for agent integration

---

## References

### Specifications

- [OpenUSD Core Specification 1.0](https://openusd.org/release/intro.html) (AOUSD, Dec 2025)
- [Model Context Protocol](https://modelcontextprotocol.io/specification/2025-11-25)
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [W3C Web of Things](https://www.w3.org/WoT/)
- [WASM Component Model](https://component-model.bytecodealliance.org/)

### Industry Parallels

- [Slang Shading Language](http://shader-slang.org/)
- [Flecs ECS](https://github.com/SanderMertens/flecs)
- [glTF Transform](https://gltf-transform.dev/)

---

_Last updated: 2026-02-09_
_Source: uAA2++ Protocol Research Phase_
