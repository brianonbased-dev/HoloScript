# @holoscript/core

> The **semantic engine** at the heart of HoloScript. Traits describe any domain entity — spatial, AI, services, IoT — and the compiler fleet translates them to platform-specific code. [Read the V6 Vision →](../../VISION.md)

Core parser, AST, compiler infrastructure, and trait system.

## Installation

```bash
npm install @holoscript/core
```

## Usage

```typescript
// Parse HoloScript+ files (.hsplus)
import { HoloScriptPlusParser } from '@holoscript/core';

const parser = new HoloScriptPlusParser();
const result = parser.parse(source);

// Parse .holo composition files
import { HoloCompositionParser } from '@holoscript/core';

const holoParser = new HoloCompositionParser();
const result = holoParser.parseHolo(source);

// Compile to a specific target
import { UnityCompiler } from '@holoscript/core';

const compiler = new UnityCompiler();
const output = compiler.compile(ast);
```

## Features

- **Multi-format Parser** - Supports `.hs`, `.hsplus`, and `.holo` files
- **Complete AST** - Full abstract syntax tree representation
- **Validation** - Comprehensive error checking with recovery
- **30+ Compile Targets** - Web (R3F, Babylon), Unity, Unreal, Godot, iOS, Android, Vision Pro, WebGPU, WASM, VRChat, OpenXR, URDF, DTDL, SDF
- **3,300+ Traits** - Modularized across 114 category files covering VR interactions, physics, networking, AI, scripting, automation, animation, nature, magic, sci-fi, emotions, and more
- **AI Integration** - Adapters for OpenAI, Anthropic, Gemini, Ollama, and more
- **Reactive State** - `reactive()`, `computed()`, `effect()`, `bind()`

## Parsers

| Parser                  | File Types | Use Case                                |
| ----------------------- | ---------- | --------------------------------------- |
| `HoloScriptPlusParser`  | `.hsplus`  | Extended syntax with TypeScript modules |
| `HoloCompositionParser` | `.holo`    | Scene-centric composition files         |
| `HoloScript2DParser`    | `.hs`      | Basic logic and protocols               |
| `HoloScriptParser`      | `.hs`      | Standard semantic parser                |

## Compilers (30+ implementations; verify live targets via health + ExportTarget enum)

| Compiler                 | Target                    | Output            |
| ------------------------ | ------------------------- | ----------------- |
| `UnityCompiler`          | Unity Engine              | C# + Prefab       |
| `UnrealCompiler`         | Unreal Engine 5           | C++ + Blueprint   |
| `GodotCompiler`          | Godot 4                   | GDScript + .tscn  |
| `R3FCompiler`            | React Three Fiber         | TSX + hooks       |
| `BabylonCompiler`        | Babylon.js                | TypeScript        |
| `PlayCanvasCompiler`     | PlayCanvas                | JavaScript        |
| `OpenXRCompiler`         | OpenXR Standard           | C++               |
| `VRChatCompiler`         | VRChat                    | UdonSharp C#      |
| `VisionOSCompiler`       | Apple Vision Pro          | Swift             |
| `AndroidXRCompiler`      | Android XR                | Kotlin            |
| `IOSCompiler`            | iOS / ARKit               | Swift             |
| `AndroidCompiler`        | Android / ARCore          | Kotlin            |
| `ARCompiler`             | Generic AR                | TypeScript        |
| `WASMCompiler`           | WebAssembly               | .wasm + .js       |
| `WebGPUCompiler`         | WebGPU Compute            | WGSL + TypeScript |
| `URDFCompiler`           | Robotics (URDF)           | .urdf XML         |
| `SDFCompiler`            | SDF / Gazebo              | .sdf XML          |
| `DTDLCompiler`           | Digital Twins             | JSON-LD           |
| `StateCompiler`          | Reactive State            | JSON              |
| `A2AAgentCardCompiler`   | A2A Agent Cards           | JSON              |
| `NIRCompiler`            | Neuromorphic IR           | JSON              |
| `VRRCompiler`            | Variable Rate Rendering   | TypeScript        |
| `Native2DCompiler`       | 2D HTML/CSS               | TSX + HTML        |
| `NodeServiceCompiler`    | Node.js Services          | TypeScript        |
| `AIGlassesCompiler`      | AI Glasses                | Kotlin Compose    |
| `GLTFPipeline`           | glTF                      | .glb / .gltf      |
| `NFTMarketplaceCompiler` | NFT Marketplace           | Solidity          |
| `USDPhysicsCompiler`     | USD Physics               | .usda             |
| `TSLCompiler`            | Three.js Shading Language | GLSL / WGSL       |
| `SCMCompiler`            | Structural Causal Model   | JSON DAG          |
| `QuiltCompiler`          | Looking Glass Hologram    | Multi-view PNG    |
| `MVHEVCCompiler`         | MV-HEVC Hologram          | Swift + .mov      |
| `FlatSemanticCompiler`   | Semantic 2D Layout        | TSX               |

