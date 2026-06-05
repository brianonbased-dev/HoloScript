/**
 * Durability test for the daimōn EMERGENCE CORPUS persistence (D.053 / P.007).
 *
 * Proves the additive persistence layer added to daemon-lifecycle-tools.ts:
 *   1. write-through  — observing a soul appends a durable record to JSONL,
 *   2. survives restart — a fresh read of the on-disk corpus returns the record,
 *   3. re-hydrates    — hydrateEmergenceFromCorpus rebuilds the in-memory
 *                       emergence state so emergence progress is NOT lost,
 *   4. exports        — the corpus projects to the normalized (soul, context,
 *                       observation/target, timestamp) shape harvest_real.py reads.
 *
 * Restart simulation: the in-memory Maps live inside daemon-lifecycle-tools.ts
 * module state. A real restart = a fresh module instance over the SAME on-disk
 * corpus. We model that by writing through the live tool path, then dynamically
 * importing a SECOND, independent instance of the module (Vitest gives each
 * dynamic import with a cache-bust query its own module state) and hydrating it
 * from the durable corpus the first instance wrote. The second instance starts
 * with EMPTY Maps (proving nothing leaked in-process) and recovers the soul's
 * accumulated knowing purely from disk.
 *
 * Test isolation: temp HOLOMESH_DATA_DIR set BEFORE first import (the store
 * resolves its data dir at module load, mirroring state-persistence.test.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEMP_DIR = mkdtempSync(join(tmpdir(), 'emergence-persist-'));
process.env.HOLOMESH_DATA_DIR = TEMP_DIR;
// Ensure write-through is NOT disabled (the CAEL test-opt-out flag is separate,
// but be explicit so a polluted env never silently no-ops this test).
delete process.env.HOLOMESH_TEST_DISABLE_EMERGENCE_PERSISTENCE;

// First module instance — the "pre-restart" server process.
const live = await import('../daemon-lifecycle-tools');
const store = await import('../daemon-emergence-store');

const SOUL = 'soul-durability-test';
const CORPUS_PATH = join(TEMP_DIR, 'emergence', 'soul-observations.jsonl');

describe('emergence corpus durability (D.053 persistence)', () => {
  beforeAll(async () => {
    // Observe the soul several times via the LIVE tool path. Each call mutates
    // the in-memory Map AND write-throughs to the durable corpus. We deliberately
    // stay BELOW the emergence threshold so we test pure pre-emergence accrual
    // (the exact data that used to evaporate).
    for (let i = 0; i < 3; i++) {
      await live.handleDaemonLifecycleTool('holo_observe_soul', {
        ownerId: SOUL,
        contextDelta: {
          updatedPreferences: { [`pref_${i}`]: `value_${i}` },
          careSignalHistory: [`care_${i}`],
          significanceScore: 0.9,
        },
      });
    }
  });

  afterAll(() => {
    try {
      rmSync(TEMP_DIR, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  it('write-through: observations land in the on-disk JSONL corpus', () => {
    expect(existsSync(CORPUS_PATH)).toBe(true);
    const lines = readFileSync(CORPUS_PATH, 'utf8').split('\n').filter((l) => l.trim());
    // 3 observation records for this soul.
    const mine = lines
      .map((l) => JSON.parse(l))
      .filter((r) => r.ownerId === SOUL && r.kind === 'observation');
    expect(mine).toHaveLength(3);
    expect(mine[0].delta.updatedPreferences).toEqual({ pref_0: 'value_0' });
    expect(mine[0].delta.significanceScore).toBe(0.9);
  });

  it('survives "restart": a fresh disk read returns the records', () => {
    const records = store.readEmergenceRecords();
    const mine = records.filter((r) => r.ownerId === SOUL);
    expect(mine).toHaveLength(3);
  });

  it('re-hydrates a fresh module instance from disk (the restart proof)', async () => {
    // Independent module instance — its in-memory Maps start EMPTY. This is the
    // post-restart server.
    const restarted = await import('../daemon-lifecycle-tools?restart=1');

    // BEFORE hydration: the fresh instance knows nothing about the soul.
    const before = (await restarted.handleDaemonLifecycleTool('holo_daemon_emergence_check', {
      ownerId: SOUL,
    })) as { significantTurns: number; modelRichness: number };
    expect(before.significantTurns).toBe(0);
    expect(before.modelRichness).toBe(0);

    // Hydrate from the durable corpus the first instance wrote to disk.
    const stats = restarted.hydrateEmergenceFromCorpus();
    expect(stats.records).toBeGreaterThanOrEqual(3);
    expect(stats.souls).toBeGreaterThanOrEqual(1);

    // AFTER hydration: the soul's accumulated knowing is RECOVERED — 3 significant
    // turns + 6 distinct model signals (3 pref keys + 3 care signals). This is the
    // exact emergence progress that previously evaporated on restart.
    const after = (await restarted.handleDaemonLifecycleTool('holo_daemon_emergence_check', {
      ownerId: SOUL,
    })) as { significantTurns: number; modelRichness: number };
    expect(after.significantTurns).toBe(3);
    expect(after.modelRichness).toBe(6);
  });

  it('exports normalized rows in the harvest_real.py shape', () => {
    const rows = store.buildNormalizedRows();
    const mine = rows.filter((r) => r.soul === SOUL);
    expect(mine).toHaveLength(3);

    const row = mine[0];
    // Normalized training shape the corpus builder consumes.
    expect(row).toHaveProperty('system');
    expect(row).toHaveProperty('user');
    expect(row).toHaveProperty('target');
    expect(row).toHaveProperty('timestamp');
    expect(row.source).toBe('daemon-emergence-corpus');
    expect(row.modality).toBe('soul-observation');
    expect(row.grader_key[0]).toBe('emergence');
    expect(row.grader_key[1]).toBe(SOUL);
    // target carries the learned model (preferences + care + significance).
    const target = JSON.parse(row.target);
    expect(target.updatedPreferences).toEqual({ pref_0: 'value_0' });
    expect(target.careSignalHistory).toEqual(['care_0']);

    // The export file is written and re-readable.
    const out = store.exportCorpusJsonl();
    expect(out.rows).toBeGreaterThanOrEqual(3);
    expect(existsSync(out.path)).toBe(true);
  });
});
