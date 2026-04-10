/**
 * heritage-revival.scenario.ts — LIVING-SPEC: Heritage Revival Museum
 *
 * Persona: Curator Amina — digital archaeologist who verifies provenance,
 * posts restoration bounties, and manages cultural memory consolidation.
 */
import { describe, it, expect } from 'vitest';

function provenanceChainLength(chain: { verifier: string }[]): number {
  return chain.length;
}

function isFullyVerified(chain: { verifier: string }[], minVerifiers: number): boolean {
  const unique = new Set(chain.map((c) => c.verifier)).size;
  return unique >= minVerifiers;
}

function restorationBountyReward(condition: number): number {
  return Math.round((1 - condition) * 50);
}

function needsRestoration(condition: number, threshold: number): boolean {
  return condition < threshold;
}

function culturalEraClassify(yearBCE: number): string {
  if (yearBCE > 3000) return 'prehistoric';
  if (yearBCE > 500) return 'ancient';
  if (yearBCE > 0) return 'classical';
  return 'modern';
}

describe('Scenario: Heritage — Provenance', () => {
  it('provenanceChainLength() counts entries', () => {
    expect(provenanceChainLength([{ verifier: 'a' }, { verifier: 'b' }])).toBe(2);
  });
  it('isFullyVerified() requires unique verifiers', () => {
    expect(isFullyVerified([{ verifier: 'a' }, { verifier: 'b' }], 2)).toBe(true);
    expect(isFullyVerified([{ verifier: 'a' }, { verifier: 'a' }], 2)).toBe(false);
  });
});

describe('Scenario: Heritage — Restoration', () => {
  it('restorationBountyReward() — low condition = high reward', () => {
    expect(restorationBountyReward(0.3)).toBe(35);
    expect(restorationBountyReward(0.9)).toBe(5);
  });
  it('needsRestoration() — below threshold', () => {
    expect(needsRestoration(0.4, 0.7)).toBe(true);
    expect(needsRestoration(0.9, 0.7)).toBe(false);
  });
  it('culturalEraClassify() — period classification', () => {
    expect(culturalEraClassify(5000)).toBe('prehistoric');
    expect(culturalEraClassify(1000)).toBe('ancient');
    expect(culturalEraClassify(200)).toBe('classical');
    expect(culturalEraClassify(-500)).toBe('modern');
  });
});

// ── Visualization: Stigmergic Trace on Museum Floor Plan ────────────────────
// Visitor traces accumulate intensity at exhibit positions on a 2D grid,
// creating a heatmap of cultural engagement patterns.

interface ExhibitTrace {
  exhibitId: string;
  position: [number, number]; // x, y on floor plan
  visitCount: number;
  avgDwellMs: number;
}

function traceIntensity(trace: ExhibitTrace): number {
  // Normalize: visit count × dwell factor (longer visits = higher engagement)
  const dwellFactor = Math.min(1.0, trace.avgDwellMs / 60000); // cap at 1 min
  return Math.min(1.0, (trace.visitCount / 100) * (0.5 + dwellFactor * 0.5));
}

function museumHeatmapGrid(traces: ExhibitTrace[], gridSize: number): number[][] {
  const grid: number[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
  for (const t of traces) {
    const r = Math.min(gridSize - 1, Math.max(0, Math.floor(t.position[1])));
    const c = Math.min(gridSize - 1, Math.max(0, Math.floor(t.position[0])));
    grid[r][c] += traceIntensity(t);
  }
  return grid;
}

function topExhibits(traces: ExhibitTrace[], n: number): ExhibitTrace[] {
  return [...traces].sort((a, b) => traceIntensity(b) - traceIntensity(a)).slice(0, n);
}

function coldSpots(traces: ExhibitTrace[], threshold: number): ExhibitTrace[] {
  return traces.filter((t) => traceIntensity(t) < threshold);
}

describe('Scenario: Heritage — Stigmergic Trace Visualization', () => {
  const traces: ExhibitTrace[] = [
    { exhibitId: 'rosetta', position: [2, 3], visitCount: 80, avgDwellMs: 45000 },
    { exhibitId: 'tutankhamun', position: [5, 1], visitCount: 95, avgDwellMs: 55000 },
    { exhibitId: 'pottery_shard', position: [7, 7], visitCount: 5, avgDwellMs: 8000 },
    { exhibitId: 'mural_fragment', position: [4, 6], visitCount: 30, avgDwellMs: 20000 },
  ];

  it('traceIntensity() — high visits + dwell = high intensity', () => {
    const rosetta = traceIntensity(traces[0]);
    const shard = traceIntensity(traces[2]);
    expect(rosetta).toBeGreaterThan(shard);
    expect(rosetta).toBeGreaterThan(0);
    expect(rosetta).toBeLessThanOrEqual(1.0);
  });
  it('museumHeatmapGrid() accumulates trace data to grid', () => {
    const grid = museumHeatmapGrid(traces, 10);
    expect(grid[3][2]).toBeGreaterThan(0); // rosetta at (2,3)
    expect(grid[1][5]).toBeGreaterThan(0); // tutankhamun at (5,1)
    expect(grid[0][0]).toBe(0); // empty cell
  });
  it('topExhibits() returns highest-engagement exhibits', () => {
    const top = topExhibits(traces, 2);
    expect(top).toHaveLength(2);
    expect(top[0].exhibitId).toBe('tutankhamun');
  });
  it('coldSpots() finds under-visited exhibits', () => {
    const cold = coldSpots(traces, 0.1);
    expect(cold.length).toBeGreaterThan(0);
    expect(cold.some((c) => c.exhibitId === 'pottery_shard')).toBe(true);
  });
});
