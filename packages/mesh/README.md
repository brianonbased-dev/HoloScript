# @holoscript/mesh

HoloScript's mesh and network layer — real-time multiplayer networking, agent-to-agent messaging, CRDT-backed collaboration, consensus, and sovereign state survivability for HoloScript compositions and the agents that inhabit them.

## Installation

```bash
npm install @holoscript/mesh
```

## Modules

| Module          | Path                    | Purpose                                                                 |
| ---------------- | ----------------------- | ------------------------------------------------------------------------ |
| Network          | `src/network/`           | `NetworkManager`, matchmaking, room/session management, WebRTC/WebSocket transports, delta compression, spatial sharding, anti-cheat |
| Messaging        | `src/messaging/`          | `ChannelManager`, `AgentMessaging` — typed agent channels with schema-validated messages and broadcast/ack semantics |
| Collaboration    | `src/collaboration/`      | `CRDTDocument`, `CollaborationSession` — shared-document editing with conflict-free sync |
| Consensus        | `src/consensus/`          | `ConsensusManager`, `RaftConsensus` — leader election and replicated state for multi-agent coordination |
| Social           | `src/social/`             | Social-graph primitives layered on the mesh |
| Sovereign        | `src/sovereign/`          | `LifePod` — signed identity/state survivability across restarts and handoffs |
| Multiplayer      | `src/multiplayer/`        | Multiplayer session helpers built on the network layer |
| Sync             | `src/sync/`               | Position quantization, quaternion compression, priority scheduling, jitter buffering for high-frequency state updates |
| CRDT / GPU / testing / utils | `src/crdt/`, `src/gpu/`, `src/testing/`, `src/utils/` | Supporting primitives shared across the above |

## Usage

```typescript
// Real-time networking
import { NetworkManager } from '@holoscript/mesh';

// Agent-to-agent messaging channels
import { ChannelManager, AgentMessaging } from '@holoscript/mesh';

// CRDT-backed collaborative documents
import { CRDTDocument, CollaborationSession } from '@holoscript/mesh';

// Consensus for multi-agent coordination
import { ConsensusManager, RaftConsensus } from '@holoscript/mesh';

// Sovereign identity/state survivability
import { LifePod } from '@holoscript/mesh';

// High-frequency state sync
import { quantizePosition, dequantizePosition, PriorityScheduler } from '@holoscript/mesh';
```

Each subsystem is independently importable — pull in only the modules a given deployment needs (e.g. `messaging` without `network`, or `consensus` without `sovereign`).

## Optional integrations

Heavy or environment-specific dependencies (`three`, the `tree-sitter-*` grammars, `discord.js`, `openai`, `ipfs-http-client`, `draco3d`, `ws`, plugin packages, etc.) are declared as `optionalDependencies` — npm/pnpm will attempt them but a failed optional install does not break the base package. `@holoscript/engine`, `@pixiv/three-vrm`, `ioredis`, `puppeteer`, and `react` are `peerDependencies` marked `optional: true`: install the ones your deployment actually uses.

## Package boundary & release posture

`@holoscript/mesh` targets external agent frameworks, operators, and founders building multiplayer or multi-agent HoloScript deployments — it is not a hosted service. The package does not ship a transport backend, a Redis instance, a signaling server, or any founder-local network configuration; you bring your own connection endpoints, `ioredis` client, and WebRTC signaling, and the mesh layer wires against what you supply.

It does not assume a specific renderer, engine, or hosting environment — `@holoscript/engine`, `three`, and the VRM/renderer-facing pieces are all optional, and the package is not the package default for identity: `LifePod` signs and verifies state you hand it, but key management and storage are caller-owned.

Operability: `ConsensusManager` and `LifePod` both emit structured events (via `EventEmitter`) for state-change auditing, and the mesh's CRDT/consensus paths are built to be receipt-checkable by a host validation harness rather than opaque.

Known limitations: this is a v0-preview release for several subsystems (notably `gpu/` and parts of `social/`), and the optional plugin/provider integrations listed above are unverified outside the documented import paths — treat unlisted combinations as unsupported until exercised. Pin the version in consuming projects; rollback is a plain `npm install @holoscript/mesh@<previous-version>`.

## License

MIT

## Related

- [@holoscript/core](../core) — HoloScript core compiler and trait system
- [@holoscript/agent-protocol](../agent-protocol) — Agent communication protocol
- [@holoscript/core-types](../core-types) — Shared type definitions
