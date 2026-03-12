# Package Governance Matrix

This matrix assigns a support level to each documented package so contributors can quickly see what is production-safe, what is moving, and what is experimental.

## Support Levels

- `stable`: Supported for production use. Breaking changes require migration notes.
- `beta`: Actively developed, API may evolve between minor versions.
- `experimental`: Research or incubator package; API can change without compatibility guarantees.

## Ownership Policy

- Core platform packages: HoloScript Core Team
- Studio/editor packages: Studio Team
- Agent/AI packages: Agent Systems Team
- Services/data packages: Platform Services Team
- Research packages: R&D Team

## Matrix

| Package | Level | Owning Team |
| ------- | ----- | ----------- |
| `@holoscript/core` | stable | HoloScript Core Team |
| `@holoscript/parser` | stable | HoloScript Core Team |
| `@holoscript/compiler` | stable | HoloScript Core Team |
| `@holoscript/runtime` | stable | HoloScript Core Team |
| `@holoscript/engine` | beta | HoloScript Core Team |
| `@holoscript/traits` | stable | HoloScript Core Team |
| `@holoscript/std` | stable | HoloScript Core Team |
| `@holoscript/fs` | stable | HoloScript Core Team |
| `@holoscript/holo-vm` | beta | Agent Systems Team |
| `@holoscript/wasm` | stable | HoloScript Core Team |
| `@holoscript/component` | beta | HoloScript Core Team |
| `@holoscript/cli` | stable | HoloScript Core Team |
| `@holoscript/formatter` | stable | HoloScript Core Team |
| `@holoscript/linter` | stable | HoloScript Core Team |
| `@holoscript/lsp` | stable | HoloScript Core Team |
| `@holoscript/test` | beta | HoloScript Core Team |
| `@holoscript/benchmark` | beta | HoloScript Core Team |
| `@holoscript/comparative-benchmarks` | beta | HoloScript Core Team |
| `tree-sitter-holoscript` | stable | HoloScript Core Team |
| `@holoscript/studio` | beta | Studio Team |
| `@holoscript/studio-bridge` | beta | Studio Team |
| `@holoscript/studio-plugin-sdk` | beta | Studio Team |
| `@holoscript/studio-desktop` | beta | Studio Team |
| `@holoscript/vscode` | stable | Studio Team |
| `@holoscript/neovim` | beta | Studio Team |
| `@holoscript/visual` | beta | Studio Team |
| `@holoscript/playground` | beta | Studio Team |
| `@holoscript/preview-component` | stable | Studio Team |
| `@holoscript/video-tutorials` | beta | Studio Team |
| `visualizer-client` | beta | Studio Team |
| `@holoscript/sdk` | stable | HoloScript Core Team |
| `@holoscript/cdn` | beta | Platform Services Team |
| `@holoscript/unity-sdk` | beta | Platform Services Team |
| `@holoscript/mcp-server` | stable | Agent Systems Team |
| `@holoscript/r3f-renderer` | beta | Studio Team |
| `@holoscript/llm-provider` | stable | Agent Systems Team |
| `@holoscript/ai-validator` | stable | Agent Systems Team |
| `@holoscript/agent-sdk` | beta | Agent Systems Team |
| `@holoscript/agent-protocol` | beta | Agent Systems Team |
| `@holoscript/intelligence` | beta | Agent Systems Team |
| `@holoscript/uaal` | experimental | Agent Systems Team |
| `@holoscript/vm-bridge` | beta | Agent Systems Team |
| `@hololand/react-agent-sdk` | beta | Agent Systems Team |
| `@holoscript/auth` | stable | Platform Services Team |
| `@holoscript/security-sandbox` | stable | Platform Services Team |
| `@holoscript/partner-sdk` | beta | Platform Services Team |
| `@holoscript/registry` | beta | Platform Services Team |
| `@holoscript/marketplace-api` | beta | Platform Services Team |
| `@holoscript/marketplace-web` | beta | Platform Services Team |
| `@holoscript/graphql-api` | beta | Platform Services Team |
| `@holoscript/adapter-postgres` | beta | Platform Services Team |
| `@holoscript/collab-server` | beta | Platform Services Team |
| `@holoscript/crdt` | beta | Platform Services Team |
| `@holoscript/crdt-spatial` | experimental | Platform Services Team |
| `@holoscript/mvc-schema` | beta | Platform Services Team |
| `@holoscript/spatial-index` | stable | HoloScript Core Team |
| `@holoscript/animation-presets` | stable | Studio Team |
| `@holoscript/snn-poc` | experimental | R&D Team |
| `@holoscript/snn-webgpu` | experimental | R&D Team |

## Compatibility Note

Some docs pages describe distribution or compatibility entry points (`holoscript` distribution page, support directory reference) and are intentionally not listed as standalone governed packages in this matrix.
