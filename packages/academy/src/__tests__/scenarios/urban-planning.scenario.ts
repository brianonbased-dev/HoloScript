/**
 * urban-planning.scenario.ts — LIVING-SPEC: Urban Planning Governance
 *
 * Persona: Steward Chen — city planner analyzing districts and running
 * democratic referendums on infrastructure proposals.
 */
import { describe, it, expect } from 'vitest';

function referendumResult(votesFor: number, votesAgainst: number): 'approved' | 'rejected' {
  return votesFor > votesAgainst ? 'approved' : 'rejected';
}

function quorumReached(totalVoters: number, quorum: number): boolean {
  return totalVoters >= quorum;
}

function congestionIndex(vehicles: number, roadCapacity: number): number {
  return roadCapacity > 0 ? Math.min(1.0, vehicles / roadCapacity) : 1.0;
}

function proposalCost(severity: number, baseMultiplier: number): number {
  return Math.floor(severity * baseMultiplier);
}

function oneVotePerCitizen(voters: string[]): boolean {
  return new Set(voters).size === voters.length;
}

// ── Visualization: Zoning Heatmap ─────────────────────────────────────────
// Generates a 2D grid of zoning intensity values for heatmap rendering.
// Each cell value is the weighted average of its zone type multiplier.

type ZoneType = 'residential' | 'commercial' | 'industrial' | 'park';
const ZONE_WEIGHTS: Record<ZoneType, number> = {
  residential: 0.4,
  commercial: 0.7,
  industrial: 1.0,
  park: 0.1,
};

interface ZoningCell {
  row: number;
  col: number;
  zone: ZoneType;
  intensity: number; // 0–1
}

function generateZoningHeatmap(grid: ZoneType[][]): ZoningCell[] {
  const cells: ZoningCell[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const zone = grid[r][c];
      cells.push({
        row: r,
        col: c,
        zone,
        intensity: ZONE_WEIGHTS[zone],
      });
    }
  }
  return cells;
}

function heatmapMaxIntensity(cells: ZoningCell[]): number {
  return cells.reduce((max, c) => Math.max(max, c.intensity), 0);
}

function heatmapCellsByZone(cells: ZoningCell[], zone: ZoneType): ZoningCell[] {
  return cells.filter((c) => c.zone === zone);
}

// ── Visualization: Multi-District Impact Analysis ─────────────────────────
// Calculates cascading impact when a change in one district affects neighbors.

interface District {
  id: string;
  population: number;
  adjacentIds: string[];
}

interface ImpactResult {
  districtId: string;
  directImpact: number;
  cascadeImpact: number;
  totalImpact: number;
}

function multiDistrictImpact(
  districts: District[],
  sourceId: string,
  impactMagnitude: number,
  cascadeDecay: number = 0.5
): ImpactResult[] {
  const lookup = new Map(districts.map((d) => [d.id, d]));
  const results: ImpactResult[] = [];
  const source = lookup.get(sourceId);
  if (!source) return results;

  for (const district of districts) {
    const directImpact = district.id === sourceId ? impactMagnitude : 0;
    const cascadeImpact = source.adjacentIds.includes(district.id)
      ? impactMagnitude * cascadeDecay * (district.population / source.population)
      : 0;
    results.push({
      districtId: district.id,
      directImpact,
      cascadeImpact,
      totalImpact: directImpact + cascadeImpact,
    });
  }
  return results;
}

describe('Scenario: Urban Planning — Referendum', () => {
  it('referendumResult() — majority wins', () => {
    expect(referendumResult(7, 3)).toBe('approved');
    expect(referendumResult(4, 6)).toBe('rejected');
  });
  it('quorumReached() — checks threshold', () => {
    expect(quorumReached(5, 4)).toBe(true);
    expect(quorumReached(2, 4)).toBe(false);
  });
  it('oneVotePerCitizen() detects duplicates', () => {
    expect(oneVotePerCitizen(['c01', 'c02', 'c03'])).toBe(true);
    expect(oneVotePerCitizen(['c01', 'c02', 'c01'])).toBe(false);
  });
});

describe('Scenario: Urban Planning — Analysis', () => {
  it('congestionIndex() — at capacity = 1.0', () => {
    expect(congestionIndex(100, 100)).toBe(1.0);
    expect(congestionIndex(50, 100)).toBe(0.5);
  });
  it('congestionIndex() — over capacity capped', () => {
    expect(congestionIndex(150, 100)).toBe(1.0);
  });
  it('proposalCost() scales with severity', () => {
    expect(proposalCost(0.8, 1e6)).toBe(800000);
  });
});

describe('Scenario: Urban Planning — Zoning Heatmap Visualization', () => {
  const grid: ZoneType[][] = [
    ['residential', 'commercial'],
    ['park', 'industrial'],
  ];
  const cells = generateZoningHeatmap(grid);

  it('generates correct cell count for grid', () => {
    expect(cells).toHaveLength(4);
  });
  it('assigns zone-weighted intensity to each cell', () => {
    const residential = cells.find((c) => c.zone === 'residential')!;
    expect(residential.intensity).toBe(0.4);
    const park = cells.find((c) => c.zone === 'park')!;
    expect(park.intensity).toBe(0.1);
  });
  it('heatmapMaxIntensity() finds hottest cell', () => {
    expect(heatmapMaxIntensity(cells)).toBe(1.0); // industrial
  });
  it('heatmapCellsByZone() filters correctly', () => {
    expect(heatmapCellsByZone(cells, 'commercial')).toHaveLength(1);
  });
});

describe('Scenario: Urban Planning — Multi-District Impact Analysis', () => {
  const districts: District[] = [
    { id: 'downtown', population: 10000, adjacentIds: ['midtown', 'harbor'] },
    { id: 'midtown', population: 8000, adjacentIds: ['downtown', 'suburbs'] },
    { id: 'harbor', population: 5000, adjacentIds: ['downtown'] },
    { id: 'suburbs', population: 12000, adjacentIds: ['midtown'] },
  ];

  it('source district receives full direct impact', () => {
    const results = multiDistrictImpact(districts, 'downtown', 100);
    const source = results.find((r) => r.districtId === 'downtown')!;
    expect(source.directImpact).toBe(100);
    expect(source.totalImpact).toBe(100);
  });
  it('adjacent districts receive cascading impact', () => {
    const results = multiDistrictImpact(districts, 'downtown', 100, 0.5);
    const midtown = results.find((r) => r.districtId === 'midtown')!;
    expect(midtown.cascadeImpact).toBeGreaterThan(0);
    expect(midtown.directImpact).toBe(0);
  });
  it('non-adjacent districts receive zero impact', () => {
    const results = multiDistrictImpact(districts, 'downtown', 100);
    const suburbs = results.find((r) => r.districtId === 'suburbs')!;
    expect(suburbs.totalImpact).toBe(0);
  });
  it('cascade decay scales impact to adjacent population ratio', () => {
    const results = multiDistrictImpact(districts, 'downtown', 100, 0.5);
    const harbor = results.find((r) => r.districtId === 'harbor')!;
    // cascade = 100 * 0.5 * (5000 / 10000) = 25
    expect(harbor.cascadeImpact).toBe(25);
  });
});
