import { describe, expect, it } from 'vitest';
import { executeStudioGraph, validateGraph } from '@/lib/nodeGraphExecutionBridge';
import type { GraphNode, GraphEdge } from '@/hooks/useNodeGraph';

function makeNode(
  id: string,
  type: string,
  category: string,
  inputs: Array<{ id: string; label: string; type: 'float' | 'vec3' | 'color' | 'texture' | 'bool' | 'string' }> = [],
  outputs: Array<{ id: string; label: string; type: 'float' | 'vec3' | 'color' | 'texture' | 'bool' | 'string' }> = []
): GraphNode {
  return {
    id,
    type,
    label: id,
    category,
    color: '#888899',
    x: 0,
    y: 0,
    inputs,
    outputs,
  };
}

describe('NodeGraphPanel execution bridge', () => {
  it('executes a simple graph and returns deterministic order + outputs', async () => {
    const n1 = makeNode('n1', 'add', 'utility', [], [{ id: 'out', label: 'Out', type: 'float' }]);
    const n2 = makeNode(
      'n2',
      'output_surface',
      'output',
      [{ id: 'in', label: 'In', type: 'float' }],
      [{ id: 'color', label: 'Color', type: 'color' }]
    );

    const edges: GraphEdge[] = [
      {
        id: 'e1',
        fromNodeId: 'n1',
        fromPortId: 'out',
        toNodeId: 'n2',
        toPortId: 'in',
      },
    ];

    const result = await executeStudioGraph([n1, n2], edges, { scene: 'test' });

    expect(result.success).toBe(true);
    expect(result.nodeOrder).toEqual(['n1', 'n2']);
    expect(Object.keys(result.outputs).length).toBeGreaterThan(0);
    expect(result.state.scene).toBe('test');
    expect(result.state['output:n2']).toBeDefined();
  });

  it('fails validation for output node without incoming connections', async () => {
    const out = makeNode(
      'n2',
      'output_surface',
      'output',
      [{ id: 'in', label: 'In', type: 'float' }],
      [{ id: 'color', label: 'Color', type: 'color' }]
    );

    const result = await executeStudioGraph([out], []);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Output node');
  });

  it('detects cycle during validation', () => {
    const n1 = makeNode('n1', 'add', 'utility', [], [{ id: 'out', label: 'Out', type: 'float' }]);
    const n2 = makeNode('n2', 'mul', 'utility', [], [{ id: 'out', label: 'Out', type: 'float' }]);

    const edges: GraphEdge[] = [
      { id: 'e1', fromNodeId: 'n1', fromPortId: 'out', toNodeId: 'n2', toPortId: 'inA' },
      { id: 'e2', fromNodeId: 'n2', fromPortId: 'out', toNodeId: 'n1', toPortId: 'inB' },
    ];

    const errors = validateGraph([n1, n2], edges);
    expect(errors.some((e) => e.includes('Cycle'))).toBe(true);
  });
});
