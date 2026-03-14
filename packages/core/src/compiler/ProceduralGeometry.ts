/**
 * ProceduralGeometry — Shared procedural geometry generators.
 *
 * These functions generate BufferGeometry-compatible data (positions, normals, uvs, indices)
 * for advanced geometry types: metaball hulls, spline tubes, and lofted membranes.
 *
 * Used by both:
 *  - GLTFPipeline.ts (offline .glb compilation)
 *  - ProceduralMesh.tsx (live R3F rendering in Studio)
 */

// Import centralized math utilities
import { vec3NormalizeInPlace, vec3CrossArray, vec3SubArray, vec3ScaleArray } from '../math/vec3.js';

// =============================================================================
// TYPES
// =============================================================================

export interface GeometryData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array;
}

export interface BlobDef {
  center: number[];
  radius: number[];
}

/**
 * Level of Detail preset for procedural geometry generation.
 *  - 'low'    : Fast generation, minimal polygons. Good for distant objects or previews.
 *  - 'medium' : Balanced quality and performance. Default for most use cases.
 *  - 'high'   : Maximum quality. Best for close-up views and offline export.
 */
export type LODPreset = 'low' | 'medium' | 'high';

/** Resolved LOD parameters for each generator type. */
interface LODParams {
  hull: { resolution: number; boundsPadding: number };
  spline: { radialSegments: number; lengthSteps: number };
  membrane: { subdivisions: number };
}

const LOD_PRESETS: Record<LODPreset, LODParams> = {
  low: {
    hull: { resolution: 12, boundsPadding: 1.2 },
    spline: { radialSegments: 8, lengthSteps: 4 },
    membrane: { subdivisions: 3 },
  },
  medium: {
    hull: { resolution: 24, boundsPadding: 1.3 },
    spline: { radialSegments: 32, lengthSteps: 12 },
    membrane: { subdivisions: 8 },
  },
  high: {
    hull: { resolution: 48, boundsPadding: 1.4 },
    spline: { radialSegments: 64, lengthSteps: 24 },
    membrane: { subdivisions: 16 },
  },
};

// =============================================================================
// VECTOR MATH HELPERS
// =============================================================================

function catmullRom(p0: number[], p1: number[], p2: number[], p3: number[], t: number): number[] {
  const t2 = t * t;
  const t3 = t2 * t;
  const result: number[] = [];
  for (let i = 0; i < p0.length; i++) {
    result.push(
      0.5 *
        (2 * p1[i] +
          (-p0[i] + p2[i]) * t +
          (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
          (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3)
    );
  }
  return result;
}





// =============================================================================
// FALLBACK GENERATORS (minimal, for edge-case fallbacks)
// =============================================================================

function fallbackBox(): GeometryData {
  const s = 0.5;
  // 24 verts (4 per face × 6 faces)
  const positions = new Float32Array([
    // Front
    -s,
    -s,
    s,
    s,
    -s,
    s,
    s,
    s,
    s,
    -s,
    s,
    s,
    // Back
    s,
    -s,
    -s,
    -s,
    -s,
    -s,
    -s,
    s,
    -s,
    s,
    s,
    -s,
    // Top
    -s,
    s,
    s,
    s,
    s,
    s,
    s,
    s,
    -s,
    -s,
    s,
    -s,
    // Bottom
    -s,
    -s,
    -s,
    s,
    -s,
    -s,
    s,
    -s,
    s,
    -s,
    -s,
    s,
    // Right
    s,
    -s,
    s,
    s,
    -s,
    -s,
    s,
    s,
    -s,
    s,
    s,
    s,
    // Left
    -s,
    -s,
    -s,
    -s,
    -s,
    s,
    -s,
    s,
    s,
    -s,
    s,
    -s,
  ]);
  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0,
    1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ]);
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16,
    18, 19, 20, 21, 22, 20, 22, 23,
  ]);
  return { positions, normals, uvs, indices };
}

// =============================================================================
// SPLINE TUBE GENERATOR
// =============================================================================

/**
 * Generate a smooth tube mesh along a Catmull-Rom spline curve.
 *
 * @param lod - Optional LOD preset ('low' | 'medium' | 'high') that overrides
 *              radialSegments and lengthSteps with balanced defaults.
 */
