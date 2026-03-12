# @holoscript/core

Core HoloScript parser, AST, compiler infrastructure, and trait system.

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
- **15+ Compile Targets** - Web (R3F, Babylon), Unity, Unreal, Godot, iOS, Android, Vision Pro, WebGPU, WASM, VRChat, OpenXR, URDF, DTDL, SDF
- **2,000+ Traits** - Modularized across 74 category files covering VR interactions, physics, networking, AI, animation, nature, magic, sci-fi, emotions, and more
- **AI Integration** - Adapters for OpenAI, Anthropic, Gemini, Ollama, and more
- **Reactive State** - `reactive()`, `computed()`, `effect()`, `bind()`

## Parsers

| Parser                  | File Types | Use Case                                |
| ----------------------- | ---------- | --------------------------------------- |
| `HoloScriptPlusParser`  | `.hsplus`  | Extended syntax with TypeScript modules |
| `HoloCompositionParser` | `.holo`    | Scene-centric composition files         |
| `HoloScript2DParser`    | `.hs`      | Basic logic and protocols               |
| `HoloScriptParser`      | `.hs`      | Legacy parser                           |

## Compilers

| Compiler            | Target                  | Status     |
| ------------------- | ----------------------- | ---------- |
| `R3FCompiler`       | React Three Fiber (Web) | Production |
| `BabylonCompiler`   | Babylon.js (Web)        | Production |
| `UnityCompiler`     | Unity Engine            | Production |
| `UnrealCompiler`    | Unreal Engine 5         | Production |
| `GodotCompiler`     | Godot 4                 | Production |
| `IOSCompiler`       | iOS / ARKit             | Production |
| `AndroidCompiler`   | Android / ARCore        | Production |
| `VisionOSCompiler`  | Apple Vision Pro        | Production |
| `WebGPUCompiler`    | WebGPU Compute          | Production |
| `WASMCompiler`      | WebAssembly             | Production |
| `VRChatCompiler`    | VRChat                  | Alpha      |
| `OpenXRCompiler`    | OpenXR Standard         | Production |
| `AndroidXRCompiler` | Android XR              | Production |
| `URDFCompiler`      | Robotics (URDF)         | Production |
| `DTDLCompiler`      | Digital Twins (DTDL)    | Production |
| `SDFCompiler`       | SDF Robotics            | Production |

## Trait System

VR traits are modularized into 74 category files under `src/traits/constants/`:

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
import { VR_TRAITS } from '@holoscript/core'; // All 2,000+ traits
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

## License

MIT
