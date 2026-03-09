# @holoscript/agent-sdk

**uAA2++ Agent SDK** — Developer toolkit for building multi-agent systems.

Mesh discovery, inter-agent signaling, gossip-based knowledge sync, MCP tool schemas, and Agent Card (A2A) interoperability.

## Quick Start

```ts
import {
  MeshDiscovery,
  SignalService,
  GossipProtocol,
  createAgentCard,
} from '@holoscript/agent-sdk';

// 1. Mesh Discovery — find other agents in the network
const mesh = new MeshDiscovery('agent_spatial_001');

mesh.onPeerDiscovered((peer) => {
  console.log(`Discovered: ${peer.hostname}:${peer.port} with ${peer.agentCount} agents`);
});

mesh.registerPeer({
  id: 'agent_spatial_002',
  hostname: '192.168.1.100',
  port: 5000,
  version: '5.0.0',
  agentCount: 3,
  capabilities: ['3d-pathfinding', 'object-tracking'],
  lastSeen: Date.now(),
});

// 2. Signal Service — broadcast capabilities
const signals = new SignalService('node_001');

signals.broadcastSignal(
  {
    type: 'mcp-server',
    url: 'http://localhost:3000/mcp',
    capabilities: ['semantic-search', 'knowledge-index'],
  },
  3600000
); // 1 hour TTL

const mcpServers = signals.discoverSignals('mcp-server');
// mcpServers: [{ type: 'mcp-server', nodeId: 'node_001', url: '...', ... }]

// 3. Gossip Protocol — sync knowledge across agents
const gossip = new GossipProtocol();

const packet = gossip.shareWisdom('agent_001', {
  insight: 'Geospatial coords are universal anchors',
  confidence: 0.95,
});

// Anti-entropy sync with peer's pool
const absorbed = gossip.antiEntropySync(peerGossipPool);
console.log(`Absorbed ${absorbed} new knowledge packets`);
```

## Agent Card (A2A Interoperability)

Agent Cards enable standardized discovery and invocation across heterogeneous agent systems.

```ts
import { createAgentCard, validateAgentCard } from '@holoscript/agent-sdk';

const card = createAgentCard({
  name: 'SpatialReasoningAgent',
  description: 'Autonomous spatial reasoning with 3D pathfinding and object tracking',
  version: '5.0.0',
  url: 'http://localhost:5000/agent',
  skills: [
    {
      id: 'pathfinding',
      name: '3D Pathfinding',
      description: 'A* pathfinding in 3D environments with obstacle avoidance',
      tags: ['spatial', '3d', 'navigation'],
      examples: ['Find path from (0,0,0) to (10,5,3)'],
    },
    {
      id: 'object-tracking',
      name: 'Object Tracking',
      description: 'Real-time object tracking with Kalman filtering',
      tags: ['computer-vision', 'tracking'],
    },
  ],
  capabilities: [
    { id: 'spatial-reasoning', name: 'Spatial Reasoning', description: '3D spatial intelligence' },
  ],
  auth: { type: 'api-key', credentials: { apiKey: 'sk_...' } },
});

const validation = validateAgentCard(card);
// validation.valid === true

// Serialize to JSON for A2A protocol exchange
const cardJson = JSON.stringify(card, null, 2);
```

## MCP Tool Schemas

Pre-defined schemas for common MCP tools in the semantic search hub:

```ts
import { MCP_TOOL_SCHEMAS } from '@holoscript/agent-sdk';

// Available schemas:
// - search_knowledge: Semantic vector search
// - add_pattern: Index P.XXX.XX pattern
// - add_wisdom: Index W.XXX.XX wisdom
// - add_gotcha: Index G.XXX.XX gotcha
// - get_session_context: Retrieve session state
// - knowledge_stats: Get vector index stats

const searchSchema = MCP_TOOL_SCHEMAS.find((t) => t.name === 'search_knowledge');
// searchSchema.inputSchema.properties.query.type === 'string'
```

## Mesh Discovery Events

```ts
const mesh = new MeshDiscovery();

const unsubscribeDiscovered = mesh.onPeerDiscovered((peer) => {
  console.log(`New peer: ${peer.id} at ${peer.hostname}:${peer.port}`);
});

const unsubscribeLost = mesh.onPeerLost((peer) => {
  console.log(`Lost peer: ${peer.id} (last seen ${Date.now() - peer.lastSeen}ms ago)`);
});

// Prune stale peers (not seen in 15 seconds)
const pruned = mesh.pruneStalePeers(15000);
console.log(`Pruned ${pruned} stale peers`);

// Cleanup
unsubscribeDiscovered();
unsubscribeLost();
```

## Architecture

- **MeshDiscovery**: Peer-to-peer agent discovery with heartbeat pruning
- **SignalService**: Capability broadcasting with TTL expiration
- **GossipProtocol**: Eventual consistency knowledge sync via anti-entropy
- **AgentCard**: Standardized agent metadata for A2A interoperability
- **MCP Schemas**: Type-safe tool definitions for Model Context Protocol

## Scripts

```bash
npm run test    # Run tests
npm run build   # Build to dist/
npm run dev     # Watch mode
```
