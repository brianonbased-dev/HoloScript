# Spec: Loro CRDT World State Integration

**TODO-FEAT-003** | Priority 3 | Pillar B Foundation
**Date**: 2026-03-21
**Status**: SPEC DRAFT

## Context

### What Exists
- **@holoscript/crdt** package: DID-JWT signing, LWWRegister, ORSet, GCounter, WebRTC P2P sync, RBAC conflict resolver
- **@holoscript/crdt-spatial** package: **Already uses Loro v1.0.0!** Strategy C hybrid rotation (base quaternion LWW + delta Euler counters + 30s checkpoints), LoroWebSocketProvider, `useSpatialSync()` React hook
- **CRDTRoomTrait.ts**: Trait integration for CRDT rooms
- **WeatherSystem.ts**: Event-based state changes (potential CRDT consumer)

### What's Missing
- **World-level state model**: Objects, terrain heightmaps, NPC memory, inventory — only rotation/position currently in Loro
- **Persistence**: No server-side snapshot storage — state is ephemeral per session
- **Scale testing**: Only tested with 2 clients
- **Server authority**: No server-side validation for physics disagreements
- **Publishing pipeline**: No Loro snapshot → CDN → Hololand registry flow
- **Time-travel**: Loro supports it natively but not exposed in HoloScript

## Design

### Architecture: Extend crdt-spatial, Don't Replace

Since `@holoscript/crdt-spatial` already uses Loro, we **extend** it with world-level state types rather than creating a new package.

### State Model

```typescript
// packages/crdt-spatial/src/WorldState.ts

import { Loro, LoroMap, LoroList, LoroTree, LoroMovableList } from 'loro-crdt';

/**
 * World state hierarchy in Loro document:
 *
 * root (LoroMap)
 * ├── objects (LoroMap<string, ObjectState>)     — Scene objects (LWW per field)
 * ├── terrain (LoroList<number>)                 — Heightmap (append-only erosion deltas)
 * ├── npc_memory (LoroTree)                      — Hierarchical NPC knowledge
 * ├── inventory (LoroMap<string, LoroMap>)        — Per-player inventories
 * ├── weather (LoroMap)                          — Weather state (LWW)
 * └── meta (LoroMap)                             — World metadata, version, permissions
 */

export class WorldStateDoc {
  private doc: Loro;

  constructor(peerId?: string) {
    this.doc = new Loro();
    if (peerId) this.doc.setPeerId(BigInt(peerId));
  }

  // --- Object Management (LWW Map) ---

  setObject(id: string, state: ObjectState): void;
  getObject(id: string): ObjectState | null;
  removeObject(id: string): void;
  getAllObjects(): Map<string, ObjectState>;

  // --- Terrain (Heightmap via List) ---

  setTerrainHeight(x: number, z: number, height: number): void;
  getTerrainHeight(x: number, z: number): number;
  applyErosionDelta(x: number, z: number, delta: number): void;
  getHeightmap(): Float32Array;

  // --- NPC Memory (Tree) ---

  addNPCMemory(npcId: string, memory: NPCMemoryEntry): void;
  queryNPCMemories(npcId: string, limit?: number): NPCMemoryEntry[];

  // --- Inventory (Per-player Map) ---

  setInventoryItem(playerId: string, slot: string, item: InventoryItem): void;
  getInventory(playerId: string): Map<string, InventoryItem>;

  // --- Persistence ---

  export(): Uint8Array;                    // Binary snapshot
  import(data: Uint8Array): void;          // Restore from snapshot
  exportUpdates(since: Uint8Array): Uint8Array;  // Incremental updates

  // --- Time Travel ---

  checkpoint(label?: string): string;      // Returns version ID
  getHistory(): VersionEntry[];
  rollback(versionId: string): void;

  // --- Sync ---

  onUpdate(callback: (event: LoroEvent) => void): void;
  merge(other: WorldStateDoc): void;
}

export interface ObjectState {
  position: [number, number, number];
  rotation: [number, number, number, number];  // Quaternion
  scale: [number, number, number];
  mesh: string;           // Asset reference
  traits: string[];       // Applied traits
  owner: string;          // DID of creator
  properties: Record<string, unknown>;
}

export interface NPCMemoryEntry {
  timestamp: number;
  type: 'observation' | 'interaction' | 'emotion' | 'fact';
  content: string;
  embedding?: Float32Array;  // For vector search
  decay: number;             // 0-1, decreases over time
}

export interface InventoryItem {
  type: string;
  quantity: number;
  metadata: Record<string, unknown>;
}
```

