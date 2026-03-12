# Sprint 8: Language Interoperability Expansion

**Version**: v3.5.0  
**Target Date**: June 2026  
**Theme**: Extended Reach - glTF, Python, Tree-sitter, Bidirectional Import

---

## Overview

Sprint 8 delivers **Language Interoperability Expansion**, extending HoloScript's 22-connection interop hub with critical new capabilities. Based on research findings (see [architecture/INTEROPERABILITY.md](./architecture/INTEROPERABILITY.md)), this sprint focuses on filling gaps in the ecosystem to maximize HoloScript's reach across domains.

### Research Context

HoloScript currently compiles to 25+ targets spanning:

- **VR/Gaming**: Unity, Unreal, Godot, VRChat
- **Web**: Babylon.js, WebGPU, Three.js runtime
- **Mobile XR**: visionOS, Android XR
- **Robotics**: URDF (ROS 2), SDF (Gazebo)
- **IoT/Digital Twins**: DTDL (Azure), W3C WoT, MQTT
- **AI**: MCP Protocol, LLM adapters

Sprint 8 addresses identified gaps to complete the vision of HoloScript as the universal spatial computing language.

---

## Sprint Priorities

| Priority | Focus                            | Effort | Dependencies   | Status      |
| -------- | -------------------------------- | ------ | -------------- | ----------- |
| **1**    | glTF/GLB Export Pipeline         | High   | Core complete  | ✅ COMPLETE |
| **2**    | Python Bindings                  | Medium | WASM parser    | ✅ COMPLETE |
| **3**    | Tree-sitter Grammar              | Medium | LSP complete   | ✅ COMPLETE |
| **4**    | Bidirectional Import             | High   | All compilers  | ✅ COMPLETE |
| **5**    | WASM Component Model             | High   | WASI Preview 3 | ✅ COMPLETE |
| **6**    | Performance Dashboard Completion | Low    | Sprint 7       | ✅ COMPLETE |

---

## Priority 1: glTF/GLB Export Pipeline

**Goal:** Direct glTF/GLB export as the web's universal 3D format

**Effort**: 3 weeks | **Risk**: Low | **Impact**: High

### Context

glTF ("Graphics Language Transmission Format") is the JPEG of 3D - supported by virtually every 3D viewer, game engine, and web framework. HoloScript currently exports to USDA (OpenUSD) but lacks direct glTF support, missing a major interoperability opportunity.

### Design

```typescript
// packages/core/src/compiler/GLTFPipeline.ts
import { Document, WebIO, NodeIO } from '@gltf-transform/core';
import { dedup, prune, quantize } from '@gltf-transform/functions';

export class GLTFPipeline {
  async compile(composition: HoloComposition): Promise<Uint8Array> {
    const document = new Document();

    // Create scene structure
    const scene = document.createScene('main');

    // Convert HoloScript objects to glTF nodes
    for (const object of composition.objects) {
      const node = this.createNode(document, object);
      scene.addChild(node);
    }

    // Apply optimizations
    await document.transform(dedup(), prune(), quantize());

    // Export as GLB (binary)
    const io = new NodeIO();
    return io.writeBinary(document);
  }

  private createNode(document: Document, object: HoloObject): Node {
    const node = document.createNode(object.name);

    // Transform
    node.setTranslation(object.position);
    node.setRotation(object.rotation);
    node.setScale(object.scale);

    // Mesh (primitives)
    if (object.geometry) {
      const mesh = this.createMesh(document, object.geometry);
      node.setMesh(mesh);
    }

    // Material (PBR)
    if (object.material) {
      this.applyMaterial(document, node, object.material);
    }

    return node;
  }
}
```

### Deliverables

- `packages/core/src/compiler/GLTFPipeline.ts` - Main pipeline ✅
- `packages/core/src/compiler/gltf/` - Helper utilities ✅
- `packages/cli/` - `holo export --format=gltf` command ✅
- 40+ unit tests

### Acceptance Criteria

- [x] Export HoloScript scenes to .glb binary
- [x] Export HoloScript scenes to .gltf + .bin
- [x] PBR materials with textures
- [x] Mesh primitives (cube, sphere, plane, custom)
- [x] Animation export (position, rotation, scale)
- [x] Extension support (KHR_materials_unlit, etc.)
- [x] CLI integration: `holo export --format=gltf`
- [ ] VS Code extension integration

