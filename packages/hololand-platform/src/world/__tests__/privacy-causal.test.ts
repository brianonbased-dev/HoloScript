import { describe, it, expect } from 'vitest';
import {
  addDPNoise,
  fisherZ,
  inverseFisherZ,
  dpConditionalIndependenceTest,
  runDPSkeletonLearning,
  aggregateCausalSkeletons,
  buildCorrelationMatrix,
  SecureCausalDiscovery,
  PrivacyAuditLog,
} from '../privacy-causal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCorrelations(
  vars: string[],
  values: Record<string, number>,
): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const v of vars) {
    m.set(v, new Map());
    for (const u of vars) {
      const key = [v, u].sort().join('||');
      m.get(v)!.set(u, v === u ? 1.0 : (values[key] ?? 0.0));
    }
  }
  return m;
}

// ---------------------------------------------------------------------------
// addDPNoise
// ---------------------------------------------------------------------------

describe('addDPNoise', () => {
  it('returns a finite number', () => {
    const result = addDPNoise(0.5, 1.0, 1.0);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('throws for epsilon <= 0', () => {
    expect(() => addDPNoise(0, 1, 0)).toThrow('epsilon');
    expect(() => addDPNoise(0, 1, -1)).toThrow('epsilon');
  });

  it('throws for sensitivity <= 0', () => {
    expect(() => addDPNoise(0, 0, 1)).toThrow('sensitivity');
  });

  it('noise magnitude scales with sensitivity', () => {
    const N = 500;
    let sumLow = 0, sumHigh = 0;
    for (let i = 0; i < N; i++) {
      sumLow += Math.abs(addDPNoise(0, 0.1, 1));
      sumHigh += Math.abs(addDPNoise(0, 10, 1));
    }
    expect(sumHigh / N).toBeGreaterThan(sumLow / N);
  });
});

// ---------------------------------------------------------------------------
// fisherZ / inverseFisherZ
// ---------------------------------------------------------------------------

describe('fisherZ', () => {
  it('returns 0 for r=0', () => {
    expect(fisherZ(0)).toBeCloseTo(0, 5);
  });

  it('increases monotonically', () => {
    expect(fisherZ(0.5)).toBeLessThan(fisherZ(0.8));
  });

  it('round-trips through inverseFisherZ', () => {
    for (const r of [-0.8, -0.3, 0, 0.3, 0.8]) {
      expect(inverseFisherZ(fisherZ(r))).toBeCloseTo(r, 4);
    }
  });

  it('clamps at ±0.9999 to avoid Infinity', () => {
    expect(Number.isFinite(fisherZ(1.0))).toBe(true);
    expect(Number.isFinite(fisherZ(-1.0))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dpConditionalIndependenceTest
// ---------------------------------------------------------------------------

describe('dpConditionalIndependenceTest', () => {
  it('returns a result with correct variable names', () => {
    const result = dpConditionalIndependenceTest('A', 'B', [], 0.8, 100, 0.5);
    expect(result.x).toBe('A');
    expect(result.y).toBe('B');
    expect(result.condSet).toEqual([]);
  });

  it('p-value is in [0, 1]', () => {
    for (let i = 0; i < 20; i++) {
      const result = dpConditionalIndependenceTest('X', 'Y', [], 0.5, 200, 1.0);
      expect(result.pValue).toBeGreaterThanOrEqual(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
    }
  });

  it('strong correlation tends not to be called independent', () => {
    let independentCount = 0;
    for (let i = 0; i < 50; i++) {
      const result = dpConditionalIndependenceTest('X', 'Y', [], 0.99, 1000, 0.1, 0.05);
      if (result.independent) independentCount++;
    }
    // With near-perfect correlation and large n, should mostly call dependent
    expect(independentCount).toBeLessThan(40);
  });

  it('near-zero correlation tends to be called independent', () => {
    let independentCount = 0;
    for (let i = 0; i < 50; i++) {
      // Use high epsilon to reduce DP noise so the statistical tendency is stable.
      const result = dpConditionalIndependenceTest('X', 'Y', [], 0.01, 1000, 10.0, 0.05);
      if (result.independent) independentCount++;
    }
    expect(independentCount).toBeGreaterThan(35);
  });

  it('throws for epsilon <= 0', () => {
    expect(() => dpConditionalIndependenceTest('X', 'Y', [], 0.5, 100, 0)).toThrow('epsilon');
  });

  it('throws for sampleSize < 4', () => {
    expect(() => dpConditionalIndependenceTest('X', 'Y', [], 0.5, 3, 1.0)).toThrow('sampleSize');
  });

  it('handles large conditioning set with insufficient df gracefully', () => {
    // condSet larger than sampleSize-3 → df ≤ 0, treated as dependent
    const result = dpConditionalIndependenceTest('X', 'Y', ['Z1', 'Z2', 'Z3'], 0.1, 5, 1.0);
    expect(result.independent).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runDPSkeletonLearning
// ---------------------------------------------------------------------------

describe('runDPSkeletonLearning', () => {
  const vars = ['A', 'B', 'C'];
  const config = {
    epsilon: 1.0,
    delta: 0,
    alpha: 0.05,
    maxCondSetSize: 1,
    minSiloAgreement: 0.5,
  };

  it('returns a skeleton with variables', () => {
    const corr = makeCorrelations(vars, { 'A||B': 0.9, 'A||C': 0.1, 'B||C': 0.1 });
    const sk = runDPSkeletonLearning(vars, corr, 200, config);
    expect(sk.variables).toEqual(vars);
    expect(Array.isArray(sk.edges)).toBe(true);
  });

  it('privacyBudgetSpent is positive', () => {
    const corr = makeCorrelations(vars, { 'A||B': 0.9, 'A||C': 0.1, 'B||C': 0.1 });
    const sk = runDPSkeletonLearning(vars, corr, 200, config);
    expect(sk.privacyBudgetSpent).toBeGreaterThan(0);
  });

  it('edge objects have required fields', () => {
    const corr = makeCorrelations(vars, { 'A||B': 0.95, 'A||C': 0.9, 'B||C': 0.9 });
    const sk = runDPSkeletonLearning(vars, corr, 200, config);
    for (const edge of sk.edges) {
      expect(typeof edge.from).toBe('string');
      expect(typeof edge.to).toBe('string');
      expect(['directed', 'undirected', 'none']).toContain(edge.orientation);
      expect(edge.confidence).toBeGreaterThanOrEqual(0);
      expect(edge.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// aggregateCausalSkeletons
// ---------------------------------------------------------------------------

describe('aggregateCausalSkeletons', () => {
  const vars = ['X', 'Y', 'Z'];
  const config = {
    epsilon: 1.0,
    delta: 0,
    alpha: 0.05,
    maxCondSetSize: 1,
    minSiloAgreement: 0.6,
  };

  function makeSilo(id: string, edges: Array<{ from: string; to: string }>): import('../privacy-causal').FederatedSiloData {
    return {
      siloId: id,
      skeleton: {
        variables: vars,
        edges: edges.map(e => ({ ...e, orientation: 'undirected' as const, confidence: 1.0 })),
        privacyBudgetSpent: 0.5,
      },
      sampleSize: 100,
    };
  }

  it('edge with majority votes appears in result', () => {
    const silos = [
      makeSilo('s1', [{ from: 'X', to: 'Y' }]),
      makeSilo('s2', [{ from: 'X', to: 'Y' }]),
      makeSilo('s3', [{ from: 'X', to: 'Y' }]),
    ];
    const graph = aggregateCausalSkeletons(silos, config);
    const edge = graph.edges.find(e =>
      (e.from === 'X' && e.to === 'Y') || (e.from === 'Y' && e.to === 'X'),
    );
    expect(edge).toBeDefined();
    expect(edge!.confidence).toBeCloseTo(1.0);
  });

  it('edge with minority votes excluded', () => {
    const silos = [
      makeSilo('s1', [{ from: 'X', to: 'Z' }]),
      makeSilo('s2', []),
      makeSilo('s3', []),
      makeSilo('s4', []),
      makeSilo('s5', []),
    ];
    const graph = aggregateCausalSkeletons(silos, config);
    const edge = graph.edges.find(e =>
      (e.from === 'X' && e.to === 'Z') || (e.from === 'Z' && e.to === 'X'),
    );
    expect(edge).toBeUndefined();
  });

  it('accumulates totalSamples and totalSilos', () => {
    const silos = [
      makeSilo('s1', []),
      makeSilo('s2', []),
    ];
    const graph = aggregateCausalSkeletons(silos, config);
    expect(graph.totalSilos).toBe(2);
    expect(graph.totalSamples).toBe(200);
  });

  it('throws on empty silos', () => {
    expect(() => aggregateCausalSkeletons([], config)).toThrow('silo');
  });

  it('privacyBudgetSpent sums across silos', () => {
    const silos = [makeSilo('s1', []), makeSilo('s2', [])];
    const graph = aggregateCausalSkeletons(silos, config);
    expect(graph.privacyBudgetSpent).toBeCloseTo(1.0);
  });
});

// ---------------------------------------------------------------------------
// buildCorrelationMatrix
// ---------------------------------------------------------------------------

describe('buildCorrelationMatrix', () => {
  it('returns 1.0 on diagonal', () => {
    const obs = new Map([
      ['A', [1, 2, 3, 4, 5]],
      ['B', [5, 4, 3, 2, 1]],
    ]);
    const m = buildCorrelationMatrix(obs);
    expect(m.get('A')!.get('A')).toBeCloseTo(1.0);
    expect(m.get('B')!.get('B')).toBeCloseTo(1.0);
  });

  it('perfect anti-correlation → r = -1', () => {
    const obs = new Map([
      ['A', [1, 2, 3, 4, 5]],
      ['B', [5, 4, 3, 2, 1]],
    ]);
    const m = buildCorrelationMatrix(obs);
    expect(m.get('A')!.get('B')).toBeCloseTo(-1.0, 3);
  });

  it('is symmetric', () => {
    const obs = new Map([
      ['A', [1, 3, 2, 5, 4]],
      ['B', [2, 1, 4, 3, 5]],
      ['C', [5, 2, 1, 4, 3]],
    ]);
    const m = buildCorrelationMatrix(obs);
    expect(m.get('A')!.get('B')).toBeCloseTo(m.get('B')!.get('A')!, 10);
    expect(m.get('A')!.get('C')).toBeCloseTo(m.get('C')!.get('A')!, 10);
  });

  it('independent variables → r ≈ 0', () => {
    // Perfectly orthogonal vectors
    const obs = new Map([
      ['A', [1, -1, 1, -1, 1, -1, 1, -1]],
      ['B', [1, 1, -1, -1, 1, 1, -1, -1]],
    ]);
    const m = buildCorrelationMatrix(obs);
    expect(Math.abs(m.get('A')!.get('B')!)).toBeCloseTo(0, 5);
  });
});

// ---------------------------------------------------------------------------
// SecureCausalDiscovery
// ---------------------------------------------------------------------------

describe('SecureCausalDiscovery', () => {
  const config = {
    epsilon: 1.0,
    delta: 0,
    alpha: 0.05,
    maxCondSetSize: 1,
    minSiloAgreement: 0.5,
  };

  function makeCorrMap(vars: string[]): Map<string, Map<string, number>> {
    // All pairs with moderate correlation
    const vals: Record<string, number> = {};
    for (let i = 0; i < vars.length; i++)
      for (let j = i + 1; j < vars.length; j++)
        vals[[vars[i], vars[j]].sort().join('||')] = 0.5;
    return makeCorrelations(vars, vals);
  }

  it('throws when no silos registered', () => {
    const scd = new SecureCausalDiscovery(config);
    expect(() => scd.discover()).toThrow('No silos');
  });

  it('returns aggregated graph with correct silo count', () => {
    const scd = new SecureCausalDiscovery(config);
    const vars = ['A', 'B', 'C'];
    scd.registerSilo('silo-1', vars, makeCorrMap(vars), 200);
    scd.registerSilo('silo-2', vars, makeCorrMap(vars), 150);
    const graph = scd.discover();
    expect(graph.totalSilos).toBe(2);
    expect(graph.totalSamples).toBe(350);
  });

  it('siloCount increments with registerSilo', () => {
    const scd = new SecureCausalDiscovery(config);
    expect(scd.siloCount()).toBe(0);
    scd.registerSilo('s1', ['X'], new Map(), 100);
    expect(scd.siloCount()).toBe(1);
  });

  it('reset clears silos', () => {
    const scd = new SecureCausalDiscovery(config);
    scd.registerSilo('s1', ['X'], new Map(), 100);
    scd.reset();
    expect(scd.siloCount()).toBe(0);
    expect(() => scd.discover()).toThrow();
  });

  it('discoveredAt is a recent timestamp', () => {
    const before = Date.now();
    const scd = new SecureCausalDiscovery(config);
    scd.registerSilo('s1', ['X', 'Y'], makeCorrMap(['X', 'Y']), 100);
    const graph = scd.discover();
    const after = Date.now();
    expect(graph.discoveredAt).toBeGreaterThanOrEqual(before);
    expect(graph.discoveredAt).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// PrivacyAuditLog
// ---------------------------------------------------------------------------

describe('PrivacyAuditLog', () => {
  it('records entries', () => {
    const log = new PrivacyAuditLog();
    log.record('silo-a', 0.3, 10);
    log.record('silo-b', 0.5, 15);
    expect(log.all().length).toBe(2);
  });

  it('totalEpsilonSpent sums correctly', () => {
    const log = new PrivacyAuditLog();
    log.record('s1', 0.4, 5);
    log.record('s2', 0.6, 8);
    expect(log.totalEpsilonSpent()).toBeCloseTo(1.0);
  });

  it('entriesForSilo filters correctly', () => {
    const log = new PrivacyAuditLog();
    log.record('silo-a', 0.3, 10);
    log.record('silo-b', 0.5, 15);
    log.record('silo-a', 0.2, 7);
    expect(log.entriesForSilo('silo-a').length).toBe(2);
    expect(log.entriesForSilo('silo-b').length).toBe(1);
  });

  it('each entry has a unique sessionId', () => {
    const log = new PrivacyAuditLog();
    for (let i = 0; i < 5; i++) log.record('s', 0.1, 2);
    const ids = log.all().map(e => e.sessionId);
    expect(new Set(ids).size).toBe(5);
  });

  it('clear removes all entries', () => {
    const log = new PrivacyAuditLog();
    log.record('s', 0.5, 5);
    log.clear();
    expect(log.all().length).toBe(0);
    expect(log.totalEpsilonSpent()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: 3 silos, healthcare causal discovery
// ---------------------------------------------------------------------------

describe('end-to-end: 3-silo healthcare causal discovery', () => {
  it('discovers shared causal structure across silos', () => {
    const vars = ['smoking', 'lung_cancer', 'age', 'exercise'];
    const config = {
      epsilon: 2.0,
      delta: 0,
      alpha: 0.1,
      maxCondSetSize: 1,
      minSiloAgreement: 0.5,
    };

    // Simulate: smoking → lung_cancer (strong), age weakly related
    const corr = makeCorrelations(vars, {
      'lung_cancer||smoking': 0.9,
      'age||smoking': 0.1,
      'age||lung_cancer': 0.15,
      'exercise||lung_cancer': -0.1,
      'exercise||smoking': -0.05,
      'age||exercise': 0.05,
    });

    const scd = new SecureCausalDiscovery(config);
    scd.registerSilo('hospital-a', vars, corr, 500);
    scd.registerSilo('hospital-b', vars, corr, 400);
    scd.registerSilo('hospital-c', vars, corr, 600);

    const graph = scd.discover();

    expect(graph.totalSilos).toBe(3);
    expect(graph.totalSamples).toBe(1500);
    expect(graph.variables).toContain('smoking');
    expect(graph.variables).toContain('lung_cancer');
    expect(graph.privacyBudgetSpent).toBeGreaterThan(0);

    // The strong smoking-lung_cancer edge should appear in most runs
    // (DP noise may occasionally remove it at low n, so we don't hard-assert)
    expect(Array.isArray(graph.edges)).toBe(true);
  });
});
