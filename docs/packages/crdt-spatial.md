# CRDT Spatial

Package: @holoscript/crdt-spatial

Loro CRDT-based synchronization for multiplayer spatial transforms.

## Main Exports

- SpatialCRDTBridge
- LoroWebSocketProvider
- useSpatialSync
- quaternion and hybrid rotation helper utilities

## What It Solves

- Hybrid rotation strategy with base quaternion plus additive yaw/pitch/roll deltas.
- Conflict-tolerant transform convergence in collaborative XR sessions.
- Transport abstraction for live sync over WebSocket providers.

## Typical Usage

```ts
import { SpatialCRDTBridge, LoroWebSocketProvider } from '@holoscript/crdt-spatial';

const bridge = new SpatialCRDTBridge('room-123');
const provider = new LoroWebSocketProvider({
  url: 'ws://localhost:8080',
  roomId: 'room-123',
  peerId: 'peer-a',
});

bridge.attachProvider(provider);
bridge.updatePosition([0, 1.6, -2]);
```