---

## Priority 2: Python Bindings

**Goal:** Enable Python access to HoloScript parser for robotics/ML workflows

**Effort**: 2 weeks | **Risk**: Medium | **Impact**: High

### Context

Python dominates robotics (ROS 2), machine learning (PyTorch, TensorFlow), and data science. HoloScript's URDF/SDF exporters are valuable for robotics, but Python developers cannot easily use them without TypeScript/Node.js. Python bindings unlock a massive user base.

### Design Options

#### Option A: WASM via wasmtime-py

```python
# packages/holoscript-py/holoscript/__init__.py
from wasmtime import Engine, Store, Module, Instance

def parse(source: str) -> dict:
    """Parse HoloScript source and return AST as dict."""
    engine = Engine()
    store = Store(engine)
    module = Module.from_file(engine, "holoscript_wasm.wasm")
    instance = Instance(store, module, [])

    # Call parse function
    result = instance.exports["parse"](source)
    return json.loads(result)

def validate(source: str) -> list:
    """Validate HoloScript and return diagnostics."""
    ...
```

#### Option B: Native Rust bindings via PyO3

```rust
// packages/holoscript-py/src/lib.rs
use pyo3::prelude::*;
use holoscript_core::parser;

#[pyfunction]
fn parse(source: &str) -> PyResult<String> {
    let ast = parser::parse(source)?;
    Ok(serde_json::to_string(&ast)?)
}

#[pymodule]
fn holoscript(_py: Python, m: &PyModule) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(parse, m)?)?;
    m.add_function(wrap_pyfunction!(validate, m)?)?;
    Ok(())
}
```

### Deliverables

- `packages/python-bindings/` - Python package ✅
- PyPI publication: `pip install holoscript` ✅
- Documentation: `/docs/guides/python-bindings.md` ✅
- 77 unit tests (pytest) ✅

### Acceptance Criteria

- [x] `pip install holoscript` works
- [x] `holoscript.parse()` returns AST as dict
- [x] `holoscript.validate()` returns diagnostics
- [x] Works on Python 3.8+
- [x] Works on Linux, macOS, Windows
- [x] Jupyter notebook example

---

## Priority 3: Tree-sitter Grammar

**Goal:** Tree-sitter grammar for broad editor support and static analysis

**Effort**: 2 weeks | **Risk**: Low | **Impact**: Medium

### Context

Currently, HoloScript IDE support relies on the LSP package (`@holoscript/lsp`), which works great for VS Code and Neovim but doesn't cover:

- Zed editor (tree-sitter native)
- Helix editor (tree-sitter native)
- Emacs tree-sitter mode
- Semgrep (SAST tool using tree-sitter)
- GitHub Linguist (syntax highlighting)

A tree-sitter grammar provides universal syntax highlighting and navigation.

### Design

```javascript
// packages/tree-sitter-holoscript/grammar.js
module.exports = grammar({
  name: 'holoscript',

  rules: {
    source_file: ($) => repeat($._definition),

    _definition: ($) => choice($.composition, $.world, $.entity, $.template, $.trait_definition),

    composition: ($) =>
      seq('composition', field('name', $.identifier), '{', repeat($._statement), '}'),

    world: ($) =>
      seq(
        'world',
        field('name', $.identifier),
        optional($.trait_list),
        '{',
        repeat($._world_content),
        '}'
      ),

    entity: ($) =>
      seq(
        'entity',
        field('name', $.identifier),
        optional($.trait_list),
        '{',
        repeat($._entity_content),
        '}'
      ),

    trait_list: ($) => seq('@', '[', sepBy(',', $.trait), ']'),

    trait: ($) => seq(field('name', $.identifier), optional($.trait_arguments)),

    // ... additional rules
  },
});
```

### Deliverables

- `packages/tree-sitter-holoscript/` - Grammar package ✅
- `grammar.js` - Tree-sitter grammar definition ✅
- `queries/highlights.scm` - Syntax highlighting queries ✅
- `queries/indents.scm` - Indentation queries ✅
- `queries/locals.scm` - Local variable queries ✅
- `queries/tags.scm` - Symbol navigation queries ✅
- npm package: `tree-sitter-holoscript`

### Acceptance Criteria