### Two-Tier Sync (W.156)

**CRITICAL**: Do NOT use Loro for physics particle sync.

```
Tier 1: Loro CRDT (high-level state)
├── Object positions/rotations (updated at ~10Hz, not 60Hz)
├── Terrain heightmap (updated on erosion events, ~0.1Hz)
├── NPC memory (updated on interaction events)
├── Inventory changes (updated on trade/pickup events)
└── Weather state (updated by @weather hub, ~1Hz)

Tier 2: Raw Binary WebRTC (physics particles)
├── Fluid particle positions (60Hz, 28 bytes/particle)
├── Cloth vertex positions (60Hz, 12 bytes/vertex)
├── Debris fragments (60Hz, 12 bytes/fragment)
└── Spatially filtered: only send within player's view radius
```

### Persistence Layer

```typescript
// packages/crdt-spatial/src/WorldPersistence.ts

export class WorldPersistence {
  private storageUrl: string;  // Railway persistent volume or S3

  constructor(config: PersistenceConfig);

  // Auto-save: snapshot every N seconds or on significant change
  startAutoSave(intervalMs: number): void;
  stopAutoSave(): void;

  // Manual save/load
  saveSnapshot(worldId: string, doc: WorldStateDoc): Promise<string>;  // Returns version ID
  loadSnapshot(worldId: string, version?: string): Promise<WorldStateDoc>;
  listVersions(worldId: string): Promise<VersionEntry[]>;

  // Publishing pipeline integration
  exportForPublish(worldId: string): Promise<PublishBundle>;
}

export interface PublishBundle {
  snapshot: Uint8Array;       // Loro binary
  assets: AssetManifest;     // Referenced meshes, textures
  metadata: WorldMetadata;   // Name, description, creator DID
  version: string;
}
```

### Integration with Existing crdt-spatial

Extend the existing `useSpatialSync()` hook:

```typescript
// Existing: position/rotation sync only
const { position, rotation } = useSpatialSync(objectId);

// Extended: full world state
const { worldState, setObject, checkpoint, rollback } = useWorldState(worldId);
```

## Files Changed

| File | Action |
|------|--------|
| `packages/crdt-spatial/src/WorldState.ts` | **NEW** — World state document class |
| `packages/crdt-spatial/src/WorldPersistence.ts` | **NEW** — Snapshot persistence |
| `packages/crdt-spatial/src/types.ts` | Add ObjectState, NPCMemoryEntry, InventoryItem types |
| `packages/crdt-spatial/src/index.ts` | Export new modules |
| `packages/crdt-spatial/package.json` | Bump version, add `loro-crdt` dep if not already |
| `packages/core/src/traits/WorldStateTrait.ts` | **NEW** — @world_state trait handler |

## Test Targets

| Test | Target | Method |
|------|--------|--------|
| 10K objects sync | <100ms convergence, 2 clients | Integration test with 2 Loro docs |
| Snapshot export/import | Round-trip fidelity | Unit test: set state → export → import → verify |
| Time-travel rollback | Correct state restoration | Unit test: set state → checkpoint → modify → rollback → verify |
| Terrain erosion | Persistent heightmap changes | Integration: apply erosion → save → reload → verify heights |
| NPC memory | Persistent across sessions | Integration: add memory → save → reload → query |

## Dependencies

- `loro-crdt` (already in crdt-spatial) — may need version bump to 1.8+
- Consumed by: TODO-FEAT-004 (@weather persistence), TODO-FEAT-005 (WebRTC physics sync), TODO-FEAT-010 (economy/publishing), TODO-FEAT-011 (terrain erosion)

## Risks

1. **Loro version compatibility**: crdt-spatial uses v1.0.0, research recommends v1.8+. Need to check API changes.
2. **Heightmap size**: 1024×1024 terrain = 4MB as Float32Array. Loro handles this but snapshot size matters for network. **Mitigation**: Use incremental updates, not full snapshots.
3. **MV-Transformer for rotation**: Already implemented in crdt-spatial (Strategy C). Validate it handles >2 peers.

## References

- ArXiv 2503.17826 — MV-Transformer pattern
- Loro CRDT docs: https://loro.dev/docs
- GAPS Research: W.156 (Two-Tier State Sync), G.GAPS.07 (CRDT particle anti-pattern)
