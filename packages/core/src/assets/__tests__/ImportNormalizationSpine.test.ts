import { describe, it, expect } from 'vitest';
import {
  normalizeLegacyToGLTF,
  type SourceImportReceipt,
  type SemanticMappingReceipt,
} from '../ImportNormalizationSpine';

describe('ImportNormalizationSpine (task_1779336717743_34m6 Phase 1 seed)', () => {
  it('normalizeLegacyToGLTF returns SourceImportReceipt + SemanticMappingReceipt for legacy format (OBJ via assimp path)', async () => {
    const fakeObj = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3';
    const artifact = await normalizeLegacyToGLTF('test-model.obj', fakeObj, { preferNativeAssimp: true });

    expect(artifact.source).toBeDefined();
    const src: SourceImportReceipt = artifact.source;
    expect(src.sourceFormat).toBe('obj');
    expect(src.converter).toBe('native-assimp');
    expect(src.warnings.length).toBeGreaterThan(0); // Phase-1 note
    expect(src.inputSizeBytes).toBeGreaterThan(0);
    expect(src.convertedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const sem: SemanticMappingReceipt = artifact.semantic;
    expect(sem.normalizedFormat).toBe('gltf');
    expect(sem.traitMappings.mesh_0).toContain('@mesh_node');
    expect(sem.validation.ok).toBe(true);

    expect(artifact.importResult).toBeDefined();
  });

  it('normalizeLegacyToGLTF fast-paths direct glTF without assimp warnings', async () => {
    const minimalGltf = JSON.stringify({ asset: { version: '2.0' } });
    const artifact = await normalizeLegacyToGLTF('brain-mni152-pial.gltf', minimalGltf);

    expect(artifact.source.converter).toBe('direct-gltf');
    expect(artifact.source.warnings.length).toBe(0);
    expect(artifact.semantic.normalizedFormat).toBe('gltf');
  });

  it('unsupported format path still emits predictable receipts (no crash)', async () => {
    const artifact = await normalizeLegacyToGLTF('weird.xyz', 'data');
    expect(artifact.source.sourceFormat).toBe('xyz');
    expect(artifact.semantic.validation.ok).toBe(true);
  });
});
