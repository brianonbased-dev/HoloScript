/**
 * @holoscript/assimp-plugin — ADAPTER CONTRACT TEST
 *
 * Universal-IR coverage row 5 (FBX / OBJ via Assimp). Extends pattern
 * a7ef1f8ed + e467ab055.
 */
import { describe, it, expect } from 'vitest';
import * as mod from '../index';
import { importAssimp, type AssimpScene } from '../index';

function scene(overrides: Partial<AssimpScene> = {}): AssimpScene {
  return {
    source_format: 'fbx',
    root: {
      name: 'root',
      children: [
        { name: 'a', mesh_indices: [0] },
        { name: 'b', children: [{ name: 'b_child', mesh_indices: [1, 2] }] },
      ],
    },
    mesh_count: 3,
    material_count: 1,
    ...overrides,
  };
}

describe('CONTRACT: assimp-plugin adapter', () => {
  it('exposes importAssimp at a stable public path', () => {
    expect(typeof mod.importAssimp).toBe('function');
  });

  it('preserves source_format verbatim on the emission', () => {
    for (const f of ['fbx', 'obj', 'gltf', 'collada', 'other'] as const) {
      const r = importAssimp(scene({ source_format: f }));
      expect(r.format).toBe(f);
    }
  });

  it('only meshed nodes produce @mesh_node traits', () => {
    const r = importAssimp(scene());
    // root + b have no mesh_indices; a + b_child do
    expect(r.traits.length).toBe(2);
    for (const t of r.traits) expect(t.kind).toBe('@mesh_node');
    expect(r.traits.map((t) => t.target_id).sort()).toEqual(['a', 'b_child']);
  });

  it('stats.total_nodes counts every node in the tree (incl. non-meshed)', () => {
    const r = importAssimp(scene());
    // root + a + b + b_child = 4
    expect(r.stats.total_nodes).toBe(4);
  });

  it('stats.meshed_nodes matches trait count', () => {
    const r = importAssimp(scene());
    expect(r.stats.meshed_nodes).toBe(r.traits.length);
  });

  it('stats.max_depth reflects deepest nested node', () => {
    const r = importAssimp(scene()); // root=0, a=1, b=1, b_child=2
    expect(r.stats.max_depth).toBe(2);
    const flat = importAssimp(scene({ root: { name: 'only' } }));
    expect(flat.stats.max_depth).toBe(0);
  });

  it('empty tree (root only, no children, no mesh) emits zero traits, no throw', () => {
    expect(() => importAssimp(scene({ root: { name: 'only' } }))).not.toThrow();
    const r = importAssimp(scene({ root: { name: 'only' } }));
    expect(r.traits).toEqual([]);
    expect(r.stats.total_nodes).toBe(1);
  });

  it('trait params preserve mesh_indices array and depth', () => {
    const r = importAssimp(scene());
    const a = r.traits.find((t) => t.target_id === 'a');
    expect(a?.params.mesh_indices).toEqual([0]);
    expect(a?.params.depth).toBe(1);
    const child = r.traits.find((t) => t.target_id === 'b_child');
    expect(child?.params.mesh_indices).toEqual([1, 2]);
    expect(child?.params.depth).toBe(2);
  });
});
