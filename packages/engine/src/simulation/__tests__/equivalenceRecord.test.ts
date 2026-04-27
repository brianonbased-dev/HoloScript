import { describe, it, expect } from 'vitest';
import type { SimulationProvenance, InteractionEvent } from '../SimulationContract';
import {
  EQUIVALENCE_V1,
  buildEquivalenceV1Record,
  canonicalWireSnapshot,
  stableStringify,
  toEquivalenceWireInput,
  wireFormatEquivalent,
  wireKey,
} from '../equivalenceRecord';

function baseInteraction(
  id: number,
  simTime: number,
  type: string,
  data: Record<string, unknown>
): InteractionEvent {
  return {
    id,
    timestamp: 1_000_000 + id,
    simTime,
    type,
    data,
  };
}

function baseReplay(over: Partial<SimulationProvenance> = {}): SimulationProvenance {
  const interactions: InteractionEvent[] = [baseInteraction(0, 0, 'load', { k: 1 })];
  return {
    runId: 'run-a',
    geometryHash: 'gh1',
    contractId: 'gh1',
    subgridAttestation: undefined,
    solverType: 'structural.steady.v1',
    config: { material: 'steel' },
    fixedDt: 0.01,
    totalSteps: 3,
    totalSimTime: 0.03,
    wallTimeMs: 10,
    interactions: over.interactions ?? interactions,
    finalStats: {},
    deterministic: true,
    platformVersion: 'test',
    createdAt: '2026-01-01',
    ...over,
  };
}

describe('equivalenceRecord (W.315 wire seam)', () => {
  it('EQUIVALENCE_V1 is the documented solverType token', () => {
    expect(EQUIVALENCE_V1).toBe('equivalence.v1');
  });

  it('stableStringify is key-order independent for objects', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it('wireFormatEquivalent is true for identical replays (ignoring run metadata)', () => {
    const a = baseReplay({ runId: 'x' });
    const b = baseReplay({ runId: 'y', wallTimeMs: 99 });
    expect(wireFormatEquivalent(a, b)).toBe(true);
  });

  it('treats interaction id/timestamp as non-semantic (same simTime/type/data)', () => {
    const body = {
      interactions: [
        baseInteraction(7, 0, 'load', { k: 1 }),
        baseInteraction(8, 0.1, 'nudge', { dx: 0.01 }),
      ],
    };
    const a = baseReplay(body);
    const b = baseReplay({
      interactions: [
        baseInteraction(99, 0, 'load', { k: 1 }),
        baseInteraction(1, 0.1, 'nudge', { dx: 0.01 }),
      ],
    });
    expect(wireFormatEquivalent(a, b)).toBe(true);
  });

  it('is false when interaction data differs', () => {
    const a = baseReplay();
    const b = baseReplay({
      interactions: [baseInteraction(0, 0, 'load', { k: 2 })],
    });
    expect(wireFormatEquivalent(a, b)).toBe(false);
  });

  it('is false when contractId differs', () => {
    const a = baseReplay();
    const b = baseReplay({ contractId: 'other' });
    expect(wireFormatEquivalent(a, b)).toBe(false);
  });

  it('toEquivalenceWireInput and canonicalWireSnapshot strip provenance-only fields', () => {
    const p = baseReplay();
    const w = toEquivalenceWireInput(p);
    expect('runId' in w).toBe(false);
    const c = canonicalWireSnapshot(p);
    expect(c).not.toHaveProperty('runId');
    expect(c).toHaveProperty('interactions');
  });

  it('buildEquivalenceV1Record marks equivalent and exposes wire keys', () => {
    const a = baseReplay();
    const b = baseReplay();
    const rec = buildEquivalenceV1Record(a, b, { label: 't1' });
    expect(rec.solverType).toBe('equivalence.v1');
    expect(rec.specVersion).toBe(1);
    expect(rec.equivalent).toBe(true);
    expect(rec.wireKeyLeft).toBe(rec.wireKeyRight);
    expect(rec.wireKeyLeft).toBe(wireKey(a));
    expect(rec.label).toBe('t1');
  });

  it('buildEquivalenceV1Record equivalent false when keys differ', () => {
    const a = baseReplay();
    const b = baseReplay({ totalSteps: 4 });
    const rec = buildEquivalenceV1Record(a, b);
    expect(rec.equivalent).toBe(false);
    expect(rec.wireKeyLeft).not.toBe(rec.wireKeyRight);
  });
});
