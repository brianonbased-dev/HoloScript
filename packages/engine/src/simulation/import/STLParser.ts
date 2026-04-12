/**
 * STLParser — Parse binary and ASCII STL files into surface triangle meshes.
 *
 * STL (Stereolithography) is the most common format for 3D printing and CAD export.
 *
 * Binary format:
 *   - 80-byte header (ignored)
 *   - 4-byte uint32: triangle count
 *   - Per triangle (50 bytes): normal (3×f32) + 3 vertices (9×f32) + 2-byte attribute
 *
 * ASCII format:
 *   - "solid <name>" header
 *   - Per facet: "facet normal ...", "outer loop", 3× "vertex x y z", "endloop", "endfacet"
 *   - "endsolid"
 *
 * @see MeshImporter — pipes STL surface into AutoMesher.meshSurface()
 */

import type { SurfaceMesh } from '../AutoMesher';

/**
 * Parse an STL file (auto-detects binary vs ASCII).
 */
export function parseSTL(buffer: ArrayBuffer): SurfaceMesh {
  const bytes = new Uint8Array(buffer);

  // Heuristic: ASCII STL starts with "solid" (but binary can too if header starts with "solid")
  // Better heuristic: check if byte 80-83 (triangle count) makes sense for the file size
  if (isBinarySTL(buffer)) {
    return parseBinarySTL(buffer);
  }
  return parseASCIISTL(buffer);
}

function isBinarySTL(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 84) return false;

  const view = new DataView(buffer);
  const triCount = view.getUint32(80, true);
  const expectedSize = 84 + triCount * 50;

  // Binary if file size matches expected triangle count
  return Math.abs(buffer.byteLength - expectedSize) < 100;
}

function parseBinarySTL(buffer: ArrayBuffer): SurfaceMesh {
  const view = new DataView(buffer);
  const triCount = view.getUint32(80, true);

  const vertices = new Float64Array(triCount * 9); // 3 verts × 3 coords per triangle
  const triangles = new Uint32Array(triCount * 3);

  // Vertex deduplication via position key
  const vertMap = new Map<string, number>();
  const uniqueVerts: number[] = [];
  let nextIdx = 0;

  for (let t = 0; t < triCount; t++) {
    const base = 84 + t * 50;
    // Skip normal (12 bytes), read 3 vertices (36 bytes)
    for (let v = 0; v < 3; v++) {
      const off = base + 12 + v * 12;
      const x = view.getFloat32(off, true);
      const y = view.getFloat32(off + 4, true);
      const z = view.getFloat32(off + 8, true);

      // Deduplicate vertices
      const key = `${x.toFixed(6)}_${y.toFixed(6)}_${z.toFixed(6)}`;
      let idx = vertMap.get(key);
      if (idx === undefined) {
        idx = nextIdx++;
        vertMap.set(key, idx);
        uniqueVerts.push(x, y, z);
      }
      triangles[t * 3 + v] = idx;
    }
  }

  return {
    vertices: new Float64Array(uniqueVerts),
    triangles,
  };
}

function parseASCIISTL(buffer: ArrayBuffer): SurfaceMesh {
  const text = new TextDecoder().decode(buffer);
  const lines = text.split('\n');

  const vertMap = new Map<string, number>();
  const uniqueVerts: number[] = [];
  const triIndices: number[] = [];
  let nextIdx = 0;

  let vertexBuffer: number[] = [];

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith('vertex')) {
      const parts = line.split(/\s+/);
      const x = parseFloat(parts[1]);
      const y = parseFloat(parts[2]);
      const z = parseFloat(parts[3]);

      const key = `${x.toFixed(6)}_${y.toFixed(6)}_${z.toFixed(6)}`;
      let idx = vertMap.get(key);
      if (idx === undefined) {
        idx = nextIdx++;
        vertMap.set(key, idx);
        uniqueVerts.push(x, y, z);
      }
      vertexBuffer.push(idx);

      if (vertexBuffer.length === 3) {
        triIndices.push(vertexBuffer[0], vertexBuffer[1], vertexBuffer[2]);
        vertexBuffer = [];
      }
    }
  }

  return {
    vertices: new Float64Array(uniqueVerts),
    triangles: new Uint32Array(triIndices),
  };
}

/**
 * Build a minimal binary STL buffer (for testing).
 */
export function buildSTL(triangles: [number, number, number][][]): ArrayBuffer {
  const triCount = triangles.length;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);

  view.setUint32(80, triCount, true);

  for (let t = 0; t < triCount; t++) {
    const base = 84 + t * 50;
    // Zero normal
    for (let i = 0; i < 3; i++) view.setFloat32(base + i * 4, 0, true);
    // 3 vertices
    for (let v = 0; v < 3; v++) {
      view.setFloat32(base + 12 + v * 12, triangles[t][v][0], true);
      view.setFloat32(base + 12 + v * 12 + 4, triangles[t][v][1], true);
      view.setFloat32(base + 12 + v * 12 + 8, triangles[t][v][2], true);
    }
  }

  return buffer;
}
