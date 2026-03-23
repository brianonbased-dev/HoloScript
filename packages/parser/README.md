# @holoscript/parser

> HoloScript parser — tree-sitter grammars, tokenizer, AST types. Rust/WASM candidate.

## Overview

Standalone parser package providing tree-sitter grammars and a performant tokenizer for HoloScript's three file formats (`.holo`, `.hs`, `.hsplus`). Designed as a Rust/WASM compilation candidate for use in browsers and editors.

## Key Components

| Component | Purpose |
|-----------|---------|
| **Tokenizer** | Lexical analysis for all HoloScript formats |
| **Tree-sitter grammar** | Incremental parsing for editor integration |
| **AST Types** | TypeScript type definitions for the AST |

## Usage

```typescript
import { tokenize, parse } from '@holoscript/parser';

// Tokenize source
const tokens = tokenize(source);

// Parse to AST
const ast = parse(source, { format: 'holo' });
```

## Grammar

The tree-sitter grammar is defined in `grammar.js` and supports:
- `.holo` compositions (objects, environments, spatial groups)
- `.hs` templates (agents, streams, events)
- `.hsplus` modules (TypeScript-like types, imports, exports)

## Related

- [`@holoscript/core`](../core/) — Full parser implementations
- [`@holoscript/tree-sitter-holoscript`](../tree-sitter-holoscript/) — Tree-sitter bindings
- [Parser Internals](../../docs/architecture/PARSER_INTERNALS.md) — Architecture doc

## License

MIT
