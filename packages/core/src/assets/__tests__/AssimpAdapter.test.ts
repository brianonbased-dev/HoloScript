/**
 * AssimpAdapter — bridge tests
 */
import { describe, it, expect } from 'vitest';
import { convertAssimpSceneToImportResult } from '../AssimpAdapter';
import type { AssimpScene } from '../AssimpAdapter';

function scene(overrides: Partial<AssimpScene> = {}): AssimpScene {
  return {
    source_format: 'fbx',
    root: {
      name: 'root',
      children: [
        { name: 'body', mesh_indices: [0], transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1] },
        { name: 'empty_xform' },
      ],
    },
    mesh_count: 1,
    material_count: 1,
    ...overrides,
  };
}

describe('AssimpAdapter', () => {
  it('converts a basic scene to ImportResult', () => {
    const r = convertAssimpSceneToImportResult(scene());
    expect(r.errors.length).toBe(0);
    expect(r.meshes.length).toBe(1);
    expect(r.meshes[0].name).toBe('body');
    expect(r.meshes[0].materialId).toBe('mat_0');
    expect(r.materials.length).toBe(1);
    expect(r.materials[0].name).toBe('Assimp_Material');
  });

  it('bounds are derived from transform translation', () => {
    const r = convertAssimpSceneToImportResult(scene());
    const m = r.meshes[0];
    expect(m.bounds.min).toEqual([1, 2, 3]); // tx=2, ty=3, tz=4 → min = tx-1, ty-1, tz-1
    expect(m.bounds.max).toEqual([3, 4, 5]);
  });

  it('only meshed nodes produce ImportedMesh entries', () => {
    const r = convertAssimpSceneToImportResult(scene());
    const names = r.meshes.map((m) => m.name);
    expect(names).toContain('body');
    expect(names).not.toContain('empty_xform');
  });

  it('nested children are traversed', () => {
    const nested: AssimpScene = {
      source_format: 'obj',
      root: {
        name: 'root',
        children: [
          {
            name: 'armature',
            children: [
              { name: 'hand', mesh_indices: [1, 2] },
              { name: 'fingers', mesh_indices: [3] },
            ],
          },
        ],
      },
      mesh_count: 3,
      material_count: 1,
    };
    const r = convertAssimpSceneToImportResult(nested);
    expect(r.meshes.length).toBe(2);
    expect(r.meshes.map((m) => m.name).sort()).toEqual(['fingers', 'hand']);
  });

  it('empty scene produces zero meshes and zero materials', () => {
    const empty: AssimpScene = {
      source_format: 'gltf',
      root: { name: 'root' },
      mesh_count: 0,
      material_count: 0,
    };
    const r = convertAssimpSceneToImportResult(empty);
    expect(r.meshes.length).toBe(0);
    expect(r.materials.length).toBe(0);
    expect(r.errors.length).toBe(0);
  });

  it('warns for OBJ source format', () => {
    const r = convertAssimpSceneToImportResult(scene({ source_format: 'obj' }));
    expect(r.warnings.some((w) => w.includes('OBJ'))).toBe(true);
  });

  it('preserves source_format on emitted stats indirectly via no throw', () => {
    for (const f of ['fbx', 'obj', 'gltf', 'collada', 'other'] as const) {
      expect(() => convertAssimpSceneToImportResult(scene({ source_format: f }))).not.toThrow();
    }
  });
});
