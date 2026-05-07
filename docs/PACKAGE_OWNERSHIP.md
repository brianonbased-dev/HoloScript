# HoloScript Workspace — Package Ownership

> **Live document** — verify counts via `docs/NUMBERS.md`, never hardcode.
> Updated: 2026-05-07

## Ownership Model

Each workspace package has a **primary owner** responsible for:
- Test coverage maintenance
- Build health
- Dependency hygiene
- Breaking-change coordination

Ownership is inferred from package domain and the team structure. Update this file when packages are created, archived, or reassigned.

---

## Core Platform (`@brianonbased-dev` / core-team)

| Package | Description | Test Script | Coverage |
|---------|-------------|-------------|----------|
| `@holoscript/core` | Parser, AST, compiler, traits | `node run-vitest.mjs` | Yes |
| `@holoscript/core-types` | Type definitions mirror | `vitest run --passWithNoTests` | Yes |
| `@holoscript/engine` | Rendering, physics, ECS, 20+ subsystems | `vitest run --passWithNoTests` | Yes |
| `@holoscript/runtime` | Browser R3F runtime | `vitest run --passWithNoTests` | Yes |
| `@holoscript/std` | Standard library | `vitest run --passWithNoTests` | Yes |
| `@holoscript/wasm` | WASM parser | `vitest run --passWithNoTests` | Yes |
| `@holoscript/holo-vm` | Bytecode execution engine | `vitest run --passWithNoTests` | Yes |
| `@holoscript/uaal` | uAA2++ VM | `vitest run --passWithNoTests` | Yes |

## Tooling (`@brianonbased-dev` / tooling-team)

| Package | Description | Test Script | Coverage |
|---------|-------------|-------------|----------|
| `@holoscript/cli` | Command-line interface | `vitest run` | Yes |
| `@holoscript/linter` | Static analysis | `vitest run --pool=forks` | Yes |
| `@holoscript/formatter` | Code formatting | `vitest run` | Yes |
| `@holoscript/lsp` | Language Server Protocol | `vitest run --passWithNoTests` | Yes |
| `holoscript-vscode` | VS Code extension | `vitest run` | Yes |
| `tree-sitter-holoscript` | Tree-sitter grammar | `vitest run` | Yes |
| `@holoscript/benchmark` | Benchmark suite | `vitest run --passWithNoTests` | Yes |
| `@holoscript/comparative-benchmarks` | Cross-runtime benchmarks | `vitest run` | Yes |

## Studio & UI (`@brianonbased-dev` / studio-team)

| Package | Description | Test Script | Coverage |
|---------|-------------|-------------|----------|
| `@holoscript/studio` | Studio IDE | `vitest run` | Yes |
| `@holoscript/studio-bridge` | Visual ↔ AST bridge | `vitest run` | Yes |
| `@holoscript/studio-plugin-sdk` | Plugin SDK | `vitest run` | Yes |
| `@holoscript/studio-ui-graph` | TSX → .holo emitter | `vitest run` | Yes |
| `@holoscript/preview-component` | PR embed component | `vitest run` | Yes |
| `@holoscript/ui` | Native UI components | `vitest run` | Yes |
| `@holoscript/r3f-renderer` | Shared R3F components | `vitest run` | Yes |
| `@holoscript/visual` | Visual programming | `vitest run` | Yes |
| `@holoscript/tauri-app` | Desktop shell | `vitest run --passWithNoTests` | Yes |
| `visualizer-client` | Scene debugger | `vitest run --passWithNoTests` | Yes |

## HoloLand VR (`@brianonbased-dev` / hololand-team)

| Package | Description | Test Script | Coverage |
|---------|-------------|-------------|----------|
| `@holoscript/hololand-platform` | VR platform services | `vitest run --passWithNoTests` | Yes |
| `@holoscript/crdt-spatial` | Spatial CRDT sync | `vitest run` | Yes |
| `@holoscript/spatial-index` | R-Tree spatial index | `vitest run` | Yes |
| `@holoscript/video-tutorials` | Instructional video generation | `vitest run --passWithNoTests` | Yes |

## AI & Agents (`@brianonbased-dev` / ai-team)

