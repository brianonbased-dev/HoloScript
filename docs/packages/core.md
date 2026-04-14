# @holoscript/core

**The semantic engine at the heart of HoloScript.** Full-featured parser, AST, validator, trait system, and compiler infrastructure.

## Overview

Core is the foundation. Everything else depends on it—traits, compilers, runtime, tooling.

- **Parser** — Converts `.hs`, `.hsplus`, `.holo` source to AST
- **Traits system** — semantic trait definitions (verify current inventory in `packages/core/src/traits/`)
- **Validators** — Type checking, scope analysis, trait validation
- **Compiler infrastructure** — Base classes and target registries (verify keys via `ExportTarget`)
- **AST manipulation** — Query, walk, transform code
- **Standalone** — Works without browser/Node.js (suitable for WASM)

## Installation

```bash
npm install @holoscript/core
```

## Quick Start

### Parse & Validate

```typescript
import { HoloCompositionParser, validateAST } from '@holoscript/core';

const source = `
  composition "MyGame" {
    object "Cube" {
      @grabbable
      geometry: "box"
    }
  }
`;

const parser = new HoloCompositionParser();
const ast = parser.parse(source);

// Validate
const diagnostics = validateAST(ast);
if (diagnostics.errors.length > 0) {
  diagnostics.errors.forEach((err) => console.error(err.message));
}
```

### Compile to Any Target

```typescript
import { getCompiler } from '@holoscript/core';

const compiler = getCompiler('unity'); // Also: 'godot', 'webgpu', 'ros2', etc.
const result = await compiler.compile(ast, {
  optimize: 'balanced',
});

console.log(result.code); // C# code ready for Unity
```

### Query the AST

```typescript
import { walkAST, findObjects } from '@holoscript/core';

// Find all objects with @grabbable trait
const grabbable = findObjects(ast, (obj) => obj.traits.some((t) => t.name === '@grabbable'));

// Walk entire tree
walkAST(ast, (node) => {
  if (node.type === 'template') {
    console.log(`Template: ${node.name}`);
  }
});
```

## Core Types

```typescript
// Composition (root node)
interface Composition {
  type: 'composition';
  name: string;
  items: (Template | Object | Logic)[];
}

// Template (reusable type)
interface Template {
  type: 'template';
  name: string;
  traits: Trait[];
  properties: Property[];
  actions: Action[];
  state?: StateBlock;
}

// Object (instance)
interface HoloObject {
  type: 'object';
  name: string;
  templateName?: string; // 'using' keyword
  traits: Trait[];
  properties: Property[];
  events: EventHandler[];
}

// Trait (semantic annotation)
interface Trait {
  name: string; // e.g., '@grabbable'
  category: string; // e.g., 'interaction'
  params?: Record<string, any>;
}
```

## API Reference

### Parsing

```typescript
// Parse .holo files (recommended for AI generation)
const holoParser = new HoloCompositionParser();
const ast = holoParser.parse(source);

// Parse .hsplus files (classic language)
const hsParser = new HoloScriptPlusParser();
const ast = hsParser.parse(source);

// Parse .hs files (original format)
const hsClassicParser = new HoloScriptParser();
const ast = hsClassicParser.parse(source);
```

### Validation

```typescript
import { validateAST, validateNode } from '@holoscript/core';

// Full validation
const diagnostics = validateAST(ast);
console.log(diagnostics.errors); // Critical errors
console.log(diagnostics.warnings); // Non-critical

// Single node
const nodeDiags = validateNode(ast, node);
```

### Traits

```typescript
import { listTraits, getTrait, searchTraits } from '@holoscript/core';

// List all traits
const all = listTraits();

// Get specific trait info
const grabbable = getTrait('@grabbable');
console.log(grabbable.description);
console.log(grabbable.platforms); // Where it's supported

// Search by keyword
const physics = searchTraits('physics');
```

### Compilation

```typescript
import { compile, listCompilers, getCompiler, CompileOptions } from '@holoscript/core';

// List available compilers
console.log(listCompilers());
// ['unity', 'godot', 'webgpu', 'ros2', 'unreal', ...]

// Compile to target
const options: CompileOptions = {
  target: 'webgpu',
  optimize: 'aggressive',
  debugInfo: false,
};

const result = await compile(ast, options);
console.log(result.code);
console.log(result.metadata.compilationTime);
```

## Advanced

### Custom Compiler

```typescript
import { BaseCompiler } from '@holoscript/core';

class MyLanguageCompiler extends BaseCompiler {
  compileObject(obj: HoloObject): string {
    let code = `object ${obj.name} {\n`;
    obj.traits.forEach((t) => {
      code += `  apply_trait("${t.name}")\n`;
    });
    code += `}\n`;
    return code;
  }
}

// Register and use
registerCompiler('mylang', MyLanguageCompiler);
const result = await compile(ast, { target: 'mylang' });
```

### AST Transformation

```typescript
import { transformAST, NodeTransformer } from '@holoscript/core';

class AddGlowTransformer extends NodeTransformer {
  visitObject(obj: HoloObject) {
    // Add @glowing to all objects
    if (!obj.traits.some((t) => t.name === '@glowing')) {
      obj.traits.push({ name: '@glowing', category: 'visual' });
    }
    return obj;
  }
}

const transformed = transformAST(ast, new AddGlowTransformer());
```

## Performance

- Parser: ~10ms for typical scenes
- Validation: ~5ms
- Compilation: varies by target (50-500ms)
- Traits lookup: O(1) cached

## See Also

- [Compiler package](./compiler.md) — Details on compilation targets
- [Traits reference](../guides/traits.md) — trait catalog
- [Language spec](../language/holoscript-language-spec.md) — Full grammar
