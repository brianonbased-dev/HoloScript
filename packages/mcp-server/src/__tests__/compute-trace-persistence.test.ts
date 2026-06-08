/**
 * Durability test for the COMPUTE-AXIS graded-trace corpus (P.004 / P.005 / EXP-3).
 *
 * Proves the additive compute-trace recorder (compute-trace-store.ts):
 *   1. write-through  — grading a compute mutation appends a durable record to JSONL,
 *   2. survives restart — a fresh read of the on-disk corpus returns the record,
 *   3. exports        — the corpus projects to the normalized (system, user, target,
 *                       grader, grader_key, family, modality, source) shape
 *                       scripts/corpus/harvest_real.py reads, contract-identical to
 *                       scripts/exp3/compute_suite.py rows.
 *
 * Restart simulation: the store reads/writes the SAME on-disk corpus regardless of
 * module instance (it holds no in-memory accumulation — JSONL IS the state). We
 * model a restart by grading via the live tool path (first instance), then
 * dynamically importing a SECOND, independent instance of the store (cache-busted)
 * and proving it recovers every record purely from disk.
 *
 * Test isolation: temp HOLOMESH_DATA_DIR set BEFORE first import (the store resolves
 * its data dir at module load, mirroring daemon-emergence-persistence.test.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEMP_DIR = mkdtempSync(join(tmpdir(), 'compute-trace-persist-'));
process.env.HOLOMESH_DATA_DIR = TEMP_DIR;
// Ensure write-through is NOT disabled by a polluted env.
delete process.env.HOLOMESH_TEST_DISABLE_COMPUTE_TRACE_PERSISTENCE;

// First module instance — the "pre-restart" server process.
const tools = await import('../compute-trace-tools');
const store = await import('../compute-trace-store');

const SESSION = 'compute-durability-test';
const TRACE_PATH = join(TEMP_DIR, 'compute-traces', 'compute-traces.jsonl');

// A real compute task drawn from the EXP-3 OPS table: "midpoint" of [0, 10] is 5.
// glow.intensity ∈ [0, 10], current 2; instruction asks for the exact midpoint.
const MIDPOINT_INSTRUCTION =
  'Set the intensity to the exact midpoint of its allowed range.\n\nScene:\n' +
  'simulation_contract: "glow-midpoint"\nobj#item {\n  @glow(intensity: 2)\n}\n\n' +
  'Contract "glow-midpoint" bounds: @glow.intensity ∈ [0, 10].';

describe('compute-trace corpus durability (native-model compute axis)', () => {
  beforeAll(async () => {
    // Grade three compute mutations via the LIVE tool path. Each call grades AND
    // write-throughs to the durable corpus. Two PASS (exact answer), one FAILS
    // (wrong answer) so we exercise both supervision polarities.
    await tools.handleComputeTraceTool('holo_grade_compute_mutation', {
      sessionId: SESSION,
      instruction: MIDPOINT_INSTRUCTION,
      contractId: 'glow-midpoint',
      scene: 'obj#item { @glow(intensity: 2) }',
      bound: { trait: 'glow', property: 'intensity', min: 0, max: 10, current: 2 },
      mutation: {
        tool: 'set_trait_property',
        objectName: 'item',
        traitName: 'glow',
        propertyKey: 'intensity',
        propertyValue: 5, // correct midpoint → PASS
      },
      expectedValue: 5,
      opLabel: 'midpoint',
      caelReceiptRef: 'cael:trace-abc123',
    });

    await tools.handleComputeTraceTool('holo_grade_compute_mutation', {
      sessionId: SESSION,
      instruction: 'Increase the mass by 30% of its current value, staying in bounds.',
      contractId: 'rigidbody-plus30',
      scene: 'obj#crate { @rigidbody(mass: 4) }',
      bound: { trait: 'rigidbody', property: 'mass', min: 0, max: 100, current: 4 },
      mutation: {
        tool: 'set_trait_property',
        objectName: 'crate',
        traitName: 'rigidbody',
        propertyKey: 'mass',
        propertyValue: 5.2, // 4 * 1.3 = 5.2 → PASS
      },
      expectedValue: 5.2,
      opLabel: 'plus30',
    });

    await tools.handleComputeTraceTool('holo_grade_compute_mutation', {
      sessionId: SESSION,
      instruction: 'Set the volume to two thirds of the maximum allowed.',
      contractId: 'audio-twothirds',
      scene: 'obj#speaker { @audio(volume: 1) }',
      bound: { trait: 'audio', property: 'volume', min: 0, max: 9, current: 1 },
      mutation: {
        tool: 'set_trait_property',
        objectName: 'speaker',
        traitName: 'audio',
        propertyKey: 'volume',
        propertyValue: 5, // wrong: (2/3)*9 = 6 → FAIL
      },
      expectedValue: 6,
      opLabel: 'twothirds',
    });
  });

  afterAll(() => {
    try {
      rmSync(TEMP_DIR, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  it('grades exactly: PASS on the correct value, FAIL on the wrong one', () => {
    // Re-grade synchronously to assert the verdict semantics (this also appends,
    // but the durability assertions below count by session+contract so it's safe).
    const pass = store.gradeComputeMutation({
      sessionId: 'verdict-check',
      instruction: MIDPOINT_INSTRUCTION,
      contractId: 'glow-midpoint',
      scene: 'obj#item { @glow(intensity: 2) }',
      bound: { trait: 'glow', property: 'intensity', min: 0, max: 10, current: 2 },
      mutation: {
        tool: 'set_trait_property',
        objectName: 'item',
        traitName: 'glow',
        propertyKey: 'intensity',
        propertyValue: 5,
      },
      expectedValue: 5,
      opLabel: 'midpoint',
    });
    expect(pass.passed).toBe(true);
    expect(pass.expectedValue).toBe(5);
    expect(pass.gradedValue).toBe(5);

    const fail = store.gradeComputeMutation({
      sessionId: 'verdict-check',
      instruction: 'two thirds',
      contractId: 'audio-twothirds',
      scene: 'obj#speaker { @audio(volume: 1) }',
      bound: { trait: 'audio', property: 'volume', min: 0, max: 9, current: 1 },
      mutation: {
        tool: 'set_trait_property',
        objectName: 'speaker',
        traitName: 'audio',
        propertyKey: 'volume',
        propertyValue: 5,
      },
      expectedValue: 6,
      opLabel: 'twothirds',
    });
    expect(fail.passed).toBe(false);
    expect(fail.expectedValue).toBe(6);
    expect(fail.gradedValue).toBe(5);
  });

  it('write-through: graded mutations land in the on-disk JSONL corpus', () => {
    expect(existsSync(TRACE_PATH)).toBe(true);
    const lines = readFileSync(TRACE_PATH, 'utf8')
      .split('\n')
      .filter((l) => l.trim());
    const mine = lines.map((l) => JSON.parse(l)).filter((r) => r.sessionId === SESSION);
    expect(mine).toHaveLength(3);
    const midpoint = mine.find((r) => r.contractId === 'glow-midpoint');
    expect(midpoint.passed).toBe(true);
    expect(midpoint.expectedValue).toBe(5);
    expect(midpoint.caelReceiptRef).toBe('cael:trace-abc123');
  });

  it('survives "restart": a fresh, independent module instance recovers the records from disk', async () => {
    const restarted = await import('../compute-trace-store?restart=1');
    const records = restarted
      .readComputeTraces()
      .filter((r: { sessionId: string }) => r.sessionId === SESSION);
    expect(records).toHaveLength(3);
    const stats = restarted.computeTraceStats();
    expect(stats.records).toBeGreaterThanOrEqual(3);
    expect(stats.passed).toBeGreaterThanOrEqual(2);
  });

  it('exports normalized rows in the harvest_real.py compute shape', () => {
    const rows = store.buildNormalizedRows().filter((r) => r.session === SESSION);
    expect(rows).toHaveLength(3);

    const row = rows.find((r) => r.grader.contractId === 'glow-midpoint')!;
    // Normalized training shape the corpus builder consumes.
    expect(row).toHaveProperty('system');
    expect(row).toHaveProperty('user');
    expect(row).toHaveProperty('target');
    expect(row).toHaveProperty('timestamp');
    expect(row.source).toBe('compute-trace-corpus');
    expect(row.modality).toBe('compute');
    expect(row.family).toBe('real_compute');
    expect(row.grader_key[0]).toBe('compute');
    expect(row.grader_key[1]).toBe(SESSION);
    // target is the set_trait_property mutation carrying the EXPECTED value.
    const target = JSON.parse(row.target);
    expect(target.tool).toBe('set_trait_property');
    expect(target.input.property_value).toBe(5);
    expect(row.grader.expected).toBe(5);
    expect(row.grader.passed).toBe(true);

    // passedOnly export (default) drops the failing twothirds row.
    const out = store.exportTracesJsonl(undefined, { passedOnly: true });
    expect(existsSync(out.path)).toBe(true);
    const exported = readFileSync(out.path, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
    const mineExported = exported.filter((r: { session: string }) => r.session === SESSION);
    // Of this session's 3 rows, 2 passed → only those survive the passedOnly export.
    expect(mineExported).toHaveLength(2);
    expect(mineExported.every((r: { grader: { passed: boolean } }) => r.grader.passed)).toBe(true);
  });
});
