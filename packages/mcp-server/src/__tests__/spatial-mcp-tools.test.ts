/**
 * Spatial MCP - round-trip + validator + placement coverage.
 *
 * G.GOLD.013: assertions compare against literal expected values, not
 * re-computed expressions of the input.
 * G.GOLD.015: tests target the failure categories that bite this codebase -
 * schema-version drift, frame-name drift, NaN/Infinity in poses, non-unit
 * gaze direction (F.041 / W.GOLD.514 echo), grip out of [0,1], placement
 * fallback ordering.
 */

import { describe, expect, it } from 'vitest';
import {
  handleSpatialMcpTool,
  isSpatialMcpToolName,
  spatialMcpToolDefinitions,
} from '../spatial-mcp-tools';
import {
  SPATIAL_CONTEXT_VERSION,
  SPATIAL_FRAME,
  validateSpatialContext,
  pickPlacement,
  type SpatialMCPContext,
  type SpatialMCPResponse,
} from '@holoscript/core';

const baseCtx: SpatialMCPContext = {
  version: SPATIAL_CONTEXT_VERSION,
  frame: SPATIAL_FRAME,
};

describe('spatial-mcp tool registration', () => {
  it('publishes exactly one tool named compile_to_spatial', () => {
    expect(spatialMcpToolDefinitions).toHaveLength(1);
    expect(spatialMcpToolDefinitions[0]?.name).toBe('compile_to_spatial');
  });

  it('isSpatialMcpToolName recognizes the published tool and rejects others', () => {
    expect(isSpatialMcpToolName('compile_to_spatial')).toBe(true);
    expect(isSpatialMcpToolName('compile_to_unity')).toBe(false);
    expect(isSpatialMcpToolName('')).toBe(false);
  });

  it('input schema requires code + spatialContext', () => {
    const def = spatialMcpToolDefinitions[0]!;
    const required = (def.inputSchema as { required?: string[] }).required ?? [];
    expect(required).toContain('code');
    expect(required).toContain('spatialContext');
  });
});

