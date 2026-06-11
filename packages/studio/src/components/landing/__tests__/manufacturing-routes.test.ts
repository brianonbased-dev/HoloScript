/**
 * Tests for the manufacturing API routes.
 *
 * These tests mock @holoscript/engine to avoid requiring the native engine
 * build in the test environment, and test the route handlers in isolation.
 *
 * Tested behaviors:
 * - POST /api/manufacturing/mesh returns positions, indices, printability for a sphere SDF
 * - POST /api/manufacturing/stl returns binary bytes starting with the 80-byte header
 * - Oversized resolution (> 64 per axis) is clamped to 64, not rejected
 * - Resolution below 2 returns 400
 * - Missing sdf field returns 400
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock data (must be declared before vi.mock is hoisted) ────────────
// vi.mock factory runs at hoist-time, so references here must also be hoisted.

const mocks = vi.hoisted(() => {
  // Synthetic mesh data
  const positions = new Float64Array([
    -1, -1, -1,  1, -1, -1,  1,  1, -1, -1,  1, -1,
    -1, -1,  1,  1, -1,  1,  1,  1,  1, -1,  1,  1,
  ]);
  const triangles = new Uint32Array([
    0, 1, 2,  0, 2, 3,
    4, 6, 5,  4, 7, 6,
    0, 4, 5,  0, 5, 1,
    1, 5, 6,  1, 6, 2,
    2, 6, 7,  2, 7, 3,
    3, 7, 4,  3, 4, 0,
  ]);

  const printability = {
    watertight: true,
    openEdgeCount: 0,
    manifold: true,
    volume: 8.0,
    surfaceArea: 24.0,
    orientationOutward: true,
    aabb: { min: [-1, -1, -1], max: [1, 1, 1], size: [2, 2, 2] },
    fitsBuildVolume: undefined,
    overhangs: { count: 0, totalArea: 0, fraction: 0, worstAngleDeg: NaN },
    wallThickness: undefined,
    recommendation: 'printable' as const,
  };

  // Minimal binary STL: 80-byte header + 4-byte triangle count (0) = 84 bytes
  const STL_HEADER = 'HoloScript STLExporter test';
  const stlBuffer = new ArrayBuffer(84);
  const stlView = new Uint8Array(stlBuffer);
  for (let i = 0; i < STL_HEADER.length; i++) {
    stlView[i] = STL_HEADER.charCodeAt(i);
  }

  return {
    positions,
    triangles,
    printability,
    stlBuffer,
    STL_HEADER,
    marchingCubes: vi.fn(() => ({ vertices: positions, triangles })),
    analyzePrintability: vi.fn(() => printability),
    exportSTLBinary: vi.fn(() => stlBuffer),
  };
});

// ── Mock @holoscript/engine ──────────────────────────────────────────────────

vi.mock('@holoscript/engine', () => ({
  Simulation: {
    marchingCubes: mocks.marchingCubes,
    analyzePrintability: mocks.analyzePrintability,
    exportSTLBinary: mocks.exportSTLBinary,
  },
}));

// ── Import route handlers after mock setup ────────────────────────────────────

import { POST as meshPOST } from '../../../app/api/manufacturing/mesh/route';
import { POST as stlPOST } from '../../../app/api/manufacturing/stl/route';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, url = 'http://localhost/api/manufacturing/mesh'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// A minimal valid sphere SDF node
const SPHERE_SDF = {
  type: 'primitive',
  primitive: 'sphere',
  params: { radius: 1.0 },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/manufacturing/mesh', () => {
  beforeEach(() => {
    mocks.marchingCubes.mockClear();
    mocks.analyzePrintability.mockClear();
    mocks.marchingCubes.mockReturnValue({
      vertices: mocks.positions,
      triangles: mocks.triangles,
    });
    mocks.analyzePrintability.mockReturnValue(mocks.printability);
  });

  it('returns positions, indices, and printability for a sphere SDF', async () => {
    const req = makeRequest({ sdf: SPHERE_SDF }) as Parameters<typeof meshPOST>[0];
    const res = await meshPOST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      positions: number[];
      indices: number[];
      printability: { recommendation: string; watertight: boolean };
    };
    expect(Array.isArray(body.positions)).toBe(true);
    expect(body.positions.length).toBe(mocks.positions.length);
    expect(Array.isArray(body.indices)).toBe(true);
    expect(body.indices.length).toBe(mocks.triangles.length);
    expect(body.printability.recommendation).toBe('printable');
    expect(body.printability.watertight).toBe(true);
  });

  it('clamps oversized resolution to 64 per axis (does not reject)', async () => {
    const req = makeRequest({
      sdf: SPHERE_SDF,
      resolution: [128, 256, 100],
    }) as Parameters<typeof meshPOST>[0];
    const res = await meshPOST(req);
    expect(res.status).toBe(200);
    expect(mocks.marchingCubes).toHaveBeenCalledOnce();
    const callArgs = mocks.marchingCubes.mock.calls[0] as [
      unknown,
      { resolution: [number, number, number] }
    ];
    const usedRes = callArgs[1].resolution;
    expect(usedRes[0]).toBe(64);
    expect(usedRes[1]).toBe(64);
    expect(usedRes[2]).toBe(64);
  });

  it('returns 400 when resolution axis is below 2', async () => {
    const req = makeRequest({
      sdf: SPHERE_SDF,
      resolution: [1, 40, 40],
    }) as Parameters<typeof meshPOST>[0];
    const res = await meshPOST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/resolution/i);
  });

  it('returns 400 when sdf is missing', async () => {
    const req = makeRequest({ resolution: [10, 10, 10] }) as Parameters<typeof meshPOST>[0];
    const res = await meshPOST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/sdf/i);
  });

  it('returns 400 when sdf lacks a type field', async () => {
    const req = makeRequest({ sdf: { primitive: 'sphere' } }) as Parameters<typeof meshPOST>[0];
    const res = await meshPOST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when bounds.min >= bounds.max on an axis', async () => {
    const req = makeRequest({
      sdf: SPHERE_SDF,
      bounds: { min: [1, -1, -1], max: [0, 1, 1] },
    }) as Parameters<typeof meshPOST>[0];
    const res = await meshPOST(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/manufacturing/stl', () => {
  beforeEach(() => {
    mocks.marchingCubes.mockClear();
    mocks.exportSTLBinary.mockClear();
    mocks.marchingCubes.mockReturnValue({
      vertices: mocks.positions,
      triangles: mocks.triangles,
    });
    mocks.exportSTLBinary.mockReturnValue(mocks.stlBuffer);
  });

  it('returns binary STL bytes starting with 80-byte header', async () => {
    const req = makeRequest(
      { sdf: SPHERE_SDF },
      'http://localhost/api/manufacturing/stl'
    ) as Parameters<typeof stlPOST>[0];
    const res = await stlPOST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('model/stl');
    expect(res.headers.get('Content-Disposition')).toContain('part.stl');
    const buffer = await res.arrayBuffer();
    // Must be at least 84 bytes (80-byte header + 4-byte triangle count)
    expect(buffer.byteLength).toBeGreaterThanOrEqual(84);
    // First bytes should match our mock header text
    const view = new Uint8Array(buffer);
    const firstChars = Array.from(view.slice(0, mocks.STL_HEADER.length))
      .map((b) => String.fromCharCode(b))
      .join('');
    expect(firstChars).toBe(mocks.STL_HEADER);
  });

  it('returns 400 when sdf is missing', async () => {
    const req = makeRequest(
      {},
      'http://localhost/api/manufacturing/stl'
    ) as Parameters<typeof stlPOST>[0];
    const res = await stlPOST(req);
    expect(res.status).toBe(400);
  });
});
