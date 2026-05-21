/**
 * GyriSulciPartitioner — unit tests
 *
 * Acceptance criteria (task_1779336717743_hf5e):
 *   ✓ Gyral fixture coord → tier='hot', surface_type='gyrus'
 *   ✓ Sulcal fixture coord → tier='cold', surface_type='sulcus'
 *   ✓ Boundary coord (exactly at seed entry) → correct type, distance≈0
 *   ✓ Far-out coord (> unknown_threshold_mm) → 'unknown', tier='cold'
 *   ✓ Missing-mesh behavior: no mesh required, pure seed-table lookup
 *   ✓ classifyBatch processes multiple coords correctly
 *   ✓ GyriSulciPartitioner class memoizes results
 *   ✓ isHot / isCold convenience methods
 *   ✓ clearCache resets memoization
 *   ✓ stats() returns correct breakdown
 *   ✓ priority values: gyral>unknown>sulcal
 *   ✓ is_extrapolated=false for near coords, true for far coords
 *   ✓ Custom config threshold respected
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyCoord,
  classifyBrainCoord,
  classifyBatch,
  GyriSulciPartitioner,
  GYRI_SULCI_DEFAULT_CONFIG,
  type CacheRoute,
} from '../GyriSulciPartitioner';
import { lookup } from '../BrainCoordMapper';

// ─── Fixture coords from BrainCoordMapper seed table ─────────────────────────
// physics at (30,-50,60) surface_type='gyrus'   → hot
// coordination at (0,25,30) surface_type='sulcus' → cold
// storage at (28,-22,-14) surface_type='sulcus' → cold
// truth_approval at (0,20,30) surface_type='sulcus' → cold

const GYRAL_COORD  = lookup('physics');     // (30,-50,60) gyrus
const SULCAL_COORD = lookup('coordination'); // (0,25,30) sulcus
const HIPPOCAMPUS  = lookup('storage');     // (28,-22,-14) sulcus

// Out-of-range coord — 500mm from anything in the seed table
const FAR_COORD = { mni_x: 500, mni_y: 500, mni_z: 500 };

// Exactly at a gyral seed entry
const EXACT_GYRAL = { mni_x: GYRAL_COORD.mni_x, mni_y: GYRAL_COORD.mni_y, mni_z: GYRAL_COORD.mni_z };

// Exactly at a sulcal seed entry
const EXACT_SULCAL = { mni_x: SULCAL_COORD.mni_x, mni_y: SULCAL_COORD.mni_y, mni_z: SULCAL_COORD.mni_z };

// ─── classifyCoord() ──────────────────────────────────────────────────────────

describe('classifyCoord() — hot/cold classification', () => {
  it('gyral fixture coord → hot, gyrus', () => {
    const r = classifyCoord(EXACT_GYRAL);
    expect(r.surface_type).toBe('gyrus');
    expect(r.tier).toBe('hot');
  });

  it('sulcal fixture coord → cold, sulcus', () => {
    const r = classifyCoord(EXACT_SULCAL);
    expect(r.surface_type).toBe('sulcus');
    expect(r.tier).toBe('cold');
  });

  it('hippocampus (storage) → cold, sulcus', () => {
    const r = classifyCoord(HIPPOCAMPUS);
    expect(r.surface_type).toBe('sulcus');
    expect(r.tier).toBe('cold');
  });

  it('exact gyral coord → nearest_distance_mm ≈ 0', () => {
    const r = classifyCoord(EXACT_GYRAL);
    expect(r.nearest_distance_mm).toBeCloseTo(0, 5);
    expect(r.is_extrapolated).toBe(false);
  });

  it('exact sulcal coord → nearest_distance_mm ≈ 0', () => {
    const r = classifyCoord(EXACT_SULCAL);
    expect(r.nearest_distance_mm).toBeCloseTo(0, 5);
    expect(r.is_extrapolated).toBe(false);
  });

  it('far coord → unknown, tier cold (fail-safe), is_extrapolated=true', () => {
    const r = classifyCoord(FAR_COORD);
    expect(r.surface_type).toBe('unknown');
    expect(r.tier).toBe('cold');
    expect(r.is_extrapolated).toBe(true);
  });

  it('nearest_domain is populated for all results', () => {
    const r1 = classifyCoord(EXACT_GYRAL);
    const r2 = classifyCoord(FAR_COORD);
    expect(r1.nearest_domain.length).toBeGreaterThan(0);
    expect(r2.nearest_domain.length).toBeGreaterThan(0);
  });

  it('gyral priority > sulcal priority', () => {
    const gyral  = classifyCoord(EXACT_GYRAL);
    const sulcal = classifyCoord(EXACT_SULCAL);
    expect(gyral.priority).toBeGreaterThan(sulcal.priority);
  });

  it('unknown priority is between gyral and sulcal', () => {
    const gyral   = classifyCoord(EXACT_GYRAL);
    const sulcal  = classifyCoord(EXACT_SULCAL);
    const unknown = classifyCoord(FAR_COORD);
    expect(unknown.priority).toBeLessThan(gyral.priority);
    expect(unknown.priority).toBeGreaterThan(sulcal.priority);
  });

  it('default config: unknown_threshold_mm = 40', () => {
    expect(GYRI_SULCI_DEFAULT_CONFIG.unknown_threshold_mm).toBe(40);
  });
});

// ─── Custom config ────────────────────────────────────────────────────────────

describe('classifyCoord() — custom config', () => {
  it('very small threshold forces all non-zero coords to unknown', () => {
    // threshold=0.1mm: any distance > 0.1 → unknown
    const cfg = { ...GYRI_SULCI_DEFAULT_CONFIG, unknown_threshold_mm: 0.1 };
    // Even a coord 1mm off from a seed entry should be unknown
    const r = classifyCoord({ mni_x: GYRAL_COORD.mni_x + 1, mni_y: GYRAL_COORD.mni_y, mni_z: GYRAL_COORD.mni_z }, cfg);
    expect(r.surface_type).toBe('unknown');
    expect(r.is_extrapolated).toBe(true);
  });

  it('very large threshold: far coord resolves to nearest entry type', () => {
    const cfg = { ...GYRI_SULCI_DEFAULT_CONFIG, unknown_threshold_mm: 10_000 };
    const r = classifyCoord(FAR_COORD, cfg);
    // With huge threshold, no extrapolation — resolves to nearest
    expect(r.is_extrapolated).toBe(false);
    expect(['gyrus', 'sulcus']).toContain(r.surface_type);
  });

  it('custom gyral_priority is used', () => {
    const cfg = { ...GYRI_SULCI_DEFAULT_CONFIG, gyral_priority: 0.99 };
    const r = classifyCoord(EXACT_GYRAL, cfg);
    expect(r.priority).toBe(0.99);
  });

  it('custom sulcal_priority is used', () => {
    const cfg = { ...GYRI_SULCI_DEFAULT_CONFIG, sulcal_priority: 0.01 };
    const r = classifyCoord(EXACT_SULCAL, cfg);
    expect(r.priority).toBe(0.01);
  });
});

// ─── classifyBrainCoord() ─────────────────────────────────────────────────────

describe('classifyBrainCoord()', () => {
  it('accepts a full BrainCoord (uses only x,y,z)', () => {
    const r = classifyBrainCoord(GYRAL_COORD);
    expect(r.surface_type).toBe('gyrus');
    expect(r.tier).toBe('hot');
  });

  it('cortical_depth has no effect on classification', () => {
    const depthA = classifyBrainCoord({ ...GYRAL_COORD, cortical_depth: 1 });
    const depthB = classifyBrainCoord({ ...GYRAL_COORD, cortical_depth: 6 });
    expect(depthA.surface_type).toBe(depthB.surface_type);
    expect(depthA.nearest_distance_mm).toBeCloseTo(depthB.nearest_distance_mm, 8);
  });
});

// ─── classifyBatch() ─────────────────────────────────────────────────────────

describe('classifyBatch()', () => {
  it('returns correct count of results', () => {
    const coords = [EXACT_GYRAL, EXACT_SULCAL, FAR_COORD];
    const result = classifyBatch(coords);
    expect(result.size).toBe(3);
  });

  it('gyral coord maps to hot in batch', () => {
    const result = classifyBatch([EXACT_GYRAL]);
    const key = `${EXACT_GYRAL.mni_x}:${EXACT_GYRAL.mni_y}:${EXACT_GYRAL.mni_z}`;
    expect(result.get(key)?.tier).toBe('hot');
  });

  it('sulcal coord maps to cold in batch', () => {
    const result = classifyBatch([EXACT_SULCAL]);
    const key = `${EXACT_SULCAL.mni_x}:${EXACT_SULCAL.mni_y}:${EXACT_SULCAL.mni_z}`;
    expect(result.get(key)?.tier).toBe('cold');
  });

  it('duplicate coords produce single entry (keyed by x:y:z)', () => {
    const result = classifyBatch([EXACT_GYRAL, EXACT_GYRAL, EXACT_GYRAL]);
    expect(result.size).toBe(1);
  });

  it('empty input returns empty map', () => {
    expect(classifyBatch([]).size).toBe(0);
  });
});

// ─── GyriSulciPartitioner class ───────────────────────────────────────────────

describe('GyriSulciPartitioner class', () => {
  let partitioner: GyriSulciPartitioner;

  beforeEach(() => {
    partitioner = new GyriSulciPartitioner();
  });

  it('classify() returns correct result', () => {
    const r = partitioner.classify(EXACT_GYRAL);
    expect(r.surface_type).toBe('gyrus');
  });

  it('classify() memoizes: same result on repeated call', () => {
    const r1 = partitioner.classify(EXACT_GYRAL);
    const r2 = partitioner.classify(EXACT_GYRAL);
    expect(r1).toBe(r2); // reference equality — same object from cache
  });

  it('cacheSize grows with unique coords', () => {
    partitioner.classify(EXACT_GYRAL);
    partitioner.classify(EXACT_SULCAL);
    expect(partitioner.cacheSize).toBe(2);
  });

  it('cacheSize does not grow on repeated identical coord', () => {
    partitioner.classify(EXACT_GYRAL);
    partitioner.classify(EXACT_GYRAL);
    expect(partitioner.cacheSize).toBe(1);
  });

  it('clearCache() resets cacheSize to 0', () => {
    partitioner.classify(EXACT_GYRAL);
    partitioner.classify(EXACT_SULCAL);
    partitioner.clearCache();
    expect(partitioner.cacheSize).toBe(0);
  });

  it('isHot() returns true for gyral coord', () => {
    expect(partitioner.isHot(EXACT_GYRAL)).toBe(true);
  });

  it('isCold() returns true for sulcal coord', () => {
    expect(partitioner.isCold(EXACT_SULCAL)).toBe(true);
  });

  it('isHot() returns false for sulcal coord', () => {
    expect(partitioner.isHot(EXACT_SULCAL)).toBe(false);
  });

  it('isCold() returns false for gyral coord', () => {
    expect(partitioner.isCold(EXACT_GYRAL)).toBe(false);
  });

  it('unknown coord: isHot()=false, isCold()=true (tier=cold)', () => {
    expect(partitioner.isHot(FAR_COORD)).toBe(false);
    expect(partitioner.isCold(FAR_COORD)).toBe(true);
  });

  it('stats() returns correct hot/cold/unknown counts', () => {
    partitioner.classify(EXACT_GYRAL);   // gyrus → hot
    partitioner.classify(EXACT_SULCAL);  // sulcus → cold
    partitioner.classify(HIPPOCAMPUS);   // sulcus → cold
    partitioner.classify(FAR_COORD);     // unknown

    const s = partitioner.stats();
    expect(s.hot).toBe(1);
    expect(s.cold).toBe(2);
    expect(s.unknown).toBe(1);
    expect(s.total).toBe(4);
  });

  it('custom threshold respected by class', () => {
    const strict = new GyriSulciPartitioner({ unknown_threshold_mm: 0.1 });
    const r = strict.classify({ mni_x: GYRAL_COORD.mni_x + 1, mni_y: GYRAL_COORD.mni_y, mni_z: GYRAL_COORD.mni_z });
    expect(r.surface_type).toBe('unknown');
  });

  it('missing mesh behavior: no GLTF required, pure seed table', () => {
    // This test DOCUMENTS that no external asset is needed.
    // If BrainCoordMapper.getAllEntries() returns results, classification works.
    const r = partitioner.classify(EXACT_GYRAL);
    expect(['gyrus', 'sulcus', 'unknown']).toContain(r.surface_type);
    expect(r.nearest_distance_mm).toBeGreaterThanOrEqual(0);
  });
});
