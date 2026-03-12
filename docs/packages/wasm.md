# @holoscript/wasm

**WebAssembly parser for browsers.** Compile HoloScript in the browser without server-side compilation.

## Installation

```bash
npm install @holoscript/wasm
```

## Usage

### Basic Parsing

```typescript
import { HoloScriptWasm } from '@holoscript/wasm';

const wasm = await HoloScriptWasm.load();
const result = wasm.parse(`
  composition "Demo" {
    object "Cube" { @grabbable geometry: "box" }
  }
`);

console.log(result.ast);
console.log(result.diagnostics);
```

### In-Browser Compilation

```typescript
const result = wasm.compile(ast, {
  target: 'webgpu',
  optimize: 'balanced'
});

console.log(result.code);  // Compiled output
```

### Real-time Validation

```typescript
const validator = wasm.createStreamingValidator();

document.addEventListener('input', (e) => {
  const code = e.target.value;
  const errors = validator.validate(code);
  
  // Show errors in UI
  showErrors(errors);
});
```

## Performance

- Parser: ~5ms (WASM optimized)
- Validation: ~3ms
- Small WASM module: ~50KB
- No server round-trip

## Supported Targets

All 30+ compiler targets work in the browser:
- WebGPU
- Three.js
- GraphQL schema
- TypeScript
- And more...
