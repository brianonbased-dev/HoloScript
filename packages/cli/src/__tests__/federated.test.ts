import { describe, it, expect, beforeEach } from 'vitest';
import {
  sampleLaplace,
  addLaplaceNoise,
  clipToL2Norm,
  deriveSharedKey,
  generateParticipantId,
  createFederationSession,
  prepareFederatedUpdate,
  aggregateUpdates,
  applyAggregatedUpdate,
  PrivacyBudgetTracker,
  TraitShareRegistry,
  type TraitWeights,
  type FederationConfig,
} from '../federated';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWeights(traitId: string, values: number[]): TraitWeights {
  return { traitId, weights: values, version: '1.0.0' };
}

// ---------------------------------------------------------------------------
// Laplace mechanism
// ---------------------------------------------------------------------------

describe('sampleLaplace', () => {
  it('returns a finite number', () => {
    for (let i = 0; i < 100; i++) {
      const v = sampleLaplace(1.0);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('produces symmetric distribution (mean ≈ 0 over many samples)', () => {
    const samples = Array.from({ length: 10_000 }, () => sampleLaplace(1.0));
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    expect(Math.abs(mean)).toBeLessThan(0.1);
  });

  it('larger lambda produces larger spread', () => {
    const smallSpread = Array.from({ length: 500 }, () => Math.abs(sampleLaplace(0.1)));
    const largeSpread = Array.from({ length: 500 }, () => Math.abs(sampleLaplace(10.0)));
    const smallMean = smallSpread.reduce((s, v) => s + v, 0) / smallSpread.length;
    const largeMean = largeSpread.reduce((s, v) => s + v, 0) / largeSpread.length;
    expect(largeMean).toBeGreaterThan(smallMean);
  });
});

describe('addLaplaceNoise', () => {
  it('returns same-length vector', () => {
    const w = [0.1, 0.2, 0.3];
    const noisy = addLaplaceNoise(w, 0.5, 1.0);
    expect(noisy.length).toBe(3);
  });

  it('throws for epsilon <= 0', () => {
    expect(() => addLaplaceNoise([1], 0, 1)).toThrow('epsilon must be > 0');
    expect(() => addLaplaceNoise([1], -0.1, 1)).toThrow('epsilon must be > 0');
  });

  it('throws for sensitivity <= 0', () => {
    expect(() => addLaplaceNoise([1], 0.5, 0)).toThrow('sensitivity must be > 0');
  });

  it('noise magnitude scales with sensitivity/epsilon', () => {
    // Lower epsilon → more noise
    const highNoise = Array.from({ length: 200 }, () => {
      const w = [1.0];
      return Math.abs(addLaplaceNoise(w, 0.01, 1.0)[0] - 1.0);
    });
    const lowNoise = Array.from({ length: 200 }, () => {
      const w = [1.0];
      return Math.abs(addLaplaceNoise(w, 10.0, 1.0)[0] - 1.0);
    });
    const highMean = highNoise.reduce((s, v) => s + v, 0) / highNoise.length;
    const lowMean = lowNoise.reduce((s, v) => s + v, 0) / lowNoise.length;
    expect(highMean).toBeGreaterThan(lowMean);
  });
});

describe('clipToL2Norm', () => {
  it('does not modify vector already within norm', () => {
    const w = [0.1, 0.1, 0.1];
    const clipped = clipToL2Norm(w, 10.0);
    expect(clipped).toEqual(w);
  });

  it('clips oversized vector to maxNorm', () => {
    const w = [3.0, 4.0]; // L2 norm = 5
    const clipped = clipToL2Norm(w, 1.0);
    const norm = Math.sqrt(clipped.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 5);
  });

  it('preserves direction after clipping', () => {
    const w = [3.0, 4.0];
    const clipped = clipToL2Norm(w, 1.0);
    // Direction ratio should be preserved: 3/4 ≈ clipped[0]/clipped[1]
    expect(clipped[0] / clipped[1]).toBeCloseTo(3 / 4, 5);
  });

  it('returns a new array, does not mutate original', () => {
    const w = [3.0, 4.0];
    const clipped = clipToL2Norm(w, 1.0);
    expect(clipped).not.toBe(w);
    expect(w[0]).toBe(3.0);
  });
});

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

describe('deriveSharedKey', () => {
  it('returns a 64-character hex string', () => {
    const key = deriveSharedKey('alice', 'bob');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is symmetric (A,B) === (B,A)', () => {
    expect(deriveSharedKey('alice', 'bob')).toBe(deriveSharedKey('bob', 'alice'));
  });

  it('different pairs produce different keys', () => {
    expect(deriveSharedKey('alice', 'bob')).not.toBe(deriveSharedKey('alice', 'charlie'));
  });
});

describe('generateParticipantId', () => {
  it('returns string starting with hs-', () => {
    const id = generateParticipantId();
    expect(id.startsWith('hs-')).toBe(true);
  });

  it('returns unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateParticipantId()));
    expect(ids.size).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Federation session
// ---------------------------------------------------------------------------

describe('createFederationSession', () => {
  it('returns a session with defaults', () => {
    const session = createFederationSession();
    expect(session.participantId).toMatch(/^hs-/);
    expect(session.sessionId).toBeTruthy();
    expect(session.sharedKey).toMatch(/^[0-9a-f]{64}$/);
    expect(session.config.epsilon).toBe(0.5);
    expect(session.config.sensitivity).toBe(1.0);
    expect(session.config.minParticipants).toBe(3);
  });

  it('accepts custom config', () => {
    const session = createFederationSession({ epsilon: 0.1, minParticipants: 5 });
    expect(session.config.epsilon).toBe(0.1);
    expect(session.config.minParticipants).toBe(5);
  });

  it('each session has a unique participantId', () => {
    const sessions = Array.from({ length: 10 }, () => createFederationSession());
    const ids = new Set(sessions.map((s) => s.participantId));
    expect(ids.size).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Federated update preparation
// ---------------------------------------------------------------------------

describe('prepareFederatedUpdate', () => {
  it('returns a FederatedUpdate with matching traitId', () => {
    const session = createFederationSession({ epsilon: 1.0, sensitivity: 1.0 });
    const current = makeWeights('@grabbable', [0.5, 0.5, 0.5]);
    const improved = makeWeights('@grabbable', [0.6, 0.6, 0.6]);
    const update = prepareFederatedUpdate(session, current, improved);
    expect(update.traitId).toBe('@grabbable');
    expect(update.participantId).toBe(session.participantId);
    expect(update.noisyDelta.length).toBe(3);
    expect(update.epsilonSpent).toBe(1.0);
    expect(typeof update.timestamp).toBe('number');
  });

  it('throws when traitId mismatches', () => {
    const session = createFederationSession();
    const current = makeWeights('@grabbable', [0.5]);
    const improved = makeWeights('@physics', [0.6]);
    expect(() => prepareFederatedUpdate(session, current, improved)).toThrow('traitId mismatch');
  });

  it('throws on weight length mismatch', () => {
    const session = createFederationSession();
    const current = makeWeights('@grabbable', [0.5, 0.5]);
    const improved = makeWeights('@grabbable', [0.6]);
    expect(() => prepareFederatedUpdate(session, current, improved)).toThrow('length mismatch');
  });

  it('noisyDelta values are finite', () => {
    const session = createFederationSession({ epsilon: 0.5, sensitivity: 1.0 });
    const current = makeWeights('@physics', [1.0, 2.0, 3.0]);
    const improved = makeWeights('@physics', [1.1, 2.1, 3.1]);
    const update = prepareFederatedUpdate(session, current, improved);
    expect(update.noisyDelta.every(Number.isFinite)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

describe('aggregateUpdates', () => {
  const config: FederationConfig = { epsilon: 0.5, sensitivity: 1.0, minParticipants: 3 };

  function makeUpdate(participantId: string, delta: number[]): ReturnType<typeof prepareFederatedUpdate> {
    return {
      participantId,
      traitId: '@grabbable',
      noisyDelta: delta,
      epsilonSpent: 0.5,
      timestamp: Date.now(),
    };
  }

  it('FedAvg of identical deltas equals that delta', () => {
    const updates = [
      makeUpdate('p1', [1.0, 2.0]),
      makeUpdate('p2', [1.0, 2.0]),
      makeUpdate('p3', [1.0, 2.0]),
    ];
    const result = aggregateUpdates(updates, config);
    expect(result.aggregatedDelta[0]).toBeCloseTo(1.0, 10);
    expect(result.aggregatedDelta[1]).toBeCloseTo(2.0, 10);
  });

  it('averages correctly for asymmetric deltas', () => {
    const updates = [
      makeUpdate('p1', [0.0, 0.0]),
      makeUpdate('p2', [3.0, 3.0]),
      makeUpdate('p3', [0.0, 0.0]),
    ];
    const result = aggregateUpdates(updates, config);
    expect(result.aggregatedDelta[0]).toBeCloseTo(1.0, 10);
    expect(result.participantCount).toBe(3);
  });

  it('throws when below minParticipants', () => {
    const updates = [makeUpdate('p1', [1.0]), makeUpdate('p2', [1.0])];
    expect(() => aggregateUpdates(updates, config)).toThrow('Insufficient participants');
  });

  it('throws on empty updates array', () => {
    expect(() => aggregateUpdates([], config)).toThrow('No updates');
  });

  it('throws when traitIds are mixed', () => {
    const mixed = [
      { ...makeUpdate('p1', [1.0]), traitId: '@grabbable' },
      { ...makeUpdate('p2', [1.0]), traitId: '@physics' },
      { ...makeUpdate('p3', [1.0]), traitId: '@grabbable' },
    ];
    expect(() => aggregateUpdates(mixed, config)).toThrow('multiple traits');
  });

  it('throws on mismatched vector lengths', () => {
    const updates = [
      makeUpdate('p1', [1.0, 2.0]),
      makeUpdate('p2', [1.0]),
      makeUpdate('p3', [1.0, 2.0]),
    ];
    expect(() => aggregateUpdates(updates, config)).toThrow('mismatched vector length');
  });

  it('reports cumulative epsilon correctly', () => {
    const updates = [
      makeUpdate('p1', [1.0]),
      makeUpdate('p2', [1.0]),
      makeUpdate('p3', [1.0]),
    ];
    const result = aggregateUpdates(updates, config);
    expect(result.totalEpsilonBudget).toBeCloseTo(1.5, 10); // 3 × 0.5
  });
});

// ---------------------------------------------------------------------------
// Apply aggregated update
// ---------------------------------------------------------------------------

describe('applyAggregatedUpdate', () => {
  it('moves weights in direction of delta', () => {
    const local = makeWeights('@physics', [1.0, 1.0]);
    const aggregated = {
      traitId: '@physics',
      aggregatedDelta: [1.0, -1.0],
      participantCount: 3,
      totalEpsilonBudget: 1.5,
      timestamp: Date.now(),
    };
    const updated = applyAggregatedUpdate(local, aggregated, 0.1);
    expect(updated.weights[0]).toBeCloseTo(1.1, 10);
    expect(updated.weights[1]).toBeCloseTo(0.9, 10);
  });

  it('throws on traitId mismatch', () => {
    const local = makeWeights('@physics', [1.0]);
    const aggregated = {
      traitId: '@grabbable',
      aggregatedDelta: [1.0],
      participantCount: 3,
      totalEpsilonBudget: 1.5,
      timestamp: Date.now(),
    };
    expect(() => applyAggregatedUpdate(local, aggregated)).toThrow('traitId mismatch');
  });

  it('throws on vector length mismatch', () => {
    const local = makeWeights('@physics', [1.0, 2.0]);
    const aggregated = {
      traitId: '@physics',
      aggregatedDelta: [1.0],
      participantCount: 3,
      totalEpsilonBudget: 1.5,
      timestamp: Date.now(),
    };
    expect(() => applyAggregatedUpdate(local, aggregated)).toThrow('length mismatch');
  });

  it('uses learningRate = 0.1 by default', () => {
    const local = makeWeights('@physics', [0.0]);
    const aggregated = {
      traitId: '@physics',
      aggregatedDelta: [10.0],
      participantCount: 3,
      totalEpsilonBudget: 1.5,
      timestamp: Date.now(),
    };
    const updated = applyAggregatedUpdate(local, aggregated);
    expect(updated.weights[0]).toBeCloseTo(1.0, 10);
  });
});

// ---------------------------------------------------------------------------
// PrivacyBudgetTracker
// ---------------------------------------------------------------------------

describe('PrivacyBudgetTracker', () => {
  it('starts with full budget', () => {
    const tracker = new PrivacyBudgetTracker(2.0);
    expect(tracker.remaining()).toBe(2.0);
    expect(tracker.totalSpent()).toBe(0);
    expect(tracker.isExhausted()).toBe(false);
  });

  it('consumes budget correctly', () => {
    const tracker = new PrivacyBudgetTracker(2.0);
    tracker.consume(0.5);
    expect(tracker.remaining()).toBeCloseTo(1.5, 10);
    expect(tracker.totalSpent()).toBe(0.5);
  });

  it('throws when budget exceeded', () => {
    const tracker = new PrivacyBudgetTracker(1.0);
    tracker.consume(0.8);
    expect(() => tracker.consume(0.5)).toThrow('Privacy budget exhausted');
  });

  it('throws on invalid epsilon', () => {
    const tracker = new PrivacyBudgetTracker(1.0);
    expect(() => tracker.consume(0)).toThrow('epsilon must be > 0');
    expect(() => tracker.consume(-0.1)).toThrow('epsilon must be > 0');
  });

  it('throws on invalid maxBudget', () => {
    expect(() => new PrivacyBudgetTracker(0)).toThrow('maxBudget must be > 0');
    expect(() => new PrivacyBudgetTracker(-1)).toThrow('maxBudget must be > 0');
  });

  it('marks exhausted at exactly max', () => {
    const tracker = new PrivacyBudgetTracker(1.0);
    tracker.consume(1.0);
    expect(tracker.isExhausted()).toBe(true);
  });

  it('reset restores full budget', () => {
    const tracker = new PrivacyBudgetTracker(1.0);
    tracker.consume(0.5);
    tracker.reset();
    expect(tracker.totalSpent()).toBe(0);
    expect(tracker.remaining()).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// TraitShareRegistry
// ---------------------------------------------------------------------------

describe('TraitShareRegistry', () => {
  let registry: TraitShareRegistry;

  beforeEach(() => {
    registry = new TraitShareRegistry();
  });

  it('registers a trait', () => {
    registry.register('@grabbable', 'sess-01', 0.5);
    expect(registry.has('@grabbable')).toBe(true);
    const record = registry.get('@grabbable')!;
    expect(record.rounds).toBe(1);
    expect(record.cumulativeEpsilon).toBe(0.5);
  });

  it('increments rounds on re-registration', () => {
    registry.register('@grabbable', 'sess-01', 0.5);
    registry.register('@grabbable', 'sess-01', 0.5);
    const record = registry.get('@grabbable')!;
    expect(record.rounds).toBe(2);
    expect(record.cumulativeEpsilon).toBeCloseTo(1.0, 10);
  });

  it('list returns all records', () => {
    registry.register('@grabbable', 'sess-01', 0.5);
    registry.register('@physics', 'sess-01', 0.3);
    expect(registry.list().length).toBe(2);
  });

  it('returns undefined for unknown trait', () => {
    expect(registry.get('@unknown')).toBeUndefined();
  });

  it('has returns false for unregistered trait', () => {
    expect(registry.has('@unknown')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End-to-end scenario: 10+ participants share @physics improvements
// ---------------------------------------------------------------------------

describe('federated sharing end-to-end (10 participants)', () => {
  it('improves trait weights after one federation round', () => {
    const config: FederationConfig = {
      epsilon: 1.0,
      sensitivity: 1.0,
      minParticipants: 10,
    };

    // Each participant has slightly improved weights vs baseline
    const baseline = makeWeights('@physics', [0.5, 0.5, 0.5, 0.5, 0.5]);

    const updates = Array.from({ length: 10 }, (_, i) => {
      const session = createFederationSession({
        epsilon: config.epsilon,
        sensitivity: config.sensitivity,
      });
      const improved = makeWeights('@physics', baseline.weights.map((w) => w + 0.1 + i * 0.01));
      return prepareFederatedUpdate(session, baseline, improved);
    });

    const aggregated = aggregateUpdates(updates, config);
    expect(aggregated.participantCount).toBe(10);

    const updated = applyAggregatedUpdate(baseline, aggregated, 0.1);
    // Mean delta ≈ 0.145, LR=0.1 → weights should be > baseline
    expect(updated.weights[0]).toBeGreaterThan(0.5);
  });
});
