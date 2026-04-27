import { describe, it, expect } from 'vitest';
import {
  mergeSocialCausalModels,
  type SocialMergeOptions,
} from '../social-causality';
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

const dag = (nodes: SCMNode[], edges: SCMEdge[], name = 'agent'): SCMDAG => ({
  metadata: { model_name: name, generated_at: '1970-01-01T00:00:00.000Z' },
  nodes,
  edges,
});

describe('mergeSocialCausalModels — Cycle 12: Causal Social Memory', () => {
  it('returns an empty consensus DAG when given no agents', () => {
    const { dag: merged, report } = mergeSocialCausalModels([]);
    expect(merged.nodes).toEqual([]);
    expect(merged.edges).toEqual([]);
    expect(report.agents).toBe(0);
    expect(report.nodes.kept).toBe(0);
  });

  it('keeps nodes/edges observed by a strict majority and drops the rest', () => {
    const agentA = dag(
      [node('Player'), node('Goblin', true), node('Cloud_Hallucination')],
      [edge('Player', 'Goblin', 1.0)],
    );
    const agentB = dag(
      [node('Player'), node('Goblin', true), node('Phantom_Light')],
      [edge('Player', 'Goblin', 1.0)],
    );
    const agentC = dag(
      [node('Player'), node('Goblin', true)],
      [edge('Player', 'Goblin', 1.0)],
    );

    const { dag: merged, report } = mergeSocialCausalModels([
      agentA,
      agentB,
      agentC,
    ]);

    const ids = merged.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['Goblin', 'Player']);
    expect(merged.edges).toHaveLength(1);
    expect(merged.edges[0]).toMatchObject({
      source: 'Player',
      target: 'Goblin',
      relation: 'dictates_context',
      weight: 1.0,
    });
    expect(report.nodes.dropped).toBe(2); // Cloud_Hallucination + Phantom_Light
    expect(report.edges.smoothed).toBe(0);
  });

  it('averages disagreeing edge weights instead of dropping (correlation smoothing)', () => {
    const dangerousButton = dag(
      [node('Agent1', true), node('Button', true)],
      [edge('Agent1', 'Button', 5.0, 'fears')],
    );
    const safeButton = dag(
      [node('Agent2', true), node('Button', true), node('Agent1', true)],
      [edge('Agent1', 'Button', 1.0, 'fears')],
    );
    const indifferentButton = dag(
      [node('Agent1', true), node('Button', true)],
      [edge('Agent1', 'Button', 3.0, 'fears')],
    );

    const { dag: merged, report } = mergeSocialCausalModels([
      dangerousButton,
      safeButton,
      indifferentButton,
    ]);

    const fearsEdge = merged.edges.find((e) => e.relation === 'fears');
    expect(fearsEdge).toBeDefined();
    expect(fearsEdge!.weight).toBeCloseTo((5.0 + 1.0 + 3.0) / 3);
    expect(report.edges.smoothed).toBe(1);
    expect(report.edges.dropped).toBe(0);
  });

  it('drops edges whose endpoints did not survive node consensus', () => {
    const a = dag(
      [node('Anchor'), node('Anchor2'), node('Loner')],
      [edge('Anchor', 'Loner', 1.0), edge('Anchor', 'Anchor2', 1.0)],
    );
    const b = dag(
      [node('Anchor'), node('Anchor2')],
      [edge('Anchor', 'Anchor2', 1.0)],
    );

    const { dag: merged, report } = mergeSocialCausalModels([a, b]);

    expect(merged.nodes.map((n) => n.id).sort()).toEqual(['Anchor', 'Anchor2']);
    expect(merged.edges.map((e) => `${e.source}->${e.target}`)).toEqual([
      'Anchor->Anchor2',
    ]);
    expect(report.nodes.dropped).toBe(1);
    expect(report.edges.dropped).toBe(1); // Anchor->Loner
  });

  it('respects a unanimous threshold (1.0)', () => {
    const a = dag([node('X'), node('Y')], [edge('X', 'Y', 1.0)]);
    const b = dag([node('X'), node('Y')], [edge('X', 'Y', 2.0)]);
    const c = dag([node('X')], []);

    const opts: SocialMergeOptions = { consensusThreshold: 1.0 };
    const { dag: merged, report } = mergeSocialCausalModels([a, b, c], opts);

    // unanimous: only X (in all 3)
    expect(merged.nodes.map((n) => n.id)).toEqual(['X']);
    expect(merged.edges).toEqual([]);
    expect(report.threshold).toBe(1.0);
  });

  it('counts a node observed twice within one agent only once', () => {
    const a = dag(
      [node('X'), node('X')], // duplicate inside one agent
      [],
    );
    const b = dag([node('Y')], []);

    const { report } = mergeSocialCausalModels([a, b]);

    // Strict majority on 2 agents = needs >50% = ≥ 2 observers.
    // X is in 1 agent only (duplicates inside don't count); Y in 1 agent.
    // Both should be dropped.
    expect(report.nodes.kept).toBe(0);
    expect(report.nodes.dropped).toBe(2);
  });

  it('rejects out-of-range thresholds', () => {
    expect(() =>
      mergeSocialCausalModels([], { consensusThreshold: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      mergeSocialCausalModels([], { consensusThreshold: 1.5 }),
    ).toThrow(RangeError);
  });

  it('does not mutate input DAGs', () => {
    const original = dag(
      [node('A'), node('B')],
      [edge('A', 'B', 7.0)],
    );
    const beforeNodes = JSON.stringify(original.nodes);
    const beforeEdges = JSON.stringify(original.edges);

    mergeSocialCausalModels([original, original]);

    expect(JSON.stringify(original.nodes)).toBe(beforeNodes);
    expect(JSON.stringify(original.edges)).toBe(beforeEdges);
  });
});
