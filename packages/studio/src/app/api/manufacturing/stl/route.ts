/**
 * POST /api/manufacturing/stl
 *
 * Convert an SDFNode tree into a binary STL file for download.
 * Same request body as /api/manufacturing/mesh.
 *
 * Request body (JSON):
 *   {
 *     sdf: SDFNode          — SDF tree
 *     resolution?: [n,n,n]  — voxel resolution, default [40,40,40], max 64 per axis
 *     bounds?: {
 *       min: [x,y,z]
 *       max: [x,y,z]
 *     }
 *   }
 *
 * Response 200:
 *   Content-Type: model/stl
 *   Content-Disposition: attachment; filename="part.stl"
 *   <binary STL bytes>
 *
 * Response 400:
 *   Content-Type: application/json
 *   { error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Simulation as SimulationNS } from '@holoscript/engine';

// marchingCubes accepts SDFNode | SDFDistanceField; the field variant carries
// `distances`, so excluding it leaves the plain SDF tree type this route accepts.
type SDFNode = Exclude<Parameters<typeof SimulationNS.marchingCubes>[0], { distances: unknown }>;

/**
 * Load the REAL engine at runtime, bypassing webpack — see the identical
 * helper in ../mesh/route.ts for the full rationale (config-wide alias +
 * ESM-external interop proxy make a static import unusable here).
 */
async function loadSimulation(): Promise<typeof SimulationNS> {
  const engine = (await import(/* webpackIgnore: true */ '@holoscript/engine')) as {
    Simulation: typeof SimulationNS;
  };
  return engine.Simulation;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_RESOLUTION: [number, number, number] = [40, 40, 40];
const MAX_RESOLUTION_PER_AXIS = 64;
const DEFAULT_BOUNDS = {
  min: [-1, -1, -1] as [number, number, number],
  max: [1, 1, 1] as [number, number, number],
};

// ── Input validation (mirrors mesh route) ────────────────────────────────────

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isVec3(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    isFiniteNumber(v[0]) &&
    isFiniteNumber(v[1]) &&
    isFiniteNumber(v[2])
  );
}

function isResolution(v: unknown): v is [number, number, number] {
  if (!isVec3(v)) return false;
  const [a, b, c] = v as [number, number, number];
  return (
    Number.isInteger(a) && Number.isInteger(b) && Number.isInteger(c) && a >= 2 && b >= 2 && c >= 2
  );
}

function isSDFNode(v: unknown): v is SDFNode {
  if (typeof v !== 'object' || v === null) return false;
  const n = v as Record<string, unknown>;
  return typeof n['type'] === 'string';
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  if (!isSDFNode(raw['sdf'])) {
    return NextResponse.json(
      { error: '`sdf` must be an SDFNode object with a `type` string field' },
      { status: 400 }
    );
  }
  const sdf = raw['sdf'] as SDFNode;

  let resolution = DEFAULT_RESOLUTION;
  if (raw['resolution'] !== undefined) {
    if (!isResolution(raw['resolution'])) {
      return NextResponse.json(
        { error: '`resolution` must be an array of 3 integers each >= 2' },
        { status: 400 }
      );
    }
    const r = raw['resolution'] as [number, number, number];
    resolution = [
      Math.min(r[0], MAX_RESOLUTION_PER_AXIS),
      Math.min(r[1], MAX_RESOLUTION_PER_AXIS),
      Math.min(r[2], MAX_RESOLUTION_PER_AXIS),
    ];
  }

  let bounds = DEFAULT_BOUNDS;
  if (raw['bounds'] !== undefined) {
    const b = raw['bounds'] as Record<string, unknown>;
    if (!isVec3(b['min']) || !isVec3(b['max'])) {
      return NextResponse.json(
        { error: '`bounds.min` and `bounds.max` must each be [number, number, number]' },
        { status: 400 }
      );
    }
    bounds = {
      min: b['min'] as [number, number, number],
      max: b['max'] as [number, number, number],
    };
    for (let i = 0; i < 3; i++) {
      if (bounds.min[i] >= bounds.max[i]) {
        return NextResponse.json(
          { error: `bounds.min[${i}] must be strictly less than bounds.max[${i}]` },
          { status: 400 }
        );
      }
    }
  }

  try {
    const Simulation = await loadSimulation();
    const mesh = Simulation.marchingCubes(sdf, { resolution, bounds });
    const stlBuffer = Simulation.exportSTLBinary(mesh);

    return new Response(stlBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'model/stl',
        'Content-Disposition': 'attachment; filename="part.stl"',
        'Content-Length': String(stlBuffer.byteLength),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `STL export failed: ${message}` }, { status: 400 });
  }
}
