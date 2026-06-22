/**
 * SceneSnapshot — the cognitive ⇄ spatial hand-off (gap G5).
 *
 * The HOLO VM runs the spatial world (entities/transforms/physics); the uAAL VM
 * runs agent cognition. The spec's bridge is a `SceneSnapshot`: the spatial VM
 * serializes its world to a plain, wire-safe object the cognitive VM consumes as
 * *perception*, reasons over, and acts back on. Before this, no serializer
 * existed — the two VMs were never joined in a runnable loop.
 *
 *   HOLO world  --sceneSnapshot()-->  SceneSnapshot  --(perception)-->  uAAL VM
 *        ^                                                                  |
 *        +------------------------- act (despawn/setComponent) <-----------+
 *
 * The snapshot is intentionally generic + JSON-serializable (it must cross VM
 * and process boundaries — e.g. Jetson world state perceived by a laptop brain),
 * so it captures entities + their raw component map without decoding domain
 * semantics. See docs/spec/spec-vs-reality-gap.md G5.
 *
 * @module scene-snapshot
 */

import type { ECSWorld } from './executor';

export interface SceneSnapshotEntity {
  id: number;
  name: string;
  /** Component-type-number -> component data (raw, as stored in the ECS). */
  components: Record<string, unknown>;
}

export interface SceneSnapshot {
  entityCount: number;
  entities: SceneSnapshotEntity[];
}

/**
 * Serialize an ECS world to a wire-safe SceneSnapshot (the perception the uAAL
 * VM reasons over). Pass `holoVm.world`.
 */
export function sceneSnapshot(world: ECSWorld): SceneSnapshot {
  const entities: SceneSnapshotEntity[] = world.getAllEntities().map((e) => ({
    id: e.id,
    name: e.name,
    components: Object.fromEntries(e.components),
  }));
  return { entityCount: world.entityCount, entities };
}
