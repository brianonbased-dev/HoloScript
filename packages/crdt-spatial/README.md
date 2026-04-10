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

## License

MIT
