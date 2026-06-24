/**
 * `.holo` mesh-shape bridge — emit/read a real imported mesh as a `.holo`
 * `shape "<name>" mesh { ... }` block (Track 0: the `.holo` FILE carries the
 * surface, not a text pointer to an external model).
 *
 * `meshShapeToHolo` serializes the engine codec's {@link HoloMeshGeometry}
 * (base64 buffers) into `.holo` text that `parseHolo` reads as a `HoloShape`
 * with `shapeType: 'mesh'`; `holoShapeToMesh` is the inverse — it reads a parsed
 * mesh shape back into a {@link SkinnedMeshData}. Together they close the
 * import → `.holo` file → parse round-trip with geometry intact.
 *
 * @package @holoscript/cli/importers
 */
import {
  decodeSkinnedMeshFromHolo,
  type HoloMeshGeometry,
  type DecodedHoloMesh,
} from '@holoscript/engine';

/**
 * Emit a `shape "<name>" mesh { ...base64 }` block. `indent` is the leading
 * indentation so the block sits cleanly inside a `composition { … }`.
 */
export function meshShapeToHolo(name: string, geo: HoloMeshGeometry, indent = '  '): string {
  const i = indent;
  const ii = indent + '  ';
  const lines = [`${i}shape "${name}" mesh {`];
  lines.push(`${ii}positionsB64: "${geo.positionsB64}"`);
  lines.push(`${ii}normalsB64: "${geo.normalsB64}"`);
  lines.push(`${ii}tangentsB64: "${geo.tangentsB64}"`);
  if (geo.uvsB64) lines.push(`${ii}uvsB64: "${geo.uvsB64}"`);
  lines.push(`${ii}indicesB64: "${geo.indicesB64}"`);
  lines.push(`${ii}jointIndicesB64: "${geo.jointIndicesB64}"`);
  lines.push(`${ii}jointWeightsB64: "${geo.jointWeightsB64}"`);
  // Rig (optional) — carried so the mesh can be re-emitted WITH a glTF skin.
  if (geo.inverseBindMatricesB64 && geo.jointCount !== undefined) {
    lines.push(`${ii}inverseBindMatricesB64: "${geo.inverseBindMatricesB64}"`);
    lines.push(`${ii}jointCount: ${geo.jointCount}`);
  }
  lines.push(`${ii}vertexCount: ${geo.vertexCount}`);
  lines.push(`${i}}`);
  return lines.join('\n');
}

/**
 * Read a parsed mesh shape (a `HoloShape` with `shapeType: 'mesh'`) back into a
 * {@link SkinnedMeshData}. Structurally typed on `properties` so it consumes a
 * parsed `HoloShape` without importing the parser AST type.
 */
export function holoShapeToMesh(shape: {
  properties: ReadonlyArray<{ key: string; value: unknown }>;
}): DecodedHoloMesh {
  const map = new Map(shape.properties.map((p) => [p.key, p.value]));
  const str = (k: string): string => {
    const v = map.get(k);
    if (typeof v !== 'string') {
      throw new Error(`mesh shape: missing/invalid string property "${k}"`);
    }
    return v;
  };
  const uvsVal = map.get('uvsB64');
  const ibmVal = map.get('inverseBindMatricesB64');
  const jointCountVal = map.get('jointCount');
  const geo: HoloMeshGeometry = {
    positionsB64: str('positionsB64'),
    normalsB64: str('normalsB64'),
    tangentsB64: str('tangentsB64'),
    ...(typeof uvsVal === 'string' ? { uvsB64: uvsVal } : {}),
    indicesB64: str('indicesB64'),
    jointIndicesB64: str('jointIndicesB64'),
    jointWeightsB64: str('jointWeightsB64'),
    ...(typeof ibmVal === 'string' && jointCountVal !== undefined
      ? { inverseBindMatricesB64: ibmVal, jointCount: Number(jointCountVal) }
      : {}),
    vertexCount: Number(map.get('vertexCount') ?? 0),
  };
  return decodeSkinnedMeshFromHolo(geo);
}
