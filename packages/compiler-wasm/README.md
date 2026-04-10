# @holoscript/wasm

High-performance HoloScript parser compiled to WebAssembly.

## Features

- **10x faster parsing** compared to JavaScript implementation
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

Benchmarks on a typical development machine:

| Operation           | JavaScript | WASM  | Speedup |
| ------------------- | ---------- | ----- | ------- |
| Parse 100 lines     | 5ms        | 0.5ms | 10x     |
| Parse 1000 lines    | 50ms       | 5ms   | 10x     |
| Validate 1000 lines | 30ms       | 2ms   | 15x     |

## Browser Compatibility

- Chrome 57+
- Firefox 52+
- Safari 11+
- Edge 16+

## License

MIT License - see [LICENSE](../../LICENSE) for details.
