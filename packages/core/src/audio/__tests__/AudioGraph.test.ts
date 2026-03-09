import { describe, it, expect, beforeEach } from 'vitest';
import { AudioGraph } from '../AudioGraph';

describe('AudioGraph', () => {
  let graph: AudioGraph;

  beforeEach(() => {
    graph = new AudioGraph();
  });

  // ---------------------------------------------------------------------------
  // Node Management
  // ---------------------------------------------------------------------------

  it('addNode creates a node with id and type', () => {
    const node = graph.addNode('gain');
    expect(node.id).toBeDefined();
    expect(node.type).toBe('gain');
    expect(graph.getNodeCount()).toBe(1);
  });

  it('addNode sets default params per type', () => {
    const gain = graph.addNode('gain');
    expect(gain.params.get('gain')).toBe(1);
    const filter = graph.addNode('filter');
    expect(filter.params.get('cutoff')).toBe(1000);
  });

  it('addNode accepts custom params', () => {
    const node = graph.addNode('gain', { gain: 0.5 });
    expect(node.params.get('gain')).toBe(0.5);
  });

  it('removeNode deletes node and its connections', () => {
    const a = graph.addNode('source');
    const b = graph.addNode('output');
    graph.connect(a.id, b.id);
    graph.removeNode(a.id);
    expect(graph.getNodeCount()).toBe(1);
    expect(graph.getConnectionCount()).toBe(0);
  });

  it('getNode returns undefined for missing', () => {
    expect(graph.getNode('nope')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Connections
  // ---------------------------------------------------------------------------

  it('connect links two nodes', () => {
    const a = graph.addNode('source');
    const b = graph.addNode('gain');
    const connId = graph.connect(a.id, b.id);
    expect(connId).toBeTruthy();
    expect(graph.getConnectionCount()).toBe(1);
    expect(a.outputs).toContain(b.id);
    expect(b.inputs).toContain(a.id);
  });

  it('connect returns null for invalid nodes', () => {
    const a = graph.addNode('source');
    expect(graph.connect(a.id, 'missing')).toBeNull();
  });

  it('disconnect removes connection', () => {
    const a = graph.addNode('source');
    const b = graph.addNode('output');
    const connId = graph.connect(a.id, b.id)!;
    expect(graph.disconnect(connId)).toBe(true);
    expect(graph.getConnectionCount()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Parameters
  // ---------------------------------------------------------------------------

  it('setParam / getParam update node params', () => {
    const node = graph.addNode('gain');
    graph.setParam(node.id, 'gain', 0.3);
    expect(graph.getParam(node.id, 'gain')).toBeCloseTo(0.3);
  });

  it('getParam returns undefined for missing', () => {
    expect(graph.getParam('no', 'gain')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Bypass
  // ---------------------------------------------------------------------------

  it('bypass toggles node bypassed state', () => {
    const node = graph.addNode('filter');
    expect(node.bypassed).toBe(false);
    graph.bypass(node.id, true);
    expect(node.bypassed).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Processing Order
  // ---------------------------------------------------------------------------

  it('getProcessingOrder returns topological sort', () => {
    const src = graph.addNode('source');
    const gain = graph.addNode('gain');
    const out = graph.addNode('output');
    graph.connect(src.id, gain.id);
    graph.connect(gain.id, out.id);
    const order = graph.getProcessingOrder();
    expect(order.indexOf(src.id)).toBeLessThan(order.indexOf(gain.id));
    expect(order.indexOf(gain.id)).toBeLessThan(order.indexOf(out.id));
  });

  // ---------------------------------------------------------------------------
  // Automation
  // ---------------------------------------------------------------------------

  it('automate and applyAutomation update params over time', () => {
    const node = graph.addNode('gain');
    graph.automate(node.id, 'gain', [
      { time: 0, value: 1, curve: 'linear' },
      { time: 1, value: 0, curve: 'linear' },
    ]);
    graph.applyAutomation(0.5);
    expect(graph.getParam(node.id, 'gain')).toBeCloseTo(0.5);
  });

  it('step curve holds previous value', () => {
    const node = graph.addNode('gain');
    graph.automate(node.id, 'gain', [
      { time: 0, value: 1, curve: 'step' },
      { time: 1, value: 0, curve: 'step' },
    ]);
    graph.applyAutomation(0.5);
    expect(graph.getParam(node.id, 'gain')).toBeCloseTo(1);
  });

  it('automation clamps to last value beyond range', () => {
    const node = graph.addNode('gain');
    graph.automate(node.id, 'gain', [
      { time: 0, value: 0.5, curve: 'linear' },
      { time: 1, value: 1, curve: 'linear' },
    ]);
    graph.applyAutomation(5);
    expect(graph.getParam(node.id, 'gain')).toBeCloseTo(1);
  });
});
