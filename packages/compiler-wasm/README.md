# @holoscript/wasm

High-performance **subset** parser for the `.hs` object-graph dialect of
HoloScript, compiled to WebAssembly.

> **Scope**: this parser covers the structural `.hs` surface — compositions,
> worlds, orbs, entities, templates, groups, environments, logic blocks, NPCs,
> quests, abilities, dialogues, state machines, achievement / talent-tree nodes,
> imports/exports, functions, `move` / `action` statements, and `on_*` event
> blocks. It does **not** cover:
>
> - `.hsplus` constructs: `brain` declarations, cognitive actions
>   (`@llm_call`, `@recall`, `@rag_query`, `@plan`, `@reflect`), pipelines,
>   `hs_connect`/`hs_execute`, `@safe_daemon`, `@goal`, `@escalation`,
>   `@provider_policy`, React blocks.
> - `HoloCompositionParser` constructs: spatial groups, lights, audio, camera,
>   timelines, themes, scenes, spawn groups, waypoints, constraints, terrain,
>   loot tables, world chunks, game triggers, movement paths, reaction triggers,
>   world layers, dungeon instances, world shards, domain blocks, norm / metanorm
>   / contract / topic / channel blocks, connection statements, shape
>   declarations, platform constraints.
> - `HoloScriptCodeParser` features: TypeScript companion code, expression
>   interpolation, incremental parsing.
>
> For full-grammar parsing use `HoloScriptPlusParser` (TS) or
> `HoloCompositionParser` (TS) — the `WasmParserBridge` falls back to
> `HoloScriptPlusParser` automatically when WASM is unavailable.

## Features

- **Browser-native** — runs directly in the browser without a server
- **Small footprint** — <500 KB gzipped
- **`.hs` object-graph dialect** — compositions, worlds, orbs, entities,
  templates, groups, environments, logic, NPCs, quests, abilities, dialogues,
  state machines, achievements, talent trees, imports, exports, functions,
  `move`, `action`, `on_*` event blocks

- **UAAL lowering** - `compile_to_uaal` emits executable bytecode for typed
  function kernels, including i32, finite scalar f32/f64 arithmetic, and affine
  flat-POD aggregate values

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

### `compile_to_uaal(source: string): string`

Compile the supported typed function subset to a UAAL bytecode JSON packet.
Numeric `EXEC` instructions identify their host ABI as `hs.i32.binary.v1` or
the distinct `hs.f32.binary.v1` / `hs.f64.binary.v1` contracts; the embedding
UAAL VM must register the matching handler. The f32 handler must round literals,
operands, and every arithmetic result to IEEE-754 binary32 rather than inheriting
JavaScript binary64 arithmetic. Both floating-point v1 seams prove finite operands
only and do not claim NaN, infinity, signed-zero preservation, or division-by-zero
semantics.

Flat records whose explicitly typed fields are `i32`, `f32`, `f64`, or `bool`
cross UAAL calls and returns as one affine stack value under
`hs.aggregate.value.v1`. Construction and field projection carry the semantic
layout identifier and field descriptor. Whole-value copies are rejected in favor
of `move(...)`; nested records, owned buffers, and mutable or borrowed aggregate
transfer remain outside this first value ABI.

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

The browser package under `pkg/` is committed and verified by `prepack`, so a
clean workspace build remains consumable when `wasm-pack` is unavailable. When
`wasm-pack` is installed (on `PATH`, under Cargo's bin directory, or provided as
`WASM_PACK_BIN`), `npm run build` regenerates the release artifact. Without the
tool, the build validates the committed JavaScript, declarations, WebAssembly
binary, package metadata, and rebuild receipt instead of silently skipping the
package.

> **Note**: `npm run test` locally runs `cargo test || echo '...skipping'` — a
> friendly no-op when cargo isn't installed, so `pnpm test` at the repo root
> doesn't hard-fail for contributors without a Rust toolchain. CI does **not**
> rely on this fallback: `.github/workflows/wasm-build.yml` installs a real
> Rust toolchain (`dtolnay/rust-toolchain`) and invokes `cargo test` directly
> in `packages/compiler-wasm`, so a genuine test failure fails the CI job.

## Performance

**The WASM parser is currently SLOWER than the JS parser at canonical
fixture sizes** due to JS↔linear-memory string marshalling overhead.

Measured on i7-11800H / Node v22.20.0 / `wasm-pack` release build
(`wasm-opt -O3 --enable-bulk-memory --enable-nontrapping-float-to-int`):

| Fixture           | WASM vs JS speedup     |
| ----------------- | ---------------------- |
| small (32 lines)  | 0.66-0.74x (JS faster) |
| medium (78 lines) | 0.64-0.67x (JS faster) |
| large (142 lines) | 0.64-0.66x (JS faster) |

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

## Package boundary & release posture

`@holoscript/wasm` targets external, browser-embedded consumers — operator
and founder teams, plus agent frameworks shipping HoloScript parsing into
mobile WebViews, edge workers, or sandboxed runtimes where a full Node/V8
toolchain is not available.

Caller-owned config: this package is a pure parser/validator with no network
calls, no credentials, and no external state — you own the `.hs` source you
pass to `parse()`/`validate()` and whatever you do with the returned AST.
There is nothing to point it at beyond the WASM binary itself; no
environment variables are read.

This package does not ship the full `.hsplus`/`HoloScriptPlusParser`
grammar, `HoloCompositionParser` spatial/world constructs, or any
founder-local build tooling — only the `.hs` object-graph subset documented
above, compiled to WASM, ships within this package boundary.
`WasmParserBridge`'s automatic fallback to `HoloScriptPlusParser` lives in
the core package, outside this package.

Release posture: v0-preview. As documented above, the WASM build is
currently **slower** than the JS parser at canonical fixture sizes
(0.64-0.74x) — a known limitation of the JS↔linear-memory marshalling
boundary, not a bug. Use it only where native V8 is unavailable. No rollback
mechanism is needed beyond pinning an earlier `@holoscript/wasm` version.

## License

MIT License - see [LICENSE](../../LICENSE) for details.
