/**
 * ManufacturingLane.e2e — the full CAD/3D-printing lane in one closed loop:
 *
 *   parametric SDF CSG  →  marchingCubes (watertight mesh)
 *                        →  analyzePrintability (pre-flight report)
 *                        →  exportSTLBinary (manufacturing file)
 *                        →  parseSTL (existing importer — round trip)
 *                        →  re-analysis (geometry survives the file format)
 *
 * This is the engine-level CADAM-parity contract (board task
 * task_1781125573775_6m2u): describe a part parametrically, regenerate on
 * parameter change, and get a verified printable STL — all sovereign
 * (HoloScript SDF kernel, no external CAD dependency).
 */
import { describe, it, expect } from 'vitest';
import type { SDFNode } from '../../SDFPointEvaluator';
import { marchingCubes } from '../MarchingCubes';
import { analyzePrintability } from '../PrintabilityAnalyzer';
import { exportSTLBinary } from '../../export/STLExporter';
import { parseSTL } from '../../import/STLParser';

/** Parametric mounting plate: box with a cylindrical bolt hole through it. */
interface PlateParams {
  /** Box half-extents (plate is 2w × 2h × 2d) */
  halfWidth: number;
  halfHeight: number;
  halfDepth: number;
  /** Bolt hole radius (cylinder along the Y axis, through the plate) */
  holeRadius: number;
}

function mountingPlate(p: PlateParams): SDFNode {
  return {
    type: 'csg',
    operation: 'difference',
    children: [
      {
        type: 'primitive',
        primitive: 'box',
        params: { width: p.halfWidth, height: p.halfHeight, depth: p.halfDepth },
      },
      {
        type: 'primitive',
        primitive: 'cylinder',
        // height is the half-height; make it punch fully through the plate
        params: { height: p.halfHeight * 2, radius: p.holeRadius },
      },
    ],
  };
}

/** V = 8·w·h·d − π·r²·(2h)  (hole fully through the plate along Y) */
function analyticVolume(p: PlateParams): number {
  const box = 8 * p.halfWidth * p.halfHeight * p.halfDepth;
  const hole = Math.PI * p.holeRadius ** 2 * (2 * p.halfHeight);
  return box - hole;
}

const PARAMS: PlateParams = { halfWidth: 1, halfHeight: 0.5, halfDepth: 1, holeRadius: 0.3 };
const BOUNDS = { min: [-1.3, -0.8, -1.3] as const, max: [1.3, 0.8, 1.3] as const };
const RES = [56, 40, 56] as const;

describe('Manufacturing lane — end to end', () => {
  const mesh = marchingCubes(mountingPlate(PARAMS), { bounds: BOUNDS, resolution: RES });
  // Plate lies flat: thickness along Y, so the build direction is +Y.
  const report = analyzePrintability(mesh, { buildDirection: [0, 1, 0] });

  it('meshes the parametric part watertight and outward-oriented', () => {
    expect(report.watertight).toBe(true);
    expect(report.manifold).toBe(true);
    expect(report.orientationOutward).toBe(true);
  });

  it('mesh volume matches the parametric analytic volume within 3%', () => {
    const expected = analyticVolume(PARAMS);
    expect(Math.abs(report.volume - expected) / expected).toBeLessThan(0.03);
  });

  it('pre-flight: printable once bed contact uses a first-layer tolerance', () => {
    // With the strict default bedEpsilon (1e-6), marching-cubes artifacts at
    // the bottom face flag as overhangs: edge micro-chamfers (~45°) plus
    // bore-rim triangles pulled slightly off the bed plane by CSG
    // interpolation. They are a sliver of the surface — and they are all
    // first-layer bed contact in any real slicer.
    expect(report.recommendation).toBe('needs-supports');
    expect(report.overhangs.fraction).toBeLessThan(0.04);

    // One grid cell along the build direction = the mesh's own bottom-layer
    // resolution. With that physically-meaningful bed tolerance the plate is
    // cleanly printable at the default 45° threshold.
    const cellY = (0.8 - -0.8) / (RES[1] - 1);
    const firstLayer = analyzePrintability(mesh, {
      buildDirection: [0, 1, 0],
      bedEpsilon: cellY,
    });
    expect(firstLayer.recommendation).toBe('printable');
    expect(firstLayer.overhangs.count).toBe(0);
  });

  it('survives the STL round trip: export → reimport → same solid', () => {
    const stl = exportSTLBinary(mesh);
    const reimported = parseSTL(stl);
    const report2 = analyzePrintability(reimported, { buildDirection: [0, 1, 0] });

    expect(report2.watertight).toBe(true);
    expect(report2.orientationOutward).toBe(true);
    // f32 quantization in STL changes the volume only marginally
    expect(Math.abs(report2.volume - report.volume) / report.volume).toBeLessThan(0.005);
  });

  it('parametric regeneration: growing the hole removes exactly the analytic volume delta', () => {
    const bigger: PlateParams = { ...PARAMS, holeRadius: 0.45 };
    const mesh2 = marchingCubes(mountingPlate(bigger), { bounds: BOUNDS, resolution: RES });
    const report2 = analyzePrintability(mesh2, { buildDirection: [0, 1, 0] });

    const expectedDelta = analyticVolume(PARAMS) - analyticVolume(bigger);
    const measuredDelta = report.volume - report2.volume;
    // The delta is a difference of two ~3%-accurate volumes over a small
    // region — allow 10% relative error on the delta itself.
    expect(Math.abs(measuredDelta - expectedDelta) / expectedDelta).toBeLessThan(0.1);
    expect(report2.watertight).toBe(true);
  });

  it('detects when the part will not fit the printer', () => {
    const tiny = analyzePrintability(mesh, {
      buildDirection: [0, 1, 0],
      buildVolume: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    });
    expect(tiny.fitsBuildVolume).toBe(false);
  });
});
