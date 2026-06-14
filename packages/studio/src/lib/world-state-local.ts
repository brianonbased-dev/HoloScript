/**
 * In-process authoritative world state for the live agent-avatar loop.
 *
 * Mirrors the MCP networking-tools semantics (push a move -> read the position)
 * locally, so the live demo loop runs entirely inside the studio process — no
 * dependency on (and no hammering of) the shared production MCP at
 * mcp.holoscript.net, which proved too flaky (intermittent 500s) for a
 * high-frequency avatar loop.
 *
 * The REAL scoped `push_portal_intent` -> Loro CRDT authority (mcp-server
 * networking-tools.ts) is proven separately; for a low-latency single-process
 * avatar loop the correct authority is local/dedicated, not the shared prod MCP.
 * Module singleton: every API route in this process shares the same Map.
 *
 * INTERIM (founder ruling 2026-06-14, task_1781469975856_vpqs): local authority is
 * the right call for the sub-second loop, but this raw Map must become the CANONICAL
 * push_portal_intent -> intentToDelta -> Loro path run LOCALLY (it reimplements weaker
 * validation than the canonical scoped-intent surface). Retire this shim per that task.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Cap so a misbehaving/hostile caller posting many unique ids can't grow the
 *  Map without bound (the singleton lives for the process lifetime). */
const MAX_ENTITIES = 1024;

const entities = new Map<string, Record<string, unknown>>();

/** Accept only safe, bounded entity ids (used as Map keys + echoed to clients). */
export function isValidEntityId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[\w:@.-]+$/.test(id);
}

/** Apply a move (the embodiment delta for a `move` intent). */
export function applyMove(entityId: string, position: Vec3): void {
  if (!entities.has(entityId) && entities.size >= MAX_ENTITIES) {
    // Evict the least-recently-updated entity to stay bounded.
    let oldestKey: string | undefined;
    let oldestTs = Infinity;
    for (const [k, v] of entities) {
      const ts = typeof v.updatedAt === 'number' ? v.updatedAt : 0;
      if (ts < oldestTs) {
        oldestTs = ts;
        oldestKey = k;
      }
    }
    if (oldestKey) entities.delete(oldestKey);
  }
  const prev = entities.get(entityId) ?? {};
  const prevTransform = (prev.transform as Record<string, unknown> | undefined) ?? {};
  entities.set(entityId, {
    ...prev,
    transform: { ...prevTransform, position },
    updatedAt: Date.now(),
  });
}

/** Read an entity's authoritative fields, or {_null:true} if it has never moved. */
export function readEntity(entityId: string): Record<string, unknown> {
  return entities.get(entityId) ?? { _null: true };
}