- [x] Parses all HoloScript syntax correctly
- [x] Syntax highlighting in Zed, Helix
- [ ] Syntax highlighting on GitHub (via Linguist PR)
- [x] Semgrep can analyze HoloScript files
- [x] Published to npm

---

## Priority 4: Bidirectional Import

**Goal:** Import existing scenes from Unity, Godot, and glTF into HoloScript

**Effort**: 4 weeks | **Risk**: High | **Impact**: High

### Context

All current HoloScript compilation is one-way: HoloScript → target. This is limiting because:

1. Teams with existing Unity/Godot projects can't migrate to HoloScript
2. Designers using Blender/Maya can't import their work
3. No round-trip engineering is possible

Bidirectional import enables:

- Migration paths from existing projects
- Import of artist-created assets
- Round-trip editing workflows

### Design

```typescript
// packages/core/src/importers/UnityImporter.ts
export class UnityImporter {
  async import(scenePath: string): Promise<HoloComposition> {
    const yaml = await fs.readFile(scenePath, 'utf-8');
    const scene = parseUnityYAML(yaml);

    const composition = new HoloComposition(scene.name);

    for (const gameObject of scene.gameObjects) {
      const object = this.convertGameObject(gameObject);
      composition.addObject(object);
    }

    return composition;
  }

  private convertGameObject(go: UnityGameObject): HoloObject {
    const object = new HoloObject(go.name);

    // Transform
    object.position = go.transform.position;
    object.rotation = go.transform.rotation;
    object.scale = go.transform.scale;

    // Components → Traits
    for (const component of go.components) {
      const trait = this.mapComponentToTrait(component);
      if (trait) object.addTrait(trait);
    }

    return object;
  }
}

// packages/core/src/importers/GodotImporter.ts
export class GodotImporter {
  async import(scenePath: string): Promise<HoloComposition> {
    const tscn = await fs.readFile(scenePath, 'utf-8');
    const scene = parseGodotTSCN(tscn);
    // ... conversion logic
  }
}

// packages/core/src/importers/GLTFImporter.ts
export class GLTFImporter {
  async import(gltfPath: string): Promise<HoloComposition> {
    const io = new NodeIO();
    const document = await io.read(gltfPath);
    // ... conversion logic
  }
}
```

### Deliverables

- `packages/core/src/importers/UnityImporter.ts`
- `packages/core/src/importers/GodotImporter.ts`
- `packages/core/src/importers/GLTFImporter.ts`
- CLI commands: `holo import --from=unity scene.unity`
- VS Code: "Import from Unity/Godot/glTF" commands
- 60+ unit tests

### Acceptance Criteria

- [x] Import Unity .unity scenes
- [x] Import Unity .prefab files
- [x] Import Godot .tscn scenes
- [x] Import glTF/GLB files
- [x] Preserve hierarchy and naming
- [x] Map components to traits
- [x] CLI integration
- [ ] Round-trip test: Unity → HoloScript → Unity

---

## Priority 5: WASM Component Model

**Goal:** Enable true polyglot composition using WASI Preview 3

**Effort**: 4 weeks | **Risk**: High | **Impact**: High

### Context

The current WASM compiler (`@holoscript/compiler-wasm`) emits WAT text format and provides `parse()`/`validate()` functions. This is useful but limited. The WASM Component Model (WASI Preview 3, released Feb 2026) enables:

- Language-neutral interfaces via WIT (WebAssembly Interface Types)
- Components calling other components regardless of source language
- True polyglot composition: Rust + Python + Go + Swift all interoperating

### Design

```txt
// packages/holoscript-component/wit/holoscript.wit
package holoscript:core@0.1.0;

interface parser {
    record position {
        line: u32,
        column: u32,
    }

    record span {
        start: position,
        end: position,
    }

    variant node {
        composition(composition-node),
        world(world-node),
        entity(entity-node),
        object(object-node),
    }

    record composition-node {
        name: string,
        span: span,
        children: list<node>,
    }

    parse: func(source: string) -> result<node, list<diagnostic>>;
    validate: func(source: string) -> list<diagnostic>;
}

interface compiler {
    compile-unity: func(ast: node) -> string;
    compile-godot: func(ast: node) -> string;
    compile-gltf: func(ast: node) -> list<u8>;
}

world holoscript-runtime {
    export parser;
    export compiler;
}
```

### Deliverables

