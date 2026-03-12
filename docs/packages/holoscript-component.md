# HoloScript Component

**WASM Component Model distribution of HoloScript parsing and validation capabilities.**

## Overview

`@holoscript/component` packages HoloScript as a portable WASM Component so it can be instantiated from languages and runtimes that support the WASI Preview 3 component model.

## Installation

```bash
npm install @holoscript/component
```

## Use When

- You need language-agnostic WASM component integration.
- You want parsing and validation outside the JavaScript runtime.
- You are targeting portable host environments using the component model.

## Key Capabilities

- Portable component-style distribution.
- Parsing and validation in non-JS host environments.
- Useful bridge between HoloScript tooling and broader WASM ecosystems.

## See Also

- [Compiler WASM](./compiler-wasm.md)
- [WASM](./wasm.md)
- [Parser](./parser.md)