export function generateSplineGeometry(
  points: number[][],
  radii: number[],
  radialSegments: number = 32,
  lengthSteps: number = 12,
  lod?: LODPreset
): GeometryData {
  if (lod) {
    const preset = LOD_PRESETS[lod].spline;
    radialSegments = preset.radialSegments;
    lengthSteps = preset.lengthSteps;
  }
  if (points.length < 2) return fallbackBox();

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const pathPoints: number[][] = [];
  const pathRadii: number[] = [];
  const numSegments = points.length - 1;

  for (let seg = 0; seg < numSegments; seg++) {
    const p0 = points[Math.max(0, seg - 1)];
    const p1 = points[seg];
    const p2 = points[Math.min(points.length - 1, seg + 1)];
    const p3 = points[Math.min(points.length - 1, seg + 2)];
    const r1 = radii[seg] ?? radii[radii.length - 1] ?? 0.1;
    const r2 = radii[seg + 1] ?? radii[radii.length - 1] ?? 0.1;

    const steps = seg === numSegments - 1 ? lengthSteps + 1 : lengthSteps;
    for (let i = 0; i < steps; i++) {
      const t = i / lengthSteps;
      pathPoints.push(catmullRom(p0, p1, p2, p3, t));
      pathRadii.push(r1 + (r2 - r1) * t);
    }
  }

  const totalRings = pathPoints.length;
  let prevNormal: number[] = [0, 0, 0];

  for (let ring = 0; ring < totalRings; ring++) {
    const p = pathPoints[ring];
    const radius = pathRadii[ring];
    const v = ring / (totalRings - 1);

    let tangent: number[];
    if (ring === 0) {
      tangent = vec3SubArray(pathPoints[1], pathPoints[0]);
    } else if (ring === totalRings - 1) {
      tangent = vec3SubArray(pathPoints[totalRings - 1], pathPoints[totalRings - 2]);
    } else {
      tangent = vec3SubArray(pathPoints[ring + 1], pathPoints[ring - 1]);
    }
    vec3NormalizeInPlace(tangent);

    let normal: number[];
    let binormal: number[];
    if (ring === 0) {
      if (Math.abs(tangent[0]) < 0.9) {
        normal = vec3CrossArray(tangent, [1, 0, 0]);
      } else {
        normal = vec3CrossArray(tangent, [0, 1, 0]);
      }
      vec3NormalizeInPlace(normal);
      binormal = vec3CrossArray(tangent, normal);
      vec3NormalizeInPlace(binormal);
    } else {
      normal = vec3SubArray(
        prevNormal,
        vec3ScaleArray(
          tangent,
          prevNormal[0] * tangent[0] + prevNormal[1] * tangent[1] + prevNormal[2] * tangent[2]
        )
      );
      const nLen = vec3NormalizeInPlace(normal);
      if (nLen < 1e-6) normal = [...prevNormal];
      binormal = vec3CrossArray(tangent, normal);
      vec3NormalizeInPlace(binormal);
    }

    prevNormal = normal;

    for (let i = 0; i <= radialSegments; i++) {
      const u = i / radialSegments;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const nx = normal[0] * cosT + binormal[0] * sinT;
      const ny = normal[1] * cosT + binormal[1] * sinT;
      const nz = normal[2] * cosT + binormal[2] * sinT;

      positions.push(p[0] + nx * radius, p[1] + ny * radius, p[2] + nz * radius);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
    }
  }

  const ringVerts = radialSegments + 1;
  for (let ring = 0; ring < totalRings - 1; ring++) {
    for (let i = 0; i < radialSegments; i++) {
      const a = ring * ringVerts + i;
      const b = a + ringVerts;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  // End caps
  const startCenter = positions.length / 3;
  const sp = pathPoints[0];
  const startTangent = vec3Sub(pathPoints[1], pathPoints[0]);
  vec3Normalize(startTangent);
  positions.push(sp[0], sp[1], sp[2]);
  normals.push(-startTangent[0], -startTangent[1], -startTangent[2]);
  uvs.push(0.5, 0);
  for (let i = 0; i < radialSegments; i++) {
    indices.push(startCenter, i + 1, i);
  }

  const endCenter = positions.length / 3;
  const ep = pathPoints[totalRings - 1];
  const endTangent = vec3Sub(pathPoints[totalRings - 1], pathPoints[totalRings - 2]);
  vec3Normalize(endTangent);
  positions.push(ep[0], ep[1], ep[2]);
  normals.push(endTangent[0], endTangent[1], endTangent[2]);
  uvs.push(0.5, 1);
  const lastRingStart = (totalRings - 1) * ringVerts;
  for (let i = 0; i < radialSegments; i++) {
    indices.push(endCenter, lastRingStart + i, lastRingStart + i + 1);
  }

  const vertexCount = positions.length / 3;
  const IndexArrayType = vertexCount > 65535 ? Uint32Array : Uint16Array;

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new IndexArrayType(indices),
  };
}

// =============================================================================
// HULL / METABALL GENERATOR (Marching Cubes)
// =============================================================================

/** Marching Cubes edge table */
const MC_EDGE_TABLE = [
  0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c, 0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03,
  0xe09, 0xf00, 0x190, 0x99, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c, 0x99c, 0x895, 0xb9f, 0xa96,
  0xd9a, 0xc93, 0xf99, 0xe90, 0x230, 0x339, 0x33, 0x13a, 0x636, 0x73f, 0x435, 0x53c, 0xa3c, 0xb35,
  0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30, 0x3a0, 0x2a9, 0x1a3, 0xaa, 0x7a6, 0x6af, 0x5a5, 0x4ac,
  0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0, 0x460, 0x569, 0x663, 0x76a, 0x66, 0x16f,
  0x265, 0x36c, 0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60, 0x5f0, 0x4f9, 0x7f3, 0x6fa,
  0x1f6, 0xff, 0x3f5, 0x2fc, 0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0, 0x650, 0x759,
  0x453, 0x55a, 0x256, 0x35f, 0x55, 0x15c, 0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
  0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc, 0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3,
  0x9c9, 0x8c0, 0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc, 0xcc, 0x1c5, 0x2cf, 0x3c6,
  0x4ca, 0x5c3, 0x6c9, 0x7c0, 0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c, 0x15c, 0x55,
  0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650, 0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
  0x2fc, 0x3f5, 0xff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0, 0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f,
  0xd65, 0xc6c, 0x36c, 0x265, 0x16f, 0x66, 0x76a, 0x663, 0x569, 0x460, 0xca0, 0xda9, 0xea3, 0xfaa,
  0x8a6, 0x9af, 0xaa5, 0xbac, 0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa, 0x1a3, 0x2a9, 0x3a0, 0xd30, 0xc39,
  0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c, 0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33, 0x339, 0x230,
  0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c, 0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393,
  0x99, 0x190, 0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c, 0x70c, 0x605, 0x50f, 0x406,
  0x30a, 0x203, 0x109, 0x0,
];

/**
 * Marching Cubes tri table — full 256-entry lookup.
 * Each row lists edge indices forming triangles for that cube case. -1 = terminator.
 * Standard Lorensen & Cline table.
 */
const MC_TRI_TABLE: number[][] = [
  [-1],
  [0, 8, 3, -1],
  [0, 1, 9, -1],
  [1, 8, 3, 9, 8, 1, -1],
  [1, 2, 10, -1],
  [0, 8, 3, 1, 2, 10, -1],
  [9, 2, 10, 0, 2, 9, -1],
  [2, 8, 3, 2, 10, 8, 10, 9, 8, -1],
  [3, 11, 2, -1],
  [0, 11, 2, 8, 11, 0, -1],
  [1, 9, 0, 2, 3, 11, -1],
  [1, 11, 2, 1, 9, 11, 9, 8, 11, -1],
  [3, 10, 1, 11, 10, 3, -1],
  [0, 10, 1, 0, 8, 10, 8, 11, 10, -1],
  [3, 9, 0, 3, 11, 9, 11, 10, 9, -1],
  [9, 8, 10, 10, 8, 11, -1],
  [4, 7, 8, -1],
  [4, 3, 0, 7, 3, 4, -1],
  [0, 1, 9, 8, 4, 7, -1],
  [4, 1, 9, 4, 7, 1, 7, 3, 1, -1],
  [1, 2, 10, 8, 4, 7, -1],
  [3, 4, 7, 3, 0, 4, 1, 2, 10, -1],
  [9, 2, 10, 9, 0, 2, 8, 4, 7, -1],
  [2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4, -1],
  [8, 4, 7, 3, 11, 2, -1],
  [11, 4, 7, 11, 2, 4, 2, 0, 4, -1],
  [9, 0, 1, 8, 4, 7, 2, 3, 11, -1],
  [4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1, -1],
  [3, 10, 1, 3, 11, 10, 7, 8, 4, -1],
  [1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4, -1],
  [4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3, -1],
  [4, 7, 11, 4, 11, 9, 9, 11, 10, -1],
  [9, 5, 4, -1],
  [9, 5, 4, 0, 8, 3, -1],
  [0, 5, 4, 1, 5, 0, -1],
  [8, 5, 4, 8, 3, 5, 3, 1, 5, -1],
  [1, 2, 10, 9, 5, 4, -1],
  [3, 0, 8, 1, 2, 10, 4, 9, 5, -1],
  [5, 2, 10, 5, 4, 2, 4, 0, 2, -1],
  [2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8, -1],
  [9, 5, 4, 2, 3, 11, -1],
  [0, 11, 2, 0, 8, 11, 4, 9, 5, -1],
  [0, 5, 4, 0, 1, 5, 2, 3, 11, -1],
  [2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5, -1],
  [10, 3, 11, 10, 1, 3, 9, 5, 4, -1],
  [4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10, -1],
  [5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3, -1],
  [5, 4, 8, 5, 8, 10, 10, 8, 11, -1],
  [9, 7, 8, 5, 7, 9, -1],
  [9, 3, 0, 9, 5, 3, 5, 7, 3, -1],
  [0, 7, 8, 0, 1, 7, 1, 5, 7, -1],
  [1, 5, 3, 3, 5, 7, -1],
  [9, 7, 8, 9, 5, 7, 10, 1, 2, -1],
  [10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3, -1],
  [8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2, -1],
  [2, 10, 5, 2, 5, 3, 3, 5, 7, -1],
  [7, 9, 5, 7, 8, 9, 3, 11, 2, -1],
  [9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11, -1],
  [2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7, -1],
  [11, 2, 1, 11, 1, 7, 7, 1, 5, -1],
  [9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11, -1],
  [5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0, -1],
  [11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0, -1],
  [11, 10, 5, 7, 11, 5, -1],
  [10, 6, 5, -1],
  [0, 8, 3, 5, 10, 6, -1],
  [9, 0, 1, 5, 10, 6, -1],
  [1, 8, 3, 1, 9, 8, 5, 10, 6, -1],
  [1, 6, 5, 2, 6, 1, -1],
  [1, 6, 5, 1, 2, 6, 3, 0, 8, -1],
  [9, 6, 5, 9, 0, 6, 0, 2, 6, -1],
  [5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8, -1],
  [2, 3, 11, 10, 6, 5, -1],
  [11, 0, 8, 11, 2, 0, 10, 6, 5, -1],
  [0, 1, 9, 2, 3, 11, 5, 10, 6, -1],
  [5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11, -1],
  [6, 3, 11, 6, 5, 3, 5, 1, 3, -1],
  [0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6, -1],
  [3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9, -1],
  [6, 5, 9, 6, 9, 11, 11, 9, 8, -1],
  [5, 10, 6, 4, 7, 8, -1],
  [4, 3, 0, 4, 7, 3, 6, 5, 10, -1],
  [1, 9, 0, 5, 10, 6, 8, 4, 7, -1],
  [10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4, -1],
  [6, 1, 2, 6, 5, 1, 4, 7, 8, -1],
  [1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7, -1],
  [8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6, -1],
  [7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9, -1],
  [3, 11, 2, 7, 8, 4, 10, 6, 5, -1],
  [5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11, -1],
  [0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6, -1],
  [9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6, -1],
  [8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6, -1],
  [5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11, -1],
  [0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7, -1],
  [6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9, -1],
  [10, 4, 9, 6, 4, 10, -1],
  [4, 10, 6, 4, 9, 10, 0, 8, 3, -1],
  [10, 0, 1, 10, 6, 0, 6, 4, 0, -1],
  [8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10, -1],
  [1, 4, 9, 1, 2, 4, 2, 6, 4, -1],
  [3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4, -1],
  [0, 2, 4, 4, 2, 6, -1],
  [8, 3, 2, 8, 2, 4, 4, 2, 6, -1],
  [10, 4, 9, 10, 6, 4, 11, 2, 3, -1],
  [0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6, -1],
  [3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10, -1],
  [6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1, -1],
  [9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3, -1],
  [8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1, -1],
  [3, 11, 6, 3, 6, 0, 0, 6, 4, -1],
  [6, 4, 8, 11, 6, 8, -1],
  [7, 10, 6, 7, 8, 10, 8, 9, 10, -1],
  [0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10, -1],
  [10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0, -1],
  [10, 6, 7, 10, 7, 1, 1, 7, 3, -1],
  [1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7, -1],
  [2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9, -1],
  [7, 8, 0, 7, 0, 6, 6, 0, 2, -1],
  [7, 3, 2, 6, 7, 2, -1],
  [2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7, -1],
  [2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7, -1],
  [1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11, -1],
  [11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1, -1],
  [8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6, -1],
  [0, 9, 1, 11, 6, 7, -1],
  [7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0, -1],
  [7, 11, 6, -1],
  [7, 6, 11, -1],
  [3, 0, 8, 11, 7, 6, -1],
  [0, 1, 9, 11, 7, 6, -1],
  [8, 1, 9, 8, 3, 1, 11, 7, 6, -1],
  [10, 1, 2, 6, 11, 7, -1],
  [1, 2, 10, 3, 0, 8, 6, 11, 7, -1],
  [2, 9, 0, 2, 10, 9, 6, 11, 7, -1],
  [6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8, -1],
  [7, 2, 3, 6, 2, 7, -1],
  [7, 0, 8, 7, 6, 0, 6, 2, 0, -1],
  [2, 7, 6, 2, 3, 7, 0, 1, 9, -1],
  [1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6, -1],
  [10, 7, 6, 10, 1, 7, 1, 3, 7, -1],
  [10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8, -1],
  [0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7, -1],
  [7, 6, 10, 7, 10, 8, 8, 10, 9, -1],
  [6, 8, 4, 11, 8, 6, -1],
  [3, 6, 11, 3, 0, 6, 0, 4, 6, -1],
  [8, 6, 11, 8, 4, 6, 9, 0, 1, -1],
  [9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6, -1],
  [6, 8, 4, 6, 11, 8, 2, 10, 1, -1],
  [1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6, -1],
  [4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9, -1],
  [10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3, -1],
  [8, 2, 3, 8, 4, 2, 4, 6, 2, -1],
  [0, 4, 2, 4, 6, 2, -1],
  [1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8, -1],
  [1, 9, 4, 1, 4, 2, 2, 4, 6, -1],
  [8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1, -1],
  [10, 1, 0, 10, 0, 6, 6, 0, 4, -1],
  [4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3, -1],
  [10, 9, 4, 6, 10, 4, -1],
  [4, 9, 5, 7, 6, 11, -1],
  [0, 8, 3, 4, 9, 5, 11, 7, 6, -1],
  [5, 0, 1, 5, 4, 0, 7, 6, 11, -1],
  [11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5, -1],
  [9, 5, 4, 10, 1, 2, 7, 6, 11, -1],
  [6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5, -1],
  [7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2, -1],
  [3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6, -1],
  [7, 2, 3, 7, 6, 2, 5, 4, 9, -1],
  [9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7, -1],
  [3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0, -1],
  [6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8, -1],
  [9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7, -1],
  [1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4, -1],
  [4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10, -1],
  [7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10, -1],
  [6, 9, 5, 6, 11, 9, 11, 8, 9, -1],
  [3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5, -1],
  [0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11, -1],
  [6, 11, 3, 6, 3, 5, 5, 3, 1, -1],
  [1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6, -1],
  [0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10, -1],
  [11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5, -1],
  [6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3, -1],
  [5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2, -1],
  [9, 5, 6, 9, 6, 0, 0, 6, 2, -1],
  [1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8, -1],
  [1, 5, 6, 2, 1, 6, -1],
  [1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6, -1],
  [10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0, -1],
  [0, 3, 8, 5, 6, 10, -1],
  [10, 5, 6, -1],
  [11, 5, 10, 7, 5, 11, -1],
  [11, 5, 10, 11, 7, 5, 8, 3, 0, -1],
  [5, 11, 7, 5, 10, 11, 1, 9, 0, -1],
  [10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1, -1],
  [11, 1, 2, 11, 7, 1, 7, 5, 1, -1],
  [0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11, -1],
  [9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7, -1],
  [7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2, -1],
  [2, 5, 10, 2, 3, 5, 3, 7, 5, -1],
  [8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5, -1],
  [9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2, -1],
  [9, 8, 2, 9, 2, 1, 8, 7, 2, 10, 2, 5, 7, 5, 2, -1],
  [1, 3, 5, 3, 7, 5, -1],
  [0, 8, 7, 0, 7, 1, 1, 7, 5, -1],
  [9, 0, 3, 9, 3, 5, 5, 3, 7, -1],
  [9, 8, 7, 5, 9, 7, -1],
  [5, 8, 4, 5, 10, 8, 10, 11, 8, -1],
  [5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0, -1],
  [0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5, -1],
  [10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4, -1],
  [2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8, -1],
  [0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11, -1],
  [0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5, -1],
  [9, 4, 5, 2, 11, 3, -1],
  [2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4, -1],
  [5, 10, 2, 5, 2, 4, 4, 2, 0, -1],
  [3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9, -1],
  [5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2, -1],
  [8, 4, 5, 8, 5, 3, 3, 5, 1, -1],
  [0, 4, 5, 1, 0, 5, -1],
  [8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5, -1],
  [9, 4, 5, -1],
  [4, 11, 7, 4, 9, 11, 9, 10, 11, -1],
  [0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11, -1],
  [1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11, -1],
  [3, 1, 4, 3, 4, 8, 1, 10, 4, 7, 4, 11, 10, 11, 4, -1],
  [4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2, -1],
  [9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3, -1],
  [11, 7, 4, 11, 4, 2, 2, 4, 0, -1],
  [11, 7, 4, 11, 4, 2, 8, 3, 4, 3, 2, 4, -1],
  [2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9, -1],
  [9, 10, 7, 9, 7, 4, 10, 2, 7, 0, 7, 8, 2, 8, 7, -1],
  [3, 7, 10, 3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10, -1],
  [1, 10, 2, 8, 7, 4, -1],
  [4, 9, 1, 4, 1, 7, 7, 1, 3, -1],
  [4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1, -1],
  [4, 0, 3, 7, 4, 3, -1],
  [4, 8, 7, -1],
  [9, 10, 8, 10, 11, 8, -1],
  [3, 0, 9, 3, 9, 11, 11, 9, 10, -1],
  [0, 1, 10, 0, 10, 8, 8, 10, 11, -1],
  [3, 1, 10, 11, 3, 10, -1],
  [1, 2, 11, 1, 11, 9, 9, 11, 8, -1],
  [3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9, -1],
  [0, 2, 11, 8, 0, 11, -1],
  [3, 2, 11, -1],
  [2, 3, 8, 2, 8, 10, 10, 8, 9, -1],
  [9, 10, 2, 0, 9, 2, -1],
  [2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8, -1],
  [1, 10, 2, -1],
  [1, 3, 8, 9, 1, 8, -1],
  [0, 9, 1, -1],
  [0, 3, 8, -1],
  [-1],
];

/**
 * Generate a smooth organic hull from blended sphere fields (metaballs).
 *
 * @param lod - Optional LOD preset ('low' | 'medium' | 'high') that overrides
 *              resolution with balanced defaults and adjusts bounds padding.
 */
export function generateHullGeometry(
  blobs: BlobDef[],
  resolution: number = 24,
  threshold: number = 1.0,
  lod?: LODPreset
): GeometryData {
  if (blobs.length === 0) return fallbackBox();

  const boundsPadding = lod ? LOD_PRESETS[lod].hull.boundsPadding : 1.3;
  if (lod) {
    const preset = LOD_PRESETS[lod].hull;
    resolution = preset.resolution;
  }

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const b of blobs) {
    minX = Math.min(minX, b.center[0] - b.radius[0] * boundsPadding);
    minY = Math.min(minY, b.center[1] - b.radius[1] * boundsPadding);
    minZ = Math.min(minZ, b.center[2] - b.radius[2] * boundsPadding);
    maxX = Math.max(maxX, b.center[0] + b.radius[0] * boundsPadding);
    maxY = Math.max(maxY, b.center[1] + b.radius[1] * boundsPadding);
    maxZ = Math.max(maxZ, b.center[2] + b.radius[2] * boundsPadding);
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  function evalField(x: number, y: number, z: number): number {
    let sum = 0;
    for (const b of blobs) {
      const dx = (x - b.center[0]) / b.radius[0];
      const dy = (y - b.center[1]) / b.radius[1];
      const dz = (z - b.center[2]) / b.radius[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 0.001) sum += 1.0 / d2;
    }
    return sum;
  }

  function evalGradient(x: number, y: number, z: number, eps: number = 0.01): number[] {
    return [
      evalField(x + eps, y, z) - evalField(x - eps, y, z),
      evalField(x, y + eps, z) - evalField(x, y - eps, z),
      evalField(x, y, z + eps) - evalField(x, y, z - eps),
    ];
  }

  const nx = resolution,
    ny = resolution,
    nz = resolution;
  const dx = (maxX - minX) / nx;
  const dy = (maxY - minY) / ny;
  const dz = (maxZ - minZ) / nz;

  const field = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  const idx3 = (ix: number, iy: number, iz: number) => ix + (nx + 1) * (iy + (ny + 1) * iz);

  for (let iz = 0; iz <= nz; iz++) {
    for (let iy = 0; iy <= ny; iy++) {
      for (let ix = 0; ix <= nx; ix++) {
        field[idx3(ix, iy, iz)] = evalField(minX + ix * dx, minY + iy * dy, minZ + iz * dz);
      }
    }
  }

  const vertexMap = new Map<string, number>();

  // Grid stride for collision-free vertex deduplication keys
  const gridStride = nx + 1;
  const gridSlice = gridStride * (ny + 1);

  function interpVertex(
    ix1: number,
    iy1: number,
    iz1: number,
    v1: number,
    ix2: number,
    iy2: number,
    iz2: number,
    v2: number
  ): number {
    // Use grid-dimension-aware keys to prevent collisions at high resolutions
    const k1 = ix1 + iy1 * gridStride + iz1 * gridSlice;
    const k2 = ix2 + iy2 * gridStride + iz2 * gridSlice;
    const key = k1 < k2 ? `${k1}_${k2}` : `${k2}_${k1}`;
    if (vertexMap.has(key)) return vertexMap.get(key)!;

    // Clamp interpolation factor to [0, 1] for robustness near field boundaries
    const dv = v2 - v1;
    const t = Math.abs(dv) < 1e-10 ? 0.5 : Math.max(0, Math.min(1, (threshold - v1) / dv));
    const x = minX + (ix1 + t * (ix2 - ix1)) * dx;
    const y = minY + (iy1 + t * (iy2 - iy1)) * dy;
    const z = minZ + (iz1 + t * (iz2 - iz1)) * dz;

    // Adaptive gradient epsilon scaled to voxel size for better normals
    const gradEps = Math.min(dx, dy, dz) * 0.5;
    const grad = evalGradient(x, y, z, gradEps);
    const n = [-grad[0], -grad[1], -grad[2]];
    vec3Normalize(n);

    const vertIdx = positions.length / 3;
    positions.push(x, y, z);
    normals.push(n[0], n[1], n[2]);
    uvs.push(
      0.5 + Math.atan2(n[2], n[0]) / (2 * Math.PI),
      0.5 - Math.asin(Math.max(-1, Math.min(1, n[1]))) / Math.PI
    );

    vertexMap.set(key, vertIdx);
    return vertIdx;
  }

  const edgeVerts: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];

  const cornerOffsets: [number, number, number][] = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ];

  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const cornerVals: number[] = [];
        const cornerCoords: [number, number, number][] = [];
        let cubeIndex = 0;

        for (let c = 0; c < 8; c++) {
          const cx = ix + cornerOffsets[c][0];
          const cy = iy + cornerOffsets[c][1];
          const cz = iz + cornerOffsets[c][2];
          const val = field[idx3(cx, cy, cz)];
          cornerVals.push(val);
          cornerCoords.push([cx, cy, cz]);
          if (val >= threshold) cubeIndex |= 1 << c;
        }

        const edges = MC_EDGE_TABLE[cubeIndex];
        if (edges === 0 || edges === undefined) continue;

        const edgeVertices: number[] = new Array(12).fill(-1);
        for (let e = 0; e < 12; e++) {
          if (edges & (1 << e)) {
            const [c1, c2] = edgeVerts[e];
            edgeVertices[e] = interpVertex(
              cornerCoords[c1][0],
              cornerCoords[c1][1],
              cornerCoords[c1][2],
              cornerVals[c1],
              cornerCoords[c2][0],
              cornerCoords[c2][1],
              cornerCoords[c2][2],
              cornerVals[c2]
            );
          }
        }

        // Use full MC_TRI_TABLE for proper triangulation
        const triRow = MC_TRI_TABLE[cubeIndex];
        if (triRow) {
          for (let t = 0; t < triRow.length; t += 3) {
            const e0 = triRow[t],
              e1 = triRow[t + 1],
              e2 = triRow[t + 2];
            if (e0 === -1) break;
            if (edgeVertices[e0] >= 0 && edgeVertices[e1] >= 0 && edgeVertices[e2] >= 0) {
              indices.push(edgeVertices[e0], edgeVertices[e1], edgeVertices[e2]);
            }
          }
        }
      }
    }
  }

  if (positions.length === 0) return fallbackBox();

  const vertexCount = positions.length / 3;
  const IndexArrayType = vertexCount > 65535 ? Uint32Array : Uint16Array;

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new IndexArrayType(indices),
  };
}

