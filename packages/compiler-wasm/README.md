# @holoscript/wasm

High-performance HoloScript parser compiled to WebAssembly.

## Features

- **Browser-native** - runs directly in the browser without server
- **Small footprint** - <500KB gzipped
- **Full HoloScript support** - all language features including Brittney AI constructs

## Installation

```bash
npm install @holoscript/wasm
```

## Usage

### Browser (ES Modules)

```javascript
import init, { parse, validate, version } from '@holoscript/wasm';

// Initialize the WASM module (required once)
await init();

// Parse HoloScript source code
const ast = JSON.parse(
  parse(`
  composition cube {
    @grabbable
    @physics { mass: 1.5 }
    color: "red"
    position: [0, 1, 0]
  }
`)
);

console.log(ast);

// Validate without full parse
const isValid = validate(`composition test { color: "blue" }`);
console.log('Valid:', isValid);

// Get version
console.log('WASM Version:', version());
```

### Node.js

```javascript
const { parse, validate, version } = require('@holoscript/wasm');

const source = `
  composition "My Scene" {
    composition player {
      @networked
      position: [0, 0, 0]
    }
  }
`;

const ast = JSON.parse(parse(source));
console.log(JSON.stringify(ast, null, 2));
```

### Bundlers (Webpack, Vite, etc.)

```javascript
import init, * as holoscript from '@holoscript/wasm';

async function setupParser() {
  await init();

  return {
    parse: (source) => JSON.parse(holoscript.parse(source)),
    validate: holoscript.validate,
    validateDetailed: (source) => JSON.parse(holoscript.validate_detailed(source)),
  };
}

const parser = await setupParser();
const ast = parser.parse(`composition test { color: "green" }`);
```

## API

### `parse(source: string): string`

Parse HoloScript source code and return the AST as a JSON string.

**Returns:** JSON string containing the AST or an error object.

### `parse_pretty(source: string): string`

Same as `parse()` but with pretty-printed JSON output.

### `validate(source: string): boolean`

Quickly validate if the source code is syntactically correct.

**Returns:** `true` if valid, `false` otherwise.

### `validate_detailed(source: string): string`

Validate and return detailed error information.

**Returns:** JSON string with `{ valid: boolean, errors: [...] }`

### `version(): string`

Get the version of the WASM module.

## Building from Source

### Prerequisites

- [Rust](https://rustup.rs/) 1.70+
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

### Build

```bash
# Build for web (ES modules)
npm run build

# Build for Node.js
npm run build:nodejs

# Build for bundlers
npm run build:bundler

# Run tests
npm run test
```

## Performance

**The WASM parser is currently SLOWER than the JS parser at canonical
fixture sizes** due to JS↔linear-memory string marshalling overhead.

Measured on i7-11800H / Node v22.20.0 / `wasm-pack` release build
(`wasm-opt -O3 --enable-bulk-memory --enable-nontrapping-float-to-int`):

| Fixture            | WASM vs JS speedup       |
| ------------------ | ------------------------ |
| small (32 lines)   | 0.66-0.74x (JS faster)   |
| medium (78 lines)  | 0.64-0.67x (JS faster)   |
| large (142 lines)  | 0.64-0.66x (JS faster)   |

Native Rust (no WASM boundary) is ~1.3-1.4x faster than JS, so the
parser logic itself is competitive — the boundary is the bottleneck.

Use WASM only when the V8 JIT is not available (mobile WebViews,
edge workers, sandboxed runtimes).

Full methodology and raw data: `research/2026-04-19_todo-r2-wasm-bench-results.md`.

## Browser Compatibility

- Chrome 57+
- Firefox 52+
- Safari 11+
- Edge 16+

## License

MIT License - see [LICENSE](../../LICENSE) for details.
