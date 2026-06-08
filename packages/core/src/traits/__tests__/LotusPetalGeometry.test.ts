/**
 * LotusPetalGeometry — the petal MESH generator (I.007 geometry-side closure).
 *
 * Proves the three-free petal geometry data is well-formed: correct vertex/index
 * counts, attributes in range, unit front-facing normals, a real (non-flat,
 * non-rectangular) petal silhouette, determinism, and profile-driven params.
 */
import { describe, it, expect } from 'vitest';
import {
  buildLotusPetalGeometryData,
  lotusPetalGeometryParamsFromProfile,
  buildLotusFlowerPlacements,
  createBotanicalLotusRenderProfile,
  DEFAULT_LOTUS_PETAL_GEOMETRY_PARAMS,
  LOTUS_GOLDEN_ANGLE_DEG,
} from '../BotanicalLotusTrait';

describe('buildLotusPetalGeometryData', () => {
  it('emits consistent vertex/index counts for the grid resolution', () => {
    const g = buildLotusPetalGeometryData({ segmentsU: 8, segmentsV: 12 });
    const cols = 9;
    const rows = 13;
    expect(g.vertexCount).toBe(cols * rows);
    expect(g.positions.length).toBe(g.vertexCount * 3);
    expect(g.normals.length).toBe(g.vertexCount * 3);
    expect(g.petalUv.length).toBe(g.vertexCount * 2);
    expect(g.veinPhase.length).toBe(g.vertexCount);
    expect(g.indices.length).toBe(8 * 12 * 6);
  });

  it('keeps every index within the vertex range', () => {
    const g = buildLotusPetalGeometryData({ segmentsU: 6, segmentsV: 6 });
    let max = 0;
    for (const idx of g.indices) max = Math.max(max, idx);
    expect(max).toBeLessThan(g.vertexCount);
  });

  it('petalUv spans the full [0,1]×[0,1] parametric domain', () => {
    const g = buildLotusPetalGeometryData({ segmentsU: 10, segmentsV: 10 });
    let uMin = 1,
      uMax = 0,
      vMin = 1,
      vMax = 0;
    for (let i = 0; i < g.vertexCount; i += 1) {
      uMin = Math.min(uMin, g.petalUv[i * 2]);
      uMax = Math.max(uMax, g.petalUv[i * 2]);
      vMin = Math.min(vMin, g.petalUv[i * 2 + 1]);
      vMax = Math.max(vMax, g.petalUv[i * 2 + 1]);
    }
    expect(uMin).toBeCloseTo(0);
    expect(uMax).toBeCloseTo(1);
    expect(vMin).toBeCloseTo(0);
    expect(vMax).toBeCloseTo(1);
  });

  it('positions stay within the declared width/length envelope', () => {
    const g = buildLotusPetalGeometryData({ width: 1.1, length: 1.7 });
    for (let i = 0; i < g.vertexCount; i += 1) {
      const x = g.positions[i * 3];
      const y = g.positions[i * 3 + 1];
      expect(Math.abs(x)).toBeLessThanOrEqual(1.1 / 2 + 1e-5);
      expect(y).toBeGreaterThanOrEqual(-1e-5);
      expect(y).toBeLessThanOrEqual(1.7 + 1e-5);
    }
  });

  it('produces a real petal silhouette — wider in the lower-mid than at base or tip', () => {
    const g = buildLotusPetalGeometryData({ segmentsU: 20, segmentsV: 20, width: 1.1 });
    const cols = 21;
    const halfWidthAtRow = (j: number): number => {
      let maxX = 0;
      for (let i = 0; i < cols; i += 1)
        maxX = Math.max(maxX, Math.abs(g.positions[(j * cols + i) * 3]));
      return maxX;
    };
    const base = halfWidthAtRow(0);
    const mid = halfWidthAtRow(8); // ~v=0.4, the widest region
    const tip = halfWidthAtRow(20); // apex
    expect(mid).toBeGreaterThan(base);
    expect(mid).toBeGreaterThan(tip);
    expect(tip).toBeLessThan(0.05); // pointed apex, ~zero width
  });

  it('emits unit-length, front-facing (+z) normals', () => {
    const g = buildLotusPetalGeometryData({ segmentsU: 8, segmentsV: 8 });
    for (let i = 0; i < g.vertexCount; i += 1) {
      const nx = g.normals[i * 3];
      const ny = g.normals[i * 3 + 1];
      const nz = g.normals[i * 3 + 2];
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 4);
      expect(nz).toBeGreaterThanOrEqual(0);
    }
  });

  it('is non-flat (the cup + ridge give real z relief)', () => {
    const g = buildLotusPetalGeometryData({ cup: 0.34, ridge: 0.12 });
    let zMin = Infinity,
      zMax = -Infinity;
    for (let i = 0; i < g.vertexCount; i += 1) {
      zMin = Math.min(zMin, g.positions[i * 3 + 2]);
      zMax = Math.max(zMax, g.positions[i * 3 + 2]);
    }
    expect(zMax - zMin).toBeGreaterThan(0.05);
  });

  it('winds triangles CCW so the front face points toward +z (the viewer)', () => {
    const g = buildLotusPetalGeometryData({ segmentsU: 6, segmentsV: 6 });
    const p = (vi: number): [number, number, number] => [
      g.positions[vi * 3],
      g.positions[vi * 3 + 1],
      g.positions[vi * 3 + 2],
    ];
    // Average the geometric normal across all triangles; it must face +z overall.
    let nzSum = 0;
    for (let t = 0; t < g.indices.length; t += 3) {
      const a = p(g.indices[t]);
      const b = p(g.indices[t + 1]);
      const c = p(g.indices[t + 2]);
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      nzSum += e1[0] * e2[1] - e1[1] * e2[0]; // z of e1 × e2
    }
    expect(nzSum).toBeGreaterThan(0);
  });

  it('bakes the veinPhase param into every vertex', () => {
    const g = buildLotusPetalGeometryData({ veinPhase: 0.42, segmentsU: 4, segmentsV: 4 });
    for (let i = 0; i < g.vertexCount; i += 1) expect(g.veinPhase[i]).toBeCloseTo(0.42);
  });

  it('is deterministic', () => {
    const a = buildLotusPetalGeometryData({ segmentsU: 6, segmentsV: 9 });
    const b = buildLotusPetalGeometryData({ segmentsU: 6, segmentsV: 9 });
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
  });
});

