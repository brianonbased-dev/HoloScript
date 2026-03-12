# Package Reference

Discover HoloScript's 60+ packages organized by purpose. Each package is independently useful and composable.

## Core Execution

The foundational layer that parses, validates, and executes HoloScript code.

| Package | Purpose |
|---------|---------|
| [**@holoscript/core**](./core.md) | Parser, AST, validator, all 30+ compilers |
| [**@holoscript/runtime**](./runtime.md) | Browser/WebGPU scene execution, physics, interaction |
| [**@holoscript/compiler**](./compiler.md) | Compilation engine to 30+ platforms |
| [**@holoscript/traits**](./traits.md) | 2,000+ semantic trait definitions |

## Developer Tools

Tools for writing, testing, and debugging HoloScript.

| Package | Purpose |
|---------|---------|
| [**@holoscript/cli**](./cli.md) | Command-line interface (parse, compile, validate) |
| [**@holoscript/lsp**](./lsp.md) | Language Server Protocol for IDE integration |
| [**@holoscript/formatter**](./formatter.md) | Code formatting and style consistency |
| [**@holoscript/linter**](./linter.md) | Static analysis and error detection |
| [**@holoscript/test**](./test.md) | Testing framework and visual regression |
| [**@holoscript/benchmark**](./benchmark.md) | Performance measurement and profiling |

## Editor Extensions

Plugins for popular editors.

| Package | Purpose |
|---------|---------|
| [**@holoscript/vscode**](./vscode-extension.md) | VS Code language support |
| [**@holoscript/neovim**](./neovim.md) | Neovim plugin |
| [**@holoscript/intellij**](./intellij.md) | IntelliJ / JetBrains IDE plugin |
| [**@holoscript/visual**](./visual-editor.md) | Node-based visual editor |

## Integration & Platforms

SDKs and adapters for external systems.

| Package | Purpose |
|---------|---------|
| [**@holoscript/mcp-server**](./mcp-server.md) | 65+ Model Context Protocol tools for AI agents |
| [**@holoscript/unity-sdk**](./unity-sdk.md) | Unity engine integration |
| [**@holoscript/unreal-sdk**](./unreal-sdk.md) | Unreal Engine plugin |
| [**@holoscript/sdk**](./sdk.md) | JavaScript/TypeScript SDK for web apps |
| [**@holoscript/partner-sdk**](./partner-sdk.md) | Third-party integration kit |

## AI & Autonomy

Machine learning, LLM, and autonomous agent capabilities.

| Package | Purpose |
|---------|---------|
| [**@holoscript/llm-provider**](./llm-provider.md) | Unified LLM interface (OpenAI, Anthropic, Gemini) |
| [**@holoscript/ai-validator**](./ai-validator.md) | AI hallucination detection |
| [**@holoscript/agent-sdk**](./agent-sdk.md) | Build autonomous agents |
| [**@holoscript/agent-protocol**](./agent-protocol.md) | uAA2++ agent lifecycle framework |

## Infrastructure & Networking

Backend services, databases, and distributed systems.

| Package | Purpose |
|---------|---------|
| [**@holoscript/registry**](./registry.md) | Package registry and marketplace API |
| [**@holoscript/collab-server**](./collab-server.md) | Real-time collaboration backend |
| [**@holoscript/crdt**](./crdt.md) | Conflict-free replicated data types |
| [**@holoscript/adapter-postgres**](./adapters.md#postgres) | PostgreSQL database adapter |
| [**@holoscript/graphql-api**](./graphql-api.md) | GraphQL schema generation and API |
| [**@holoscript/marketplace-api**](./marketplace-api.md) | Asset marketplace backend |

## Spatial & Physics

Spatial computing, physics simulation, and rendering.

| Package | Purpose |
|---------|---------|
| [**@holoscript/spatial-engine**](./spatial-engine.md) | Core spatial indexing and queries |
| [**@holoscript/spatial-index**](./spatial-index.md) | Optimized spatial data structures |
| [**@holoscript/crdt-spatial**](./crdt-spatial.md) | Distributed spatial replicated data |
| [**@holoscript/r3f-renderer**](./r3f-renderer.md) | React Three Fiber rendering adapter |

## Advanced & Experimental

Emerging capabilities and specialized domains.

| Package | Purpose |
|---------|---------|
| [**@holoscript/snn-poc**](./snn.md) | Spiking neural network proof-of-concept |
| [**@holoscript/snn-webgpu**](./snn-webgpu.md) | SNN inference on WebGPU |
| [**@holoscript/security-sandbox**](./security-sandbox.md) | Secure code execution environment |
| [**@holoscript/compiler-wasm**](./compiler-wasm.md) | WebAssembly compilation target |
| [**@holoscript/uaal**](./uaal.md) | Universal Autonomous Agent Language VM |

## Python & Robotics

Language bindings and robotics frameworks.

| Package | Purpose |
|---------|---------|
| [**holoscript (PyPI)**](./python-bindings.md) | Python language bindings and robotics module |

## Browser & Web

Web-specific tools and components.

| Package | Purpose |
|---------|---------|
| [**@holoscript/wasm**](./wasm.md) | WebAssembly parser for browsers |
| [**@holoscript/holoscript-cdn**](./holoscript-cdn.md) | CDN distribution and edge compilation |
| [**@holoscript/preview-component**](./preview-component.md) | Embeddable 3D scene previews for web |
| [**@holoscript/playground**](./playground.md) | Interactive online editor |

## Utilities & Standards

Helper libraries and standards.

| Package | Purpose |
|---------|---------|
| [**@holoscript/std**](./std.md) | Standard library (types, math, collections) |
| [**@holoscript/fs**](./fs.md) | Filesystem utilities and file watching |
| [**@holoscript/components**](./components.md) | Reusable scene components |

---

## Learning Resources

**New to HoloScript?** Start here:

1. [**Academy Level 1**](../academy/level-1-fundamentals/) — Fundamentals (5 lessons)
2. [**What is HoloScript?**](../guides/what-is-holoscript.md) — Philosophy and design
3. [**Quickstart**](../guides/quickstart.md) — Your first scene (5 minutes)
4. [**Traits Guide**](../guides/traits.md) — Learn the 2,000+ trait system

## Contributing

All packages follow the [HoloScript contribution guidelines](../../CONTRIBUTING.md).

Interested in adding a new package or feature? [Open an issue](https://github.com/hololand/HoloScript/issues) or [start a discussion](https://github.com/hololand/HoloScript/discussions).

HoloScript includes a broad monorepo package surface. This section documents key runtime and tooling packages that are currently underrepresented in user-facing docs.

## First-Wave Packages

- [Agent SDK](./agent-sdk) - mesh discovery, signaling, gossip sync, MCP tool schema primitives
- [Studio Bridge](./studio-bridge) - bidirectional Visual <-> AST translation and sync engine
- [Holo VM](./holo-vm) - bytecode format and native VM execution runtime
- [CRDT Spatial](./crdt-spatial) - multiplayer spatial transform sync with hybrid rotation strategy
- [Spatial Index](./spatial-index) - high-performance R-Tree indexing and anchor storage

## When to Use These

- Use Agent SDK for distributed multi-agent topology, local mesh signaling, and protocol-level interoperability helpers.
- Use Studio Bridge when integrating visual graph editing with HoloScript code and AST transformations.
- Use Holo VM when compiling to bytecode and executing deterministic scene logic across runtimes.
- Use CRDT Spatial for collaborative transform synchronization in shared worlds.
- Use Spatial Index for nearest-neighbor and bounded geospatial anchor queries.
