/**
 * GmshParser — Parse GMSH 2.x ASCII `.msh` into unstructured tet meshes.
 *
 * MVP: `$Nodes` + `$Elements` with 4-node tetrahedra (type `4`). Other element
 * types are skipped. Node tags are remapped to a dense 0-based index range.
 *
 * @see VTKImporter — compatible `VTKUnstructuredResult` shape for solvers.
 */

import type { VTKUnstructuredResult } from './VTKImporter';

/** Raised when input cannot be interpreted as a supported mesh. */
export class MeshImportError extends Error {
  constructor(
    message: string,
    public readonly code: 'GMSH_INVALID' | 'GMSH_UNSUPPORTED'
  ) {
    super(message);
    this.name = 'MeshImportError';
  }
}

/** GMSH element type: 4-node tetrahedron (linear). */
const ELTYPE_TET4 = 4;

function extractBlock(src: string, start: string, end: string): string {
  const i0 = src.indexOf(start);
  if (i0 < 0) throw new MeshImportError(`Missing ${start}`, 'GMSH_INVALID');
  const i1 = src.indexOf(end, i0 + start.length);
  if (i1 < 0) throw new MeshImportError(`Missing ${end}`, 'GMSH_INVALID');
  return src.slice(i0 + start.length, i1).trim();
}

/** Returns major.minor from `$MeshFormat` (first line). */
function readGmshVersion(src: string): number {
  const block = extractBlock(src, '$MeshFormat', '$EndMeshFormat');
  const first = block.split(/\s+/).filter(Boolean)[0];
  const ver = parseFloat(first || '0');
  if (!Number.isFinite(ver)) {
    throw new MeshImportError(`Invalid $MeshFormat version: ${first ?? '?'}`, 'GMSH_INVALID');
  }
  return ver;
}

interface NodeRow {
  tag: number;
  x: number;
  y: number;
  z: number;
}

function parseNodesBlock(block: string): NodeRow[] {
  const lines = block.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) throw new MeshImportError('Empty $Nodes section', 'GMSH_INVALID');
  const n = parseInt(lines[0], 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new MeshImportError(`Invalid node count: ${lines[0]}`, 'GMSH_INVALID');
  }
  if (lines.length < 1 + n) {
    throw new MeshImportError(`Expected ${n} node lines in $Nodes`, 'GMSH_INVALID');
  }
  const out: NodeRow[] = [];
  for (let i = 1; i <= n; i++) {
    const parts = lines[i].split(/\s+/).filter(Boolean);
    if (parts.length < 4) {
      throw new MeshImportError(`Bad node line: ${lines[i]}`, 'GMSH_INVALID');
    }
    const tag = parseInt(parts[0], 10);
    const x = parseFloat(parts[1]);
    const y = parseFloat(parts[2]);
    const z = parseFloat(parts[3]);
    if (!Number.isFinite(tag) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new MeshImportError(`Bad node values: ${lines[i]}`, 'GMSH_INVALID');
    }
    out.push({ tag, x, y, z });
  }
  return out;
}

/**
 * Parse one element line after elm-number and type: returns [ntags, ...tags, ...nodes].
 */
function parseElementTail(parts: string[], elmType: number): { tags: number[]; nodes: number[] } {
  if (parts.length < 3) {
    throw new MeshImportError(`Truncated element line`, 'GMSH_INVALID');
  }
  const ntags = parseInt(parts[2], 10);
  if (!Number.isFinite(ntags) || ntags < 0) {
    throw new MeshImportError(`Bad tag count`, 'GMSH_INVALID');
  }
  let idx = 3;
  const tags: number[] = [];
  for (let t = 0; t < ntags; t++) {
    if (idx >= parts.length) throw new MeshImportError('Missing element tags', 'GMSH_INVALID');
    tags.push(parseInt(parts[idx++], 10));
  }
  const rest = parts.slice(idx).map((p) => parseInt(p, 10));
  if (elmType === ELTYPE_TET4) {
    if (rest.length !== 4) {
      throw new MeshImportError(`Tet4 expects 4 nodes, got ${rest.length}`, 'GMSH_INVALID');
    }
    return { tags, nodes: rest };
  }
  return { tags, nodes: rest };
}

