# @holoscript/core API Reference

Complete API reference for the HoloScript core package.

## Installation

```bash
npm install @holoscript/core
# or
pnpm add @holoscript/core
```

## Quick Start

```typescript
import { HoloParser, parseHolo, compile } from '@holoscript/core';

// Parse a .holo file
const result = parseHolo(`
  composition "MyScene" {
    object "Cube" {
      geometry: "cube"
      position: [0, 1, 0]
    }
  }
`);

// Compile to target platform
const output = compile(result.composition, { target: 'threejs' });
```

---

## Parsing

### HoloParser

Main parser for `.holo` composition files.

```typescript
import { HoloParser } from '@holoscript/core';

const parser = new HoloParser();
const result = parser.parse(source);

if (result.success) {
  console.log(result.composition);
} else {
  console.error(result.errors);
}
```

#### Methods

| Method                | Parameters | Returns           | Description                  |
| --------------------- | ---------- | ----------------- | ---------------------------- |
| `parse(source)`       | `string`   | `HoloParseResult` | Parse .holo source code      |
| `parseStrict(source)` | `string`   | `HoloParseResult` | Parse with strict validation |

### parseHolo()

Convenience function for parsing `.holo` files.

```typescript
import { parseHolo } from '@holoscript/core';

const { success, composition, errors } = parseHolo(source);
```

### HoloScriptPlusParser

Parser for `.hsplus` files with VR traits.

```typescript
import { HoloScriptPlusParser } from '@holoscript/core';

const parser = new HoloScriptPlusParser();
const result = parser.parse(`
  composition Player {
    @grabbable
    @physics(mass: 2.0)
    position: [0, 1.6, 0]
  }
`);
```

### HoloScriptParser

Legacy parser for `.hs` files.

```typescript
import { HoloScriptParser } from '@holoscript/core';

const parser = new HoloScriptParser();
const ast = parser.parse(source);
```

---

## Compilation

### compile()

Compile a HoloComposition to a target platform.

```typescript
import { compile } from '@holoscript/core';

const output = compile(composition, {
  target: 'threejs', // | 'unity' | 'vrchat' | 'unreal' | etc.
  optimize: true,
  minify: false,
});
```

#### Compile Options

| Option      | Type            | Default     | Description          |
| ----------- | --------------- | ----------- | -------------------- |
| `target`    | `CompileTarget` | `'threejs'` | Target platform      |
| `optimize`  | `boolean`       | `true`      | Enable optimizations |
| `minify`    | `boolean`       | `false`     | Minify output        |
| `sourceMap` | `boolean`       | `false`     | Generate source map  |

#### Compile Targets

```typescript
type CompileTarget =
  | 'threejs'
  | 'babylon'
  | 'aframe'
  | 'webxr'
  | 'webgpu'
  | 'unity'
  | 'unreal'
  | 'godot'
  | 'vrchat'
  | 'openxr'
  | 'visionos'
  | 'ios'
  | 'android'
  | 'androidxr'
  | 'wasm'
  | 'urdf'
  | 'sdf'
  | 'dtdl';
```

### Platform Compilers

```typescript
import { VRChatCompiler, UnrealCompiler, IOSCompiler, AndroidCompiler } from '@holoscript/core';

const compiler = new VRChatCompiler();
const output = compiler.compile(composition);
```

---

## Runtime

### HoloScriptRuntime

Execute HoloScript in browser or Node.js.

```typescript
import { HoloScriptRuntime } from '@holoscript/core';

const runtime = new HoloScriptRuntime(ast);
await runtime.mount(document.getElementById('canvas'));

// Control runtime
runtime.play();
runtime.pause();
runtime.dispose();
```

#### Methods

| Method                 | Description            |
| ---------------------- | ---------------------- |
| `mount(element)`       | Mount to DOM element   |
| `play()`               | Start execution        |
| `pause()`              | Pause execution        |
| `reset()`              | Reset to initial state |
| `dispose()`            | Clean up resources     |
| `getObject(name)`      | Get object by name     |
| `setState(key, value)` | Update state           |
| `getState(key)`        | Get state value        |

### createRuntime()

Factory function for runtime creation.

```typescript
import { createRuntime } from '@holoscript/core';

const runtime = createRuntime(composition, {
  renderer: 'webgl',
  physics: true,
  audio: true,
});
```

---

## Types

### HoloComposition

Root type for .holo files.

```typescript
interface HoloComposition {
  name: string;
  environment?: HoloEnvironment;
  templates?: HoloTemplate[];
  objects?: HoloObjectDecl[];
  spatialGroups?: HoloSpatialGroup[];
  lights?: HoloLight[];
  cameras?: HoloCamera[];
  state?: HoloState;
  actions?: HoloAction[];
  logic?: HoloLogic;
  audio?: HoloAudio[];
  ui?: HoloUI[];
}
```

### HoloObjectDecl

Object declaration.

```typescript
interface HoloObjectDecl {
  name: string;
  template?: string; // "using Template"
  traits?: HoloObjectTrait[]; // @grabbable, @physics, etc.
  properties: Record<string, HoloValue>;
  children?: HoloObjectDecl[];
}
```

### HoloTemplate

Reusable object template.

```typescript
interface HoloTemplate {
  name: string;
  traits?: HoloObjectTrait[];
  properties: Record<string, HoloValue>;
  state?: Record<string, HoloValue>;
  actions?: HoloAction[];
  eventHandlers?: HoloEventHandler[];
}
```

### HoloParseResult

Result from parsing operations.

```typescript
interface HoloParseResult {
  success: boolean;
  composition?: HoloComposition;
  errors: HoloParseError[];
  warnings: HoloParseError[];
}
```

### HoloParseError

Error from parsing.

```typescript
interface HoloParseError {
  code: string;
  message: string;
  line: number;
  column: number;
  suggestion?: string;
}
```

---

## Validators

### HoloScriptValidator

Validate HoloScript code.

```typescript
import { HoloScriptValidator } from '@holoscript/core';

const validator = new HoloScriptValidator();
const errors = validator.validate(ast);
```

### TraitValidator

Validate VR trait usage.

```typescript
import { validateTrait, TRAIT_DEFINITIONS } from '@holoscript/core';

const errors = validateTrait('@grabbable', parameters);
```

---

## Utilities

### formatRichError()

Format errors for display.

```typescript
import { formatRichError } from '@holoscript/core';

const formatted = formatRichError(error, source);
console.log(formatted);
// → Error: Unknown trait @grababble
//   Did you mean: @grabbable?
//   at line 5, column 3
```

### getSourceContext()

Get source code context around an error.

```typescript
import { getSourceContext } from '@holoscript/core';

const context = getSourceContext(source, line, column);
// Returns surrounding lines with pointer
```

---

## Constants

### Geometry Types

```typescript
import { GEOMETRY_TYPES } from '@holoscript/core';

// ['cube', 'sphere', 'cylinder', 'cone', 'torus', 'plane', 'capsule', ...]
```

### Event Names

```typescript
import { EVENT_NAMES } from '@holoscript/core';

// ['onGrab', 'onRelease', 'onClick', 'onHoverEnter', 'onHoverExit', ...]
```

### Easing Functions

```typescript
import { EASING_FUNCTIONS } from '@holoscript/core';

// ['linear', 'easeIn', 'easeOut', 'easeInOut', 'bounce', 'elastic', ...]
```

---

## See Also

- [Syntax Reference](./index.md)
- [Traits Reference](../TRAITS_REFERENCE.md)
- [Built-in Functions](./functions.md)
- [CLI Reference](../guides/CLI.md)
