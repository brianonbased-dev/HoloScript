# HoloScript Ecosystem Spine

**Objective**: Provide a single narrative index that maps the HoloScript "Three Doors" market entry, separation of concerns, and toolchains to **exact folders** within this repository. 

This document reduces the "where does this live?" stall for new contributors and autonomous agents by explicitly anchoring the [NORTH_STAR](../../../.ai-ecosystem/NORTH_STAR.md) vision to concrete HoloScript packages.

## 1. Three-Door Market Entry Mapping

The HoloScript ecosystem enters the market via three distinct vectors. Here is the concrete repository anchor for each:

| Door | Vision Focus | Primary Packages / Services | Key Documentation Anchors |
|------|--------------|-----------------------------|---------------------------|
| **1. Headless (Agentic)** | MCP, Absorb, Orchestrator | `packages/mcp-server/`<br>`services/absorb-service/` | [`AGENTS.md`](../../AGENTS.md) (MCP, Absorb)<br>[`INTERNAL_MCP.md`](INTERNAL_MCP.md) |
| **2. Spatial (Human Creator)** | Studio, Engine, GAPS | `packages/studio/`<br>`packages/engine/`<br>`packages/r3f-renderer/`<br>`packages/crdt-spatial/` (State Cadence) | [`README.md`](README.md)<br>[`the-dumb-glass-architecture.md`](the-dumb-glass-architecture.md)<br>`packages/studio/README.md` |
| **3. Economy (Commerce)** | x402, Traits, Bounty Teams | `packages/framework/`<br>`packages/core/src/traits/constants/` | Trait constants<br>NORTH_STAR Separation logic |

## 2. Separation of Concerns (Interfaces)

Different layers of the HoloScript stack handle different domains of existence. 
- **The Living Semantic Graph** executes logic.
- **Downstream Compilers** are compatibility bridges.

| Concern | Primary Interface | Repository Anchor |
|---------|-------------------|-------------------|
| **Human Intelligence** | Brittney / InfinityAssistant | *(External services per ecosystem map)* |
| **Human Creation (UX)** | HoloScript Studio | `packages/studio/` |
| **Agent Knowledge Exchange** | HoloMesh (A2A) | `packages/mcp-server/src/holomesh/`<br>`packages/framework/` |
| **Standard IDE Support** | VS Code / Cursor / Claude Code | External MCP integration |

## 3. Toolchain & "Ask the Codebase First" (DT-10)

Before querying human maintainers for structural intent, autonomous agents and IDE assistants are expected to utilize the GraphRAG pipeline via the external MCP server (`packages/mcp-server`).

**Execution Path:**
1. `holo_graph_status`
2. `holo_absorb_repo` *(force=false unless explicitly corrupt)*
3. `holo_query_codebase` / `holo_ask_codebase` / `holo_impact_analysis` / `holo_semantic_search`

*Operational Note: Production absorb operates at `https://absorb.holoscript.net` to leverage cache and shared resources.*

## 4. The Two MCP Layers (Onboarding Clarity)
To prevent toolchain confusion, HoloScript explicitly implements the Model Context Protocol (MCP) at two completely different layers:

1. **External IDE MCP** (`packages/mcp-server/`): Used by Anthropic/Cursor/Antigravity to parse code, run GraphRAG, and interact with the Monorepo.
2. **Internal Spatial MCP** (`packages/core/src/mcp/`): Used *inside* 3D simulations for agent-to-agent protocol communication and world-building logic. 

See [`INTERNAL_MCP.md`](INTERNAL_MCP.md) for the complete architecture breakdown of how these boundary definitions are enforced.

## 5. Platform Dual-Path Innovation
The platform intentionally diverges from traditional monoliths by supporting a dual-path execution context (`.holo` -> Parser -> `HoloComposition`):
1. **Compile**: Downstream translation to external frameworks (React, generic TS).
2. **Runtime**: Native execution via Executor + Physics + Renderer.

For deep understanding of this split, refer to [`PLATFORM_ARCHITECTURE.md`](PLATFORM_ARCHITECTURE.md).

---

*Note on Analytics & Metrics*: Never hardcode entity counts (e.g. number of traits, endpoints, plugins) in prose. Always derive live dynamic counts per the commands listed in `docs/NUMBERS.md` or live `/health` endpoints.
