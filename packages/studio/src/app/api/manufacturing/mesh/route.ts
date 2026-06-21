/**
 * POST /api/manufacturing/mesh
 *
 * Convert an SDFNode tree into a watertight triangle mesh via marching cubes
 * and return printability analysis.
 *
 * Request body (JSON):
 *   {
 *     sdf: SDFNode          — SDF tree (type/primitive/params/children/translate/rotate/scale)
 *     resolution?: [n,n,n]  — voxel resolution, default [40,40,40], max 64 per axis
 *     bounds?: {
 *       min: [x,y,z]        — world-space AABB min, default [-1,-1,-1]
 *       max: [x,y,z]        — world-space AABB max, default [1,1,1]
 *     }
 *     mechanicalTolerance?: number — optional positive tolerance in bounds/output units
 *   }
 *
 * Response 200 (JSON):
 *   {
 *     positions: number[]         — flat xyz vertex array (length = 3 * vertexCount)
 *     indices: number[]           — flat triangle index array (length = 3 * triangleCount)
 *     printability: PrintabilityReport
 *     precision: MarchingCubesToleranceEstimate
 *     backendDecision: ManufacturingBackendDecision
 *   }
 *
 * Response 400:
 *   { error: string }             — validation failure or meshing error
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Simulation as SimulationNS } from '@holoscript/engine';

// marchingCubes accepts SDFNode | SDFDistanceField; the field variant carries
// `distances`, so excluding it leaves the plain SDF tree type this route accepts.
type SDFNode = Exclude<Parameters<typeof SimulationNS.marchingCubes>[0], { distances: unknown }>;

/**
 * Load the REAL engine at runtime, bypassing webpack entirely.
 *
 * next.config.js aliases '@holoscript/engine' to an empty module in every
 * webpack layer (it is Node-heavy and must not reach client bundles), and
 * Next's ESM-external interop wraps even exempted externals in a proxy whose
 * namespace members are unusable. `webpackIgnore` leaves this dynamic import
 * untouched, so Node resolves the actual package at request time — same path
 * as a plain `node --input-type=module` import. Engine code only ever runs
 * server-side here; the client receives plain JSON.
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

// ── Input validation ─────────────────────────────────────────────────────────

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

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  // Validate sdf
  if (!isSDFNode(raw['sdf'])) {
    return NextResponse.json(
      { error: '`sdf` must be an SDFNode object with a `type` string field' },
      { status: 400 }
    );
  }
  const sdf = raw['sdf'] as SDFNode;

  // Validate resolution
  let resolution = DEFAULT_RESOLUTION;
  if (raw['resolution'] !== undefined) {
    if (!isResolution(raw['resolution'])) {
      return NextResponse.json(
        {
          error: '`resolution` must be an array of 3 integers each >= 2',
        },
        { status: 400 }
      );
    }
    const r = raw['resolution'] as [number, number, number];
    // Clamp to max
    resolution = [
      Math.min(r[0], MAX_RESOLUTION_PER_AXIS),
      Math.min(r[1], MAX_RESOLUTION_PER_AXIS),
      Math.min(r[2], MAX_RESOLUTION_PER_AXIS),
    ];
  }

  // Validate bounds
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
    // Sanity: min < max on every axis
    for (let i = 0; i < 3; i++) {
      if (bounds.min[i] >= bounds.max[i]) {
        return NextResponse.json(
          { error: `bounds.min[${i}] must be strictly less than bounds.max[${i}]` },
          { status: 400 }
        );
      }
    }
  }

  let mechanicalTolerance: number | null = null;
  if (raw['mechanicalTolerance'] !== undefined) {
    if (!isFiniteNumber(raw['mechanicalTolerance']) || raw['mechanicalTolerance'] <= 0) {
      return NextResponse.json(
        { error: '`mechanicalTolerance` must be a positive finite number' },
        { status: 400 }
      );
    }
    mechanicalTolerance = raw['mechanicalTolerance'];
  }

  // Run marching cubes + printability analysis
  try {
    const Simulation = await loadSimulation();
    const mesh = Simulation.marchingCubes(sdf, { resolution, bounds });

    const printability = Simulation.analyzePrintability(mesh, { sdf });
    const precision = Simulation.estimateMarchingCubesTolerance({ resolution, bounds });
    const backendDecision = Simulation.decideManufacturingBackend({
      resolution,
      bounds,
      requestedTolerance: mechanicalTolerance,
    });

    // Convert typed arrays to plain number arrays for JSON serialization
    const positions = Array.from(mesh.vertices) as number[];
    const indices = Array.from(mesh.triangles) as number[];

    return NextResponse.json({ positions, indices, printability, precision, backendDecision });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Meshing failed: ${message}` }, { status: 400 });
  }
}