/**
 * Parse GMSH 2.x ASCII content into vertices + linear tetrahedra connectivity.
 */
export function parseGmsh(text: string): VTKUnstructuredResult {
  const src = text.replace(/\r\n/g, '\n');
  if (src.length < 32 || !src.includes('$MeshFormat')) {
    throw new MeshImportError('Not a GMSH mesh (expected $MeshFormat)', 'GMSH_INVALID');
  }

  const formatVer = readGmshVersion(src);
  if (formatVer >= 4) {
    throw new MeshImportError(
      `GMSH format ${formatVer} not supported in MVP (export as v2 ASCII from GMSH)`,
      'GMSH_UNSUPPORTED'
    );
  }
  if (formatVer < 2.0 || formatVer > 2.299) {
    throw new MeshImportError(
      `GMSH MeshFormat ${formatVer} not supported (MVP: 2.0–2.2 ASCII)`,
      'GMSH_UNSUPPORTED'
    );
  }

  const nodesBlock = extractBlock(src, '$Nodes', '$EndNodes');
  const nodeRows = parseNodesBlock(nodesBlock);
  const tagToDense = new Map<number, number>();
  for (let i = 0; i < nodeRows.length; i++) {
    tagToDense.set(nodeRows[i].tag, i);
  }

  const vertices = new Float64Array(nodeRows.length * 3);
  for (let i = 0; i < nodeRows.length; i++) {
    const r = nodeRows[i];
    vertices[i * 3] = r.x;
    vertices[i * 3 + 1] = r.y;
    vertices[i * 3 + 2] = r.z;
  }

  const elementsBlock = extractBlock(src, '$Elements', '$EndElements');
  const elLines = elementsBlock.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (elLines.length === 0) throw new MeshImportError('Empty $Elements section', 'GMSH_INVALID');
  const numEl = parseInt(elLines[0], 10);
  if (!Number.isFinite(numEl) || numEl < 0) {
    throw new MeshImportError(`Invalid element count: ${elLines[0]}`, 'GMSH_INVALID');
  }
  if (elLines.length < 1 + numEl) {
    throw new MeshImportError(`Expected ${numEl} element lines`, 'GMSH_INVALID');
  }

  const tetTags: number[][] = [];
  for (let i = 1; i <= numEl; i++) {
    const parts = elLines[i].split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    const elmType = parseInt(parts[1], 10);
    if (elmType !== ELTYPE_TET4) continue;
    const { nodes } = parseElementTail(parts, elmType);
    const mapped = nodes.map((nid) => {
      const d = tagToDense.get(nid);
      if (d === undefined) {
        throw new MeshImportError(`Element references unknown node tag ${nid}`, 'GMSH_INVALID');
      }
      return d;
    });
    if (mapped.length !== 4) continue;
    tetTags.push(mapped);
  }

  if (tetTags.length === 0) {
    throw new MeshImportError('No 4-node tetrahedra (type 4) found in $Elements', 'GMSH_UNSUPPORTED');
  }

  const tetrahedra = new Uint32Array(tetTags.length * 4);
  for (let e = 0; e < tetTags.length; e++) {
    const t = tetTags[e];
    tetrahedra[e * 4] = t[0];
    tetrahedra[e * 4 + 1] = t[1];
    tetrahedra[e * 4 + 2] = t[2];
    tetrahedra[e * 4 + 3] = t[3];
  }

  const nodeCount = nodeRows.length;
  const elementCount = tetTags.length;

  return {
    vertices,
    tetrahedra,
    nodeCount,
    elementCount,
    pointData: new Map(),
    cellData: new Map(),
  };
}