| Package | Description | Test Script | Coverage |
|---------|-------------|-------------|----------|
| `@holoscript/framework` | Agent memory, learning, earning | `vitest run --passWithNoTests` | Yes |
| `@holoscript/llm-provider` | Unified LLM SDK | `vitest run` | Yes |
| `@holoscript/ai-validator` | Hallucination guard | `vitest run` | Yes |
| `@holoscript/aibrittney` | Interactive CLI agent | `vitest run --config vitest.config.ts` | Yes |
| `@holoscript/holoscript-agent` | Headless agent runtime | `vitest run` | Yes |
| `@holoscript/snn-webgpu` | Spiking neural networks | `vitest run` | Yes |
| `@hololand/react-agent-sdk` | React hooks for agents | `vitest run` | Yes |

## Infrastructure & Connectors (`@brianonbased-dev` / infra-team)

| Package | Description | Test Script | Coverage |
|---------|-------------|-------------|----------|
| `@holoscript/config` | Centralized config | `vitest run --passWithNoTests` | Yes |
| `@holoscript/auth` | JWT authentication | `vitest run` | Yes |
| `@holoscript/graphql-api` | GraphQL layer | `vitest run` | Yes |
| `@holoscript/mcp-server` | MCP server | `vitest run --passWithNoTests` | Yes |
| `@holoscript/mesh` | Network layer | `vitest run` | Yes |
| `@holoscript/mvc-schema` | Cross-reality state sync | `vitest run` | Yes |
| `@holoscript/platform` | Enterprise platform | `vitest run --config vitest.config.ts` | Yes |
| `@holoscript/registry` | Package registry | `vitest run` | Yes |
| `@holoscript/security-sandbox` | VM sandbox | `vitest run` | Yes |
| `@holoscript/crdt` | CRDT primitives | `vitest run` | Yes |

## Marketplace (`@brianonbased-dev` / marketplace-team)

| Package | Description | Test Script | Coverage |
|---------|-------------|-------------|----------|
| `@holoscript/marketplace-api` | Trait marketplace API | `vitest run` | Yes |
| `@holoscript/marketplace-web` | Marketplace Web UI | `vitest run` | Yes |
| `@holoscript/marketplace-agentkit` | Coinbase AgentKit | `vitest run --passWithNoTests` | Yes |
| `@holoscript/partner-sdk` | Partner integrations | `vitest run` | Yes |

## Connectors (`@brianonbased-dev` / connector-team)

| Package | Description | Test Script | Coverage |
|---------|-------------|-------------|----------|
| `@holoscript/connector-core` | Connector foundation | `vitest run` | Yes |
| `@holoscript/connector-appstore` | App Store Connect | `vitest run` | Yes |
| `@holoscript/connector-github` | GitHub MCP | `vitest run` | Yes |
| `@holoscript/connector-moltbook` | Moltbook social | `vitest run` | Yes |
| `@holoscript/connector-railway` | Railway MCP | `vitest run` | Yes |
| `@holoscript/connector-upstash` | Upstash Redis/Vector | `vitest run` | Yes |
| `@holoscript/connector-vscode` | VS Code sync | `vitest run` | Yes |

## Domain Plugins (`@brianonbased-dev` / plugin-team)

