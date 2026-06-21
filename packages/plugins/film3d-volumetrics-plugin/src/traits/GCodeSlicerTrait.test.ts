import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPlanarSliceContoursFromMesh,
  buildSemanticGCodePreamble,
  buildTraversalStackFromMesh,
  createGCodeSlicerHandler,
  serializeTraversalStackToGCode,
  type GCodeSlicerConfig,
  type MeshSliceInput,
} from './GCodeSlicerTrait';
import type { TraitContext } from './types';

const baseConfig: GCodeSlicerConfig = {
  layerHeightMm: 0.2,
  infillPercent: 20,
  nozzleTempC: 210,
  bedTempC: 60,
  firstLayerNozzleBoostC: 10,
  adhesionLayerCount: 2,
  adhesionLayerHeightMm: 0.25,
  adhesionBrimMm: 1,
  printSpeedMmS: 50,
  enableSupports: true,
  supportOverhangAngleDeg: 45,
  supportInsetMm: 0.5,
};

const tempDirs: string[] = [];

function makeCtx(extra: Partial<TraitContext> = {}) {
  const events: { type: string; payload: unknown }[] = [];
  return {
    events,
    emit: vi.fn((type: string, payload?: unknown) => events.push({ type, payload })),
    ...extra,
  };
}

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'holoscript-gcode-'));
  tempDirs.push(dir);
  return dir;
}

function boxMesh(size: number, height: number, offset = 0): MeshSliceInput {
  const min = offset;
  const max = offset + size;
  return {
    verticesMm: [
      [min, min, 0],
      [max, min, 0],
      [max, max, 0],
      [min, max, 0],
      [min, min, height],
      [max, min, height],
      [max, max, height],
      [min, max, height],
    ],
    indices: [
      0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3,
      7, 4, 3, 4, 0,
    ],
  };
}

function overhangFrustumMesh(): MeshSliceInput {
  return {
    verticesMm: [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
      [-10, -10, 3],
      [20, -10, 3],
      [20, 20, 3],
      [-10, 20, 3],
    ],
    indices: [
      0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3,
      7, 4, 3, 4, 0,
    ],
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe('film3d GCodeSlicerTrait', () => {
  it('builds closed planar slice contours from indexed mesh triangles', () => {
    const contours = buildPlanarSliceContoursFromMesh(boxMesh(10, 10), 5);
    const points = contours.flatMap((contour) => contour.pointsMm);
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);

    expect(contours.length).toBe(1);
    expect(contours[0]!.closed).toBe(true);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(10);
    expect(Math.min(...ys)).toBeCloseTo(0);
    expect(Math.max(...ys)).toBeCloseTo(10);
  });

  it('adds support traversal when upper contours exceed the previous footprint', () => {
    const plans = buildTraversalStackFromMesh(
      { ...baseConfig, adhesionLayerCount: 0, layerHeightMm: 1, supportInsetMm: 0 },
      overhangFrustumMesh()
    );

    expect(plans.some((plan) => plan.role === 'model')).toBe(true);
    expect(plans.some((plan) => plan.role === 'support')).toBe(true);
  });

  it('serializes traversal layers into G0/G1 toolpath moves with shutdown G-code', () => {
    const preamble = buildSemanticGCodePreamble(baseConfig);
    const gcode = serializeTraversalStackToGCode(
      baseConfig,
      [
        {
          layerZMm: 0.25,
          pointsMm: [
            [0, 0, 0.25],
            [10, 0, 0.25],
            [10, 10, 0.25],
          ],
        },
      ],
      preamble
    );

    expect(gcode).toContain('M82 ; absolute extrusion');
    expect(gcode).toContain('G0 X0.000 Y0.000 F6000');
    expect(gcode).toMatch(/G1 X10\.000 Y0\.000 Z0\.250 E\d+\.\d{3} F3000/);
    expect(gcode).toContain('M104 S0 ; turn off nozzle');
    expect(gcode).toContain('M140 S0 ; turn off bed');
    expect(gcode).toContain('G28 X Y ; home XY');
  });

  it('writes a real .gcode file when a slice completes', async () => {
    const handler = createGCodeSlicerHandler();
    const node = { id: 'print-node' };
    const ctx = makeCtx();
    const outputPath = join(await makeTempDir(), 'part.gcode');

    handler.onAttach(node, baseConfig, ctx);
    handler.onEvent(node, baseConfig, ctx, {
      type: 'gcode_slicer:bind_mesh',
      payload: {
        verticesMm: [
          [0, 0, 0],
          [20, 0, 0],
          [20, 20, 0],
          [0, 20, 0],
        ],
      },
    });
    handler.onEvent(node, baseConfig, ctx, {
      type: 'gcode_slicer:slice',
      payload: { outputGCodePath: outputPath },
    });

    await vi.waitFor(() => {
      expect(ctx.events.some((event) => event.type === 'gcode_slicer:completed')).toBe(true);
    });

    const completed = ctx.events.find((event) => event.type === 'gcode_slicer:completed')!;
    const payload = completed.payload as {
      path: string;
      gcodeBytes: number;
      lineCount: number;
      traversal: unknown[];
    };
    const gcode = await readFile(outputPath, 'utf8');

    expect(payload.path).toBe(outputPath);
    expect(payload.gcodeBytes).toBeGreaterThan(0);
    expect(payload.lineCount).toBe(gcode.trimEnd().split('\n').length);
    expect(payload.traversal.length).toBeGreaterThan(0);
    expect(gcode).toContain('; traversal generated from HoloScript semantic layer plans');
    expect(gcode).toContain('G1 X');
    expect(gcode).toContain('M84 ; disable motors');
    expect(
      (node as unknown as { __slicerState: { outputGCodePath: string } }).__slicerState
        .outputGCodePath
    ).toBe(outputPath);
  });

  it('emits failure and resets slicing state when the writer rejects', async () => {
    const handler = createGCodeSlicerHandler();
    const node = { id: 'print-node' };
    const ctx = makeCtx({
      fileSystem: {
        writeFile: vi.fn(async () => {
          throw new Error('disk denied');
        }),
      },
    } as unknown as Partial<TraitContext>);

    handler.onAttach(node, baseConfig, ctx);
    handler.onEvent(node, baseConfig, ctx, { type: 'gcode_slicer:slice' });

    await vi.waitFor(() => {
      expect(ctx.events.some((event) => event.type === 'gcode_slicer:failed')).toBe(true);
    });

    const failed = ctx.events.find((event) => event.type === 'gcode_slicer:failed')!;
    expect(failed.payload).toMatchObject({ error: 'disk denied' });
    expect(
      (node as unknown as { __slicerState: { isSlicing: boolean; progressPercent: number } })
        .__slicerState
    ).toMatchObject({
      isSlicing: false,
      progressPercent: 0,
    });
  });
});
