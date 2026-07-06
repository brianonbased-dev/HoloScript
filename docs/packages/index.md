# Package Reference

HoloScript currently ships as a monorepo with **real packages** under `packages/`. This section documents the public package surface and separates it from support directories that exist in the repo but are not published package manifests.

> **Zero hardcoded stats.** Verify current package counts via `find packages -maxdepth 1 -type d -name "[^.]*" | wc -l` and cross-check against `docs/cross-language-deletion-ledger.md`.

## Language & Runtime Core

| Package                                    | Purpose                                             |
| ------------------------------------------ | --------------------------------------------------- |
| [**@holoscript/core**](./core.md)          | Core parser, AST, validation, compilers, and traits |
| [**@holoscript/core-types**](./core-types.md) | Lightweight shared TypeScript type definitions  |
| [**@holoscript/runtime**](./runtime.md)    | Scene execution runtime                             |
| [**@holoscript/engine**](./engine.md)      | Lower-level spatial engine systems                  |
| [**@holoscript/std**](./std.md)            | Standard library utilities and shared types         |
| [**@holoscript/holo-vm**](./holo-vm.md)    | VM-oriented execution runtime                       |
| [**@holoscript/wasm**](./compiler-wasm.md) | WebAssembly parser and compilation surface          |

> `@holoscript/parser`, `@holoscript/compiler`, and `@holoscript/traits` were merged into `@holoscript/core` (2026-04-29). `@holoscript/fs` was merged into `@holoscript/std/fs`. See the [deletion ledger](../cross-language-deletion-ledger.md).

## Developer Tools

| Package                                                               | Purpose                                |
| --------------------------------------------------------------------- | -------------------------------------- |
| [**@holoscript/cli**](./cli.md)                                       | Command-line workflows                 |
| [**@holoscript/formatter**](./formatter.md)                           | Code formatting                        |
| [**@holoscript/linter**](./linter.md)                                 | Static analysis                        |
| [**@holoscript/lsp**](./lsp.md)                                       | Language Server Protocol support       |
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
| [**holoscript-vscode**](./vscode-extension.md)              | VS Code extension                      |
| [**@holoscript/visual**](./visual.md)                       | Node-based visual programming layer    |
| [**@holoscript/preview-component**](./preview-component.md) | Embeddable React preview component     |
| [**@holoscript/video-tutorials**](./video-tutorials.md)     | Programmatic tutorial video generation |
| [**visualizer-client**](./visualizer-client.md)             | Internal preview and debugging client  |

## Web, SDKs, and Platform Delivery

| Package                                             | Purpose                                   |
| --------------------------------------------------- | ----------------------------------------- |
| [**@holoscript/core**](./core.md)                   | Primary JavaScript and TypeScript SDK     |
| [**@holoscript/sdk**](./sdk.md)                     | Compatibility shim for older consumers    |
| [**@holoscript/cdn**](./holoscript-cdn.md)          | CDN-oriented browser embedding            |
| [**@holoscript/platform**](./platform.md)           | Enterprise security, identity, and Web3   |
| [**@holoscript/mcp-server**](./mcp-server.md)       | MCP tools for AI agents and IDEs          |
| [**@holoscript/memory**](./memory.md)               | Sovereign agent-memory client             |
| [**@holoscript/holollama**](./holollama.md)         | Native llama.cpp serving utilities        |
| [**@holoscript/r3f-renderer**](./r3f-renderer.md)   | React Three Fiber renderer helpers        |
| [**@holoscript/xr-embodiment**](./xr-embodiment.md) | WebXR locomotion and agent avatars        |
| [**@holoscript/hololand-platform**](./hololand-platform.md) | HoloLand VR-world services        |

## AI, Agents, and Virtual Machines

| Package                                               | Purpose                                  |
| ----------------------------------------------------- | ---------------------------------------- |
| [**@holoscript/llm-provider**](./llm-provider.md)     | Unified model-provider interface         |
| [**@holoscript/ai-validator**](./ai-validator.md)     | Validation for AI-generated output       |
| [**@holoscript/agent-protocol**](./agent-protocol.md) | uAA2++ lifecycle framework               |
| [**@holoscript/uaal**](./uaal.md)                     | Universal Autonomous Agent Language VM   |
| [**@holoscript/holo-runtime**](./holo-runtime.md)     | HoloRunner S0 CPU decoder runtime        |
| [**@holoscript/framework**](./framework.md)           | Agent memory, learning, and orchestration |
| [**@holoscript/holoscript-agent**](./holoscript-agent.md) | Headless HoloMesh agent runtime       |
| [**@hololand/react-agent-sdk**](./react-agent-sdk.md) | React hooks and components for agent UIs |