describe('lotusPetalGeometryParamsFromProfile', () => {
  it('pulls petal proportions from the render profile (outermost ring by default)', () => {
    const profile = createBotanicalLotusRenderProfile();
    const params = lotusPetalGeometryParamsFromProfile(profile);
    const outer = profile.petal_rings[profile.petal_rings.length - 1];
    expect(params.length).toBeCloseTo(outer.length);
    expect(params.width).toBeCloseTo(outer.width);
    expect(params.cup).toBeCloseTo(outer.cup);
    expect(params.gravitySag).toBeCloseTo(outer.gravity_sag);
    // Falls back to defaults for non-profile fields.
    expect(params.segmentsU).toBe(DEFAULT_LOTUS_PETAL_GEOMETRY_PARAMS.segmentsU);
  });

  it('selects a named ring and honors explicit overrides', () => {
    const profile = createBotanicalLotusRenderProfile();
    const params = lotusPetalGeometryParamsFromProfile(profile, { ring: 'inner', segmentsV: 64 });
    const inner = profile.petal_rings.find((r) => r.name === 'inner')!;
    expect(params.length).toBeCloseTo(inner.length);
    expect(params.segmentsV).toBe(64);
  });
});

describe('buildLotusFlowerPlacements', () => {
  it('emits one placement per petal across all rings (full bloom)', () => {
    const profile = createBotanicalLotusRenderProfile();
    const placements = buildLotusFlowerPlacements(profile);
    const totalPetals = profile.petal_rings.reduce((sum, r) => sum + r.count, 0);
    expect(placements.length).toBe(totalPetals);
    // Default lotus = 8 + 13 + 21 = 42 petals.
    expect(placements.length).toBe(42);
  });

  it('lays petals on a continuous golden-angle spiral', () => {
    const placements = buildLotusFlowerPlacements();
    const golden = (LOTUS_GOLDEN_ANGLE_DEG * Math.PI) / 180;
    for (let i = 1; i < placements.length; i += 1) {
      expect(placements[i].azimuth - placements[i - 1].azimuth).toBeCloseTo(golden, 5);
    }
  });

  it('tilts inner rings more upright than outer rings (the cup)', () => {
    const placements = buildLotusFlowerPlacements();
    const inner = placements.find((p) => p.ring === 1)!;
    const outer = placements.find((p) => p.ring === 3)!;
    // tilt = lean from vertical; outer petals splay more → larger tilt.
    expect(outer.tilt).toBeGreaterThan(inner.tilt);
    // Inner rings sit higher in the cup.
    expect(inner.lift).toBeGreaterThan(outer.lift);
  });

  it('is deterministic', () => {
    const a = buildLotusFlowerPlacements();
    const b = buildLotusFlowerPlacements();
    expect(a).toEqual(b);
  });
});
