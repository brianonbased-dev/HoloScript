/**
 * archaeological-dig.scenario.ts — LIVING-SPEC: Archaeological Dig Simulator
 *
 * Persona: Prof. Osei — archaeologist who excavates stratified sites,
 * catalogs artifacts, applies carbon-14 dating, and reconstructs broken objects.
 */

import { describe, it, expect } from 'vitest';
import {
  carbon14RemainingFraction, estimateAgeFromC14, isC14Dateable,
  carbonDateRange, stratumThickness, identifyPeriodByDepth,
  stratigraphicSequenceValid, artifactsByMaterial, artifactsByStratum,
  reconstructionCompleteness, totalArtifactCount, excavationProgress,
  fragmentFitting, gisOverlay,
  PERIOD_TIMELINE,
  type Stratum, type ArtifactRecord, type ExcavationGrid, type ReconstructionGroup, type FragmentEdge,
} from '@/lib/archaeologicalDig';

describe('Scenario: Archaeological Dig — Carbon-14 Dating', () => {
  it('C14 at 0 years = 100% remaining', () => {
    expect(carbon14RemainingFraction(0)).toBe(1);
  });

  it('C14 at 5730 years (1 half-life) = 50%', () => {
    expect(carbon14RemainingFraction(5730)).toBeCloseTo(0.5, 2);
  });

  it('C14 at 11460 years (2 half-lives) = 25%', () => {
    expect(carbon14RemainingFraction(11460)).toBeCloseTo(0.25, 2);
  });

  it('estimateAgeFromC14(0.5) = ~5730 years', () => {
    expect(estimateAgeFromC14(0.5)).toBeCloseTo(5730, 0);
  });

  it('isC14Dateable() — bone and wood: yes; ceramic and metal: no', () => {
    expect(isC14Dateable('bone')).toBe(true);
    expect(isC14Dateable('wood')).toBe(true);
    expect(isC14Dateable('ceramic')).toBe(false);
    expect(isC14Dateable('metal')).toBe(false);
  });

  it('carbonDateRange() adds ± margin', () => {
    const range = carbonDateRange({ ageBP: 5000, margin: 200 });
    expect(range.min).toBe(4800);
    expect(range.max).toBe(5200);
  });
});

describe('Scenario: Archaeological Dig — Stratigraphy', () => {
  const strata: Stratum[] = [
    { id: 's1', name: 'Topsoil', period: 'modern', depthMinM: 0, depthMaxM: 0.3, soilColor: '#3d2b1f', composition: 'humus', estimatedAge: 50 },
    { id: 's2', name: 'Medieval Layer', period: 'medieval', depthMinM: 0.3, depthMaxM: 1.0, soilColor: '#5c4033', composition: 'sandy loam', estimatedAge: 800 },
    { id: 's3', name: 'Roman Layer', period: 'roman', depthMinM: 1.0, depthMaxM: 2.0, soilColor: '#8b7355', composition: 'clay', estimatedAge: 1900 },
  ];

  it('stratumThickness() = maxDepth - minDepth', () => {
    expect(stratumThickness(strata[1])).toBe(0.7);
  });

  it('identifyPeriodByDepth() finds correct period', () => {
    expect(identifyPeriodByDepth(strata, 0.1)).toBe('modern');
    expect(identifyPeriodByDepth(strata, 0.5)).toBe('medieval');
    expect(identifyPeriodByDepth(strata, 1.5)).toBe('roman');
  });

  it('identifyPeriodByDepth() returns null for unknown depth', () => {
    expect(identifyPeriodByDepth(strata, 5.0)).toBeNull();
  });

  it('stratigraphicSequenceValid() — older deeper = valid', () => {
    expect(stratigraphicSequenceValid(strata)).toBe(true);
  });

  it('inverted stratigraphy is invalid', () => {
    const inverted = [strata[2], strata[0]]; // Roman above Modern
    expect(stratigraphicSequenceValid(inverted)).toBe(false);
  });

  it('PERIOD_TIMELINE has 7 periods', () => {
    expect(Object.keys(PERIOD_TIMELINE)).toHaveLength(7);
  });
});

