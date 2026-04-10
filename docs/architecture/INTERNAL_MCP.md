# Internal MCP Architecture

> The two-layer MCP system: External MCP Server (for AI agents) and Internal MCP (for spatial agent communication).

## Two Distinct MCP Systems

HoloScript implements MCP (Model Context Protocol) at two levels:

```text
┌─────────────────────────────────────────────────────────┐
│  EXTERNAL MCP SERVER (packages/mcp-server/)             │
│  For AI coding agents (Claude, Cursor, Copilot)         │
│  ├── holo_absorb_repo      — Ingest codebase           │
│  ├── holo_query_codebase   — Query knowledge graph     │
│  ├── holo_semantic_search  — Vector search             │
│  ├── holo_ask_codebase     — LLM-powered Q&A          │
│  └── 61+ more tools        — Parse, compile, etc.     │
│  See: docs/guides/mcp-server.md                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  INTERNAL MCP (packages/core/src/mcp/ + src/agents/)    │
│  For agent-to-agent spatial communication               │
│                                                         │
│  MCPOrchestrator (src/mcp/MCPOrchestrator.ts)           │
│  ├── runTools() — Execute tools in sequence             │
│  ├── Tool discovery and registration                    │
│  └── Circuit breaker wrapping                           │
│                                                         │
│  HoloScriptMCPAdapter (src/mcp/HoloScriptMCPAdapter.ts) │
│  ├── MCPToolDefinition interface                        │
│  ├── MCPToolResult interface                            │
│  └── Adapter pattern for HoloScript-specific tools      │
│                                                         │
│  MCPCircuitBreaker (src/mcp/MCPCircuitBreaker.ts)       │
│  └── Resilient MCP calls with retry/timeout/fallback    │
└─────────────────────────────────────────────────────────┘
```

## Spatial Agent Communication (3-Layer Protocol)

The `src/agents/spatial-comms/` directory implements a **3-layer communication protocol** for agents in spatial environments:

| Layer                  | File                | Purpose                                         |
| ---------------------- | ------------------- | ----------------------------------------------- |
| **Layer 1: Real-Time** | `Layer1RealTime.ts` | Low-latency spatial messaging (position, state) |
| **Layer 2: A2A**       | `Layer2A2A.ts`      | Agent-to-Agent structured communication         |
| **Layer 3: MCP**       | `Layer3MCP.ts`      | MCP tool calls between spatial agents           |

### Layer3MCP (Agent MCP Client)

The `Layer3MCPClient` provides MCP capabilities to spatial agents:

```typescript
import { Layer3MCPClient } from '@holoscript/core/agents/spatial-comms';

const client = new Layer3MCPClient();

// Discover available tools
const tools = await client.getAvailableTools();

// Call a tool on another agent
const result = await client.callTool('generate_terrain', {
  biome: 'forest',
  size: [100, 100],
});

// Direct MCP tool call
const output = await client.mcpToolCall('agent-123', 'inspect', { target: 'scene' });
```

### SPATIAL_MCP_TOOLS

Pre-defined MCP tools for spatial operations:

```typescript
import { SPATIAL_MCP_TOOLS } from '@holoscript/core/agents/spatial-comms';

// Tools include:
// - spawn_entity — Create entities at spatial positions
// - move_entity — Transform entities in 3D space
// - query_spatial — Spatial queries (nearest, within radius)
// - broadcast_event — Multi-agent event broadcasting
```

## Agent Support System

Located in `src/agents/`:

| Class                 | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `AgentRegistry`       | Register and discover agents                   |
| `AgentManifest`       | Declare agent capabilities                     |
| `CapabilityMatcher`   | Match agent capabilities to tasks              |
| `CrossRealityHandoff` | Transfer agents across platforms               |
| `SpatialCommClient`   | Unified spatial communication client           |
| `NormEngine`          | Social norm enforcement for agent communities  |
| `CulturalMemory`      | Persistent cultural knowledge for agent groups |

## Registration with Orchestrator

Agents register with the MCP Mesh orchestrator:

```typescript
import { registerWithOrchestrator } from '@holoscript/core/mcp';

await registerWithOrchestrator({
  name: 'my-spatial-agent',
  port: 3000,
  tools: ['spawn_entity', 'move_entity'],
  heartbeatInterval: 30000,
});
```

## Related

- [External MCP Server Guide](../guides/mcp-server.md) — For AI coding agents
- [Spatial Comms README](../../packages/core/src/agents/spatial-comms/README.md) — Full protocol spec
- [PROTOCOL_SPEC.md](../../packages/core/src/agents/spatial-comms/PROTOCOL_SPEC.md) — 3-layer protocol details
- [Agent SDK](../../packages/agent-sdk/README.md) — Public agent SDK