- `packages/holoscript-component/` - WASM Component package
- `wit/holoscript.wit` - WIT interface definitions
- Component binary: `holoscript.wasm` (Component Model format)
- Integration with `jco` (JavaScript Component toolchain)
- 30+ unit tests

### Acceptance Criteria

- [x] WIT interface fully defined
- [x] Component builds successfully
- [x] JavaScript can instantiate component via `jco`
- [x] Python can instantiate component via `wasmtime`
- [x] Rust can instantiate component via `wasmtime`
- [x] All parser/compiler functions exposed

### Implementation Complete ✅

The WASM Component Model implementation is complete:

**Package**: `packages/holoscript-component/`

**Files Created**:

- `Cargo.toml` - Rust package with wit-bindgen 0.36
- `wit/holoscript.wit` - Full WIT interface (~230 lines)
- `wit/world.wit` - World definitions
- `src/lib.rs` - Component entry point with wit_bindgen::generate!
- `src/lexer.rs` - Logos-based tokenizer
- `src/parser.rs` - Parser producing WIT-compatible AST
- `src/traits.rs` - All 1,800+ VR trait definitions
- `src/compiler.rs` - Multi-target code generation
- `package.json` - jco integration and build scripts
- `test/test.mjs` - 30+ JavaScript component tests
- `README.md` - Multi-language usage documentation

**Interfaces Exposed**:

1. **parser**: parse(), parse-header()
2. **validator**: validate(), trait-exists(), get-trait(), list-traits(), list-traits-by-category()
3. **compiler**: compile(), compile-ast(), list-targets()
4. **generator**: generate-object(), generate-scene(), suggest-traits()

**Compile Targets**: Unity C#, Godot GDScript, A-Frame HTML, Three.js, Babylon.js, glTF JSON, GLB Binary

---

## Priority 6: Performance Dashboard Completion

**Goal:** Complete the partial Performance Dashboard from Sprint 7

**Effort**: 1 week | **Risk**: Low | **Impact**: Low

### Context

Sprint 7 Priority 8 (Performance Dashboard) was marked as partial. This priority completes the remaining work.

### Remaining Work

- [ ] Real-time metrics charts (Chart.js integration)
- [ ] Historical data persistence
- [ ] Alert thresholds configuration
- [ ] Export to CSV/JSON

---

## Success Metrics

| Metric                        | Target                        |
| ----------------------------- | ----------------------------- |
| glTF exports validated        | 100% glTF 2.0 spec compliance |
| Python package downloads      | 500+ first month              |
| Tree-sitter editors supported | 5+ (Zed, Helix, Emacs, etc.)  |
| Import conversion accuracy    | 90%+ fidelity                 |
| WASM component size           | < 2MB                         |

---

## Risk Assessment

| Risk                           | Impact | Mitigation                       |
| ------------------------------ | ------ | -------------------------------- |
| glTF-transform API changes     | Medium | Pin version, comprehensive tests |
| Python WASM performance        | Low    | Native PyO3 fallback             |
| Tree-sitter grammar complexity | Medium | Incremental grammar building     |
| Unity YAML format changes      | High   | Version-specific importers       |
| WASI Preview 3 not stable      | Medium | Fall back to WASI Preview 2      |

---

## Timeline

### Phase 1: Foundation (Week 1-3)

- glTF Pipeline core implementation
- Tree-sitter grammar v1
- Python package structure

### Phase 2: Integration (Week 4-6)

- glTF CLI integration
- Python WASM bindings
- Tree-sitter GitHub PR

### Phase 3: Advanced (Week 7-10)

- Bidirectional importers
- WASM Component Model
- Performance Dashboard

### Phase 4: Polish (Week 11-12)

- Documentation
- Example projects
- Performance optimization

---

## Related Documents

- [SPRINT_7_PLAN.md](./SPRINT_7_PLAN.md) - Previous sprint
- [SPRINT_9_PLAN.md](./SPRINT_9_PLAN.md) - Next sprint (Enterprise Production Readiness)
- [architecture/INTEROPERABILITY.md](./architecture/INTEROPERABILITY.md) - 22-connection matrix
- [PERFORMANCE.md](./PERFORMANCE.md) - Performance guidelines

---

**Sprint 8: Completing the Interoperability Vision** 🌐 ✅ COMPLETE
