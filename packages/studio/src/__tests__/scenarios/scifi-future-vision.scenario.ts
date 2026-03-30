/**
 * scifi-future-vision.scenario.ts — LIVING-SPEC: Sci-Fi Co-Creation
 *
 * Persona: Director Mira — visionary filmmaker who coordinates multi-faction
 * lore contributions and votes on plot branches for a utopian future world.
 */
import { describe, it, expect } from 'vitest';

function coherenceScore(canonicalCount: number, totalCount: number): number {
  return totalCount > 0 ? canonicalCount / totalCount : 1.0;
}

function factionBalance(contributions: Record<string, number>): number {
  const vals = Object.values(contributions);
  if (vals.length === 0) return 1;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  return max > 0 ? 1 - (max - min) / max : 1;
}

function tallyVotes(votesFor: number, votesAgainst: number): 'approved' | 'rejected' {
  return votesFor > votesAgainst ? 'approved' : 'rejected';
}

function plotBranchDepth(branches: { parent: string | null }[]): number {
  let max = 0;
  for (const b of branches) {
    let depth = 0;
    let current: typeof b | undefined = b;
    while (current?.parent) {
      depth++;
      current = branches.find((x) => x.parent === current!.parent);
      if (depth > 100) break; // safety
    }
    max = Math.max(max, depth);
  }
  return max;
}

describe('Scenario: Sci-Fi Vision — Lore Coherence', () => {
  it('coherenceScore() — all canonical = 1.0', () => {
    expect(coherenceScore(10, 10)).toBe(1.0);
  });
  it('coherenceScore() — half canonical = 0.5', () => {
    expect(coherenceScore(5, 10)).toBe(0.5);
  });
  it('coherenceScore() — empty = 1.0', () => {
    expect(coherenceScore(0, 0)).toBe(1.0);
  });
});

describe('Scenario: Sci-Fi Vision — Faction Balance', () => {
  it('factionBalance() — equal contributions = 1.0', () => {
    expect(factionBalance({ Solaris: 5, Guild: 5, Terraform: 5 })).toBe(1);
  });
  it('factionBalance() — imbalanced = < 1', () => {
    const balance = factionBalance({ Solaris: 10, Guild: 2, Terraform: 5 });
    expect(balance).toBeLessThan(1);
    expect(balance).toBeGreaterThan(0);
  });
});

describe('Scenario: Sci-Fi Vision — Voting', () => {
  it('tallyVotes() — majority wins', () => {
    expect(tallyVotes(5, 3)).toBe('approved');
    expect(tallyVotes(2, 7)).toBe('rejected');
  });
  it('tallyVotes() — tie = rejected', () => {
    expect(tallyVotes(3, 3)).toBe('rejected');
  });
});

// ── Visualization: Narrative DAG ────────────────────────────────────────────
// Directed acyclic graph for branching plot timelines.

interface NarrativeNode {
  id: string;
  label: string;
  parentId: string | null;
  faction: string;
  approved: boolean;
}

interface DAGEdge {
  from: string;
  to: string;
}

function buildNarrativeDAG(nodes: NarrativeNode[]): { nodes: NarrativeNode[]; edges: DAGEdge[] } {
  const edges: DAGEdge[] = [];
  for (const node of nodes) {
    if (node.parentId) {
      edges.push({ from: node.parentId, to: node.id });
    }
  }
  return { nodes, edges };
}

function dagDepth(nodes: NarrativeNode[], nodeId: string): number {
  let depth = 0;
  let current = nodes.find((n) => n.id === nodeId);
  while (current?.parentId) {
    depth++;
    current = nodes.find((n) => n.id === current!.parentId);
    if (depth > 100) break;
  }
  return depth;
}

function dagRoots(nodes: NarrativeNode[]): NarrativeNode[] {
  return nodes.filter((n) => n.parentId === null);
}

function dagLeaves(nodes: NarrativeNode[]): NarrativeNode[] {
  const parentIds = new Set(nodes.filter((n) => n.parentId).map((n) => n.parentId));
  return nodes.filter((n) => !parentIds.has(n.id));
}

function approvedTimeline(nodes: NarrativeNode[]): NarrativeNode[] {
  return nodes.filter((n) => n.approved);
}

describe('Scenario: Sci-Fi Vision — Narrative DAG Visualization', () => {
  const nodes: NarrativeNode[] = [
    { id: 'genesis', label: 'Colony Founded', parentId: null, faction: 'Solaris', approved: true },
    {
      id: 'expansion',
      label: 'Solar Expansion',
      parentId: 'genesis',
      faction: 'Solaris',
      approved: true,
    },
    {
      id: 'rebellion',
      label: 'Guild Rebellion',
      parentId: 'genesis',
      faction: 'Guild',
      approved: false,
    },
    {
      id: 'truce',
      label: 'Truce Signed',
      parentId: 'expansion',
      faction: 'Terraform',
      approved: true,
    },
    { id: 'war', label: 'Total War', parentId: 'rebellion', faction: 'Guild', approved: false },
  ];

  it('buildNarrativeDAG() creates correct edge count', () => {
    const dag = buildNarrativeDAG(nodes);
    expect(dag.edges).toHaveLength(4); // 4 nodes with parents
    expect(dag.nodes).toHaveLength(5);
  });
  it('dagDepth() measures depth from root', () => {
    expect(dagDepth(nodes, 'genesis')).toBe(0);
    expect(dagDepth(nodes, 'expansion')).toBe(1);
    expect(dagDepth(nodes, 'truce')).toBe(2);
  });
  it('dagRoots() finds root nodes', () => {
    expect(dagRoots(nodes)).toHaveLength(1);
    expect(dagRoots(nodes)[0].id).toBe('genesis');
  });
  it('dagLeaves() finds terminal nodes', () => {
    const leaves = dagLeaves(nodes);
    expect(leaves.map((l) => l.id).sort()).toEqual(['truce', 'war']);
  });
  it('approvedTimeline() filters to canonical storyline', () => {
    const approved = approvedTimeline(nodes);
    expect(approved).toHaveLength(3);
    expect(approved.every((n) => n.approved)).toBe(true);
  });
});
