# @holoscript/component

HoloScript WASM Component for WASI Preview 3 Component Model.

This package provides HoloScript parsing, validation, and compilation as a portable WASM Component that can be instantiated from any language with Component Model support.

## Features

- **Parser Interface**: Parse HoloScript source to AST
- **Validator Interface**: Validate syntax and access trait definitions
- **Compiler Interface**: Compile to 7 output targets (Unity, Godot, A-Frame, Three.js, Babylon.js, glTF, GLB)
- **Generator Interface**: AI-friendly code generation from natural language

## Installation

```bash
npm install @holoscript/component
```

## Usage

### JavaScript (with jco)

```javascript
import * as holoscript from '@holoscript/component';

// Parse HoloScript source
const source = `
composition "MyScene" {
  object "Cube" @grabbable {
    geometry: "cube"
    position: [0, 1, 0]
  }
}`;

const parseResult = holoscript.parser.parse(source);
if (parseResult.ok) {
  console.log('Parsed:', parseResult.ok.name);
  console.log('Objects:', parseResult.ok.objects.length);
}

// Validate
const validation = holoscript.validator.validate(source);
console.log('Valid:', validation.valid);

// Compile to Unity C#
const unityCode = holoscript.compiler.compile(source, 'unity-csharp');
console.log(unityCode.text);

// List available traits
const traits = holoscript.validator.listTraits();
console.log('Available traits:', traits.map((t) => t.name).join(', '));
```

### Python (with wasmtime)

```python
from wasmtime import Engine, Store, Component, Linker

# Load the component
engine = Engine()
store = Store(engine)
component = Component.from_file(engine, 'holoscript.component.wasm')

# Create instance
linker = Linker(engine)
instance = linker.instantiate(store, component)

# Use parser
source = '''
composition "PyScene" {
  object "Sphere" @physics {
    geometry: "sphere"
    position: [0, 2, 0]
  }
}
'''

result = instance.exports['holoscript:core/parser'].parse(store, source)
print(f"Scene name: {result.ok.name}")

# List traits
traits = instance.exports['holoscript:core/validator'].list_traits(store)
print(f"Found {len(traits)} traits")
```

### Rust (with wasmtime)

```rust
use wasmtime::*;
use wasmtime_wasi::preview2::*;

fn main() -> anyhow::Result<()> {
    let engine = Engine::default();
    let component = Component::from_file(&engine, "holoscript.component.wasm")?;

    let linker = Linker::new(&engine);
    let mut store = Store::new(&engine, WasiCtx::builder().build());

    let instance = linker.instantiate(&mut store, &component)?;

    // Call parser
    let parser = instance.get_typed_func::<(String,), (ParseResult,)>(&mut store, "holoscript:core/parser#parse")?;

    let source = r#"
        composition "RustScene" {
            object "Cube" { geometry: "cube" }
        }
    "#;

    let (result,) = parser.call(&mut store, (source.to_string(),))?;
    println!("Parsed scene: {}", result.ok.name);

    Ok(())
}
```

## WIT Interfaces

The component exposes four interfaces defined in WIT:

### holoscript:core/parser

- `parse(source: string) -> result<composition-node, list<diagnostic>>` - Parse source to AST
- `parse-header(source: string) -> result<string, string>` - Parse just the composition name

### holoscript:core/validator

- `validate(source: string) -> validation-result` - Validate source code
- `trait-exists(name: string) -> bool` - Check if a trait exists
- `get-trait(name: string) -> option<trait-def>` - Get trait definition
- `list-traits() -> list<trait-def>` - List all 2,000+ VR traits
- `list-traits-by-category(category: string) -> list<trait-def>` - Filter by category

### holoscript:core/compiler

- `compile(source: string, target: compile-target) -> compile-result` - Compile to target
- `compile-ast(ast: composition-node, target: compile-target) -> compile-result` - Compile from AST
- `list-targets() -> list<compile-target>` - List available targets

Supported targets:

- `unity-csharp` - Unity C# scripts
- `godot-gdscript` - Godot GDScript
- `aframe-html` - A-Frame VR HTML
- `threejs` - Three.js JavaScript
- `babylonjs` - Babylon.js JavaScript
- `gltf-json` - glTF 2.0 JSON
- `glb-binary` - GLB binary

### holoscript:core/generator

- `generate-object(description: string) -> result<string, string>` - Generate object from NL
- `generate-scene(description: string) -> result<string, string>` - Generate scene from NL
- `suggest-traits(description: string) -> list<trait-def>` - Suggest traits for description

## Building from Source

### Prerequisites

- Rust 1.75+ with `wasm32-wasip1` target
- wasm-tools
- Node.js 20+ (for jco)

### Build Steps

```bash
# Install Rust target
rustup target add wasm32-wasip1

# Install jco
npm install -g @bytecodealliance/jco

# Build the component
cargo build --release --target wasm32-wasip1

# Create component binary
wasm-tools component new target/wasm32-wasip1/release/holoscript_component.wasm \
    --adapt wasi_snapshot_preview1.command.wasm \
    -o dist/holoscript.component.wasm

# Generate JS bindings
jco transpile dist/holoscript.component.wasm -o dist --name holoscript

# Generate TypeScript types
jco types dist/holoscript.component.wasm -o dist/holoscript.d.ts
```

Or simply:

```bash
npm run build
```

## Testing

```bash
# Rust tests
cargo test

# JavaScript tests (requires built component)
npm run test:js
```

## License

MIT