## Trait System

VR traits are modularized into 115 category files under `src/traits/constants/`:

| Category        | File                     | Traits                                  |
| --------------- | ------------------------ | --------------------------------------- |
| Core VR         | `core-vr-interaction.ts` | grabbable, throwable, pointable, ...    |
| Humanoid        | `humanoid-avatar.ts`     | skeleton, body, face, ...               |
| Game Mechanics  | `game-mechanics.ts`      | collectible, destructible, healable, .. |
| Magic & Fantasy | `magic-fantasy.ts`       | enchantable, cursed, blessed, ...       |
| Animals         | `animals.ts`             | cat, dog, horse, dragon, ...            |
| ...             | _58 more categories_     | See `src/traits/constants/index.ts`     |

Import individual categories or the combined set:

```typescript
import { VR_TRAITS } from '@holoscript/core'; // All 3,300+ traits
import { AUDIO_TRAITS } from '@holoscript/core'; // Just audio traits
import { MAGIC_FANTASY_TRAITS } from '@holoscript/core'; // Just magic/fantasy
```

## Language Features

HoloScript v4.1 adds five production-ready language features. See [LANGUAGE_FEATURES.md](../../docs/LANGUAGE_FEATURES.md) for the full reference.

### Module System (`@import` / `@export`)

```holoscript
@import { PhysicsSystem, Gravity } from './physics.hs'
@import * as UI from './ui-components.hs'

@export PhysicsSystem
```

### Trait Composition

```holoscript
// Compose multiple traits into one named trait
@HoverVehicle = @physics + @navmesh + @propulsion
@Warrior = @combat + @inventory + @stats
```

```typescript
import { TraitCompositionCompiler, TraitComposer } from '@holoscript/core';

// Low-level API
const compiler = new TraitCompositionCompiler();
const [hovercraft] = compiler.compile(
  [{ name: 'Hovercraft', components: ['physics', 'navmesh'], overrides: { gravity: 0.1 } }],
  (name) => registry.get(name),
  traitGraph
);

// High-level composer (with lifecycle dispatch)
const composer = new TraitComposer(graph);
const result = composer.compose('Warrior', handlers, ['combat', 'inventory', 'stats']);
// result.handler.onAttach dispatches to all in order; onDetach is reversed
```

### Reactive State

```holoscript
@state {
  hp: 100,
  shield: 50,
}
```

```typescript
import { reactive, computed, effect } from '@holoscript/core';

const state = reactive({ hp: 100 });
const isAlive = computed(() => state.hp > 0);
effect(() => console.log('HP changed:', state.hp));
```

### LLM Agent Trait

```holoscript
@llm_agent {
  model: "gpt-4",
  system_prompt: "You are a game NPC",
  tools: [{ name: "move", ... }],
  bounded_autonomy: true,
  max_actions_per_turn: 3,
}
```

