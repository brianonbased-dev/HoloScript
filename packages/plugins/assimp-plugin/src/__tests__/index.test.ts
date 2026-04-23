import { describe, it, expect } from 'vitest';
import { importAssimp } from '../index';

describe('assimp-plugin stub', () => {
  it('walks nested scene tree and tallies stats', () => {
    const r = importAssimp({
      source_format: 'fbx',
      root: {
        name: 'root',
        children: [
          { name: 'body', mesh_indices: [0], children: [{ name: 'arm', mesh_indices: [1] }] },
          { name: 'empty_xform' },
        ],
      },
      mesh_count: 2,
      material_count: 1,
    });
    expect(r.stats.total_nodes).toBe(4);
    expect(r.stats.meshed_nodes).toBe(2);
    expect(r.stats.max_depth).toBe(2);
    expect(r.traits.length).toBe(2);
  });

  it('preserves format tag', () => {
    const r = importAssimp({ source_format: 'obj', root: { name: 'x' }, mesh_count: 0, material_count: 0 });
    expect(r.format).toBe('obj');
  });
});
