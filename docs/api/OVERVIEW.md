# HoloScript API Reference

**Version:** 3.4.0 | **License:** MIT | [GitHub](https://github.com/brianonbased-dev/HoloScript)

---

HoloScript is an AI-native, declarative spatial computing language that compiles to 18+ platforms. This API reference covers the TypeScript runtime, trait system, security, AI validation, and tooling packages.

## Quick Navigation

| Package                                             | Description             | Key APIs                                                |
| --------------------------------------------------- | ----------------------- | ------------------------------------------------------- |
| [`@holoscript/core`](#core)                         | Runtime, parser, traits | `HoloScriptPlusParser`, `TraitHandler`, `ReactiveState` |
| [`@holoscript/cli`](#cli)                           | Command-line tools      | `compile`, `validate`, `build`                          |
| [`@holoscript/mcp-server`](#mcp-server)             | AI agent integration    | `handleTool`, MCP protocol                              |
| [`@holoscript/security-sandbox`](#security-sandbox) | VM isolation            | `HoloScriptSandbox`, `executeSafely`                    |
| [`@holoscript/ai-validator`](#ai-validator)         | Hallucination detection | `AIValidator`, `validateAICode`                         |
| [`@holoscript/comparative-benchmarks`](#benchmarks) | Performance comparison  | `ComparativeBenchmarks`, `runComparativeBenchmarks`     |
| [`@holoscript/partner-sdk`](#partner-sdk)           | Partner integrations    | `PartnerSDK`, `WebhookHandler`                          |

---

## Core Concepts

### 1. HoloScript Language

HoloScript uses a declarative syntax with **traits** that define object behavior:

```holoscript
sphere {
  @color(blue)           // Visual trait
  @position(0, 2, 0)    // Spatial trait
  @physics               // Physics simulation
  @grabbable             // VR interaction
  @networked             // Multi-user sync

  cube {
    @color(red)
    @scale(0.5, 0.5, 0.5)
  }
}
```

### 2. Trait System

Traits are the building blocks of HoloScript objects. Each trait:

- Has a **name** (e.g., `@grabbable`)
- Accepts optional **parameters** (e.g., `@color(red)`)
- Implements **lifecycle hooks** (`onAttach`, `onUpdate`, `onEvent`, `onDetach`)

**Trait Categories:**

| Category    | Examples                                                  |
| ----------- | --------------------------------------------------------- |
| Interaction | `@grabbable`, `@clickable`, `@hoverable`, `@throwable`    |
| Physics     | `@physics`, `@rigidbody`, `@collidable`, `@gravity`       |
| Visual      | `@color`, `@material`, `@glowing`, `@emissive`, `@shader` |
| Networking  | `@networked`, `@synced`, `@persistent`, `@owned`          |
| Spatial     | `@position`, `@rotation`, `@scale`, `@anchor`             |
| Audio       | `@spatial_audio`, `@ambient`, `@hrtf`                     |
| AI/ML       | `@llm_agent`, `@behavior_tree`, `@npc_brain`              |
| XR          | `@hand_tracking`, `@eye_tracked`, `@body_tracking`        |

### 3. Lifecycle Hooks

```typescript
interface TraitHandler<TConfig> {
  name: VRTraitName;
  defaultConfig: TConfig;

  onAttach?: (node, config, context) => void; // Called when trait is added
  onDetach?: (node, config, context) => void; // Called when trait is removed
  onUpdate?: (node, config, context, delta) => void; // Called each frame
  onEvent?: (node, config, context, event) => void; // Called on events
}
```

### 4. Creating Custom Traits

```typescript
import { TraitHandler, TraitContext } from '@holoscript/core';

const MyCustomTrait: TraitHandler<{ intensity: number }> = {
  name: '@my_custom_trait' as any,
  defaultConfig: { intensity: 1.0 },

  onAttach(node, config, context) {
    // Initialize your trait
    console.log(`Attached with intensity: ${config.intensity}`);
    context.emit('trait_attached', { traitName: '@my_custom_trait' });
  },

  onUpdate(node, config, context, delta) {
    // Update every frame (delta in seconds)
    const pulse = Math.sin(Date.now() * 0.001) * config.intensity;
    // Apply pulse effect...
  },

  onEvent(node, config, context, event) {
    if (event.type === 'grab') {
      config.intensity *= 2; // Double intensity on grab
    }
  },

  onDetach(node, config, context) {
    // Cleanup
    console.log('Trait detached');
  },
};
```

---

## Core Package (`@holoscript/core`) {#core}

### Parser API

```typescript
import { HoloScriptPlusParser, parseHolo, parseHoloStrict } from '@holoscript/core';

// Quick parse (lenient)
const ast = parseHolo(holoScriptCode);

// Strict parse (throws on any error)
const strictAst = parseHoloStrict(holoScriptCode);

// Parser instance (for custom options)
const parser = new HoloScriptPlusParser();
const result = parser.parse(code, { strict: true });
```

### Runtime API

```typescript
import { HoloScriptPlusRuntimeImpl } from '@holoscript/core';

const runtime = new HoloScriptPlusRuntimeImpl(ast, {
  renderer: myRenderer,
  vrEnabled: true,
  companions: { robot: robotAPI },
});

// Mount the scene
await runtime.mount(document.getElementById('scene'));

// Lifecycle
runtime.update(deltaTime);
runtime.unmount();
```

### Reactive State API

```typescript
import { createState, ReactiveState } from '@holoscript/core';

const state = createState({ score: 0, lives: 3 });

// Subscribe to changes
state.subscribe('score', (newValue) => {
  console.log('Score changed:', newValue);
});

// Update state
state.set('score', state.get('score') + 100);
```

---

## Security Sandbox (`@holoscript/security-sandbox`) {#security-sandbox}

Provides isolated VM execution for untrusted code.

```typescript
import { HoloScriptSandbox, executeSafely } from '@holoscript/security-sandbox';

const sandbox = new HoloScriptSandbox({
  timeout: 3000, // 3 second limit
  memoryLimit: 64, // 64 MB limit
  enableLogging: true, // Audit trail
});

// Execute AI-generated code safely
const result = await sandbox.executeHoloScript(aiCode, {
  source: 'ai-generated',
});

if (!result.success) {
  console.error(`[${result.error.type}] ${result.error.message}`);
}

// Review security logs
const stats = sandbox.getSecurityStats();
console.log(`Executed: ${stats.executed}, Rejected: ${stats.rejected}`);
```

---

## AI Validator (`@holoscript/ai-validator`) {#ai-validator}

Validates AI-generated HoloScript for hallucinations and syntax errors.

```typescript
import { AIValidator, validateAICode } from '@holoscript/ai-validator';

const validator = new AIValidator({
  provider: 'anthropic',
  hallucinationThreshold: 50,
  strict: false,
});

const result = await validator.validate(aiGeneratedCode);

if (!result.valid) {
  // Use errors to regenerate with LLM
  const feedback = result.errors.map((e) => `${e.message}\n  Fix: ${e.suggestion}`);
  console.log('Feedback for LLM:', feedback.join('\n'));
}

// Hallucination score: 0-100 (higher = more suspicious)
console.log(`Hallucination score: ${result.metadata.hallucinationScore}`);
```

---

## Comparative Benchmarks (`@holoscript/comparative-benchmarks`) {#benchmarks}

Performance comparison against Unity and glTF runtimes.

```typescript
import { runComparativeBenchmarks } from '@holoscript/comparative-benchmarks';

const { results, report } = await runComparativeBenchmarks({
  iterations: 1000,
  targets: ['holoscript', 'unity', 'gltf'],
});

// Summary: HoloScript wins 5/5 benchmarks
// - 2.3x faster than Unity
// - 1.7x faster than glTF
console.log(report);
```

---

## MCP Server (`@holoscript/mcp-server`) {#mcp-server}

Model Context Protocol server for AI agent integration (34 tools).

```typescript
// MCP tools available:
// parse_hs, parse_holo, validate_holoscript
// list_traits, explain_trait, suggest_traits
// generate_object, generate_scene
// get_syntax_reference, get_examples
// explain_code, analyze_code
// compile_target, list_targets
// ... and 20+ more
```

**Configuration:** Add to Claude/Cursor MCP config:

```json
{
  "mcpServers": {
    "holoscript": {
      "command": "npx",
      "args": ["-y", "@holoscript/mcp-server"]
    }
  }
}
```

---

## Export Targets

HoloScript compiles to **18+ platforms**:

| Platform   | Package                         | Use Case       |
| ---------- | ------------------------------- | -------------- |
| WebXR      | `@holoscript/adapter-webxr`     | Browser VR/AR  |
| Unity      | `@holoscript/adapter-unity`     | Unity Engine   |
| Unreal     | `@holoscript/adapter-unreal`    | Unreal Engine  |
| Godot      | `@holoscript/adapter-godot`     | Godot Engine   |
| Three.js   | `@holoscript/adapter-threejs`   | Web 3D         |
| Babylon.js | `@holoscript/adapter-babylonjs` | WebGL          |
| URDF       | `@holoscript/adapter-urdf`      | ROS Robotics   |
| SDF        | `@holoscript/adapter-sdf`       | Gazebo Sim     |
| glTF       | `@holoscript/adapter-gltf`      | 3D Interchange |
| FBX        | `@holoscript/adapter-fbx`       | Autodesk       |
| OBJ        | `@holoscript/adapter-obj`       | Universal 3D   |

---

## Getting Help

- [GitHub Issues](https://github.com/brianonbased-dev/HoloScript/issues)
- [GitHub Discussions](https://github.com/brianonbased-dev/HoloScript/discussions)
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [Security Policy](../../SECURITY.md)

---

_API Reference generated with TypeDoc v0.26 · HoloScript v3.4.0_
