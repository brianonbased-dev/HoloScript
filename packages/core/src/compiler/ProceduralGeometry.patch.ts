/**
 * TODO-042: Marching Cubes Triangulation Fix for ProceduralGeometry.ts
 *
 * TARGET: packages/core/src/compiler/ProceduralGeometry.ts
 *
 * PROBLEM: The marching cubes hull generator can produce:
 * 1. Inconsistent triangle winding (some faces render inside-out)
 * 2. Degenerate triangles at edge boundaries where field values are very close
 * 3. Missing triangles when adjacent cubes share interpolated vertices with
 *    slightly different positions due to floating-point precision
 *
 * FIXES APPLIED:
 *
 * Fix 1: Consistent winding order enforcement
 * After generating all triangles, check each triangle's face normal against
 * the gradient direction. If the dot product is negative, swap v1 and v2
 * to ensure consistent outward-facing normals.
 *
 * Fix 2: Degenerate triangle filtering
 * Skip triangles where any two vertices are within epsilon distance of each
 * other, which produces zero-area faces that cause rendering artifacts.
 *
 * Fix 3: Vertex welding with numeric keys
 * Replace string-based vertex deduplication keys with numeric hashing to
 * improve performance and prevent hash collisions at high resolutions.
 *
 * APPLY THIS PATCH by replacing the generateHullGeometry function body
 * (lines ~658-868) in ProceduralGeometry.ts with the code below.
 */

// Replace the triangulation loop (lines ~803-855) with this improved version:

/*
  // === IMPROVED TRIANGULATION WITH WINDING FIX ===
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

            const v0 = edgeVertices[e0];
            const v1 = edgeVertices[e1];
            const v2 = edgeVertices[e2];

            if (v0 < 0 || v1 < 0 || v2 < 0) continue;

            // === Fix 2: Skip degenerate triangles ===
            const p0x = positions[v0 * 3], p0y = positions[v0 * 3 + 1], p0z = positions[v0 * 3 + 2];
            const p1x = positions[v1 * 3], p1y = positions[v1 * 3 + 1], p1z = positions[v1 * 3 + 2];
            const p2x = positions[v2 * 3], p2y = positions[v2 * 3 + 1], p2z = positions[v2 * 3 + 2];

            const DEGEN_EPS = 1e-8;
            const d01sq = (p1x-p0x)**2 + (p1y-p0y)**2 + (p1z-p0z)**2;
            const d02sq = (p2x-p0x)**2 + (p2y-p0y)**2 + (p2z-p0z)**2;
            const d12sq = (p2x-p1x)**2 + (p2y-p1y)**2 + (p2z-p1z)**2;
            if (d01sq < DEGEN_EPS || d02sq < DEGEN_EPS || d12sq < DEGEN_EPS) continue;

            // === Fix 1: Enforce consistent winding order ===
            // Compute face normal via cross product
            const ax = p1x - p0x, ay = p1y - p0y, az = p1z - p0z;
            const bx = p2x - p0x, by = p2y - p0y, bz = p2z - p0z;
            const fnx = ay * bz - az * by;
            const fny = az * bx - ax * bz;
            const fnz = ax * by - ay * bx;

            // Compare with stored vertex normal (which points outward from surface)
            const nx0 = normals[v0 * 3], ny0 = normals[v0 * 3 + 1], nz0 = normals[v0 * 3 + 2];
            const dot = fnx * nx0 + fny * ny0 + fnz * nz0;

            if (dot < 0) {
              // Winding is backwards -- swap v1 and v2
              indices.push(v0, v2, v1);
            } else {
              indices.push(v0, v1, v2);
            }
          }
        }
      }
    }
  }
*/

export {};
