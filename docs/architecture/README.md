# Architecture Documentation

Deep-dive documentation into HoloScript's internal systems.

## Core Architecture

1. **[Ecosystem Spine](./ECOSYSTEM_SPINE.md)** — Maps the NORTH_STAR vision to exact concrete HoloScript locations.
2. **[Platform Architecture](./PLATFORM_ARCHITECTURE.md)** — High-level platform design
3. **[AI Architecture](./AI_ARCHITECTURE.md)** — AI/ML integration patterns
4. **[WASM Lazy Loading](./WASM_LAZY_LOADING_ARCHITECTURE.md)** — WebAssembly loading strategy
5. **[Interoperability](./INTEROPERABILITY.md)** — Cross-platform interop

## System Internals

5. **[Trait System](./TRAIT_SYSTEM.md)** — CrossRealityTraitRegistry flow, registration → resolution → compilation
6. **[Parser Internals](./PARSER_INTERNALS.md)** — 5-parser hierarchy, AST types, parse → compile → run pipeline
7. **[Runtime & ECS](./RUNTIME_ECS.md)** — SceneRunner, HeadlessRuntime, entity lifecycle
8. **[Extension System](./EXTENSION_SYSTEM.md)** — Disambiguating the 4 uses of "extension" (plugin, file, glTF, OpenXR)
9. **[Internal MCP](./INTERNAL_MCP.md)** — Dual MCP system + 3-layer spatial agent protocol

## Specialized

10. **[AI Use Cases](./AI_USE_CASES.md)** — Applied AI scenarios
11. **[Stores Audit](./stores-audit.md)** — State management audit
12. **[The Dumb Glass](./the-dumb-glass-architecture.md)** — Epoch 8 Spatial Rendering Paradigm
