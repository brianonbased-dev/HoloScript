# npm Agent Package Migration Guide

This guide maps broad historical agent packages to the smaller canonical packages
that laptop, Jetson, and Vast consumers should install directly. Do not unpublish
the legacy packages; deprecate them and keep the replacement paths explicit.

## Quick Map

| Legacy package | Use instead | Why |
| --- | --- | --- |
| `@holoscript/agent-sdk` | `@holoscript/framework`, `@holoscript/mesh`, `@holoscript/memory` | Agent orchestration, mesh helpers, network runtime, and shared memory now live in typed packages. |
| `@holoscript/intelligence` | `@holoscript/framework`, `@holoscript/holoscript-agent`, `@holoscript/memory` | Intelligence APIs are split between framework AI/swarm/training exports, the headless runtime, and sovereign memory. |
| `@holoscript/state-sync` | `@holoscript/crdt`, `@holoscript/crdt-spatial`, `@holoscript/mesh` | State sync is now explicit CRDT state plus mesh transport. |

## agent-sdk

Use `@holoscript/framework` when the old SDK code needs agent cards, discovery,
signals, gossip, or orchestration helpers:

```ts
import {
  GossipProtocol,
  MeshDiscovery,
  SignalService,
  createAgentCard,
  validateAgentCard,
} from '@holoscript/framework';
```

Use `@holoscript/mesh` for lower-level network, messaging, collaboration,
consensus, social, sovereign, multiplayer, or sync primitives:

```ts
import { AgentMessaging, CollaborationSession, NetEntitySync } from '@holoscript/mesh';
```

Use `@holoscript/memory` when the agent needs the shared sovereign memory
substrate:

```ts
import { SovereignMemoryStore } from '@holoscript/memory';
```

## intelligence

Use `@holoscript/framework` for typed agent and team definitions, local knowledge,
protocol agents, AI helpers, swarm coordination, and training utilities:

```ts
import { KnowledgeStore, defineAgent, defineProtocolAgent } from '@holoscript/framework';
```

Use `@holoscript/holoscript-agent` when the consumer wants the packaged headless
agent runtime rather than framework building blocks.

Use `@holoscript/memory` for cross-agent memory instead of creating a separate
intelligence-specific memory store.

## state-sync

Use `@holoscript/crdt` for authenticated CRDT primitives:

```ts
import { GCounter, LWWRegister, ORSet, WebRTCSync } from '@holoscript/crdt';
```

Use `@holoscript/crdt-spatial` for spatial transform sync and world-state CRDTs:

```ts
import { SpatialCRDTBridge, WorldState } from '@holoscript/crdt-spatial';
```

Use `@holoscript/mesh` for the transport/session layer that carries replicated
state between agents or worlds.

## Deprecation Rule

Every npm deprecation notice for these packages must match
`scripts/holo-ci/npm-deprecation-manifest.json`, and every canonical replacement
must remain present in either `scripts/holo-ci/npm-v1-release-manifest.json` or a
documented next-wave package lane.
