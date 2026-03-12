# Parser

**Standalone HoloScript parser package for grammars, tokenization, and AST structures.**

## Overview

`@holoscript/parser` isolates the parsing layer behind HoloScript syntax handling. It is useful when you need AST generation without bringing in broader compiler or runtime functionality.

## Installation

```bash
npm install @holoscript/parser
```

## Use When

- You need syntax parsing without the full compiler stack.
- You are building custom tools, analysis, or transforms.
- You want a lighter-weight AST-oriented dependency.

## Key Capabilities

- Tokenization and parsing infrastructure.
- AST-focused tooling entry point.
- Useful for editors, linters, and code intelligence.

## See Also

- [Core](./core.md)
- [Tree-sitter HoloScript](./tree-sitter-holoscript.md)
- [Linter](./linter.md)
