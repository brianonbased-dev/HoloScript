/**
 * ModelImporter — glTF/OBJ mesh parsing and material extraction
 *
 * @version 1.0.0
 */

export interface ImportedMesh {
  id: string;
  name: string;
  vertexCount: number;
  indexCount: number;
  materialId: string | null;
  bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
}

export interface ImportedMaterial {
  id: string;
  name: string;
  baseColor: { r: number; g: number; b: number; a: number };
  metallic: number;
  roughness: number;
  textures: string[];
}

export interface ImportResult {
  meshes: ImportedMesh[];
  materials: ImportedMaterial[];
  warnings: string[];
  errors: string[];
  fileSize: number;
  importTimeMs: number;
}

export type ImportFormat = 'gltf' | 'obj' | 'fbx';

export class ModelImporter {
  private supportedFormats: Set<ImportFormat> = new Set(['gltf', 'obj', 'fbx']);

  /**
   * Import a model from raw data
   */
  import(filename: string, data: ArrayBuffer | string): ImportResult {
    const start = Date.now();
    const format = this.detectFormat(filename);
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!format) {
      errors.push(`Unsupported file format: ${filename}`);
      return { meshes: [], materials: [], warnings, errors, fileSize: 0, importTimeMs: 0 };
    }

    const fileSize = typeof data === 'string' ? data.length : data.byteLength;

    // Simulate parsing based on format
    const meshes: ImportedMesh[] = [];
    const materials: ImportedMaterial[] = [];

    if (format === 'gltf') {
      meshes.push({
        id: 'mesh_0',
        name: 'Mesh0',
        vertexCount: 1024,
        indexCount: 2048,
        materialId: 'mat_0',
        bounds: {
          min: { x: -1, y: -1, z: -1 },
          max: { x: 1, y: 1, z: 1 },
        },
      });
      materials.push({
        id: 'mat_0',
        name: 'PBR_Material',
        baseColor: { r: 0.8, g: 0.8, b: 0.8, a: 1 },
        metallic: 0,
        roughness: 0.5,
        textures: [],
      });
    } else if (format === 'obj') {
      meshes.push({
        id: 'mesh_0',
        name: 'ObjMesh',
        vertexCount: 512,
        indexCount: 1024,
        materialId: null,
        bounds: {
          min: { x: -1, y: 0, z: -1 },
          max: { x: 1, y: 2, z: 1 },
        },
      });
      warnings.push('OBJ format does not support PBR materials');
    } else {
      meshes.push({
        id: 'mesh_0',
        name: 'FBXMesh',
        vertexCount: 2048,
        indexCount: 4096,
        materialId: 'mat_0',
        bounds: {
          min: { x: -2, y: -2, z: -2 },
          max: { x: 2, y: 2, z: 2 },
        },
      });
      materials.push({
        id: 'mat_0',
        name: 'FBX_Material',
        baseColor: { r: 1, g: 1, b: 1, a: 1 },
        metallic: 0.5,
        roughness: 0.5,
        textures: [],
      });
    }

    return { meshes, materials, warnings, errors, fileSize, importTimeMs: Date.now() - start };
  }

  detectFormat(filename: string): ImportFormat | null {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'gltf' || ext === 'glb') return 'gltf';
    if (ext === 'obj') return 'obj';
    if (ext === 'fbx') return 'fbx';
    return null;
  }

  getSupportedFormats(): ImportFormat[] {
    return [...this.supportedFormats];
  }
}
