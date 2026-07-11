# @holoscript/crdt-spatial

> Loro CRDT-based spatial transform synchronization with hybrid rotation handling.

## Overview

Provides conflict-free replicated data types (CRDTs) specialized for spatial transforms in multiplayer HoloScript scenes. Uses [Loro](https://loro.dev/) as the CRDT backend with a hybrid rotation strategy.

## Strategy C: Hybrid Rotation Handling

| Component | Strategy               | Why                          |
| --------- | ---------------------- | ---------------------------- |
| Position  | Last-Writer-Wins (LWW) | Simple, low-frequency        |
| Scale     | Last-Writer-Wins (LWW) | Rarely conflicting           |
| Rotation  | Hybrid                 | Quaternions don't merge well |

**Rotation hybrid approach:**

- **Base quaternion**: LWW for absolute orientation
- **Delta Euler counters**: CRDT counters for incremental turns
- **30s checkpoint**: Periodic full-state sync to prevent drift

## Usage

```typescript
import { SpatialCRDT } from '@holoscript/crdt-spatial';

const sync = new SpatialCRDT({ checkpointInterval: 30000 });

// Apply local transform
sync.setPosition(entity, [1, 2, 3]);
sync.addRotation(entity, { yaw: 45 });

// Merge remote state
sync.merge(remoteState);
```

## Related

- [`@holoscript/crdt`](../crdt/) — Base CRDT primitives
- [Multiplayer example](../../examples/specialized/multiplayer/)

## Package boundary & release posture

`@holoscript/crdt-spatial` targets the external developer/operator/agent-framework audience building multiplayer spatial sync for React Three Fiber scenes — it is not wired to a specific backend. `@react-three/fiber` and `react` are optional peer dependencies: you bring your own renderer integration and merge/broadcast transport, and you configure `checkpointInterval` and the sync channel yourself rather than relying on a founder-owned default.

This package does not ship founder-local infrastructure or a private workspace default: no bundled signaling/relay server, no hardcoded sync endpoint. The `./bridge` export is the explicit seam where you wire in your own transport — the package boundary stops at the CRDT/Loro merge logic.

Status: **v0-preview**. The core position/scale LWW and hybrid-rotation strategy are covered by tests; known limitations include no built-in transport (you must pair it with your own WebRTC/WebSocket layer, e.g. `@holoscript/crdt`'s `WebRTCSync`) and the 30s checkpoint interval is a tunable default, not a guarantee. Run `pnpm test` to validate behavior in your fork; pin a version and roll back via `npm install @holoscript/crdt-spatial@<version>` if a release regresses.

## License

MIT
