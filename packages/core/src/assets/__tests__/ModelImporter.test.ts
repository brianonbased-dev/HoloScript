import { describe, it, expect, beforeEach } from 'vitest';
import { ModelImporter } from '../ModelImporter';

describe('ModelImporter', () => {
  let importer: ModelImporter;

  beforeEach(() => {
    importer = new ModelImporter();
  });

  // ---- Format Detection ----

  it('detectFormat recognizes .gltf', () => {
    expect(importer.detectFormat('model.gltf')).toBe('gltf');
  });

  it('detectFormat recognizes .glb as gltf', () => {
    expect(importer.detectFormat('model.glb')).toBe('gltf');
  });

  it('detectFormat recognizes .obj', () => {
    expect(importer.detectFormat('mesh.obj')).toBe('obj');
  });

  it('detectFormat recognizes .fbx', () => {
    expect(importer.detectFormat('char.fbx')).toBe('fbx');
  });

  it('detectFormat returns null for unknown extension', () => {
    expect(importer.detectFormat('image.png')).toBeNull();
  });

  it('detectFormat is case-insensitive', () => {
    expect(importer.detectFormat('Model.GLTF')).toBe('gltf');
  });

  // ---- Import ----

  it('import gltf returns mesh with material', () => {
    const result = importer.import('scene.gltf', 'data');
    expect(result.meshes.length).toBe(1);
    expect(result.materials.length).toBe(1);
    expect(result.errors.length).toBe(0);
  });

  it('import obj returns mesh with warning', () => {
    const result = importer.import('model.obj', 'data');
    expect(result.meshes.length).toBe(1);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.meshes[0].materialId).toBeNull();
  });

  it('import fbx returns mesh with material', () => {
    const result = importer.import('char.fbx', 'data');
    expect(result.meshes.length).toBe(1);
    expect(result.materials.length).toBe(1);
    expect(result.meshes[0].vertexCount).toBe(2048);
  });

  it('import unsupported format returns error', () => {
    const result = importer.import('file.xyz', 'data');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.meshes.length).toBe(0);
  });

  it('import tracks fileSize from string data', () => {
    const data = 'a'.repeat(500);
    const result = importer.import('a.gltf', data);
    expect(result.fileSize).toBe(500);
  });

  it('import tracks fileSize from ArrayBuffer', () => {
    const buf = new ArrayBuffer(1024);
    const result = importer.import('a.gltf', buf);
    expect(result.fileSize).toBe(1024);
  });

  // ---- Supported Formats ----

  it('getSupportedFormats returns array', () => {
    const formats = importer.getSupportedFormats();
    expect(formats).toContain('gltf');
    expect(formats).toContain('obj');
    expect(formats).toContain('fbx');
  });

  // ---- Mesh Bounds ----

  it('gltf meshes have correct bounds', () => {
    const result = importer.import('a.gltf', 'data');
    const mesh = result.meshes[0];
    expect(mesh.bounds.min[0]).toBe(-1);
    expect(mesh.bounds.max[0]).toBe(1);
  });
});