| Package | Description | Test Script | Coverage |
|---------|-------------|-------------|----------|
| `@holoscript/alphafold-plugin` | AlphaFold integration | `vitest run` | Yes |
| `@holoscript/assimp-plugin` | Assimp import | `vitest run` | Yes |
| `@holoscript/plugin-banking-finance` | Banking primitives | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-civil-engineering` | Civil engineering | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-culture-keyword` | Culture taxonomy | `vitest run --passWithNoTests` | Yes |
| `@holoscript/domain-plugin-template` | Plugin template | `vitest run` | Yes |
| `@holoscript/plugin-economic-primitives` | Economic models | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-education-lms` | Education/LMS | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-fashion` | Fashion design | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-film3d-volumetrics` | Film volumetrics | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-fitness-wellness` | Fitness/wellness | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-forensics` | Forensics | `vitest run` | Yes |
| `@holoscript/plugin-geolocation-gis` | GIS/Geolocation | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-government-civic` | Government/civic | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-hardware-invention` | Hardware invention | `vitest run` | Yes |
| `@holoscript/plugin-hr-workforce` | HR/workforce | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-insurance` | Insurance | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-legal-document` | Legal documents | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-manufacturing-qc` | Manufacturing QC | `vitest run --passWithNoTests` | Yes |
| `@holoscript/marble-genie3-plugin` | Marble Genie3 | `vitest run` | Yes |
| `@holoscript/medical-plugin` | Medical imaging | `vitest run` | Yes |
| `@holoscript/mixamo-plugin` | Mixamo animation | `vitest run` | Yes |
| `@holoscript/msf-3d-plugin` | MSF 3D | `vitest run` | Yes |
| `@holoscript/plugin-neuroscience` | Neuroscience | `vitest run --passWithNoTests` | Yes |
| `@holoscript/niantic-lgm-plugin` | Niantic LGM | `vitest run` | Yes |
| `@holoscript/nodetoy-plugin` | NodeToy | `vitest run` | Yes |
| `@holoscript/openusd-plugin` | OpenUSD | `vitest run` | Yes |
| `@holoscript/qm-bridge` | Quantum bridge | `vitest run` | Yes |
| `@holoscript/radio-astronomy-plugin` | Radio astronomy | `vitest run` | Yes |
| `@holoscript/remotion-r3f-plugin` | Remotion R3F | `vitest run` | Yes |
| `@holoscript/plugin-restaurant` | Restaurant | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-retail-ecommerce` | Retail/e-commerce | `vitest run --passWithNoTests` | Yes |
| `@holoscript/robotics-plugin` | Robotics | `vitest run` | Yes |
| `@holoscript/scenethesis-plugin` | Scene thesis | `vitest run` | Yes |
| `@holoscript/narupa-plugin` | Scientific simulation | `vitest run` | Yes |
| `@holoscript/structural-biology-plugin` | Structural biology | `vitest run` | Yes |
| `@holoscript/talkinghead-plugin` | Talking head avatar | `vitest run` | Yes |
| `@holoscript/plugin-therapy` | Therapy | `vitest run` | Yes |
| `@holoscript/plugin-threat-intelligence` | Threat intel | `vitest run` | Yes |
| `@holoscript/plugin-trait-audit` | Trait audit | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-travel-hospitality` | Travel/hospitality | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-urban-planning` | Urban planning | `vitest run --passWithNoTests` | Yes |
| `@holoscript/urdf-plugin` | URDF | `vitest run` | Yes |
| `@holoscript/urdformer-plugin` | URDFormer | `vitest run` | Yes |
| `@holoscript/vrm-avatar-plugin` | VRM avatars | `vitest run` | Yes |
| `holoscript-web-preview` | Web preview | `vitest run --passWithNoTests` | Yes |
| `@holoscript/web-preview-plugin` | Web preview plugin | `vitest run` | Yes |
| `@holoscript/plugin-wine-food-beverage` | Wine/food/beverage | `vitest run --passWithNoTests` | Yes |
| `@holoscript/plugin-wisdom-gotcha` | Wisdom/gotcha | `vitest run --passWithNoTests` | Yes |

## Services (`@brianonbased-dev` / infra-team)

| Package | Description | Test Script | Coverage |
|---------|-------------|-------------|----------|
| `@holoscript/absorb-service` | Codebase intelligence | `vitest run --passWithNoTests` | Yes |
| `@holoscript/absorb-service-host` | Absorb host | `vitest run --passWithNoTests` | Yes |
| `brittney-service` | LLM service | `vitest run --passWithNoTests` | Yes |
| `@holoscript/render-service` | Render service | `vitest run` | Yes |
| `@holoscript/studio-api` | Studio API | `vitest run --passWithNoTests` | Yes |

## Utilities (`@brianonbased-dev` / tooling-team)

| Package | Description | Test Script | Coverage |
|---------|-------------|-------------|----------|
| `create-holoscript` | Scaffold CLI | `vitest run` | Yes |
| `@holoscript/cdn` | Browser CDN | `vitest run` | Yes |
| `@holoscript/hologram-worker` | Render worker | `vitest run --passWithNoTests` | Yes |
| `@holoscript/holomap` | Map operator UX | `vitest run` | Yes |
| `@holoscript/animation-presets` | Animation presets | `vitest run` | Yes |
| `@holoscript/adapter-postgres` | PostgreSQL adapter | `vitest run` | Yes |
| `@holoscript/agent-protocol` | uAA2++ protocol | `vitest run` | Yes |
| `@holoscript/compiler-wasm` | WASM compiler | `vitest run` | Yes |

---

## Coverage Policy

1. **Every package with source code** must have a `test` script.
2. **Every package with a `test` script** must have a `test:coverage` script.
3. `--passWithNoTests` is acceptable for packages that have no tests yet but have source code.
4. Run `pnpm run coverage:summary` to verify coverage reports are generated.
5. Stale 0% coverage reports should be regenerated via `pnpm -r test:coverage`.

## Normalization Checklist

- [x] All packages have `test` scripts
- [x] All packages have `test:coverage` scripts
- [x] Coverage normalization script created (`scripts/normalize-coverage.mjs`)
- [x] Package ownership registry created (this file)
