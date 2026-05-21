/**
 * ImportNormalizationSpine — Assimp + MSF/OpenUSD/glTF normalization spine (Phase 1)
 *
 * Per task_1779336717743_34m6: Establish the broad ingest spine contract.
 * Native/server Assimp (or assimpjs probe) + MSF/OpenUSD bridges normalize
 * legacy formats to GLB/glTF + semantic sidecars + receipts.
 *
 * This seed defines the receipt types and a typed normalization entry point.
 * Real converters (NativeAssimpJobConverter, MSF bridge) wire in follow-ups.
 * glTF/GLB direct path remains fast-path bypass.
 */

import type { ImportResult } from './ModelImporter';

export interface SourceImportReceipt {
  sourceHash: string;
  sourceFormat: string;
  sourceUri?: string;
  converter: 'native-assimp' | 'assimpjs' | 'direct-gltf' | 'msf-bridge' | 'openusd-bridge';
  converterVersion?: string;
  warnings: string[];
  inputSizeBytes: number;
  convertedAt: string;
}

export interface SemanticMappingReceipt {
  normalizedFormat: 'gltf' | 'glb';
  normalizedUri: string;
  semanticSidecarHash?: string;
  traitMappings: Record<string, string[]>; // e.g. { mesh_0: ['@mesh_node', '@transform'] }
  lostFeatures: string[];
  validation: { ok: boolean; errors: string[] };
}

export interface NormalizedImportArtifact {
  source: SourceImportReceipt;
  semantic: SemanticMappingReceipt;
  importResult: ImportResult;
}

/**
 * normalizeLegacyToGLTF
 * Entry point for the normalization spine.
 * Phase 1: typed stub that always succeeds for direct-gltf and returns
 * placeholder receipts for legacy paths. Follow-ups replace with real Assimp/MSF calls.
 */
export async function normalizeLegacyToGLTF(
  filename: string,
  data: ArrayBuffer | string | unknown,
  opts: { preferNativeAssimp?: boolean; sourceUri?: string } = {}
): Promise<NormalizedImportArtifact> {
  const now = new Date().toISOString();
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const isDirectGltf = ext === 'gltf' || ext === 'glb';

  const inputSize =
    typeof data === 'string'
      ? data.length
      : data instanceof ArrayBuffer
        ? data.byteLength
        : 0;

  const source: SourceImportReceipt = {
    sourceHash: `sha256:ph-${filename}-${inputSize}`,
    sourceFormat: ext || 'unknown',
    sourceUri: opts.sourceUri,
    converter: isDirectGltf ? 'direct-gltf' : (opts.preferNativeAssimp ? 'native-assimp' : 'assimpjs'),
    warnings: isDirectGltf ? [] : ['Phase-1 stub: real Assimp/MSF conversion pending; using placeholder receipts'],
    inputSizeBytes: inputSize,
    convertedAt: now,
  };

  const semantic: SemanticMappingReceipt = {
    normalizedFormat: 'gltf',
    normalizedUri: `memory://${filename}.normalized.gltf`,
    traitMappings: { mesh_0: ['@mesh_node'] },
    lostFeatures: [],
    validation: { ok: true, errors: [] },
  };

  // Placeholder ImportResult (real path would populate from AssimpAdapter or direct parse)
  const importResult: ImportResult = {
    meshes: [],
    materials: [],
    warnings: source.warnings,
    errors: [],
    fileSize: inputSize,
    importTimeMs: 0,
  };

  return { source, semantic, importResult };
}
