/**
 * STLExporter — Manufacturing-grade SurfaceMesh → STL serializer.
 *
 * Replaces the test-grade `buildSTL` in STLParser.ts, which writes zero normals.
 * This exporter computes correct unit face normals from vertex winding (right-hand rule).
 *
 * ## STL Binary Format (ISO/ASTM 52915 / de-facto standard)
 *
 *   80-byte ASCII header (caller-supplied or default constant)
 *   uint32 LE  — triangle count N
 *   N × 50 bytes per triangle:
 *     float32 LE × 3  — unit face normal (nx, ny, nz)
 *     float32 LE × 3  — vertex 0 (x0, y0, z0)
 *     float32 LE × 3  — vertex 1
 *     float32 LE × 3  — vertex 2
 *     uint16 LE       — attribute byte count (always 0 here)
 *
 * ## Normal Computation
 *
 *   Given vertices A, B, C in winding order:
 *     edge1 = B − A
 *     edge2 = C − A
 *     raw   = edge1 × edge2    (cross product, right-hand rule)
 *     normal = raw / |raw|     (unit vector)
 *
 *   For degenerate triangles (|raw| = 0), the STL spec does not forbid zero
 *   normals; we write (0, 0, 0) rather than NaN to remain spec-safe.
 *
 * ## Units
 *
 *   HoloScript geometry is unit-agnostic. STL consumers (slicers, CAM tools)
 *   conventionally interpret coordinates as millimeters. Use the `scale` option
 *   to convert from your working units to millimeters on write — e.g. if your
 *   scene is in metres, pass `scale: 1000`.
 *
 *   Vault rule G.GOLD.485: physical assumptions are config, never hardcoded.
 *   No unit conversion is applied without an explicit `scale` value.
 *
 * @see SurfaceMesh (AutoMesher.ts) — shared mesh contract
 * @see parseSTL (import/STLParser.ts) — round-trip parser
 */

import type { SurfaceMesh } from '../AutoMesher';

// ── Default header constant ───────────────────────────────────────────────────

/**
 * Default 80-byte STL header string. No wall-clock timestamp (deterministic).
 * Padded / truncated to exactly 80 bytes when written.
 */
const DEFAULT_HEADER = 'HoloScript STLExporter v1 — manufacturing-grade export';

// ── Options interfaces ────────────────────────────────────────────────────────

/**
 * Options for binary STL export.
 */
export interface STLBinaryOptions {
  /**
   * Text to write into the 80-byte header field.
   * Truncated to 79 characters + null if longer; zero-padded if shorter.
   * Default: a constant identifying string (no wall-clock timestamps).
   */
  header?: string;

  /**
   * Coordinate scale factor applied to all vertex positions on write.
   * Does NOT affect normals (direction vectors are scale-invariant).
   *
   * STL consumers conventionally expect millimeters. If your scene uses
   * metres, pass `scale: 1000`. If already in millimeters, omit or pass 1.
   * Default: 1 (no scaling).
   */
  scale?: number;
}

/**
 * Options for ASCII STL export.
 */
export interface STLAsciiOptions {
  /**
   * Solid name written on the `solid` / `endsolid` lines.
   * Default: 'HoloScriptMesh'.
   */
  name?: string;

  /**
   * Coordinate scale factor — same semantics as STLBinaryOptions.scale.
   * Default: 1 (no scaling).
   */
  scale?: number;