describe('Scenario: Archaeological Dig — Artifacts & Reconstruction', () => {
  const artifacts: ArtifactRecord[] = [
    { id: 'a1', catalogNumber: 'CAT-001', name: 'Pottery Shard', material: 'ceramic', stratumId: 's2', position: { x: 1, y: -0.5, z: 2 }, dimensions: { lengthCm: 8, widthCm: 5, heightCm: 0.5 }, weight: 45, condition: 'good', description: 'Painted rim shard', photoUrls: [], fragments: ['a2'] },
    { id: 'a2', catalogNumber: 'CAT-002', name: 'Pottery Shard B', material: 'ceramic', stratumId: 's2', position: { x: 1.1, y: -0.5, z: 2.1 }, dimensions: { lengthCm: 6, widthCm: 4, heightCm: 0.5 }, weight: 30, condition: 'fair', description: 'Body shard', photoUrls: [], fragments: ['a1'] },
    { id: 'a3', catalogNumber: 'CAT-003', name: 'Iron Nail', material: 'metal', stratumId: 's3', position: { x: 3, y: -1.5, z: 1 }, dimensions: { lengthCm: 7, widthCm: 0.5, heightCm: 0.5 }, weight: 12, condition: 'poor', description: 'Roman iron nail', photoUrls: [], fragments: [] },
  ];

  it('artifactsByMaterial(ceramic) returns 2 shards', () => {
    expect(artifactsByMaterial(artifacts, 'ceramic')).toHaveLength(2);
  });

  it('artifactsByStratum(s3) returns Roman artifacts', () => {
    expect(artifactsByStratum(artifacts, 's3')).toHaveLength(1);
  });

  it('reconstructionCompleteness() labels correctly', () => {
    expect(reconstructionCompleteness({ id: 'r1', name: 'Pot', fragmentIds: [], completeness: 0.95 })).toBe('near-complete');
    expect(reconstructionCompleteness({ id: 'r2', name: 'Bowl', fragmentIds: [], completeness: 0.65 })).toBe('substantial');
    expect(reconstructionCompleteness({ id: 'r3', name: 'Tile', fragmentIds: [], completeness: 0.35 })).toBe('partial');
    expect(reconstructionCompleteness({ id: 'r4', name: 'Unknown', fragmentIds: [], completeness: 0.1 })).toBe('fragmentary');
  });

  it('totalArtifactCount() sums across grids', () => {
    const grids: ExcavationGrid[] = [
      { id: 'g1', unitLabel: 'A1', position: { x: 0, y: 0, z: 0 }, widthM: 1, lengthM: 1, stratumHistory: [], artifacts: artifacts.slice(0, 2), excavated: true },
      { id: 'g2', unitLabel: 'A2', position: { x: 1, y: 0, z: 0 }, widthM: 1, lengthM: 1, stratumHistory: [], artifacts: artifacts.slice(2), excavated: false },
    ];
    expect(totalArtifactCount(grids)).toBe(3);
    expect(excavationProgress(grids)).toBe(0.5);
  });

  it('3D fragment fitting — auto-align fragments by edge contour matching', () => {
    const edgeA: FragmentEdge = { points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0.1, z: 0 }, { x: 2, y: 0, z: 0 }], curvature: 0.15 };
    const edgeB: FragmentEdge = { points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0.12, z: 0 }, { x: 2, y: 0, z: 0 }], curvature: 0.16 };
    const edgeC: FragmentEdge = { points: [{ x: 5, y: 5, z: 5 }, { x: 6, y: 6, z: 6 }], curvature: 0.8 };
    // A and B should match well (similar curvature + close points)
    const matchAB = fragmentFitting(edgeA, edgeB);
    const matchAC = fragmentFitting(edgeA, edgeC);
    expect(matchAB).toBeGreaterThan(0.5);
    expect(matchAC).toBeLessThan(matchAB);
  });

  it('GIS overlay — place excavation grid on real-world satellite map', () => {
    const grid: ExcavationGrid = { id: 'g1', unitLabel: 'A1', position: { x: 10, y: 0, z: 20 }, widthM: 5, lengthM: 5, stratumHistory: [], artifacts: [], excavated: true };
    const origin = { lat: 37.9715, lon: 23.7269 }; // Athens
    const { sw, ne } = gisOverlay(grid, origin);
    expect(sw.lat).toBeGreaterThan(origin.lat);
    expect(sw.lon).toBeGreaterThan(origin.lon);
    expect(ne.lat).toBeGreaterThan(sw.lat);
    expect(ne.lon).toBeGreaterThan(sw.lon);
  });
});
