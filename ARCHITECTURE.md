# HoloScript Architecture

> 66 packages in a pnpm monorepo. Build order: Layer 1 first, then 2, then 3.

## Dependency Graph

```
Layer 3: Applications
  ┌──────────────────────────────────────────────────────────────────┐
  │  studio ─► core, r3f-renderer, absorb-service, ui, std,        │
  │            connector-*, studio-plugin-sdk                       │
  │  mcp-server ─► core, absorb-service                            │
  │  cli ─► core, core-types, llm-provider, sdk                    │
  │  lsp ─► core, linter                                           │
  │  marketplace-web ─► (standalone Next.js)                       │
  │  playground ─► (standalone)                                    │
  └───────────────────────────┬────────────────────────────────────┘
                              │ depends on
Layer 2: Domain Packages      ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  engine ─► core, uaal                                          │
  │  framework ─► core                                             │
  │  crdt ─► (no @holoscript deps)                                 │
  │  crdt-spatial ─► (no @holoscript deps)                         │
  │  marketplace-api ─► core, auth, registry                       │
  │  r3f-renderer ─► core                                          │
  │  absorb-service ─► core                                        │
  │  linter ─► (standalone)                                        │
  │  formatter ─► (standalone)                                     │
  │  agent-protocol ─► framework                                   │
  │  agent-sdk ─► framework (deprecated shim)                      │
  │  sdk (@holoscript/sdk) ─► core (deprecated shim)               │
  └───────────────────────────┬────────────────────────────────────┘
                              │ depends on
Layer 1: Language Substrate    ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  core ─► core-types, engine, agent-protocol                    │
  │  core-types ─► (zero deps)                                     │
  │  uaal ─► (zero deps)                                           │
  └──────────────────────────────────────────────────────────────────┘
```

> **Note:** `core` has a circular peer-dep on `engine` because engine was
> extracted from core (A.011). The re-exports in `core/src/index.ts` are
> compatibility shims being removed over time.

## Package Inventory

### Layer 1 — Language Substrate (no or minimal @holoscript deps)

| Package | npm name | Description |
|---------|----------|-------------|
| `core` | @holoscript/core | Parser, AST, 24 compilers, 150+ traits, type system |
| `core-types` | @holoscript/core-types | Lightweight type mirror for external consumers (zero runtime) |
| `uaal` | @holoscript/uaal | Unity-as-a-Library bridge types |
| `compiler-wasm` | @holoscript/wasm | Rust WASM parser for high-performance edge parsing |

### Layer 2 — Domain Packages (depend on Layer 1)

| Package | npm name | Description |
|---------|----------|-------------|
| `engine` | @holoscript/engine | Rendering, physics, animation, audio, ECS, VR runtime |
| `framework` | @holoscript/framework | Agents, teams, knowledge, economy, self-improvement |
| `crdt` | @holoscript/crdt | CRDT primitives, network, multiplayer, consensus |
| `crdt-spatial` | @holoscript/crdt-spatial | Spatial CRDT extensions |
| `marketplace-api` | @holoscript/marketplace-api | Marketplace, economy, web3, payment endpoints |
| `r3f-renderer` | @holoscript/r3f-renderer | React Three Fiber rendering components |
| `absorb-service` | @holoscript/absorb-service | Codebase intelligence, GraphRAG, knowledge extraction |
| `agent-protocol` | @holoscript/agent-protocol | Protocol type contracts for agent communication |
| `agent-sdk` | @holoscript/agent-sdk | Deprecated shim, use @holoscript/framework |
| `sdk` | @holoscript/sdk | Deprecated shim, use @holoscript/core |
| `linter` | @holoscript/linter | HoloScript linting rules |
| `formatter` | @holoscript/formatter | HoloScript code formatter |
| `auth` | @holoscript/auth | Authentication primitives |
| `registry` | @holoscript/registry | Package registry client |
| `llm-provider` | @holoscript/llm-provider | Provider-agnostic LLM adapter |
| `std` | @holoscript/std | Standard library (I/O action handlers) |
| `runtime` | @holoscript/runtime | Standalone runtime package |
| `snn-webgpu` | @holoscript/snn-webgpu | GPU spiking neural networks |
| `snn-poc` | @holoscript/snn-poc | SNN proof-of-concept |
| `spatial-index` | @holoscript/spatial-index | Spatial indexing (R-tree, octree) |
| `holo-vm` | @holoscript/holo-vm | HoloScript virtual machine |
| `vm-bridge` | @holoscript/vm-bridge | VM ↔ host bridge |
| `security-sandbox` | @holoscript/security-sandbox | Sandboxed execution environment |
| `graphql-api` | @holoscript/graphql-api | GraphQL schema and resolvers |
| `mvc-schema` | @holoscript/mvc-schema | MVC schema definitions |
| `semantic-2d` | @holoscript/semantic-2d | 2D semantic layout engine |
| `animation-presets` | @holoscript/animation-presets | Pre-built animation libraries |
| `ai-validator` | @holoscript/ai-validator | AI output validation |

