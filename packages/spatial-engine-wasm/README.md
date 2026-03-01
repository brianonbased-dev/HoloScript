# spatial-engine-wasm

HoloScript spatial engine hot-path functions compiled to WebAssembly. Provides performance-critical routines callable from JavaScript via wasm-bindgen.

## Usage

```bash
wasm-pack build --target web
```

The output in `pkg/` can be imported as an ES module in browser or Node.js environments.

## Development

```bash
cargo build
cargo test
wasm-pack build --target web    # Build WASM bundle
```
