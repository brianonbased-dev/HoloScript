# Architecture Documentation

Deep-dive documentation into HoloScript's internal systems.

## Core Architecture

1. **[Ecosystem Spine](./ECOSYSTEM_SPINE.md)** - Maps the NORTH_STAR vision to exact concrete HoloScript locations.
2. **[Platform Architecture](./PLATFORM_ARCHITECTURE.md)** - High-level platform design.
3. **[AI Architecture](./AI_ARCHITECTURE.md)** - AI/ML integration patterns.
4. **[WASM Lazy Loading](./WASM_LAZY_LOADING_ARCHITECTURE.md)** - WebAssembly loading strategy.
5. **[Interoperability](./INTEROPERABILITY.md)** - Cross-platform interop.
6. **[Universal Use Boundary](./universal-use-boundary.md)** - Distinguishes engine contribution, local projects, hosted MCP/API use, Studio workspaces, and service/container images.

## System Internals

1. **[Trait System](./TRAIT_SYSTEM.md)** - CrossRealityTraitRegistry flow, registration to resolution to compilation.
2. **[Parser Internals](./PARSER_INTERNALS.md)** - Parser hierarchy, AST types, parse to compile to run pipeline.
3. **[Runtime & ECS](./RUNTIME_ECS.md)** - SceneRunner, HeadlessRuntime, entity lifecycle.
4. **[Extension System](./EXTENSION_SYSTEM.md)** - Disambiguating plugin, file, glTF, and OpenXR extension surfaces.
5. **[Internal MCP](./INTERNAL_MCP.md)** - Dual MCP system and spatial agent protocol.

## Specialized

1. **[AI Use Cases](./AI_USE_CASES.md)** - Applied AI scenarios.
2. **[Absorb Intelligence Spine](./absorb-intelligence-spine.md)** - Canonical boundary between Absorb, HoloGraph, HoloEmbed, and HoloLlama.
3. **[Stores Audit](./stores-audit.md)** - State management audit.
4. **[The Dumb Glass](./the-dumb-glass-architecture.md)** - Epoch 8 Spatial Rendering Paradigm.