// =============================================================================
// LOFTED MEMBRANE GENERATOR
// =============================================================================

/**
 * Generate a smooth membrane mesh from anchor points.
 *
 * @param lod - Optional LOD preset ('low' | 'medium' | 'high') that overrides
 *              subdivisions with balanced defaults.
 */
export function generateMembraneGeometry(
  anchors: number[][],
  subdivisions: number = 8,
  bulge: number = 0.15,
  lod?: LODPreset
): GeometryData {
  if (lod) {
    subdivisions = LOD_PRESETS[lod].membrane.subdivisions;
  }
  if (anchors.length < 3) return fallbackBox();

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Compute center of anchors
  const center = [0, 0, 0];
  for (const a of anchors) {
    center[0] += a[0];
    center[1] += a[1];
    center[2] += a[2];
  }
  center[0] /= anchors.length;
  center[1] /= anchors.length;
  center[2] /= anchors.length;

  // Compute membrane normal (average of edge cross products)
  const memNormal = [0, 0, 0];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    const ca = vec3SubArray(a, center);
    const cb = vec3SubArray(b, center);
    const cross = vec3CrossArray(ca, cb);
    memNormal[0] += cross[0];
    memNormal[1] += cross[1];
    memNormal[2] += cross[2];
  }
  vec3NormalizeInPlace(memNormal);

  // Generate subdivided rings from center to edge
  const numAnchors = anchors.length;

  // Center vertex
  const centerIdx = 0;
  positions.push(
    center[0] + memNormal[0] * bulge,
    center[1] + memNormal[1] * bulge,
    center[2] + memNormal[2] * bulge
  );
  normals.push(memNormal[0], memNormal[1], memNormal[2]);
  uvs.push(0.5, 0.5);

  // Rings from center outward
  for (let ring = 1; ring <= subdivisions; ring++) {
    const t = ring / subdivisions;
    const ringBulge = bulge * (1 - t * t); // Parabolic falloff

    for (let seg = 0; seg < numAnchors; seg++) {
      const a0 = anchors[seg];
      const a1 = anchors[(seg + 1) % numAnchors];

      // Interpolate between center and edge
      const px = center[0] + (a0[0] - center[0]) * t;
      const py = center[1] + (a0[1] - center[1]) * t;
      const pz = center[2] + (a0[2] - center[2]) * t;

      positions.push(
        px + memNormal[0] * ringBulge,
        py + memNormal[1] * ringBulge,
        pz + memNormal[2] * ringBulge
      );

      // Compute normal with bulge consideration
      const dx = px - center[0];
      const dy = py - center[1];
      const dz = pz - center[2];
      const n = [
        memNormal[0] + dx * bulge * 0.5,
        memNormal[1] + dy * bulge * 0.5,
        memNormal[2] + dz * bulge * 0.5,
      ];
      vec3NormalizeInPlace(n);
      normals.push(n[0], n[1], n[2]);

      // UV
      const angle = (seg / numAnchors) * Math.PI * 2;
      uvs.push(0.5 + t * 0.5 * Math.cos(angle), 0.5 + t * 0.5 * Math.sin(angle));
    }
  }

  // Generate indices
  // Inner fan (center to first ring)
  for (let i = 0; i < numAnchors; i++) {
    const next = (i + 1) % numAnchors;
    indices.push(centerIdx, 1 + i, 1 + next);
  }

  // Rings
  for (let ring = 1; ring < subdivisions; ring++) {
    const ringStart = 1 + (ring - 1) * numAnchors;
    const nextRingStart = 1 + ring * numAnchors;

    for (let i = 0; i < numAnchors; i++) {
      const next = (i + 1) % numAnchors;
      indices.push(ringStart + i, nextRingStart + i, nextRingStart + next);
      indices.push(ringStart + i, nextRingStart + next, ringStart + next);
    }
  }

  // Double-sided: add reversed triangles
  const triCount = indices.length;
  for (let i = 0; i < triCount; i += 3) {
    indices.push(indices[i], indices[i + 2], indices[i + 1]);
  }

  const vertexCount = positions.length / 3;
  const IndexArrayType = vertexCount > 65535 ? Uint32Array : Uint16Array;

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new IndexArrayType(indices),
  };
}
