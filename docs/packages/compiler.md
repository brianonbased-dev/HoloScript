# @holoscript/compiler

**HoloScript compilation engine.** Transforms semantic trait specifications into platform-native code across 30+ targets.

## Overview

The compiler translates HoloScript's trait-based semantic layer into optimized code for any platform:

- **25+ programming languages** (Go, C#, Python, Rust, C++, TypeScript, Swift, Kotlin, etc.)
- **5+ game engines** (Unity, Unreal, Godot, PlayCanvas, Babylon.js)
- **Web formats** (WebGPU, Three.js, Babylon, Cesium)
- **Robotics** (ROS 2, Gazebo, URDF)
- **IoT & digital twins** (DTDL, WoT, CoAP)
- **Enterprise formats** (GraphQL schema, OpenAPI, Protocol Buffers)
- **AR/XR platforms** (visionOS, ARKit, OpenXR, ARCore)

## Installation

```bash
npm install @holoscript/compiler
# or use @holoscript/core which includes the compiler
npm install @holoscript/core
```

## Basic Usage

```typescript
import { compileHoloScript, listCompilers } from '@holoscript/compiler';
import { parseComposition } from '@holoscript/core';

// Parse scene
const source = `
  composition "MyGame" {
    template "Player" { @grabbable geometry: "humanoid" }
    object "Hero" using "Player" { position: [0, 1, 0] }
  }
`;
const ast = parseComposition(source);

// Compile to Unity
const unityOutput = await compileHoloScript(ast, { target: 'unity' });
console.log(unityOutput.code);

// Or compile to multiple targets
const targets = ['unity', 'godot', 'webgpu'];
const results = await Promise.all(
  targets.map(target => compileHoloScript(ast, { target }))
);
```

## Compiler List

### Game Engines

| Target | Language | Output |
|--------|----------|--------|
| `unity` | C# | UnityEngine code + prefabs |
| `unreal` | C++ | Unreal Blueprints / C++ |
| `godot` | GDScript | Godot scene files (.tscn) |
| `playcanvas` | JavaScript | PlayCanvas Entity components |
| `babylon` | TypeScript | Babylon.js scene graph |

### Web Platforms

| Target | Language | Output |
|--------|----------|--------|
| `webgpu` | TypeScript | WebGPU compute shaders + scene |
| `three` | JavaScript | Three.js object tree |
| `babylon-web` | TypeScript | Babylon.js web deployment |
| `cesium` | JavaScript | Cesium.js 3D geospatial |
| `wasm` | Rust | WebAssembly (.wasm module) |

### VR/AR Platforms

| Target | Language | Output |
|--------|----------|--------|
| `visionos` | Swift | SwiftUI + RealityKit |
| `openxr` | C++ | OpenXR-compliant plugin |
| `quest` | C# | Meta Quest SDK (Unity) |
| `arcore` | Kotlin | Google ARCore app |
| `arkit` | Swift | Apple ARKit scene |

### Robotics & IoT

| Target | Language | Output |
|--------|----------|--------|
| `ros2` | Python | ROS 2 node stubs |
| `gazebo` | XML | Gazebo SDF simulation |
| `urdf` | XML | URDF robot model |
| `dtdl` | JSON | Azure DTDL schema |
| `mqtt` | Python | MQTT client code |

### Services & APIs

| Target | Language | Output |
|--------|----------|--------|
| `graphql` | GraphQL | Schema + resolvers |
| `openapi` | YAML | OpenAPI 3.0 spec |
| `protobuf` | Protobuf | Protocol Buffers (.proto) |
| `nodejs` | TypeScript | Express.js server |
| `python` | Python | FastAPI backend |

## Compilation Options

```typescript
const options = {
  target: 'unity',              // Required: target platform
  
  // Optimization
  optimize: 'balanced',         // 'off' | 'balanced' | 'aggressive'
  inlineProperties: true,       // Inline simple properties
  removeDeadCode: true,         // Remove unused objects/traits
  
  // Output
  outputFormat: 'esm',          // 'cjs' | 'esm' | 'umd'
  minify: false,                // Minify output code
  sourceMaps: false,            // Generate source maps
  
  // Customization
  namespace: 'MyGame',          // Namespace/module name
  baseClass: 'GameObject',      // Custom base class (if applicable)
  traits: ['@grabbable'],       // Only include these traits
  
  // Platform-specific
  engineVersion: '2022.3',      // For Unity/Unreal/Godot
  platform: 'editor',           // 'editor' | 'runtime' | 'standalone'
  
  // Debug
  debug: false,                 // Keep debug symbols
  verbose: false                // Detailed compilation log
};

const output = await compileHoloScript(ast, options);
```

## Output Structure

Each compiler produces a standard output object:

```typescript
interface CompilationResult {
  code: string;                 // Generated source code
  files: {                      // If multi-file output
    [filename: string]: string
  };
  assets: {                     // Generated assets
    [assetName: string]: Uint8Array
  };
  sourceMap?: string;           // Source map if enabled
  diagnostics: Diagnostic[];    // Warnings/errors
  metadata: {
    target: string;
    language: string;
    linesOfCode: number;
    compilationTime: number;
  };
}
```

## Extending the Compiler

Create custom compiler targets:

```typescript
import { BaseCompiler } from '@holoscript/compiler';

class MyCustomCompiler extends BaseCompiler {
  async compileObject(obj: HoloObject) {
    // Custom compilation logic
    return `myformat_object "${obj.name}" { ... }`;
  }
  
  async compileTemplate(template: HoloTemplate) {
    // Generate code for template
    return `myformat_template "${template.name}" { ... }`;
  }
}

// Register custom compiler
registerCompiler('mycustom', MyCustomCompiler);

// Now use it
await compileHoloScript(ast, { target: 'mycustom' });
```

## CLI Usage

```bash
# Compile file
holo compile scene.holo --target unity --output ./output

# List available targets
holo targets

# Show compiler details for a target
holo targets unity

# Compile to multiple targets at once
holo compile scene.holo --targets unity,godot,webgpu --output dist

# Use advanced options
holo compile scene.holo \
  --target unity \
  --optimize aggressive \
  --output dist \
  --namespace "MyGame"
```

## Performance Tips

- **Batch compilation** — Compile multiple files together for better optimization
- **Aggressive mode** — Use `optimize: 'aggressive'` for production builds
- **Parallel compilation** — Compile to multiple targets in parallel using Promise.all()
- **Caching** — Use `--cache` flag in CLI for incremental builds
- **Tree shaking** — Remove unused traits with `removeDeadCode: true`

## See Also

- [Compiler targets reference](../compilers/) — Detailed docs for each platform
- [CLI commands](./cli.md) — Using the command-line interface
- [Core package](./core.md) — Parser and AST information
