# Compiler Bridge API Reference

The `CompilerBridge` is the main thread API for interacting with the HoloScript compiler. It manages a Web Worker that loads the WASM component and provides typed async methods for parsing, validating, compiling, and generating HoloScript content.

## Architecture

```
Main Thread (React UI)
    |
    v
CompilerBridge (this API)
    |
    v
Web Worker (wasm-compiler-worker.ts)
    |
    v
WASM Component (holoscript.component.wasm)
    |
    v--- Falls back to @holoscript/core TypeScript if WASM unavailable
```

## Installation

```tsx
import {
  CompilerBridge,
  getCompilerBridge,
  resetCompilerBridge,
} from '@holoscript/studio/platform';

// React hook (recommended for React apps)
import { useCompilerBridge } from '@holoscript/studio/platform';
```

## Quick Start

### Class-based API

```typescript
import { CompilerBridge } from '@holoscript/studio/platform';

const bridge = new CompilerBridge();
const status = await bridge.init('/wasm/holoscript.component.wasm');

console.log(`Backend: ${status.backend}`); // 'wasm-component' or 'typescript-fallback'
console.log(`WASM loaded: ${status.wasmLoaded}`); // true
console.log(`Load time: ${status.loadTimeMs}ms`); // e.g. 150

// Parse
const parseResult = await bridge.parse('object "Cube" { geometry: "cube" }');
console.log(parseResult.ast);

// Compile
const compiled = await bridge.compile(source, 'threejs');
if (compiled.type === 'text') {
  console.log(compiled.data); // Three.js scene JSON
}

// Clean up
bridge.destroy();
```

### Singleton Pattern

```typescript
import { getCompilerBridge, resetCompilerBridge } from '@holoscript/studio/platform';

// Get or create singleton
const bridge = getCompilerBridge();
await bridge.init();

// Use the same instance everywhere
const sameBridge = getCompilerBridge(); // same instance

// Reset for testing
resetCompilerBridge();
```

### React Hook

```tsx
import { useCompilerBridge } from '@holoscript/studio/platform';

function Editor() {
  const {
    parse,
    compile,
    validate,
    format,
    status,
    isReady,
    isLoading,
    error,
    compileForPlatform,
  } = useCompilerBridge();

  const handleParse = async () => {
    const result = await parse(editorValue);
    if (result.errors?.length) {
      console.error('Parse errors:', result.errors);
    } else {
      console.log('AST:', result.ast);
    }
  };

  const handleCompile = async () => {
    const result = await compile(editorValue, 'threejs');
    if (result.type === 'text') {
      console.log('Three.js output:', result.data);
    }
  };

  if (isLoading) return <div>Loading compiler...</div>;
  if (error) return <div>Error: {error}</div>;

  return <div>Backend: {status?.backend}</div>;
}
```

## API Reference

### `CompilerBridge` Class

#### `init(wasmUrl?, world?)`

Initialize the compiler bridge with WASM binary.

```typescript
async init(
  wasmUrl?: string,  // default: '/wasm/holoscript.component.wasm'
  world?: 'holoscript-runtime' | 'holoscript-parser' | 'holoscript-compiler' | 'holoscript-spatial'
): Promise<CompilerBridgeStatus>
```

**WIT Worlds:**

- `holoscript-runtime` (default): Full compiler + runtime APIs
- `holoscript-parser`: Parse-only (smaller binary)
- `holoscript-compiler`: Parse + compile (no runtime)
- `holoscript-spatial`: Spatial computing extensions

#### `parse(source)`

Parse HoloScript source code into an AST.

```typescript
async parse(source: string): Promise<{ ast?: unknown; errors?: Diagnostic[] }>
```

#### `validate(source, options?)`

Validate HoloScript source with optional trait and type checking.

```typescript
async validate(source: string, options?: {
  checkTraits?: boolean;
  checkTypes?: boolean;
}): Promise<ValidationResult>
```

#### `compile(source, target)`

Compile HoloScript to an engine-core target format.

```typescript
async compile(source: string, target: CompileTarget): Promise<CompileResult>
```

**Engine-Core Targets:**
| Target | Output |
|--------|--------|
| `'threejs'` | Three.js scene JSON |
| `'babylonjs'` | Babylon.js scene JSON |
| `'aframe-html'` | A-Frame HTML markup |
| `'gltf-json'` | glTF 2.0 JSON |
| `'glb-binary'` | glTF Binary (GLB) |
| `'json-ast'` | Raw AST JSON |

