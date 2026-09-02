/**
 * Loro CRDT-backed world state for the live agent-avatar loop.
 *
 * Replaces world-state-local.ts (raw Map) per task_1781469975856_vpqs:
 * the canonical push_portal_intent → intentToDelta → Loro path, run locally
 * in the studio process for the sub-second avatar loop.
 *
 * Persists to ~/.holoscript/studio-world-state.loro on every write.
 * Survives Next.js hot-reloads and within-container restarts. On Railway,
 * path is /root/.holoscript/studio-world-state.loro (ephemeral per deploy;
 * external DB persistence is a follow-on).
 */
import { LoroDoc, LoroMap } from 'loro-crdt';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const STATE_DIR = join(homedir(), '.holoscript');
const STATE_FILE = join(STATE_DIR, 'studio-world-state.loro');

function ensureDir(): void {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
  } catch {}
}

let _doc: LoroDoc | undefined;

function getDoc(): LoroDoc {
  if (_doc) return _doc;
  ensureDir();
  const d = new LoroDoc();
  d.setPeerId(BigInt(Date.now() % Number.MAX_SAFE_INTEGER));
  try {
    const bytes = readFileSync(STATE_FILE);
    d.import(new Uint8Array(bytes));
  } catch {
    // no snapshot yet — fresh doc
  }
  _doc = d;
  return _doc;
}

function getEntitiesMap(): LoroMap {
  return getDoc().getMap('entities');
}

function persistToDisk(): void {
  try {
    ensureDir();
    writeFileSync(STATE_FILE, getDoc().export({ mode: 'snapshot' }));
  } catch {
    // non-fatal — in-process state remains valid
  }
}

/** Accept only safe, bounded entity ids (used as Loro keys + echoed to clients). */
export function isValidEntityId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[\w:@.-]+$/.test(id);
}

/** Apply a move delta (the embodiment delta for a `move` intent). */
export function applyMove(entityId: string, position: Vec3): void {
  const em = getEntitiesMap();
  let entityMap = em.get(entityId) as LoroMap | undefined;
  if (!entityMap) {
    entityMap = em.setContainer(entityId, new LoroMap());
  }
  // Merge position into existing transform (preserves rotation if present).
  let prevTransform: Record<string, unknown> = {};
  const rawTransform = entityMap.get('transform') as string | undefined;
  if (rawTransform) {
    try {
      prevTransform = JSON.parse(rawTransform) as Record<string, unknown>;
    } catch {}
  }
  entityMap.set('transform', JSON.stringify({ ...prevTransform, position }));
  entityMap.set('updatedAt', JSON.stringify(Date.now()));
  getDoc().commit();
  persistToDisk();
}

/** Read an entity's authoritative fields, or {_null:true} if it has never moved. */
export function readEntity(entityId: string): Record<string, unknown> {
  const em = getEntitiesMap();
  const entityMap = em.get(entityId) as LoroMap | undefined;
  if (!entityMap) return { _null: true };
  const raw = entityMap.toJSON() as Record<string, string>;
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    try {
      fields[k] = JSON.parse(v);
    } catch {
      fields[k] = v;
    }
  }
  return Object.keys(fields).length > 0 ? fields : { _null: true };
}

/**
 * Set arbitrary top-level twin fields on an entity (merging with what is already there).
 *
 * `applyMove` writes only `transform.position`, which is all the avatar loop needed. A twin a
 * surface can be CHECKED against holds whatever the surface claims to mirror — an altitude, a
 * temperature, a balance — so the authority has to be able to record those too. Same merge,
 * commit and persist path as applyMove; only the shape is general.
 *
 * Values are stored JSON-encoded exactly as applyMove stores its transform, so `readEntity`
 * decodes them without a special case.
 */
export function applyFields(entityId: string, fields: Record<string, unknown>): void {
  const em = getEntitiesMap();
  let entityMap = em.get(entityId) as LoroMap | undefined;
  if (!entityMap) {
    entityMap = em.setContainer(entityId, new LoroMap());
  }
  for (const [key, value] of Object.entries(fields)) {
    if (key === '_null') continue; // reserved: readEntity's "never written" sentinel
    entityMap.set(key, JSON.stringify(value));
  }
  entityMap.set('updatedAt', JSON.stringify(Date.now()));
  getDoc().commit();
  persistToDisk();
}