  /**
   * Number of decimal places for floating-point output.
   * Default: 6.
   */
  precision?: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Compute a unit face normal via the right-hand rule.
 * Returns [0, 0, 0] for degenerate (zero-area) triangles instead of NaN.
 *
 * edge1 = B − A,  edge2 = C − A,  normal = normalize(edge1 × edge2)
 */
function computeNormal(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number
): [number, number, number] {
  // edge1 = B − A
  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;

  // edge2 = C − A
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;

  // cross product (right-hand rule)
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;

  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

  // Degenerate triangle: return zero normal per STL spec convention
  if (len === 0) return [0, 0, 0];

  return [nx / len, ny / len, nz / len];
}

/**
 * Validate mesh integrity: indices in range, vertices finite.
 * Throws a descriptive error on the first violation found.
 */
function validateMesh(mesh: SurfaceMesh): void {
  const vertexCount = mesh.vertices.length / 3;
  const triCount = mesh.triangles.length / 3;

  if (mesh.triangles.length % 3 !== 0) {
    throw new Error(
      `STLExporter: triangles array length (${mesh.triangles.length}) is not a multiple of 3`
    );
  }

  if (mesh.vertices.length % 3 !== 0) {
    throw new Error(
      `STLExporter: vertices array length (${mesh.vertices.length}) is not a multiple of 3`
    );
  }

  // Check vertex finiteness
  for (let i = 0; i < mesh.vertices.length; i++) {
    if (!Number.isFinite(mesh.vertices[i])) {
      throw new Error(
        `STLExporter: non-finite value at vertices[${i}] (${mesh.vertices[i]})`
      );
    }
  }

  // Check triangle index bounds
  for (let t = 0; t < triCount; t++) {
    for (let v = 0; v < 3; v++) {
      const idx = mesh.triangles[t * 3 + v];
      if (idx >= vertexCount) {
        throw new Error(
          `STLExporter: triangle ${t} vertex ${v} index ${idx} out of range ` +
          `(vertex count: ${vertexCount})`
        );
      }
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Export a SurfaceMesh to a binary STL ArrayBuffer.
 *
 * Format: little-endian, 80-byte header + uint32 count + N × 50-byte records.
 * Normals are computed from vertex winding (right-hand rule); the zero-normal
 * degenerate fallback is used when a triangle has zero area.
 *
 * @param mesh  Shared SurfaceMesh (vertices: Float64Array|Float32Array, triangles: Uint32Array)
 * @param opts  Optional header text and coordinate scale factor
 * @returns     ArrayBuffer containing a valid binary STL file
 *
 * @example
 * const buf = exportSTLBinary(myMesh, { scale: 1000 }); // metres → millimetres
 * fs.writeFileSync('part.stl', Buffer.from(buf));
 */
export function exportSTLBinary(
  mesh: SurfaceMesh,
  opts: STLBinaryOptions = {}
): ArrayBuffer {
  validateMesh(mesh);

  const scale = opts.scale ?? 1;
  const triCount = mesh.triangles.length / 3;

  // Allocate: 80-byte header + 4-byte count + N * 50-byte records
  const buf = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buf);

  // ── Header (80 bytes, null-padded) ──────────────────────────────────────────
  const headerText = opts.header ?? DEFAULT_HEADER;
  const headerBytes = new Uint8Array(buf, 0, 80);
  headerBytes.fill(0);
  const encoded = new TextEncoder().encode(headerText);
  const copyLen = Math.min(encoded.length, 80);
  for (let i = 0; i < copyLen; i++) {
    headerBytes[i] = encoded[i];
  }

  // ── Triangle count ──────────────────────────────────────────────────────────
  view.setUint32(80, triCount, /* littleEndian */ true);

  // ── Per-triangle records ────────────────────────────────────────────────────
  const verts = mesh.vertices;
  const tris = mesh.triangles;

  for (let t = 0; t < triCount; t++) {
    const i0 = tris[t * 3];
    const i1 = tris[t * 3 + 1];
    const i2 = tris[t * 3 + 2];

    const ax = verts[i0 * 3]     * scale;
    const ay = verts[i0 * 3 + 1] * scale;
    const az = verts[i0 * 3 + 2] * scale;
    const bx = verts[i1 * 3]     * scale;
    const by = verts[i1 * 3 + 1] * scale;
    const bz = verts[i1 * 3 + 2] * scale;
    const cx = verts[i2 * 3]     * scale;
    const cy = verts[i2 * 3 + 1] * scale;
    const cz = verts[i2 * 3 + 2] * scale;

    const [nx, ny, nz] = computeNormal(ax, ay, az, bx, by, bz, cx, cy, cz);

    const base = 84 + t * 50;

    // Normal (3 × f32)
    view.setFloat32(base,      nx, true);
    view.setFloat32(base +  4, ny, true);
    view.setFloat32(base +  8, nz, true);

    // Vertex 0 (3 × f32)
    view.setFloat32(base + 12, ax, true);
    view.setFloat32(base + 16, ay, true);
    view.setFloat32(base + 20, az, true);

    // Vertex 1 (3 × f32)
    view.setFloat32(base + 24, bx, true);
    view.setFloat32(base + 28, by, true);
    view.setFloat32(base + 32, bz, true);

    // Vertex 2 (3 × f32)
    view.setFloat32(base + 36, cx, true);
    view.setFloat32(base + 40, cy, true);
    view.setFloat32(base + 44, cz, true);

    // Attribute byte count (uint16, always 0)
    view.setUint16(base + 48, 0, true);
  }

  return buf;
}

/**
 * Export a SurfaceMesh to an ASCII STL string.
 *
 * Format: 'solid <name>' / 'endsolid <name>', with one facet block per triangle.
 * Normals are computed the same way as exportSTLBinary.
 *
 * @param mesh  Shared SurfaceMesh
 * @param opts  Optional solid name, scale factor, and decimal precision
 * @returns     ASCII STL string
 *
 * @example
 * const stl = exportSTLAscii(myMesh, { name: 'bracket', precision: 8 });
 * fs.writeFileSync('part.stl', stl);
 */
export function exportSTLAscii(
  mesh: SurfaceMesh,
  opts: STLAsciiOptions = {}
): string {
  validateMesh(mesh);

  const scale = opts.scale ?? 1;
  const name = opts.name ?? 'HoloScriptMesh';
  const precision = opts.precision ?? 6;
  const triCount = mesh.triangles.length / 3;

  const lines: string[] = [`solid ${name}`];

  const verts = mesh.vertices;
  const tris = mesh.triangles;

  for (let t = 0; t < triCount; t++) {
    const i0 = tris[t * 3];
    const i1 = tris[t * 3 + 1];
    const i2 = tris[t * 3 + 2];

    const ax = verts[i0 * 3]     * scale;
    const ay = verts[i0 * 3 + 1] * scale;
    const az = verts[i0 * 3 + 2] * scale;
    const bx = verts[i1 * 3]     * scale;
    const by = verts[i1 * 3 + 1] * scale;
    const bz = verts[i1 * 3 + 2] * scale;
    const cx = verts[i2 * 3]     * scale;
    const cy = verts[i2 * 3 + 1] * scale;
    const cz = verts[i2 * 3 + 2] * scale;

    const [nx, ny, nz] = computeNormal(ax, ay, az, bx, by, bz, cx, cy, cz);

    lines.push(
      `  facet normal ${nx.toFixed(precision)} ${ny.toFixed(precision)} ${nz.toFixed(precision)}`
    );
    lines.push('    outer loop');
    lines.push(`      vertex ${ax.toFixed(precision)} ${ay.toFixed(precision)} ${az.toFixed(precision)}`);
    lines.push(`      vertex ${bx.toFixed(precision)} ${by.toFixed(precision)} ${bz.toFixed(precision)}`);
    lines.push(`      vertex ${cx.toFixed(precision)} ${cy.toFixed(precision)} ${cz.toFixed(precision)}`);
    lines.push('    endloop');
    lines.push('  endfacet');
  }

  lines.push(`endsolid ${name}`);
  return lines.join('\n') + '\n';
}
