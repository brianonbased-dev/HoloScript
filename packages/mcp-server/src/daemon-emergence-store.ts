/**
 * DaemonEmergenceStore — durable, append-only persistence for the daimōn
 * EMERGENCE CORPUS (D.053 / P.007).
 *
 * WHY THIS EXISTS
 * ───────────────
 * daemon-lifecycle-tools.ts accumulates a person's pre-emergence knowing in
 * `soulObservations = new Map()` and the emerged daimōn record in
 * `daemonStore = new Map()`. Both are in-memory: every ContextDelta the field
 * learns EVAPORATES on process restart. That is the structural reason "no real
 * training data accrues" for the native-model program — the emergence corpus is
 * the live graded-trace source, and it was never written to disk.
 *
 * This module is a TRANSPARENT persistence layer. It changes NOTHING about the
 * emergence semantics, thresholds, richness math, or composition logic (P.007 is
 * founder-ratified). It only:
 *   1. write-through: every soul observation / emergence event the in-memory Map
 *      already records is ALSO appended to a durable store, and
 *   2. hydrate: on startup the in-memory Maps are re-seeded from the store, and
 *   3. export: a normalized JSONL dump the corpus builder (harvest_real.py)
 *      can consume.
 *
 * MECHANISM (why append-only JSONL, mirroring state.ts CAEL audit)
 * ────────────────────────────────────────────────────────────────
 * The native-model corpus has to accrue on the LOCAL machine, where there is no
 * DATABASE_URL. The CAEL-audit store (state.ts §persistCaelAuditRecord /
 * loadCaelAuditFromDisk) already proves this exact pattern works for graded-trace
 * accrual without Postgres: append-only JSONL under <HOLOMESH_DATA_DIR>, hydrate
 * on boot. A corpus is naturally append-only (ever-growing), and harvest_real.py
 * already reads JSONL. When DATABASE_URL IS present (Railway multi-instance), we
 * also fire-and-forget into Postgres JSONB so cross-instance reads converge —
 * additive, never the source of truth for the local trainer.
 *
 * RECORD GRAIN
 * ────────────
 * One JSONL line per OBSERVED ContextDelta (the unit the emergence engine counts).
 * That single grain rehydrates BOTH Maps deterministically:
 *   - soulObservations[ownerId] is the replay of all `observation` events for a
 *     soul that has NOT yet emerged, and
 *   - the emerged `daemonStore[daemonId]` is restored from the `emergence` event
 *     (its channel re-seeded by replaying the observation events that preceded it,
 *     exactly as composeDaemonFromContext does live).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Data dir (same root the rest of mcp-server persists under) ────────────────
//
// Matches holomesh/state.ts HOLOMESH_DATA_DIR so all durable state lives in one
// place. We import the env var directly rather than the symbol to avoid a load
// cycle with the holomesh barrel.

const DATA_ROOT =
  process.env.HOLOMESH_DATA_DIR ||
  path.join(process.env.HOLOSCRIPT_CACHE_DIR || path.join(os.homedir(), '.holoscript'), 'holomesh');

const EMERGENCE_DIR = path.join(DATA_ROOT, 'emergence');
const CORPUS_PATH = path.join(EMERGENCE_DIR, 'soul-observations.jsonl');

// ── Durable record shapes ─────────────────────────────────────────────────────
//
// These mirror the in-memory shapes in daemon-lifecycle-tools.ts but are
// serialization-safe (no Set, no Map — plain JSON). They are an internal,
// loss-free encoding of what the Maps already hold; they are NOT the export
// format (see exportCorpusJsonl for the normalized training shape).

/** A serialization-safe ContextDelta echo (the durable memory artifact). */
export interface PersistedContextDelta {
  newIntentSignals: unknown[];
  updatedPreferences: Record<string, unknown>;
  newReceiptRefs: string[];
  capabilityUpdates: Array<{ capability: string; available: boolean }>;
  careSignalHistory: string[];
  significanceScore: number;
}

/**
 * One durable line in the emergence corpus. `kind` distinguishes a pre-emergence
 * soul observation from the moment a daimōn manifested — both are needed to
 * replay the Maps exactly.
 */
export type EmergenceRecord =
  | {
      kind: 'observation';
      /** The soul (HoloMesh agentId / workspaceId). */
      ownerId: string;
      /** The delta that was observed against the soul's latent model. */
      delta: PersistedContextDelta;
      /** Whether the delta was routed to a soul accumulator or a live daemon channel. */
      routedTo: 'soul-accumulator' | 'daemon-channel';
      /** ISO-8601 server stamp of the observation. */
      observedAt: string;
    }
  | {
      kind: 'emergence';
      ownerId: string;
      /** The deterministic daimōn id (emergentDaemonId(ownerId)). */
      daemonId: string;
      /** Display name the daimōn manifested with. */
      displayName: string;
      /** ISO-8601 server stamp of manifestation. */
      emergedAt: string;
    };

