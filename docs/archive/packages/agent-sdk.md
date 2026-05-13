# Agent SDK

Package: @holoscript/agent-sdk

Developer SDK for building agents on the uAA2++ protocol.

## Main Exports

- MeshDiscovery
- SignalService
- GossipProtocol
- MCP_TOOL_SCHEMAS

## What It Solves

- Mesh peer discovery and lifecycle tracking across agent hosts.
- Local and remote service signaling with TTL-based expiration.
- Gossip-style anti-entropy synchronization for distributed knowledge packets.
- Standardized MCP tool schema definitions for interoperability.

## Typical Usage

```ts
import {
  MeshDiscovery,
  SignalService,
  GossipProtocol,
  MCP_TOOL_SCHEMAS,
} from '@holoscript/agent-sdk';

const mesh = new MeshDiscovery();
const signal = new SignalService();
const gossip = new GossipProtocol();

const packet = gossip.shareWisdom(mesh.localId, { topic: 'compiler-cache', status: 'fresh' });
signal.broadcastSignal({
  type: 'agent-host',
  url: 'http://localhost:7777',
  capabilities: ['holo_query_codebase', 'validate_holoscript'],
});

console.log(MCP_TOOL_SCHEMAS.length, packet.id);
```