describe('validateSpatialContext - schema drift defenses', () => {
  it('rejects unknown schema version (G.GOLD.015 - schema drift)', () => {
    const r = validateSpatialContext({ version: '0.2', frame: SPATIAL_FRAME });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === 'version')).toBe(true);
  });

  it('rejects unknown frame name (G.GOLD.015 - unit/frame drift)', () => {
    const r = validateSpatialContext({
      version: SPATIAL_CONTEXT_VERSION,
      frame: 'world-z-up-meters',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === 'frame')).toBe(true);
  });

  it('rejects non-unit gaze direction (F.041 echo - W.GOLD.514 canonicalization rot)', () => {
    const r = validateSpatialContext({
      ...baseCtx,
      gaze: { origin: [0, 0, 0], direction: [2, 0, 0] },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === 'gaze.direction')).toBe(true);
  });

  it('rejects NaN in headset position (G.GOLD.015 - finiteness)', () => {
    const r = validateSpatialContext({
      ...baseCtx,
      headset: {
        position: [Number.NaN, 0, 0],
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === 'headset.position')).toBe(true);
  });

  it('rejects Infinity in controller velocity (G.GOLD.015 - finiteness)', () => {
    const r = validateSpatialContext({
      ...baseCtx,
      controllers: {
        right: {
          position: [0, 0, 0],
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          velocity: [Number.POSITIVE_INFINITY, 0, 0],
        },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === 'controllers.right.velocity')).toBe(true);
  });

  it('rejects grip outside [0,1]', () => {
    const r = validateSpatialContext({
      ...baseCtx,
      hands: {
        right: {
          position: [0, 0, 0],
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          grip: 1.5,
        },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === 'hands.right.grip')).toBe(true);
  });

  it('accepts a minimal payload (version + frame only)', () => {
    const r = validateSpatialContext(baseCtx);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('accepts a unit-length gaze direction within tolerance', () => {
    // Direction normalized; magnitude exactly 1.
    const r = validateSpatialContext({
      ...baseCtx,
      gaze: { origin: [0, 1.6, 0], direction: [0, 0, -1] },
    });
    expect(r.ok).toBe(true);
  });
});

describe('pickPlacement - fallback ordering', () => {
  it('returns gaze-hit when origin + direction + hitDistance are present', () => {
    const ctx: SpatialMCPContext = {
      ...baseCtx,
      // Gaze ray: origin [0,1,0], direction [0,0,-1], hit at 2m -> [0,1,-2].
      gaze: { origin: [0, 1, 0], direction: [0, 0, -1], hitDistance: 2 },
      // Distractor: hand should NOT win when gaze is present.
      hands: {
        right: { position: [9, 9, 9], rotation: { x: 0, y: 0, z: 0, w: 1 }, grip: 0 },
      },
    };
    const p = pickPlacement(ctx);
    // Literal expected: G.GOLD.013 - not recomputed from inputs.
    expect(p.source).toBe('gaze-hit');
    expect(p.position).toEqual([0, 1, -2]);
  });

  it('returns gaze-ray (1m along direction) when hitDistance is missing', () => {
    const p = pickPlacement({
      ...baseCtx,
      gaze: { origin: [0, 0, 0], direction: [1, 0, 0] },
    });
    expect(p.source).toBe('gaze-ray');
    expect(p.position).toEqual([1, 0, 0]);
  });

  it('prefers right hand over left hand', () => {
    const p = pickPlacement({
      ...baseCtx,
      hands: {
        left: { position: [-1, 0, 0], rotation: { x: 0, y: 0, z: 0, w: 1 }, grip: 0 },
        right: { position: [1, 0, 0], rotation: { x: 0, y: 0, z: 0, w: 1 }, grip: 0 },
      },
    });
    expect(p.source).toBe('hand-right');
    expect(p.position).toEqual([1, 0, 0]);
  });

  it('prefers right controller over left controller (when no hands)', () => {
    const p = pickPlacement({
      ...baseCtx,
      controllers: {
        left: { position: [-2, 0, 0], rotation: { x: 0, y: 0, z: 0, w: 1 } },
        right: { position: [2, 0, 0], rotation: { x: 0, y: 0, z: 0, w: 1 } },
      },
    });
    expect(p.source).toBe('controller-right');
    expect(p.position).toEqual([2, 0, 0]);
  });

  it('returns AABB center when only room geometry is provided', () => {
    const p = pickPlacement({
      ...baseCtx,
      room: { aabb: { min: [-1, 0, -1], max: [1, 2, 1] } },
    });
    expect(p.source).toBe('aabb-center');
    // Literal expected: midpoint of (-1,0,-1) and (1,2,1) is (0,1,0).
    expect(p.position).toEqual([0, 1, 0]);
  });

  it('returns headset position when nothing else is present', () => {
    const p = pickPlacement({
      ...baseCtx,
      headset: { position: [0, 1.6, 0], rotation: { x: 0, y: 0, z: 0, w: 1 } },
    });
    expect(p.source).toBe('headset');
    expect(p.position).toEqual([0, 1.6, 0]);
  });

  it('returns origin when context is empty', () => {
    const p = pickPlacement(baseCtx);
    expect(p.source).toBe('origin');
    expect(p.position).toEqual([0, 0, 0]);
  });
});

describe('compile_to_spatial - round-trip', () => {
  it('throws when name is not compile_to_spatial', async () => {
    await expect(handleSpatialMcpTool('foo', {})).rejects.toThrow(/Unknown spatial-mcp tool/);
  });

  it('throws when code is missing', async () => {
    await expect(
      handleSpatialMcpTool('compile_to_spatial', { spatialContext: baseCtx })
    ).rejects.toThrow(/code/);
  });

  it('returns validation errors when spatialContext is malformed', async () => {
    const result = (await handleSpatialMcpTool('compile_to_spatial', {
      code: 'orb#x { position: [0,0,0] }',
      spatialContext: { version: '0.2', frame: SPATIAL_FRAME },
    })) as { ok: boolean; error?: string; validationErrors?: unknown[] };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/validation/i);
    expect(Array.isArray(result.validationErrors)).toBe(true);
  });

  it('end-to-end: gaze hit produces scenePatch spawn at the hit point', async () => {
    const code = 'orb#myOrb { position: [0,0,0] }';
    const result = (await handleSpatialMcpTool('compile_to_spatial', {
      code,
      spatialContext: {
        ...baseCtx,
        gaze: { origin: [0, 1, 0], direction: [0, 0, -1], hitDistance: 2 },
      },
    })) as SpatialMCPResponse & { ok: boolean; placementSource: string };

    // Round-trip invariants - literal expected values.
    expect(result.ok).toBe(true);
    expect(result.version).toBe(SPATIAL_CONTEXT_VERSION);
    expect(result.frame).toBe(SPATIAL_FRAME);
    expect(result.placementSource).toBe('gaze-hit');

    // text channel always present (chat-only client invariant).
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);

    // scenePatch is exactly one spawn op at the gaze-hit point.
    expect(result.scenePatch).toEqual([
      { op: 'spawn', id: 'spatial-mcp-spawn', position: [0, 1, -2] },
    ]);

    // holo channel carries the placement-wrapped composition.
    expect(typeof result.holo).toBe('string');
    expect(result.holo).toContain('spatial-mcp v0.1 placement');
    expect(result.holo).toContain('frame: tracking-space-y-up-meters');
    expect(result.holo).toContain('source: gaze-hit');
    expect(result.holo).toContain(code);
  });

  it('honors a custom spawnId', async () => {
    const result = (await handleSpatialMcpTool('compile_to_spatial', {
      code: 'orb#x { position: [0,0,0] }',
      spatialContext: baseCtx,
      spawnId: 'custom-id-42',
    })) as SpatialMCPResponse & { ok: boolean };
    expect(result.scenePatch).toEqual([
      { op: 'spawn', id: 'custom-id-42', position: [0, 0, 0] },
    ]);
  });
});
