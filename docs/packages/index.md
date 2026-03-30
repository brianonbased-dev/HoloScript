# Package Reference

HoloScript currently ships as a monorepo with **59 real packages** under `packages/`. This section documents the public package surface and separates it from support directories that exist in the repo but are not published package manifests.

## Language & Runtime Core

| Package                                                | Purpose                                                |
| ------------------------------------------------------ | ------------------------------------------------------ |
| [**@holoscript/core**](./core.md)                      | Core parser, AST, validation, and compiler-facing APIs |
| [**@holoscript/parser**](./parser.md)                  | Standalone parsing and AST generation                  |
| [**@holoscript/compiler**](./compiler.md)              | Main compilation engine                                |
| [**@holoscript/runtime**](./runtime.md)                | Scene execution runtime                                |
| [**@holoscript/engine**](./engine.md)                  | Lower-level spatial engine systems                     |
| [**@holoscript/traits**](./traits.md)                  | Trait definitions and trait-oriented semantics         |
| [**@holoscript/std**](./std.md)                        | Standard library utilities and shared types            |
| [**@holoscript/fs**](./fs.md)                          | Filesystem utilities for tooling and local workflows   |
| [**@holoscript/holo-vm**](./holo-vm.md)                | VM-oriented execution runtime                          |
| [**@holoscript/wasm**](./compiler-wasm.md)             | WebAssembly parser and compilation surface             |
| [**@holoscript/component**](./holoscript-component.md) | WASM Component Model packaging                         |

## Developer Tools

| Package                                                               | Purpose                                |
| --------------------------------------------------------------------- | -------------------------------------- |
| [**@holoscript/cli**](./cli.md)                                       | Command-line workflows                 |
| [**@holoscript/formatter**](./formatter.md)                           | Code formatting                        |
| [**@holoscript/linter**](./linter.md)                                 | Static analysis                        |
| [**@holoscript/lsp**](./lsp.md)                                       | Language Server Protocol support       |
| [**@holoscript/test**](./test.md)                                     | Shared testing framework               |
| [**@holoscript/benchmark**](./benchmark.md)                           | Internal performance benchmarking      |
| [**@holoscript/comparative-benchmarks**](./comparative-benchmarks.md) | Cross-stack performance comparisons    |
| [**tree-sitter-holoscript**](./tree-sitter-holoscript.md)             | Tree-sitter grammar for editor tooling |

## Editors, Authoring, and Previews

| Package                                                     | Purpose                                |
| ----------------------------------------------------------- | -------------------------------------- |
| [**@holoscript/studio**](./studio.md)                       | Visual IDE and authoring environment   |
| [**@holoscript/studio-bridge**](./studio-bridge.md)         | Visual-to-AST synchronization layer    |
| [**@holoscript/studio-plugin-sdk**](./studio-plugin-sdk.md) | Plugin SDK for Studio extensions       |
| [**@holoscript/studio-desktop**](./tauri-app.md)            | Native desktop shell for Studio        |
| [**@holoscript/vscode**](./vscode-extension.md)             | VS Code extension                      |
| [**@holoscript/neovim**](./neovim.md)                       | Neovim integration                     |
| [**@holoscript/visual**](./visual.md)                       | Node-based visual programming layer    |
| [**@holoscript/playground**](./playground.md)               | Browser playground                     |
| [**@holoscript/preview-component**](./preview-component.md) | Embeddable React preview component     |
| [**@holoscript/video-tutorials**](./video-tutorials.md)     | Programmatic tutorial video generation |
| [**visualizer-client**](./visualizer-client.md)             | Internal preview and debugging client  |

## Web, SDKs, and Platform Delivery

| Package                                             | Purpose                                   |
| --------------------------------------------------- | ----------------------------------------- |
| [**@holoscript/sdk**](./sdk.md)                     | Primary JavaScript and TypeScript SDK     |
| [**@holoscript/sdk** distribution](./holoscript.md) | Consolidated SDK distribution entry point |
| [**@holoscript/cdn**](./holoscript-cdn.md)          | CDN-oriented browser embedding            |
| [**@holoscript/unity-sdk**](./unity-sdk.md)         | Unity integration                         |
| [**@holoscript/mcp-server**](./mcp-server.md)       | MCP tools for AI agents and IDEs          |
| [**@holoscript/r3f-renderer**](./r3f-renderer.md)   | React Three Fiber renderer helpers        |