### Gaussian Splat Trait

```holoscript
@gaussian_splat {
  source: "./assets/scene.ply",
  quality: "ultra",
  sh_degree: 3,
  sort_mode: "distance",
  streaming: true,
}
```

## Codebase Intelligence (GraphRAG)

Built-in pipeline for semantic code analysis:

```
CodebaseScanner → CodebaseGraph → EmbeddingIndex → GraphRAGEngine
```

| Class                   | File                              | Purpose                                                              |
| ----------------------- | --------------------------------- | -------------------------------------------------------------------- |
| `CodebaseScanner`       | `src/codebase/CodebaseScanner.ts` | Scan repositories, extract symbols/imports/calls                     |
| `CodebaseGraph`         | `src/codebase/CodebaseGraph.ts`   | Graph of nodes (symbols) + edges (dependencies), community detection |
| `EmbeddingIndex`        | `src/codebase/EmbeddingIndex.ts`  | Vector index (OpenAI/BM25/Ollama), binary cache for 42x speedup      |
| `GraphRAGEngine`        | `src/codebase/GraphRAGEngine.ts`  | Graph traversal + semantic search + LLM synthesis                    |
| `CodebaseSceneCompiler` | `src/codebase/visualization/`     | 3D visualization of codebase graphs                                  |

```typescript
import { CodebaseScanner, CodebaseGraph, EmbeddingIndex, GraphRAGEngine } from '@holoscript/core';

const scanner = new CodebaseScanner();
const graph = await scanner.scan('./src');
const index = new EmbeddingIndex();
await index.buildIndex(graph);
const engine = new GraphRAGEngine(graph, index);
const answer = await engine.queryWithLLM('How does the parser work?');
```

## Runtime & ECS

| Class             | File                                      | Purpose                                       |
| ----------------- | ----------------------------------------- | --------------------------------------------- |
| `SceneRunner`     | `src/runtime/SceneRunner.ts`              | Walks AST, spawns entities, runs compositions |
| `HeadlessRuntime` | `src/runtime/profiles/HeadlessRuntime.ts` | No-GUI execution for tests/CI/servers         |
| `RuntimeBridge`   | `src/runtime/RuntimeBridge.ts`            | Connects SceneRunner to renderers             |
| `RuntimeRenderer` | `src/runtime/RuntimeRenderer.ts`          | PBR materials, particle systems, post-FX      |

## MCP Integration

Two MCP layers:

- **External** (`packages/mcp-server`): Exposes `holo_absorb_repo`, `holo_query_codebase`, `holo_semantic_search` for AI agents
- **Internal** (`src/mcp/` + `src/agents/spatial-comms/`): `MCPOrchestrator`, `Layer3MCPClient`, `SPATIAL_MCP_TOOLS` for agent-to-agent spatial comm

## Smart Assets

| Class              | File                             | Purpose                                                               |
| ------------------ | -------------------------------- | --------------------------------------------------------------------- |
| `SmartAssetLoader` | `src/assets/SmartAssetLoader.ts` | Load/configure/bundle assets with `load()`, `doLoad()`, `getConfig()` |
| `LoaderConfig`     | `src/assets/SmartAssetLoader.ts` | Configuration interface for asset loading                             |

## Extension System

| Class                | File                                   | Purpose                             |
| -------------------- | -------------------------------------- | ----------------------------------- |
| `ExtensionRegistry`  | `src/extensions/ExtensionRegistry.ts`  | Register and load plugin extensions |
| `ExtensionInterface` | `src/extensions/ExtensionInterface.ts` | Extension lifecycle context         |

> **Note**: "Extension" has multiple meanings in the codebase — plugin extensions (`ExtensionRegistry`), glTF extensions (`GLTFTrait`), LSP file extensions (`ImportResolver.EXTENSIONS`), and OpenXR required extensions. See [Extension System Architecture](../../docs/architecture/EXTENSION_SYSTEM.md).

## License

MIT
