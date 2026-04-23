/**
 * @holoscript/nodetoy-plugin — ADAPTER CONTRACT TEST
 *
 * Universal-IR coverage row 8 (NodeToy shader graph). Validation errors
 * MUST catch missing output_node_id + dangling input refs.
 */
import { describe, it, expect } from 'vitest';
import * as mod from '../index';
import { mapNodeToyToShader, type NodeToyGraph } from '../index';

function graph(overrides: Partial<NodeToyGraph> = {}): NodeToyGraph {
  return {
    name: 'TestShader',
    output_node_id: 'out1',
    nodes: [
      { id: 'tex1', family: 'texture' },
      { id: 'pbr1', family: 'pbr', inputs: { albedo: 'tex1' } },
      { id: 'out1', family: 'output', inputs: { color: 'pbr1' } },
    ],
    ...overrides,
  };
}

describe('CONTRACT: nodetoy-plugin adapter', () => {
  it('exposes mapNodeToyToShader at stable public path', () => {
    expect(typeof mod.mapNodeToyToShader).toBe('function');
  });

  it('trait.kind = @shader, target_id preserves graph.name', () => {
    const r = mapNodeToyToShader(graph());
    expect(r.trait.kind).toBe('@shader');
    expect(r.trait.target_id).toBe('TestShader');
  });

  it('node_count matches graph.nodes.length', () => {
    expect(mapNodeToyToShader(graph()).node_count).toBe(3);
  });

  it('by_family sum equals node_count', () => {
    const r = mapNodeToyToShader(graph());
    const sum = Object.values(r.by_family).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.node_count);
  });

  it('missing output_node_id is flagged in validation_errors', () => {
    const r = mapNodeToyToShader(graph({ output_node_id: 'does_not_exist' }));
    expect(r.validation_errors.some((e) => /output_node_id/.test(e))).toBe(true);
  });

  it('dangling input ref is flagged in validation_errors', () => {
    const r = mapNodeToyToShader({
      name: 'Dangling',
      output_node_id: 'out',
      nodes: [
        { id: 'out', family: 'output', inputs: { color: 'missing_node' } },
      ],
    });
    expect(r.validation_errors.some((e) => /missing/.test(e))).toBe(true);
  });

  it('well-formed graph produces zero validation_errors', () => {
    const r = mapNodeToyToShader(graph());
    expect(r.validation_errors).toEqual([]);
  });

  it('trait.params.output preserves output_node_id', () => {
    expect(mapNodeToyToShader(graph()).trait.params.output).toBe('out1');
  });

  it('empty graph (no nodes) → validation_errors catches missing output', () => {
    const r = mapNodeToyToShader({ name: 'Empty', output_node_id: 'out', nodes: [] });
    expect(r.node_count).toBe(0);
    expect(r.validation_errors.length).toBeGreaterThan(0);
  });
});