## AI, Agents, and Virtual Machines

| Package                                               | Purpose                                  |
| ----------------------------------------------------- | ---------------------------------------- |
| [**@holoscript/llm-provider**](./llm-provider.md)     | Unified model-provider interface         |
| [**@holoscript/ai-validator**](./ai-validator.md)     | Validation for AI-generated output       |
| [**@holoscript/agent-sdk**](./agent-sdk.md)           | Agent development primitives             |
| [**@holoscript/agent-protocol**](./agent-protocol.md) | uAA2++ lifecycle framework               |
| [**@holoscript/intelligence**](./intelligence.md)     | Higher-level intelligence orchestration  |
| [**@holoscript/uaal**](./uaal.md)                     | Universal Autonomous Agent Language VM   |
| [**@holoscript/vm-bridge**](./vm-bridge.md)           | Bridge between scene and agent VMs       |
| [**@hololand/react-agent-sdk**](./react-agent-sdk.md) | React hooks and components for agent UIs |

## Services, Data, and Collaboration

| Package                                                   | Purpose                                     |
| --------------------------------------------------------- | ------------------------------------------- |
| [**@holoscript/auth**](./auth.md)                         | Authentication and authorization            |
| [**@holoscript/security-sandbox**](./security-sandbox.md) | Safe execution for untrusted logic          |
| [**@holoscript/partner-sdk**](./partner-sdk.md)           | Partner API, webhooks, and analytics        |
| [**@holoscript/registry**](./registry.md)                 | Registry and workspace service layer        |
| [**@holoscript/marketplace-api**](./marketplace-api.md)   | Marketplace backend APIs                    |
| [**@holoscript/marketplace-web**](./marketplace-web.md)   | Marketplace web frontend                    |
| [**@holoscript/graphql-api**](./graphql-api.md)           | GraphQL service layer                       |
| [**@holoscript/adapter-postgres**](./adapter-postgres.md) | PostgreSQL adapter                          |
| [**@holoscript/collab-server**](./collab-server.md)       | Collaboration relay backend                 |
| [**@holoscript/crdt**](./crdt.md)                         | Distributed CRDT primitives                 |
| [**@holoscript/crdt-spatial**](./crdt-spatial.md)         | Spatial synchronization via CRDTs           |
| [**@holoscript/mvc-schema**](./mvc-schema.md)             | Context schema for synchronized agent state |

## Spatial, Animation, and Research

| Package                                                     | Purpose                                         |
| ----------------------------------------------------------- | ----------------------------------------------- |
| [**@holoscript/spatial-index**](./spatial-index.md)         | Spatial indexing and lookup                     |
| [**@holoscript/animation-presets**](./animation-presets.md) | Reusable animation configuration bundles        |
| [**@holoscript/snn-poc**](./snn-poc.md)                     | Experimental WebGPU spiking-neural prototype    |
| [**@holoscript/snn-webgpu**](./snn-webgpu.md)               | Higher-throughput WebGPU spiking neural compute |

## What Is Not Counted Here

The repo also contains support directories under `packages/` that are useful internally but do **not** currently expose their own `package.json`. Examples include `components`, `intellij`, `plugins`, `python-bindings`, `spatial-engine`, and `shader-preview-wgpu`.

Those directories are documented separately in [Support Directories](./support-directories.md), but they are not part of the current 59-package manifest count used in this reference.

## Suggested Starting Points

1. Start with [Core](./core.md), [Runtime](./runtime.md), and [Compiler](./compiler.md) if you want the execution model.
2. Start with [SDK](./sdk.md), [Preview Component](./preview-component.md), and [Playground](./playground.md) if you want web embedding.
3. Start with [Agent Protocol](./agent-protocol.md), [LLM Provider](./llm-provider.md), and [UAAL](./uaal.md) if you want autonomous systems.
4. Start with [Studio](./studio.md), [Studio Plugin SDK](./studio-plugin-sdk.md), and [Visual](./visual.md) if you want authoring workflows.
5. Read [Support Directories](./support-directories.md) if you are navigating repo-only surfaces under `packages/`.
6. Read [Governance Matrix](./governance.md) for per-package support levels and owners.