### Layer 2.5 — Connectors (adapter pattern, minimal deps)

| Package | npm name | Description |
|---------|----------|-------------|
| `connector-core` | @holoscript/connector-core | Base connector interface |
| `connector-github` | @holoscript/connector-github | GitHub integration |
| `connector-railway` | @holoscript/connector-railway | Railway deployment |
| `connector-upstash` | @holoscript/connector-upstash | Upstash Redis/Kafka |
| `connector-vscode` | @holoscript/connector-vscode | VS Code extension bridge |
| `connector-appstore` | @holoscript/connector-appstore | App store connector |
| `adapter-postgres` | @holoscript/adapter-postgres | PostgreSQL adapter |

### Layer 2.5 — Plugins (domain extensions)

| Package | npm name | Description |
|---------|----------|-------------|
| `plugins/robotics-plugin` | @holoscript/robotics-plugin | URDF/ROS2 robotics |
| `plugins/medical-plugin` | @holoscript/medical-plugin | DICOM/HL7 medical imaging |
| `plugins/scientific-plugin` | @holoscript/narupa-plugin | Molecular dynamics (Narupa) |
| `plugins/alphafold-plugin` | @holoscript/alphafold-plugin | Protein structure prediction |
| `plugins/domain-plugin-template` | @holoscript/domain-plugin-template | Starter template for new plugins |

### Layer 3 — Applications (depend on Layer 1 + 2)

| Package | npm name | Description |
|---------|----------|-------------|
| `studio` | @holoscript/studio | Universal Point of Entry (Next.js, 34 pages, 74 API routes) |
| `mcp-server` | @holoscript/mcp-server | MCP tools + HoloMesh API + REST endpoints |
| `cli` | @holoscript/cli | CLI tool (`holoscript` command) |
| `lsp` | @holoscript/lsp | Language Server Protocol implementation |
| `marketplace-web` | @holoscript/marketplace-web | Marketplace web frontend |
| `playground` | @holoscript/playground | Interactive playground |
| `academy` | @holoscript/academy | Tutorial and learning platform |
| `holoscript-cdn` | @holoscript/cdn | CDN distribution bundle |
| `create-holoscript-app` | create-holoscript-app | Project scaffolding CLI |
| `vscode-extension` | — | VS Code extension |
| `tree-sitter-holoscript` | — | Tree-sitter grammar |

### Layer 3 — UI & Rendering

| Package | npm name | Description |
|---------|----------|-------------|
| `ui` | @holoscript/ui | Shared React UI components |
| `visual` | @holoscript/visual | Visual programming interface |
| `visualizer-client` | @holoscript/visualizer-client | Remote visualizer client |
| `preview-component` | @holoscript/preview-component | Embeddable preview widget |
| `studio-bridge` | @holoscript/studio-bridge | Studio ↔ renderer communication |
| `studio-plugin-sdk` | @holoscript/studio-plugin-sdk | SDK for Studio plugins |
| `react-agent-sdk` | @holoscript/react-agent-sdk | React hooks for agent integration |
| `video-tutorials` | @holoscript/video-tutorials | Remotion-based tutorial videos |

### Supporting

| Package | npm name | Description |
|---------|----------|-------------|
| `benchmark` | @holoscript/benchmark | Performance benchmarks |
| `comparative-benchmarks` | @holoscript/comparative-benchmarks | Cross-platform comparison benchmarks |
| `partner-sdk` | @holoscript/partner-sdk | Partner integration SDK |
| `collab-server` | @holoscript/collab-server | Collaboration server (CRDT relay) |
| `fs` | @holoscript/fs | File system abstraction |

## Build Order

```bash
pnpm build          # Builds all packages in topological order
pnpm test           # Runs vitest across the monorepo
pnpm bench          # Performance benchmarks
```

Core must build first. Engine depends on core. Everything else depends on one or both.
