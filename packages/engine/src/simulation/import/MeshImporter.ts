/**
 * MeshImporter — Unified facade for mesh file import.
 *
 * Detects format by file extension (or buffer heuristic), dispatches to the
 * appropriate parser, and optionally tetrahedralizes surface meshes via
 * AutoMesher.meshSurface().
 *
 * Supported formats (MVP):
 *   - STL (binary + ASCII)  → SurfaceMesh
 *   - OBJ (Wavefront)       → SurfaceMesh
 *   - GMSH 2.x ASCII (.msh) → TetMesh (volumetric, no surface step needed)
 *
 * @see AutoMesher.meshSurface — surface-to-volume tetrahedralization
 * @see STLParser, OBJParser, GmshParser — underlying parsers
 */

import type { SurfaceMesh, TetMesh, SurfaceMeshOptions } from '../AutoMesher';
import { meshSurface } from '../AutoMesher';
import { parseSTL } from './STLParser';
import { parseOBJ } from './OBJParser';
import { parseGmsh, MeshImportError } from './GmshParser';
import type { VTKUnstructuredResult } from './VTKImporter';

export { MeshImportError };

/** Detected or asserted mesh file format. */
export type MeshFormat = 'stl' | 'obj' | 'msh' | 'vtk' | 'unknown';

export interface ImportOptions extends Partial<SurfaceMeshOptions> {
  /**
   * For surface meshes (STL/OBJ), auto-tetrahedralize via meshSurface().
   * Default: true.
   */
  tetrahedralize?: boolean;
}

/** Result of a mesh import. Exactly one of tetMesh / surfaceMesh is present. */
export interface ImportedMesh {
  format: MeshFormat;
  /** Volumetric mesh (from GMSH direct, or STL/OBJ after meshSurface). */
  tetMesh?: TetMesh;
  /** Surface mesh (from STL/OBJ when tetrahedralize=false or meshSurface failed). */
  surfaceMesh?: SurfaceMesh;
  /** Raw unstructured result (from GMSH — carries point/cell data). */
  unstructured?: VTKUnstructuredResult;
}

/** Detect format from a path string or buffer header. */
export function detectFormat(source: string | ArrayBuffer): MeshFormat {
  if (typeof source === 'string') {
    const lower = source.toLowerCase();
    if (lower.endsWith('.stl')) return 'stl';
    if (lower.endsWith('.obj')) return 'obj';
    if (lower.endsWith('.msh')) return 'msh';
    if (lower.endsWith('.vtk')) return 'vtk';
    // Content heuristic for strings that happen to be raw file content
    if (lower.includes('$meshformat')) return 'msh';
    if (lower.includes('solid ') || lower.includes('endsolid')) return 'stl';
    if (lower.startsWith('v ') || lower.startsWith('f ') || lower.startsWith('vn ') || lower.startsWith('vt ') || lower.startsWith('o ') || lower.startsWith('g ')) return 'obj';
    if (lower.startsWith('# vtk')) return 'vtk';
    return 'unknown';
  }

  const bytes = new Uint8Array(source);
  if (bytes.length < 8) return 'unknown';
  const header = new TextDecoder().decode(bytes.slice(0, 80)).toLowerCase();
  if (header.includes('solid')) return 'stl';
  if (header.includes('$meshformat')) return 'msh';
  if (header.startsWith('# vtk')) return 'vtk';
  // Binary STL heuristic: check if file size matches 84 + n*50
  if (bytes.length >= 84) {
    const view = new DataView(source);
    const triCount = view.getUint32(80, true);
    const expected = 84 + triCount * 50;
    if (Math.abs(bytes.length - expected) < 100) return 'stl';
  }
  return 'unknown';
}

/**
 * Synchronous mesh import.
 *
 * - STL / OBJ → SurfaceMesh (tetrahedralize=false)
 * - GMSH      → TetMesh (direct volumetric)
 *
 * To tetrahedralize a surface mesh, use `importMesh()` (async) or call
 * `meshSurface(surfaceMesh)` yourself after this step.
 */
export function importMeshSync(
  source: string | ArrayBuffer,
  options?: ImportOptions,
): ImportedMesh {
  const format = detectFormat(source);

  switch (format) {
    case 'stl': {
      if (typeof source === 'string') {
        throw new MeshImportError('STL requires ArrayBuffer; convert file content first', 'GMSH_INVALID');
      }
      const surface = parseSTL(source);
      if (options?.tetrahedralize === false) {
        return { format, surfaceMesh: surface };
      }
      // Return surfaceMesh; caller should await meshSurface() or use importMesh()
      return { format, surfaceMesh: surface };
    }

    case 'obj': {
      if (typeof source !== 'string') {
        throw new MeshImportError('OBJ requires string content', 'GMSH_INVALID');
      }
      const surface = parseOBJ(source);
      if (options?.tetrahedralize === false) {
        return { format, surfaceMesh: surface };
      }
      return { format, surfaceMesh: surface };
    }

    case 'msh': {
      if (typeof source !== 'string') {
        throw new MeshImportError('GMSH requires string content', 'GMSH_INVALID');
      }
      const unstructured = parseGmsh(source);
      const tetMesh: TetMesh = {
        vertices: unstructured.vertices,
        tetrahedra: unstructured.tetrahedra,
        nodeCount: unstructured.nodeCount,
        elementCount: unstructured.elementCount,
      };
      return { format, tetMesh, unstructured };
    }

    default:
      throw new MeshImportError(
        `Unsupported or undetected mesh format (detected: ${format})`,
        'GMSH_INVALID',
      );
  }
}

/**
 * Async mesh import with optional auto-tetrahedralization.
 *
 * - STL / OBJ → SurfaceMesh → meshSurface() → TetMesh
 * - GMSH      → TetMesh (direct, no async work)
 */
export async function importMesh(
  source: string | ArrayBuffer,
  options?: ImportOptions,
): Promise<ImportedMesh> {
  const result = importMeshSync(source, options);

  if (result.surfaceMesh && (options?.tetrahedralize !== false)) {
    try {
      const tet = await meshSurface(result.surfaceMesh, {
        maxEdgeLength: options?.maxEdgeLength,
        quality: options?.quality,
        maxVolume: options?.maxVolume,
      });
      result.tetMesh = tet;
    } catch (err) {
      // Keep surfaceMesh so caller can retry or use a different mesher.
      const reason = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(`[MeshImporter] meshSurface failed: ${reason}. Returning surfaceMesh only.`);
    }
  }

  return result;
}
