/**
 * CG-757: the compile fan-out producer writes GENUINE per-target results into
 * the compile-job-{id} StateAuthority entity, and the twin verifier catches a
 * lying display against that REAL store.
 *
 * Discipline (research/2026-07-10_verified-view-v1-design.md §4): the red-flip
 * canary lives in the SAME file as the clean check — a verifier that cannot go
 * red proves nothing. Zero fabrication: every value asserted here round-trips
 * through the real push_state_delta → Loro → fetcher path, and every receipt
 * hash comes from a real compile artifact.
 */
import { describe, it, expect, beforeAll } from 'vitest';

import { runCompileFanout } from '../compileFanout.js';
import { __resetNetworkingState } from '../networking-tools.js';
import {
  createAuthoritativeStateFetcher,
  verifySurfaceAgainstLiveAuthority,
} from '../surfaceTwinFetcher.js';

const TINY_COMPOSITION = `composition "fanout-probe" {
  object "Box" {
    @grabbable
  }
}`;

const TARGETS = ['webgpu', 'unity', 'svg', 'usd'];

describe('runCompileFanout — genuine producer against the real store', () => {
  beforeAll(() => {
    __resetNetworkingState();
  });

  it('refuses an entity-unsafe jobId', async () => {
    await expect(
      runCompileFanout({ jobId: 'bad id!', code: TINY_COMPOSITION, targets: TARGETS })
    ).rejects.toThrow(/jobId must match/);
  });

  it('compiles real targets, writes real sizes and receipt hashes to the entity', async () => {
    const result = await runCompileFanout({
      jobId: 'test-clean',
      code: TINY_COMPOSITION,
      targets: TARGETS,
    });

    expect(result.entityId).toBe('compile-job-test-clean');
    expect(result.status).toBe('complete');
    expect(result.okCount).toBe(TARGETS.length);
    expect(result.totalKb).toBeGreaterThan(0);
    for (const t of result.targets) {
      expect(t.status).toBe('ok');
      expect(t.sizeKb).toBeGreaterThan(0);
      // A receipt hash is the compile handler's own artifact digest.
      expect(t.receiptHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
    // Distinct targets produce distinct artifacts, so hashes must differ —
    // identical hashes would mean the "per-target" results are one artifact.
    const hashes = new Set(result.targets.map((t) => t.receiptHash));
    expect(hashes.size).toBe(TARGETS.length);

    // Read back through the REAL production fetcher — no fabrication.
    const fetch = createAuthoritativeStateFetcher();
    const entity = (await fetch(result.entityId)) as Record<string, unknown>;
    expect(entity).toBeTruthy();
    expect(entity.status).toBe('complete');
    expect(entity.targetCount).toBe(TARGETS.length);
    expect(entity.okCount).toBe(TARGETS.length);
    expect(entity.totalKb).toBeCloseTo(result.totalKb, 6);
    const stored = entity.targets as Array<{ target: string; receiptHash: string }>;
    expect(stored.map((t) => t.receiptHash).sort()).toEqual(
      result.targets.map((t) => t.receiptHash).sort()
    );
    // Per-target progressive keys survived the parallel writes.
    for (const target of TARGETS) {
      expect(entity[`t_${target}`]).toBeTruthy();
    }
    expect(result.writes.every((w) => w === 'success' || w === 'skipped')).toBe(true);
  });

  it('reports a bogus target as error and the job as partial — a fault it must catch', async () => {
    const result = await runCompileFanout({
      jobId: 'test-partial',
      code: TINY_COMPOSITION,
      targets: ['svg', 'no-such-target'],
    });
    expect(result.status).toBe('partial');
    expect(result.okCount).toBe(1);
    const bad = result.targets.find((t) => t.target === 'no-such-target');
    expect(bad?.status).toBe('error');
    expect(bad?.receiptHash).toBe('');
    const fetch = createAuthoritativeStateFetcher();
    const entity = (await fetch(result.entityId)) as Record<string, unknown>;
    expect(entity.status).toBe('partial');
  });
});

describe('twin verification against the producer-written entity (done-test #3)', () => {
  const contractFor = (entityId: string) => ({
    projections: [
      { element: 'CountRow', node: 'job.targetCount', entity: entityId, identity: true },
    ],
  });

  it('CONSENSUS when the display shows what the producer really wrote', async () => {
    const fanout = await runCompileFanout({
      jobId: 'test-verify',
      code: TINY_COMPOSITION,
      targets: TARGETS,
    });
    const receipt = await verifySurfaceAgainstLiveAuthority({
      contract: contractFor(fanout.entityId),
      displayedValues: { 'job.targetCount': fanout.targetCount },
    });
    expect(receipt.verdict).toBe('CONSENSUS');
    expect(receipt.checked).toBe(1);
  });

  it('RED-FLIP: a display lying about the same entity is FALSIFIED', async () => {
    // Same real entity, same contract — only the rendered value is wrong
    // (the §4 injected render bug). If this passes, the verifier is
    // self-passing and the build must be rejected.
    const receipt = await verifySurfaceAgainstLiveAuthority({
      contract: contractFor('compile-job-test-verify'),
      displayedValues: { 'job.targetCount': TARGETS.length + 41 },
    });
    expect(receipt.verdict).toBe('FALSIFIED');
    expect(receipt.divergences.length).toBeGreaterThan(0);
  });
});
