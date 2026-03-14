/**
 * scifi-cocreation.scenario.ts — LIVING-SPEC: Co-Creation Metaverse
 *
 * Persona: Worldbuilder Nova — coordinates multi-faction lore,
 * cultural memory consolidation, and faction balance.
 */
import { describe, it, expect } from 'vitest';

function memoryConsolidation(episodes: number, threshold: number): boolean {
  return episodes >= threshold;
}

function factionImbalance(counts: number[]): number {
  if (counts.length === 0) return 0;
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  return max > 0 ? (max - min) / max : 0;
}

function needsInspiration(myCount: number, maxCount: number, threshold: number): boolean {
  return myCount < maxCount * threshold;
}

function loreDiversity(factions: string[]): number {
  const unique = new Set(factions).size;
  return factions.length > 0 ? unique / factions.length : 0;
}

describe('Scenario: Co-Creation — Memory', () => {
  it('memoryConsolidation() triggers at threshold', () => {
    expect(memoryConsolidation(5, 5)).toBe(true);
    expect(memoryConsolidation(3, 5)).toBe(false);
  });
});

describe('Scenario: Co-Creation — Balance', () => {
  it('factionImbalance() — equal = 0', () => {
    expect(factionImbalance([5, 5, 5])).toBe(0);
  });
  it('factionImbalance() — unequal', () => {
    expect(factionImbalance([10, 2])).toBeCloseTo(0.8);
  });
  it('needsInspiration() — underrepresented faction', () => {
    expect(needsInspiration(2, 10, 0.6)).toBe(true);
    expect(needsInspiration(7, 10, 0.6)).toBe(false);
  });
  it('loreDiversity() — all same faction = low', () => {
    expect(loreDiversity(['A', 'A', 'A'])).toBeCloseTo(0.33, 1);
  });
  it('loreDiversity() — all different = 1', () => {
    expect(loreDiversity(['A', 'B', 'C'])).toBe(1);
  });
});

// ── Visualization: Stigmergic Markers ───────────────────────────────────────
// Emergent knowledge traces: agents leave weighted spatial markers that decay.

interface StigmergicMarker {
  id: string;
  position: [number, number]; // x, y on map
  weight: number;             // 0–1 intensity
  faction: string;
  ageMs: number;
}

function decayMarkers(markers: StigmergicMarker[], decayRate: number, dtMs: number): StigmergicMarker[] {
  return markers
    .map(m => ({ ...m, weight: m.weight * Math.exp(-decayRate * dtMs / 1000), ageMs: m.ageMs + dtMs }))
    .filter(m => m.weight > 0.01);
}

function clusterMarkers(markers: StigmergicMarker[], radius: number): StigmergicMarker[][] {
  const visited = new Set<string>();
  const clusters: StigmergicMarker[][] = [];
  for (const m of markers) {
    if (visited.has(m.id)) continue;
    const cluster = markers.filter(o => {
      const dx = m.position[0] - o.position[0];
      const dy = m.position[1] - o.position[1];
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });
    cluster.forEach(c => visited.add(c.id));
    clusters.push(cluster);
  }
  return clusters;
}

function heatmapFromMarkers(markers: StigmergicMarker[], gridSize: number): number[][] {
  const grid: number[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
  for (const m of markers) {
    const r = Math.min(gridSize - 1, Math.max(0, Math.floor(m.position[1])));
    const c = Math.min(gridSize - 1, Math.max(0, Math.floor(m.position[0])));
    grid[r][c] += m.weight;
  }
  return grid;
}

// ── Visualization: Timeline Branching DAG Export ────────────────────────────

interface TimelineBranch {
  id: string;
  label: string;
  parentId: string | null;
  faction: string;
  votes: number;
}

function exportTimelineDAG(branches: TimelineBranch[]): { nodes: string[]; edges: [string, string][] } {
  const nodes = branches.map(b => b.id);
  const edges: [string, string][] = branches
    .filter(b => b.parentId !== null)
    .map(b => [b.parentId!, b.id]);
  return { nodes, edges };
}

function winningBranch(branches: TimelineBranch[]): TimelineBranch | null {
  if (branches.length === 0) return null;
  return branches.reduce((best, b) => b.votes > best.votes ? b : best);
}

describe('Scenario: Co-Creation — Stigmergic Markers Visualization', () => {
  const markers: StigmergicMarker[] = [
    { id: 'm1', position: [1, 1], weight: 0.8, faction: 'A', ageMs: 0 },
    { id: 'm2', position: [1.2, 1.1], weight: 0.6, faction: 'A', ageMs: 0 },
    { id: 'm3', position: [5, 5], weight: 0.9, faction: 'B', ageMs: 0 },
  ];

  it('decayMarkers() reduces weight over time', () => {
    const decayed = decayMarkers(markers, 0.5, 2000);
    expect(decayed[0].weight).toBeLessThan(0.8);
    expect(decayed.every(m => m.weight > 0)).toBe(true);
  });
  it('decayMarkers() removes near-zero markers', () => {
    const decayed = decayMarkers(markers, 10, 5000); // aggressive decay
    expect(decayed.length).toBeLessThan(markers.length);
  });
  it('clusterMarkers() groups nearby markers', () => {
    const clusters = clusterMarkers(markers, 1.0);
    expect(clusters.length).toBe(2); // m1+m2 clustered, m3 alone
  });
  it('heatmapFromMarkers() accumulates grid cells', () => {
    const grid = heatmapFromMarkers(markers, 8);
    expect(grid[1][1]).toBeGreaterThan(0); // m1 + m2 at approx (1,1)
    expect(grid[5][5]).toBeGreaterThan(0); // m3 at (5,5)
  });
});

describe('Scenario: Co-Creation — Timeline Branching DAG Export', () => {
  const branches: TimelineBranch[] = [
    { id: 'root', label: 'Origin', parentId: null, faction: 'neutral', votes: 10 },
    { id: 'peace', label: 'Peace Path', parentId: 'root', faction: 'A', votes: 7 },
    { id: 'war', label: 'War Path', parentId: 'root', faction: 'B', votes: 3 },
    { id: 'treaty', label: 'Treaty', parentId: 'peace', faction: 'A', votes: 5 },
  ];

  it('exportTimelineDAG() produces correct adjacency', () => {
    const dag = exportTimelineDAG(branches);
    expect(dag.nodes).toHaveLength(4);
    expect(dag.edges).toHaveLength(3);
    expect(dag.edges).toContainEqual(['root', 'peace']);
  });
  it('winningBranch() returns highest-voted', () => {
    expect(winningBranch(branches)?.id).toBe('root');
  });
});
