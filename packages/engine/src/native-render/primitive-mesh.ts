/**
 * primitive-mesh — CPU geometry generation for the native render path (D.083, task 2h3s, Inc 1).
 *
 * The pre-mortem confirmed the engine has NO primitive→mesh generator. This is that piece:
 * pure CPU math (positions + indices), zero GPU, zero foreign-engine deps — fully
 * headless-unit-testable. The GPU backend uploads these to GPUBuffers; this module never
 * touches a device. Centered at the origin; unit extents (cube/plane = ±0.5, sphere r=0.5).
 */

import type { GeometryKind } from './draw-spec';

export interface PrimitiveMesh {
  /** Interleaved is avoided for clarity: flat XYZ positions, 3 floats per vertex. */
  positions: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
  vertexCount: number;
}

/** Unit cube centered at origin, half-extent 0.5 — 8 corner verts, 12 triangles. */
function cube(): PrimitiveMesh {
  const h = 0.5;
  const positions = new Float32Array([
    -h,
    -h,
    -h,
    h,
    -h,
    -h,
    h,
    h,
    -h,
    -h,
    h,
    -h, // back  (z = -h): 0,1,2,3
    -h,
    -h,
    h,
    h,
    -h,
    h,
    h,
    h,
    h,
    -h,
    h,
    h, // front (z = +h): 4,5,6,7
  ]);
  const indices = new Uint32Array([
    4,
    5,
    6,
    4,
    6,
    7, // front
    1,
    0,
    3,
    1,
    3,
    2, // back
    0,
    4,
    7,
    0,
    7,
    3, // left
    5,
    1,
    2,
    5,
    2,
    6, // right
    3,
    7,
    6,
    3,
    6,
    2, // top
    0,
    1,
    5,
    0,
    5,
    4, // bottom
  ]);
  return { positions, indices, vertexCount: positions.length / 3 };
}

/** Unit plane on the XZ plane (y = 0), extent ±0.5 — 4 verts, 2 triangles. */
function plane(): PrimitiveMesh {
  const h = 0.5;
  const positions = new Float32Array([-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
  return { positions, indices, vertexCount: 4 };
}

/** UV sphere, radius 0.5. Segments default 16x12. */
function sphere(params?: Record<string, number>): PrimitiveMesh {
  const r = 0.5;
  const lon = Math.max(3, Math.floor(params?.segments ?? 16));
  const lat = Math.max(2, Math.floor(params?.rings ?? 12));
  const pos: number[] = [];
  for (let y = 0; y <= lat; y++) {
    const v = y / lat;
    const theta = v * Math.PI; // 0..pi
    const sinT = Math.sin(theta),
      cosT = Math.cos(theta);
    for (let x = 0; x <= lon; x++) {
      const u = x / lon;
      const phi = u * Math.PI * 2; // 0..2pi
      pos.push(r * Math.cos(phi) * sinT, r * cosT, r * Math.sin(phi) * sinT);
    }
  }
  const idx: number[] = [];
  const stride = lon + 1;
  for (let y = 0; y < lat; y++) {
    for (let x = 0; x < lon; x++) {
      const a = y * stride + x;
      const b = a + stride;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return {
    positions: new Float32Array(pos),
    indices: new Uint32Array(idx),
    vertexCount: pos.length / 3,
  };
}

/**
 * Generate a primitive mesh for a geometry kind. Unsupported/unknown kinds fall back to a
 * cube (a visible placeholder is better than a missing draw — and it's logged-by-shape via
 * the returned kind in DrawSpec). `mesh` (asset geometry) is NOT handled here — it loads
 * externally; callers must branch on kind === 'mesh' before calling this.
 */
export function primitiveToMesh(
  kind: GeometryKind,
  params?: Record<string, number>
): PrimitiveMesh {
  switch (kind) {
    case 'cube':
      return cube();
    case 'plane':
      return plane();
    case 'sphere':
      return sphere(params);
    // cylinder/cone/torus/capsule: TODO — fall back to cube placeholder until built.
    default:
      return cube();
  }
}
