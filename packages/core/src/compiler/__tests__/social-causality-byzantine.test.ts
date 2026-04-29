import { describe, it, expect } from 'vitest';
import {
  AgentTrustLedger,
  byzantineResilientMerge,
} from '../social-causality-byzantine';
import type { SCMDAG, SCMEdge, SCMNode } from '../SCMCompiler';

const node = (id: string, do_capable = false): SCMNode => ({
  id,
  type: do_capable ? 'mechanism_variable' : 'static_variable',
  do_capable,
  properties: { context_group: 'global' },
});

const edge = (
  source: string,
  target: string,
  weight: number,
  relation = 'dictates_context',
): SCMEdge => ({ source, target, relation, weight });

const dag = (
  agentId: string,
  nodes: SCMNode[],
  edges: SCMEdge[],
): SCMDAG => ({
  metadata: { model_name: agentId, generated_at: '1970-01-01T00:00:00.000Z' },
  nodes,
  edges,
});

describe('byzantineResilientMerge — Cycle 13: Byzantine-Resilient FMARL', () => {
  it('passes through when no agent is an outlier', () => {
    const ledger = new AgentTrustLedger();
    const dags = [
      dag('agentA', [node('Player'), node('Goblin', true)], [edge('Player', 'Goblin', 1.0)]),
      dag('agentB', [node('Player'), node('Goblin', true)], [edge('Player', 'Goblin', 1.05)]),
      dag('agentC', [node('Player'), node('Goblin', true)], [edge('Player', 'Goblin', 0.95)]),
    ];
    const { dag: merged, report } = byzantineResilientMerge(dags, ledger);
    expect(report.dropped).toEqual([]);
    expect(report.flaggedThisEpoch).toEqual([]);
    expect(merged.edges).toHaveLength(1);
    // Honest agents start at 1.0 and stay there.
    expect(report.ledger.agentA.score).toBe(1.0);
    expect(report.ledger.agentB.score).toBe(1.0);
    expect(report.ledger.agentC.score).toBe(1.0);
  });

  it('flags an agent whose edge weight is > 1.5σ from the cluster mean', () => {
    const ledger = new AgentTrustLedger();
    // 4 honest agents at ~1.0, one Byzantine at 99.0.
    const dags = [
      dag('honest1', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('honest2', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('honest3', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('honest4', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('byz', [node('A'), node('B')], [edge('A', 'B', 99.0)]),
    ];
    const { report } = byzantineResilientMerge(dags, ledger);
    expect(report.flaggedThisEpoch).toEqual(['byz']);
    // First epoch: byz was flagged but only decayed by 0.1 (still 0.9 > 0.3).
    expect(report.ledger.byz.score).toBeCloseTo(0.9, 10);
    expect(report.dropped).toEqual([]);
    // Honest agents untouched.
    expect(report.ledger.honest1.score).toBe(1.0);
  });

  it('decays trust progressively and drops the agent below threshold after 8 epochs', () => {
    const ledger = new AgentTrustLedger();
    const buildEpoch = () => [
      dag('honest1', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('honest2', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('honest3', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('honest4', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('byz', [node('A'), node('B')], [edge('A', 'B', 99.0)]),
    ];

    // Run 7 epochs: byz should decay 1.0 -> 0.3 (still trusted, just at the edge).
    for (let i = 0; i < 7; i++) {
      byzantineResilientMerge(buildEpoch(), ledger);
    }
    expect(ledger.get('byz')?.score).toBeCloseTo(0.3, 10);
    // 0.3 == dropThreshold, so still admitted (>= threshold).

    // Epoch 8: score drops below 0.3 BEFORE the merge step, so byz is excluded.
    const r8 = byzantineResilientMerge(buildEpoch(), ledger);
    expect(r8.report.dropped).toContain('byz');
    expect(r8.report.ledger.byz.score).toBeLessThan(0.3);
    // Honest agents still trusted.
    expect(r8.report.dropped).not.toContain('honest1');
  });

  it('skips std-dev tests when fewer than minClusterAgents observed an edge', () => {
    const ledger = new AgentTrustLedger();
    // 2 agents: cluster too small for a meaningful std-dev test (default min=3).
    const dags = [
      dag('agentA', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('agentB', [node('A'), node('B')], [edge('A', 'B', 99.0)]),
    ];
    const { report } = byzantineResilientMerge(dags, ledger);
    expect(report.flaggedThisEpoch).toEqual([]);
    expect(report.outliersByEdge).toEqual({});
  });

  it('respects custom outlierSigma — looser sigma admits weights tighter sigma rejects', () => {
    const ledgerStrict = new AgentTrustLedger();
    const ledgerLoose = new AgentTrustLedger();
    // Cluster: 1.0, 1.0, 1.0, 2.0. mean ≈ 1.25, std ≈ 0.43.
    // 2.0 deviates by ~0.75 → 1.75σ → flagged at default 1.5σ, admitted at 2.0σ.
    const buildDags = () => [
      dag('a1', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('a2', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('a3', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('outlier', [node('A'), node('B')], [edge('A', 'B', 2.0)]),
    ];
    const strictReport = byzantineResilientMerge(buildDags(), ledgerStrict).report;
    const looseReport = byzantineResilientMerge(buildDags(), ledgerLoose, {
      outlierSigma: 2.0,
    }).report;
    expect(strictReport.flaggedThisEpoch).toContain('outlier');
    expect(looseReport.flaggedThisEpoch).not.toContain('outlier');
  });

  it('does NOT recover trust when an agent stops misbehaving', () => {
    const ledger = new AgentTrustLedger();
    // Two epochs of attack: byz decays 1.0 -> 0.8.
    const attackEpoch = () => [
      dag('h1', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('h2', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('h3', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('byz', [node('A'), node('B')], [edge('A', 'B', 99.0)]),
    ];
    byzantineResilientMerge(attackEpoch(), ledger);
    byzantineResilientMerge(attackEpoch(), ledger);
    expect(ledger.get('byz')?.score).toBeCloseTo(0.8, 10);

    // Now byz behaves: should stay at 0.8, not climb back to 1.0.
    const honestEpoch = [
      dag('h1', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('h2', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('h3', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('byz', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
    ];
    byzantineResilientMerge(honestEpoch, ledger);
    expect(ledger.get('byz')?.score).toBeCloseTo(0.8, 10);
  });

  it('reset() pardons a dropped agent', () => {
    const ledger = new AgentTrustLedger();
    const attackEpoch = () => [
      dag('h1', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('h2', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('h3', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('byz', [node('A'), node('B')], [edge('A', 'B', 99.0)]),
    ];
    // Decay byz below threshold.
    for (let i = 0; i < 8; i++) byzantineResilientMerge(attackEpoch(), ledger);
    expect(ledger.get('byz')?.score).toBeLessThan(0.3);

    // Pardon and re-merge: byz is admitted again.
    ledger.reset('byz');
    expect(ledger.get('byz')).toBeUndefined();
    const r = byzantineResilientMerge(attackEpoch(), ledger);
    // byz is treated as a fresh 1.0 → flagged this epoch but admitted (decays to 0.9).
    expect(r.report.dropped).not.toContain('byz');
    expect(r.report.ledger.byz.score).toBeCloseTo(0.9, 10);
  });

  it('handles missing/duplicate model_name with synthetic agent IDs', () => {
    const ledger = new AgentTrustLedger();
    const dupName = (edges: SCMEdge[]): SCMDAG => ({
      metadata: { model_name: 'shared', generated_at: '1970-01-01T00:00:00.000Z' },
      nodes: [node('A'), node('B')],
      edges,
    });
    const dags = [
      dupName([edge('A', 'B', 1.0)]),
      dupName([edge('A', 'B', 1.0)]),
      dupName([edge('A', 'B', 1.0)]),
      dupName([edge('A', 'B', 99.0)]),
    ];
    const { report } = byzantineResilientMerge(dags, ledger);
    // First DAG keeps 'shared', the next three get synthetic ids.
    const ids = Object.keys(report.ledger);
    expect(ids).toContain('shared');
    expect(ids.filter((id) => id.startsWith('agent#'))).toHaveLength(3);
    // The 99.0 agent (last entry, agent#3) is the one flagged.
    expect(report.flaggedThisEpoch).toEqual(['agent#3']);
  });

  it('rejects out-of-range option values', () => {
    const ledger = new AgentTrustLedger();
    const dags = [dag('a', [node('A')], [])];
    expect(() => byzantineResilientMerge(dags, ledger, { outlierSigma: 0 })).toThrow(
      RangeError,
    );
    expect(() => byzantineResilientMerge(dags, ledger, { decayPerEpoch: -0.1 })).toThrow(
      RangeError,
    );
    expect(() =>
      byzantineResilientMerge(dags, ledger, { dropThreshold: 1.5 }),
    ).toThrow(RangeError);
    expect(() =>
      byzantineResilientMerge(dags, ledger, { minClusterAgents: 1 }),
    ).toThrow(RangeError);
  });

  it('skips std-dev test when all observers have identical weights (std=0)', () => {
    const ledger = new AgentTrustLedger();
    const dags = [
      dag('a1', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('a2', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
      dag('a3', [node('A'), node('B')], [edge('A', 'B', 1.0)]),
    ];
    const { report } = byzantineResilientMerge(dags, ledger);
    expect(report.flaggedThisEpoch).toEqual([]);
    expect(report.outliersByEdge).toEqual({});
  });
});
