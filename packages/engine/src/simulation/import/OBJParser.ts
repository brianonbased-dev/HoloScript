/**
 * OBJParser — Parse Wavefront OBJ files into surface triangle meshes.
 *
 * Supports: v (vertices), f (faces — triangles and quads auto-triangulated).
 * Ignores: vn, vt, g, s, mtllib, usemtl (normals/textures/groups/materials).
 *
 * @see MeshImporter — pipes OBJ surface into AutoMesher.meshSurface()
 */

import type { SurfaceMesh } from '../AutoMesher';

/**
 * Parse a Wavefront OBJ string into a surface mesh.
 */
export function parseOBJ(text: string): SurfaceMesh {
  const vertices: number[] = [];
  const triIndices: number[] = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#') || line.length === 0) continue;

    const parts = line.split(/\s+/);
    const cmd = parts[0];

    if (cmd === 'v' && parts.length >= 4) {
      vertices.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (cmd === 'f' && parts.length >= 4) {
      // Face indices are 1-based, may contain v/vt/vn format
      const indices = parts.slice(1).map((p) => {
        const idx = parseInt(p.split('/')[0], 10);
        return idx > 0 ? idx - 1 : vertices.length / 3 + idx; // handle negative indices
      });

      // Triangulate fan: 0-1-2, 0-2-3, 0-3-4, ...
      for (let i = 1; i < indices.length - 1; i++) {
        triIndices.push(indices[0], indices[i], indices[i + 1]);
      }
    }
  }

  return {
    vertices: new Float64Array(vertices),
    triangles: new Uint32Array(triIndices),
  };
}