#### `generateObject(description)`

Generate a HoloScript object definition from natural language.

```typescript
async generateObject(description: string): Promise<string>
```

#### `generateScene(description)`

Generate a complete HoloScript composition from natural language.

```typescript
async generateScene(description: string): Promise<string>
```

#### `suggestTraits(description)`

Suggest appropriate traits for an object described in natural language.

```typescript
async suggestTraits(description: string): Promise<TraitDef[]>
```

#### `listTraits()` / `listTraitsByCategory(category)`

List available traits from the trait registry.

```typescript
async listTraits(): Promise<TraitDef[]>
async listTraitsByCategory(category: string): Promise<TraitDef[]>
```

#### `format(source)`

Format HoloScript source code.

```typescript
async format(source: string): Promise<string>
```

#### `checkTypes(source)` / `completionsAt(source, offset)`

Type checking and completions for editor integration.

```typescript
async checkTypes(source: string): Promise<Diagnostic[]>
async completionsAt(source: string, offset: number): Promise<string[]>
```

#### `getStatus()`

Get the current bridge status (synchronous).

```typescript
getStatus(): CompilerBridgeStatus
```

#### `destroy()`

Terminate the worker and free all resources.

```typescript
destroy(): void
```

## Types

### `CompilerBridgeStatus`

```typescript
interface CompilerBridgeStatus {
  backend: 'wasm-component' | 'wasm-legacy' | 'typescript-fallback';
  wasmLoaded: boolean;
  binarySize: number;
  loadTimeMs: number;
  world: string;
  version: string;
}
```

### `CompileResult`

```typescript
type CompileResult =
  | { type: 'text'; data: string }
  | { type: 'binary'; data: Uint8Array }
  | { type: 'error'; diagnostics: Diagnostic[] };
```

### `Diagnostic`

```typescript
interface Diagnostic {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  span?: { start: Position; end: Position };
  code?: string;
}
```

### `ValidationResult`

```typescript
interface ValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
}
```

## Platform Plugin Compilation

For platform targets (Unity, Godot, Unreal, etc.), use the `compileForPlatform` method from the `useCompilerBridge` hook. This lazy-loads the appropriate platform plugin WASM component.

```tsx
const { compileForPlatform } = useCompilerBridge();

// Compile to Unity C#
const result = await compileForPlatform(source, 'unity-csharp');

// Compile to Godot GDScript
const result = await compileForPlatform(source, 'godot-gdscript');
```

**Platform Targets:**
`unity-csharp`, `godot-gdscript`, `unreal-cpp`, `vrchat-udon`, `openxr`, `visionos-swift`, `android-arcore`, `webgpu-wgsl`, `react-three-fiber`, `playcanvas`, `urdf`, `sdf`, `usd`

## Fallback Behavior

When WASM is unavailable (e.g., SSR, older browsers), the bridge automatically falls back to `@holoscript/core` TypeScript implementations:

- `parse()` uses `parseHolo()` from core
- `validate()` uses `HoloScriptValidator` from core
- `compile()` uses `R3FCompiler` or `BabylonCompiler` from core
- Generator methods return template-based results
- `format()` returns source unchanged
- `listTraits()` returns a subset of core traits (8 vs 1525+ in WASM)

The `getStatus().backend` property always reflects which backend is active.

## Error Handling

All methods gracefully handle errors and return appropriate error types:

```typescript
const result = await bridge.compile(source, 'threejs');
if (result.type === 'error') {
  result.diagnostics.forEach((d) => {
    console.error(`[${d.severity}] ${d.message}`);
    if (d.span) {
      console.error(`  at line ${d.span.start.line}:${d.span.start.column}`);
    }
  });
}
```

Worker-level errors (crashes, timeouts) are surfaced as rejected promises with descriptive error messages. The bridge uses a 30-second timeout per request.

## Extension Development

To build extensions that use the `CompilerBridge`:

1. Import from the `@holoscript/studio/platform` entry point.
2. Use the singleton (`getCompilerBridge()`) to share the WASM instance.
3. Always check `getStatus().backend` to know which backend is active.
4. Use `compileForPlatform()` for platform-specific code generation.
5. Call `destroy()` only when your extension is fully unloaded.