// ── Optional Postgres write-through (Railway multi-instance) ──────────────────
//
// Mirrors player-store.ts: when DATABASE_URL is present we ALSO push to a JSONB
// table. JSONL on disk remains the source of truth for the local trainer; this
// only helps cross-instance reads converge. Lazy + fire-and-forget so a DB hiccup
// never blocks (or changes) the emergence path.

interface PgLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ data: EmergenceRecord }> }>;
}

const EMERGENCE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS daemon_emergence_corpus (
  id          BIGSERIAL PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  kind        TEXT NOT NULL,
  data        JSONB NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_emergence_owner ON daemon_emergence_corpus (owner_id);
CREATE INDEX IF NOT EXISTS idx_emergence_created ON daemon_emergence_corpus (created_at);
`;

let pgPool: PgLike | null = null;
let pgReady: Promise<void> | null = null;

function maybeInitPg(): void {
  if (pgPool || pgReady) return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require('pg') as { Pool: new (cfg: { connectionString: string }) => PgLike };
    const pool = new Pool({ connectionString: databaseUrl });
    pgPool = pool;
    pgReady = pool
      .query(EMERGENCE_SCHEMA_SQL)
      .then(() => undefined)
      .catch((e: unknown) => {
        console.warn('[DaemonEmergenceStore] schema init failed:', e);
      });
    console.log('[DaemonEmergenceStore] PostgreSQL write-through active');
  } catch (e) {
    console.warn('[DaemonEmergenceStore] DATABASE_URL set but pg failed to load:', e);
  }
}

function pgAppend(record: EmergenceRecord): void {
  maybeInitPg();
  if (!pgPool || !pgReady) return;
  pgReady
    .then(() =>
      pgPool!.query(
        `INSERT INTO daemon_emergence_corpus (owner_id, kind, data) VALUES ($1, $2, $3)`,
        [record.ownerId, record.kind, JSON.stringify(record)]
      )
    )
    .catch((e: unknown) => {
      console.warn('[DaemonEmergenceStore] pg append failed:', e);
    });
}

// ── Append (write-through) ────────────────────────────────────────────────────
//
// Synchronous JSONL append (matches state.ts persistCaelAuditRecord). Never
// throws into the emergence path — a persistence failure must not change live
// behavior. Honors the same test opt-out env as the CAEL audit store.

let dirEnsured = false;

function ensureDir(): void {
  if (dirEnsured) return;
  if (!fs.existsSync(EMERGENCE_DIR)) {
    fs.mkdirSync(EMERGENCE_DIR, { recursive: true });
  }
  dirEnsured = true;
}

/**
 * Persist one emergence record (observation or emergence event). Write-through:
 * JSONL on disk (source of truth) + optional Postgres (multi-instance). Best-effort
 * — swallows errors so the in-memory emergence path is never affected.
 */
export function appendEmergenceRecord(record: EmergenceRecord): void {
  if (
    process.env.NODE_ENV === 'test' &&
    process.env.HOLOMESH_TEST_DISABLE_EMERGENCE_PERSISTENCE === '1'
  ) {
    return;
  }
  try {
    ensureDir();
    fs.appendFileSync(CORPUS_PATH, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (err) {
    console.warn(`[DaemonEmergenceStore] JSONL append failed: ${(err as Error).message}`);
  }
  pgAppend(record);
}

// ── Read (hydration source) ───────────────────────────────────────────────────

/**
 * Read every persisted emergence record from disk, oldest-first (append order).
 * Corrupt / half-flushed lines are skipped (honest: rare, never fatal). Returns
 * [] when nothing has accrued yet. This is the local source of truth — Postgres
 * is only consulted by the caller when it explicitly wants cross-instance reads.
 */
export function readEmergenceRecords(): EmergenceRecord[] {
  if (!fs.existsSync(CORPUS_PATH)) return [];
  const out: EmergenceRecord[] = [];
  const lines = fs.readFileSync(CORPUS_PATH, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as EmergenceRecord);
    } catch {
      // Corrupt line — skip.
    }
  }
  return out;
}

// ── Export (normalized training corpus) ───────────────────────────────────────
//
// The corpus consumer (ai-ecosystem/scripts/corpus/harvest_real.py) normalizes
// every source into (system, user, target, grader_key, ...). The emergence
// source is a live behavioral trace, so we emit the same shape:
//
//   system   : fixed emergence-task framing
//   user     : a JSON encoding of the observed context (the field's input)
//   target   : a JSON encoding of what the field learned (preferences + care
//              signals + significance) — the supervision signal
//   timestamp: ISO observed/emerged stamp
//   grader_key: ["emergence", ownerId, seq] — provenance + dedup handle
//
// Emergence events are emitted as a `manifested` marker row so a corpus builder
// can segment a soul's pre-emergence stream from post-emergence learning.

export interface NormalizedCorpusRow {
  system: string;
  user: string;
  target: string;
  grader: { kind: string; ownerId: string; significanceScore?: number };
  grader_key: [string, string, number];
  family: string;
  modality: string;
  source: string;
  soul: string;
  context: Record<string, unknown>;
  observation: Record<string, unknown> | null;
  timestamp: string;
}

const SYSTEM_EMERGENCE =
  'You are a daimōn substrate observing a soul (D.053). Given the accumulated ' +
  'context of an interaction, update the latent model of who this person is — ' +
  'their preferences and the care they are owed. Respond with ONLY the updated ' +
  'model as JSON.';

/**
 * Project the persisted emergence corpus into normalized training rows.
 * Pure over the on-disk records (no I/O beyond the read) so it is trivially
 * testable. `records` defaults to the on-disk corpus.
 */
export function buildNormalizedRows(
  records: EmergenceRecord[] = readEmergenceRecords()
): NormalizedCorpusRow[] {
  const rows: NormalizedCorpusRow[] = [];
  const seqByOwner = new Map<string, number>();

  for (const rec of records) {
    const seq = (seqByOwner.get(rec.ownerId) ?? -1) + 1;
    seqByOwner.set(rec.ownerId, seq);

    if (rec.kind === 'observation') {
      const d = rec.delta;
      // user = the input context the field saw (intents + capability updates +
      // receipt refs). target = what it learned (preferences + care signals).
      const context = {
        newIntentSignals: d.newIntentSignals,
        capabilityUpdates: d.capabilityUpdates,
        newReceiptRefs: d.newReceiptRefs,
      };
      const observation = {
        updatedPreferences: d.updatedPreferences,
        careSignalHistory: d.careSignalHistory,
        significanceScore: d.significanceScore,
      };
      rows.push({
        system: SYSTEM_EMERGENCE,
        user: JSON.stringify(context),
        target: JSON.stringify(observation),
        grader: {
          kind: 'emergence_observation',
          ownerId: rec.ownerId,
          significanceScore: d.significanceScore,
        },
        grader_key: ['emergence', rec.ownerId, seq],
        family: 'real_emergence',
        modality: 'soul-observation',
        source: 'daemon-emergence-corpus',
        soul: rec.ownerId,
        context,
        observation,
        timestamp: rec.observedAt,
      });
    } else {
      // emergence marker row — segments pre/post emergence for a soul.
      rows.push({
        system: SYSTEM_EMERGENCE,
        user: JSON.stringify({ event: 'manifested', daemonId: rec.daemonId }),
        target: JSON.stringify({ displayName: rec.displayName }),
        grader: { kind: 'emergence_manifested', ownerId: rec.ownerId },
        grader_key: ['emergence', rec.ownerId, seq],
        family: 'real_emergence',
        modality: 'emergence-event',
        source: 'daemon-emergence-corpus',
        soul: rec.ownerId,
        context: { event: 'manifested', daemonId: rec.daemonId },
        observation: null,
        timestamp: rec.emergedAt,
      });
    }
  }
  return rows;
}

/**
 * Export the persisted emergence corpus to a normalized JSONL file the
 * corpus builder (harvest_real.py) can consume. Returns the path written and
 * the row count. If `outPath` is omitted, writes alongside the raw corpus as
 * `emergence-corpus.normalized.jsonl`.
 */
export function exportCorpusJsonl(outPath?: string): {
  path: string;
  rows: number;
  bytes: number;
} {
  const rows = buildNormalizedRows();
  const target = outPath || path.join(EMERGENCE_DIR, 'emergence-corpus.normalized.jsonl');
  ensureDir();
  const body = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
  fs.writeFileSync(target, body, 'utf8');
  return { path: target, rows: rows.length, bytes: Buffer.byteLength(body, 'utf8') };
}

/** Diagnostics: where the corpus lives + how much has accrued. */
export function emergenceCorpusStats(): {
  corpusPath: string;
  exists: boolean;
  records: number;
  souls: number;
  emergedSouls: number;
} {
  const records = readEmergenceRecords();
  const souls = new Set(records.map((r) => r.ownerId));
  const emerged = new Set(
    records
      .filter((r): r is Extract<EmergenceRecord, { kind: 'emergence' }> => r.kind === 'emergence')
      .map((r) => r.ownerId)
  );
  return {
    corpusPath: CORPUS_PATH,
    exists: fs.existsSync(CORPUS_PATH),
    records: records.length,
    souls: souls.size,
    emergedSouls: emerged.size,
  };
}

/** Test-only: the resolved corpus path (so tests can point HOLOMESH_DATA_DIR). */
export function _corpusPathForTest(): string {
  return CORPUS_PATH;
}
