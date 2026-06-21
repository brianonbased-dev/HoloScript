import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createGCodeSlicerHandler,
  serializeTraversalStackToGCode,
  type GCodeSlicerConfig,
} from './GCodeSlicerTrait';
import type { TraitContext } from './types';

function makeCtx(extra: Partial<TraitContext> = {}) {
  const events: { type: string; payload: unknown }[] = [];
  return {
    events,
    emit: vi.fn((type: string, payload?: unknown) => events.push({ type, payload })),
    ...extra,
  };
}

async function eventually(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < 40; i += 1) {
    try {
      assertion();
      return;
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}

describe('film3d GCodeSlicerTrait', () => {
  it('serializes traversal layer plans into executable G-code moves', () => {
    const config: GCodeSlicerConfig = {
      layerHeightMm: 0.2,
      infillPercent: 20,
      nozzleTempC: 210,
      bedTempC: 60,
      firstLayerNozzleBoostC: 10,
      adhesionLayerCount: 1,
      adhesionLayerHeightMm: 0.25,
      adhesionBrimMm: 2,
      printSpeedMmS: 25,
    };

    const gcode = serializeTraversalStackToGCode(
      config,
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
      'G21 ; millimeters'
    );

    expect(gcode).toContain('G21 ; millimeters');
    expect(gcode).toContain('G0 X0.000 Y0.000 F6000');
    expect(gcode).toContain('G1 X10.000 Y0.000 Z0.250 E0.090 F1500');
    expect(gcode).toContain('M104 S0 ; hotend off');
    expect(gcode).toContain('M140 S0 ; bed off');
    expect(gcode).toContain('G28 X Y ; home XY');
  });

  it('writes a .gcode file before emitting gcode_slicer:completed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'holoscript-gcode-'));
    const outputPath = join(dir, 'slice.gcode');
    try {
      const handler = createGCodeSlicerHandler();
      const node = { id: 'print-node' };
      const ctx = makeCtx();
      const config = { ...handler.defaultConfig, adhesionLayerCount: 1, printSpeedMmS: 30 };

      handler.onAttach(node, config, ctx);
      handler.onEvent(node, config, ctx, {
        type: 'gcode_slicer:bind_mesh',
        payload: {
          verticesMm: [
            [0, 0, 0],
            [30, 0, 0],
            [30, 30, 4],
            [0, 30, 4],
          ],
        },
      });
      handler.onEvent(node, config, ctx, {
        type: 'gcode_slicer:slice',
        payload: { outputPath },
      });

      await eventually(() => expect(existsSync(outputPath)).toBe(true));
      const contents = readFileSync(outputPath, 'utf8');
      const completed = ctx.events.find((event) => event.type === 'gcode_slicer:completed');

      expect(contents).toContain('; traversal generated from HoloScript semantic layer plans');
      expect(contents).toContain('G1 X');
      expect(contents).toContain('M84 ; disable motors');
      expect(statSync(outputPath).size).toBeGreaterThan(200);
      expect(completed?.payload).toMatchObject({
        path: outputPath,
        bytes: contents.length,
      });
      expect(
        (node as { __slicerState?: { outputGCodePath?: string } }).__slicerState
      ).toMatchObject({
        outputGCodePath: outputPath,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
