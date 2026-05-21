import { describe, it, expect } from 'vitest';
import { mapNodeToyToShader, nodeToyToNativeShaderGraph } from '../index';

describe('nodetoy-plugin stub', () => {
  it('tallies family counts', () => {
    const r = mapNodeToyToShader({
      name: 'plastic',
      nodes: [
        { id: 'n1', family: 'input' },
        { id: 'n2', family: 'noise' },
        { id: 'n3', family: 'pbr', inputs: { albedo: 'n2' } },
        { id: 'n4', family: 'output', inputs: { color: 'n3' } },
      ],
      output_node_id: 'n4',
    });
    expect(r.node_count).toBe(4);
    expect(r.by_family.pbr).toBe(1);
    expect(r.by_family.noise).toBe(1);
    expect(r.validation_errors).toEqual([]);
  });

  it('flags missing output node', () => {
    const r = mapNodeToyToShader({
      name: 'broken',
      nodes: [{ id: 'n1', family: 'input' }],
      output_node_id: 'zzz',
    });
    expect(r.validation_errors[0]).toContain('zzz');
  });

  it('flags dangling input refs', () => {
    const r = mapNodeToyToShader({
      name: 'dangle',
      nodes: [{ id: 'n1', family: 'output', inputs: { color: 'missing' } }],
      output_node_id: 'n1',
    });
    expect(r.validation_errors.some((e) => e.includes('missing'))).toBe(true);
  });

  it('produces HoloScript-native ShaderGraph IR from NodeToy (Phase 2 native path)', () => {
    const native = nodeToyToNativeShaderGraph({
      name: 'test-graph',
      nodes: [
        { id: 'a', family: 'pbr' },
        { id: 'b', family: 'output', inputs: { color: 'a' } },
      ],
      output_node_id: 'b',
    });
    expect(native.id).toBe('sg_test-graph');
    expect(native.provenance).toBe('imported:NodeToy');
    expect(native.nodes.length).toBe(2);
    expect(native.outputNodeId).toBe('b');
  });
});