> `@holoscript/agent-sdk` was superseded by `@holoscript/framework`. `@holoscript/intelligence` was retired. See the [deletion ledger](../cross-language-deletion-ledger.md).

## Services, Data, and Collaboration

| Package                                                   | Purpose                                     |
| --------------------------------------------------------- | ------------------------------------------- |
| [**@holoscript/absorb-service**](./absorb-service.md)     | Codebase intelligence and GraphRAG engine   |
| [**@holoscript/auth**](./auth.md)                         | Authentication and authorization            |
| [**@holoscript/security-sandbox**](./security-sandbox.md) | Safe execution for untrusted logic          |
| [**@holoscript/secrets-broker**](./secrets-broker.md)     | HoloKey capability-token and secret broker  |
| [**@holoscript/partner-sdk**](./partner-sdk.md)           | Partner API, webhooks, and analytics        |
| [**@holoscript/registry**](./registry.md)                 | Registry and workspace service layer        |
| [**@holoscript/marketplace-api**](./marketplace-api.md)   | Marketplace backend APIs                    |
| [**@holoscript/marketplace-web**](./marketplace-web.md)   | Marketplace web frontend                    |
| [**@holoscript/graphql-api**](./graphql-api.md)           | GraphQL service layer                       |
| [**@holoscript/adapter-postgres**](./adapter-postgres.md) | PostgreSQL adapter                          |
| [**@holoscript/mesh**](./mesh.md)                         | Network and collaboration runtime           |
| [**@holoscript/crdt**](./crdt.md)                         | Distributed CRDT primitives                 |
| [**@holoscript/crdt-spatial**](./crdt-spatial.md)         | Spatial synchronization via CRDTs           |
| [**@holoscript/mvc-schema**](./mvc-schema.md)             | Context schema for synchronized agent state |

> `@holoscript/collab-server` was merged into `@holoscript/mcp-server` (2026-04-29). See the [deletion ledger](../cross-language-deletion-ledger.md).

## Spatial, Animation, and Research

| Package                                                     | Purpose                                         |
| ----------------------------------------------------------- | ----------------------------------------------- |
| [**@holoscript/spatial-index**](./spatial-index.md)         | Spatial indexing and lookup                     |
| [**@holoscript/animation-presets**](./animation-presets.md) | Reusable animation configuration bundles        |
| [**@holoscript/snn-webgpu**](./snn-webgpu.md)               | Higher-throughput WebGPU spiking neural compute |

> `@holoscript/snn-poc` was superseded by `@holoscript/snn-webgpu` (2026-04-29). See the [deletion ledger](../cross-language-deletion-ledger.md).

## Domain Plugins

| Package                                                   | Purpose                         |
| --------------------------------------------------------- | ------------------------------- |
| [**@holoscript/plugin-film-vfx**](./plugin-film-vfx.md)   | Film, VFX, and virtual production traits |

## What Is Not Counted Here

The repo also contains support directories under `packages/` that are useful internally but do **not** currently expose their own `package.json`. Nested plugin directories with package manifests are documented above as domain plugins; package-free support directories are documented separately.

Those directories are documented separately in [Support Directories](./support-directories.md), but they are not part of the current public package manifest count used in this reference. Historical packages (retired, merged, or migrated) are recorded in the [Cross-Language Deletion Ledger](../cross-language-deletion-ledger.md) and archived under `docs/archive/packages/`.

## Suggested Starting Points

1. Start with [Core](./core.md), [Runtime](./runtime.md), and [Engine](./engine.md) if you want the execution model.
2. Start with [SDK](./sdk.md), [Preview Component](./preview-component.md), and [Studio](./studio.md) if you want web embedding.
3. Start with [Agent Protocol](./agent-protocol.md), [LLM Provider](./llm-provider.md), and [UAAL](./uaal.md) if you want autonomous systems.
4. Start with [Studio](./studio.md), [Studio Plugin SDK](./studio-plugin-sdk.md), and [Visual](./visual.md) if you want authoring workflows.
5. Read [Support Directories](./support-directories.md) if you are navigating repo-only surfaces under `packages/`.
6. Read [Governance Matrix](./governance.md) for per-package support levels and owners.
7. Read [npm Package Canonicalization](../handbooks/npm-package-canonicalization.md) before publishing, deprecating, or promoting npm packages.
