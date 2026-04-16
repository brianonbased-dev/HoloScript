/**
 * NodeGraphPanel — Production Tests
 *
 * Tests NodeGraphPanel UI entity generation,
 * node/connection rendering, selection color, port entities,
 * and the selection API.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NodeGraphPanel } from '../NodeGraphPanel';
import { NodeGraph } from '../../logic/NodeGraph';

// =============================================================================
// CONSTRUCTION
// =============================================================================

describe('NodeGraphPanel — Construction', () => {
  it('constructs with default config', () => {
    const panel = new NodeGraphPanel(new NodeGraph());
    expect(panel).toBeDefined();
  });

  it('accepts partial config overrides', () => {
    const panel = new NodeGraphPanel(new NodeGraph(), { nodeWidth: 0.5 });
    expect(panel).toBeDefined();
  });
});

// =============================================================================
// generateUI — empty graph
// =============================================================================

describe('NodeGraphPanel — generateUI (empty graph)', () => {
  let panel: NodeGraphPanel;

  beforeEach(() => {
    panel = new NodeGraphPanel(new NodeGraph());
  });

  it('returns at least a background panel entity', () => {
    const entities = panel.generateUI();
    const bg = entities.find((e) => e.id === 'graph_background');
    expect(bg).toBeDefined();
    expect(bg!.type).toBe('panel');
  });

  it('background has fixed size 2×1.5', () => {
    const entities = panel.generateUI();
    const bg = entities.find((e) => e.id === 'graph_background');
    expect(bg!.size).toEqual({ width: 2, height: 1.5 });
  });

  it('returns no node or port entities for empty graph', () => {
    const entities = panel.generateUI();
    const nonBg = entities.filter((e) => e.id !== 'graph_background');
    expect(nonBg).toHaveLength(0);
  });
});

// =============================================================================
// generateUI — single node
// =============================================================================

describe('NodeGraphPanel — generateUI (one node)', () => {
  let graph: NodeGraph;
  let panel: NodeGraphPanel;

  beforeEach(() => {
    graph = new NodeGraph();
    graph.addNode('MathAdd', { x: 0, y: 0 });
    panel = new NodeGraphPanel(graph);
  });

  it('generates a node body entity', () => {
    const entities = panel.generateUI();
    const body = entities.find((e) => e.type === 'panel' && e.data?.role === 'node');
    expect(body).toBeDefined();
  });

  it('node body color is not empty', () => {
    const entities = panel.generateUI();
    const body = entities.find((e) => e.data?.role === 'node');
    expect(typeof body!.color).toBe('string');
    expect(body!.color!.length).toBeGreaterThan(0);
  });

  it('generates a node title label entity', () => {
    const entities = panel.generateUI();
    const title = entities.find((e) => e.type === 'label' && e.data?.role === 'title');
    expect(title).toBeDefined();
    expect(title!.text).toBe('MathAdd');
  });

  it('generates input port entities for all inputs', () => {
    const entities = panel.generateUI();
    const inputPorts = entities.filter((e) => e.type === 'port' && e.data?.role === 'input_port');
    // MathAdd has 2 input ports (a, b)
    expect(inputPorts.length).toBeGreaterThanOrEqual(2);
  });

  it('generates output port entities for all outputs', () => {
    const entities = panel.generateUI();
    const outputPorts = entities.filter((e) => e.type === 'port' && e.data?.role === 'output_port');
    // MathAdd has 1 output port (result)
    expect(outputPorts.length).toBeGreaterThanOrEqual(1);
  });

  it('port entities have text matching port name', () => {
    const entities = panel.generateUI();
    const portNames = entities.filter((e) => e.type === 'port').map((e) => e.text);
    expect(portNames).toContain('a');
    expect(portNames).toContain('b');
    expect(portNames).toContain('result');
  });
});

// =============================================================================
// generateUI — selected node color
// =============================================================================

describe('NodeGraphPanel — generateUI (selection color)', () => {
  it('selected node body uses highlight color #e94560', () => {
    const graph = new NodeGraph();
    const n = graph.addNode('MathAdd', { x: 0, y: 0 });
    const panel = new NodeGraphPanel(graph);
    panel.selectNode(n.id);

    const entities = panel.generateUI();
    const body = entities.find((e) => e.data?.role === 'node');
    expect(body!.color).toBe('#e94560');
  });

  it('deselected node uses type-based colour (not #e94560)', () => {
    const graph = new NodeGraph();
    graph.addNode('MathAdd', { x: 0, y: 0 });
    const panel = new NodeGraphPanel(graph);
    // Nothing selected
    const entities = panel.generateUI();
    const body = entities.find((e) => e.data?.role === 'node');
    expect(body!.color).not.toBe('#e94560');
  });
});

// =============================================================================
// generateUI — known node type colors
// =============================================================================

describe('NodeGraphPanel — generateUI (node type colors)', () => {
  const colorMap: Record<string, string> = {
    MathAdd: '#4a90e2',
    MathMultiply: '#4a90e2',
    Compare: '#7b68ee',
    Branch: '#f39c12',
    Not: '#f39c12',
    GetState: '#2ecc71',
    SetState: '#27ae60',
    OnEvent: '#e74c3c',
    EmitEvent: '#c0392b',
    Timer: '#9b59b6',
    Random: '#1abc9c',
    Clamp: '#4a90e2',
  };

  for (const [type, expectedColor] of Object.entries(colorMap)) {
    it(`${type} gets color ${expectedColor}`, () => {
      const graph = new NodeGraph();
      graph.addNode(type, { x: 0, y: 0 });
      const panel = new NodeGraphPanel(graph);
      const entities = panel.generateUI();
      const body = entities.find((e) => e.data?.role === 'node');
      expect(body!.color).toBe(expectedColor);
    });
  }

  it('unknown type gets fallback color #555555', () => {
    const graph = new NodeGraph();
    graph.addNode('UnknownXYZ', { x: 0, y: 0 });
    const panel = new NodeGraphPanel(graph);
    const entities = panel.generateUI();
    const body = entities.find((e) => e.data?.role === 'node');
    expect(body!.color).toBe('#555555');
  });
});

// =============================================================================
// generateUI — connection
// =============================================================================

describe('NodeGraphPanel — generateUI (connection)', () => {
  it('generates a connection_line entity per connection', () => {
    const graph = new NodeGraph();
    const a = graph.addNode('MathAdd', { x: 0, y: 0 });
    const b = graph.addNode('MathMultiply', { x: 10, y: 0 });
    graph.connect(a.id, 'result', b.id, 'a');
    const panel = new NodeGraphPanel(graph);
    const entities = panel.generateUI();
    const lines = entities.filter((e) => e.type === 'connection_line');
    expect(lines).toHaveLength(1);
    expect(lines[0].color).toBe('#16c79a');
  });

  it('connection entity has from/to data', () => {
    const graph = new NodeGraph();
    const a = graph.addNode('MathAdd', { x: 0, y: 0 });
    const b = graph.addNode('MathMultiply', { x: 5, y: 0 });
    graph.connect(a.id, 'result', b.id, 'a');
    const panel = new NodeGraphPanel(graph);
    const entities = panel.generateUI();
    const line = entities.find((e) => e.type === 'connection_line');
    expect(line!.data!.from).toBeDefined();
    expect(line!.data!.to).toBeDefined();
  });

  it('generates 0 connection lines when no connections', () => {
    const graph = new NodeGraph();
    graph.addNode('MathAdd');
    const panel = new NodeGraphPanel(graph);
    const entities = panel.generateUI();
    expect(entities.filter((e) => e.type === 'connection_line')).toHaveLength(0);
  });
});

// =============================================================================
// selectNode / getSelectedNode
// =============================================================================

describe('NodeGraphPanel — selectNode / getSelectedNode', () => {
  it('getSelectedNode returns null initially', () => {
    expect(new NodeGraphPanel(new NodeGraph()).getSelectedNode()).toBeNull();
  });

  it('selectNode sets selected id', () => {
    const panel = new NodeGraphPanel(new NodeGraph());
    panel.selectNode('n1');
    expect(panel.getSelectedNode()).toBe('n1');
  });

  it('selectNode(null) clears selection', () => {
    const panel = new NodeGraphPanel(new NodeGraph());
    panel.selectNode('n1');
    panel.selectNode(null);
    expect(panel.getSelectedNode()).toBeNull();
  });

  it('selectNode changes selection', () => {
    const panel = new NodeGraphPanel(new NodeGraph());
    panel.selectNode('n1');
    panel.selectNode('n2');
    expect(panel.getSelectedNode()).toBe('n2');
  });
});

// =============================================================================
// generateUI — re-call clears previous entities
// =============================================================================

describe('NodeGraphPanel — generateUI idempotency', () => {
  it('calling generateUI twice returns same entity count', () => {
    const graph = new NodeGraph();
    graph.addNode('MathAdd', { x: 0, y: 0 });
    const panel = new NodeGraphPanel(graph);
    const e1 = panel.generateUI().length;
    const e2 = panel.generateUI().length;
    expect(e1).toBe(e2);
  });

  it('entities list re-calculated fresh on each call', () => {
    const graph = new NodeGraph();
    const panel = new NodeGraphPanel(graph);
    const before = panel.generateUI().length;
    graph.addNode('MathAdd', { x: 0, y: 0 });
    const after = panel.generateUI().length;
    expect(after).toBeGreaterThan(before);
  });
});

// =============================================================================
// executeGraph
// =============================================================================

describe('NodeGraphPanel — executeGraph', () => {
  it('executes a simple chained math graph', () => {
    const graph = new NodeGraph();
    const add = graph.addNode('MathAdd');
    const mul = graph.addNode('MathMultiply');

    add.inputs.find((p) => p.name === 'a')!.defaultValue = 2;
    add.inputs.find((p) => p.name === 'b')!.defaultValue = 3;
    mul.inputs.find((p) => p.name === 'b')!.defaultValue = 4;
    graph.connect(add.id, 'result', mul.id, 'a');

    const panel = new NodeGraphPanel(graph);
    const result = panel.executeGraph();

    expect(result.nodeOrder).toContain(add.id);
    expect(result.nodeOrder).toContain(mul.id);
    expect(result.outputs.get(add.id)?.result).toBe(5);
    expect(result.outputs.get(mul.id)?.result).toBe(20);
  });

  it('returns mutated state from SetState nodes', () => {
    const graph = new NodeGraph();
    const setter = graph.addNode('SetState');
    setter.inputs.find((p) => p.name === 'key')!.defaultValue = 'score';
    setter.inputs.find((p) => p.name === 'value')!.defaultValue = 9001;

    const panel = new NodeGraphPanel(graph);
    const result = panel.executeGraph();

    expect(result.state.score).toBe(9001);
    expect(result.outputs.get(setter.id)?.value).toBe(9001);
  });

  it('reads event payloads and records emitted events', () => {
    const graph = new NodeGraph();
    const onEvent = graph.addNode('OnEvent');
    const emit = graph.addNode('EmitEvent');

    onEvent.inputs.find((p) => p.name === 'eventName')!.defaultValue = 'tick';
    emit.inputs.find((p) => p.name === 'eventName')!.defaultValue = 'pulse';
    emit.inputs.find((p) => p.name === 'payload')!.defaultValue = { ok: true };
    graph.connect(onEvent.id, 'triggered', emit.id, 'trigger');

    const panel = new NodeGraphPanel(graph);
    const result = panel.executeGraph({
      events: new Map([['tick', [{ frame: 1 }]]]),
    });

    expect(result.outputs.get(onEvent.id)?.triggered).toBe(true);
    expect(result.outputs.get(onEvent.id)?.payload).toEqual({ frame: 1 });
    expect(result.emittedEvents.get('pulse')).toEqual([{ ok: true }]);
  });

  it('throws when graph has a cycle', () => {
    const graph = new NodeGraph();
    const a = graph.addNode('MathAdd');
    const b = graph.addNode('MathMultiply');
    graph.connect(a.id, 'result', b.id, 'a');
    (graph as unknown as { connections: Array<Record<string, unknown>> }).connections.push({
      id: 'fake-cycle',
      fromNode: b.id,
      fromPort: 'result',
      toNode: a.id,
      toPort: 'b',
    });
    (graph as unknown as { _sortedOrder: string[] | null })._sortedOrder = null;

    const panel = new NodeGraphPanel(graph);
    expect(() => panel.executeGraph()).toThrow(/Cycle detected/);
  });
});
