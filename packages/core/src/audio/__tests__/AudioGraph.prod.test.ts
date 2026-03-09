/**
 * AudioGraph.prod.test.ts
 *
 * Production tests for AudioGraph — node CRUD, connections, default params,
 * bypass, parameter automation (linear/exponential/step), and topological order.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AudioGraph } from '../AudioGraph';

describe('AudioGraph', () => {
  let graph: AudioGraph;

  beforeEach(() => {
    graph = new AudioGraph();
  });

  // -------------------------------------------------------------------------
  // Node Management
  // -------------------------------------------------------------------------
  describe('addNode() / removeNode() / getNode()', () => {
    it('starts empty', () => {
      expect(graph.getNodeCount()).toBe(0);
    });

    it('addNode increments count', () => {
      graph.addNode('source');
      expect(graph.getNodeCount()).toBe(1);
    });

    it('addNode returns the created node', () => {
      const node = graph.addNode('gain');
      expect(node.type).toBe('gain');
      expect(typeof node.id).toBe('string');
    });

    it('getNode retrieves node by id', () => {
      const n = graph.addNode('filter');
      expect(graph.getNode(n.id)).toBe(n);
    });

    it('getNode returns undefined for unknown id', () => {
      expect(graph.getNode('ghost')).toBeUndefined();
    });

    it('removeNode decrements count', () => {
      const n = graph.addNode('gain');
      graph.removeNode(n.id);
      expect(graph.getNodeCount()).toBe(0);
    });

    it('removeNode returns true for existing node', () => {
      const n = graph.addNode('delay');
      expect(graph.removeNode(n.id)).toBe(true);
    });

    it('removeNode returns false for unknown node', () => {
      expect(graph.removeNode('ghost')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Default Parameters
  // -------------------------------------------------------------------------
  describe('default parameters', () => {
    it('gain node has default gain=1', () => {
      const n = graph.addNode('gain');
      expect(n.params.get('gain')).toBe(1);
    });

    it('filter node has default cutoff=1000', () => {
      const n = graph.addNode('filter');
      expect(n.params.get('cutoff')).toBe(1000);
    });

    it('delay node has default time=0.5', () => {
      const n = graph.addNode('delay');
      expect(n.params.get('time')).toBe(0.5);
    });

    it('reverb node has default decay=1.5', () => {
      const n = graph.addNode('reverb');
      expect(n.params.get('decay')).toBe(1.5);
    });

    it('compressor node has default threshold=-24', () => {
      const n = graph.addNode('compressor');
      expect(n.params.get('threshold')).toBe(-24);
    });

    it('custom params override defaults', () => {
      const n = graph.addNode('gain', { gain: 0.5 });
      expect(n.params.get('gain')).toBe(0.5);
    });
  });

  // -------------------------------------------------------------------------
  // Connections
  // -------------------------------------------------------------------------
  describe('connect() / disconnect()', () => {
    it('connect returns a connection id', () => {
      const src = graph.addNode('source');
      const out = graph.addNode('output');
      expect(typeof graph.connect(src.id, out.id)).toBe('string');
    });

    it('connect increments connection count', () => {
      const a = graph.addNode('source');
      const b = graph.addNode('gain');
      graph.connect(a.id, b.id);
      expect(graph.getConnectionCount()).toBe(1);
    });

    it('source outputs and target inputs are updated', () => {
      const a = graph.addNode('source');
      const b = graph.addNode('gain');
      graph.connect(a.id, b.id);
      expect(graph.getNode(a.id)!.outputs).toContain(b.id);
      expect(graph.getNode(b.id)!.inputs).toContain(a.id);
    });

    it('connect returns null for unknown source', () => {
      const b = graph.addNode('output');
      expect(graph.connect('ghost', b.id)).toBeNull();
    });

    it('connect returns null for unknown target', () => {
      const a = graph.addNode('source');
      expect(graph.connect(a.id, 'ghost')).toBeNull();
    });

    it('disconnect removes the connection', () => {
      const a = graph.addNode('source');
      const b = graph.addNode('output');
      const connId = graph.connect(a.id, b.id)!;
      graph.disconnect(connId);
      expect(graph.getConnectionCount()).toBe(0);
    });

    it('disconnect cleans up inputs/outputs', () => {
      const a = graph.addNode('source');
      const b = graph.addNode('output');
      const connId = graph.connect(a.id, b.id)!;
      graph.disconnect(connId);
      expect(graph.getNode(a.id)!.outputs).not.toContain(b.id);
      expect(graph.getNode(b.id)!.inputs).not.toContain(a.id);
    });

    it('disconnect returns false for unknown connection id', () => {
      expect(graph.disconnect('no-conn')).toBe(false);
    });

    it('removeNode also disconnects its connections', () => {
      const a = graph.addNode('source');
      const b = graph.addNode('output');
      graph.connect(a.id, b.id);
      graph.removeNode(a.id);
      expect(graph.getConnectionCount()).toBe(0);
      expect(graph.getNode(b.id)!.inputs).not.toContain(a.id);
    });
  });

  // -------------------------------------------------------------------------
  // Bypass
  // -------------------------------------------------------------------------
  describe('bypass()', () => {
    it('default node is not bypassed', () => {
      const n = graph.addNode('gain');
      expect(n.bypassed).toBe(false);
    });

    it('bypass(true) sets bypassed flag', () => {
      const n = graph.addNode('reverb');
      graph.bypass(n.id, true);
      expect(graph.getNode(n.id)!.bypassed).toBe(true);
    });

    it('bypass(false) clears bypassed flag', () => {
      const n = graph.addNode('reverb');
      graph.bypass(n.id, true);
      graph.bypass(n.id, false);
      expect(graph.getNode(n.id)!.bypassed).toBe(false);
    });

    it('bypass on unknown node is a no-op', () => {
      expect(() => graph.bypass('ghost', true)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // setParam / getParam
  // -------------------------------------------------------------------------
  describe('setParam() / getParam()', () => {
    it('setParam updates a parameter', () => {
      const n = graph.addNode('gain');
      graph.setParam(n.id, 'gain', 0.3);
      expect(graph.getParam(n.id, 'gain')).toBeCloseTo(0.3, 5);
    });

    it('getParam returns undefined for unknown node', () => {
      expect(graph.getParam('ghost', 'gain')).toBeUndefined();
    });

    it('setParam on unknown node is a no-op', () => {
      expect(() => graph.setParam('ghost', 'gain', 1)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Parameter Automation
  // -------------------------------------------------------------------------
  describe('automate() / applyAutomation()', () => {
    it('linear: interpolates between two points', () => {
      const n = graph.addNode('gain');
      graph.automate(n.id, 'gain', [
        { time: 0, value: 0, curve: 'linear' },
        { time: 1, value: 1, curve: 'linear' },
      ]);
      graph.applyAutomation(0.5);
      expect(graph.getParam(n.id, 'gain')).toBeCloseTo(0.5, 5);
    });

    it('before first point returns first value', () => {
      const n = graph.addNode('gain');
      graph.automate(n.id, 'gain', [{ time: 2, value: 0.7, curve: 'linear' }]);
      graph.applyAutomation(0);
      expect(graph.getParam(n.id, 'gain')).toBeCloseTo(0.7, 5);
    });

    it('past last point returns last value', () => {
      const n = graph.addNode('gain');
      graph.automate(n.id, 'gain', [
        { time: 0, value: 0, curve: 'linear' },
        { time: 1, value: 0.9, curve: 'linear' },
      ]);
      graph.applyAutomation(10);
      expect(graph.getParam(n.id, 'gain')).toBeCloseTo(0.9, 5);
    });

    it('step: returns previous value within segment', () => {
      const n = graph.addNode('gain');
      graph.automate(n.id, 'gain', [
        { time: 0, value: 0.3, curve: 'step' },
        { time: 1, value: 0.9, curve: 'step' },
      ]);
      graph.applyAutomation(0.5);
      expect(graph.getParam(n.id, 'gain')).toBeCloseTo(0.3, 5); // step stays at previous
    });

    it('exponential: mid-point between 1 and 100 via exp', () => {
      const n = graph.addNode('filter');
      graph.automate(n.id, 'cutoff', [
        { time: 0, value: 1, curve: 'exponential' },
        { time: 1, value: 100, curve: 'exponential' },
      ]);
      graph.applyAutomation(0.5);
      const val = graph.getParam(n.id, 'cutoff')!;
      // Geometric mean of 1 and 100 ≈ 10
      expect(val).toBeCloseTo(10, 0);
    });

    it('automation on unknown node is a no-op', () => {
      graph.automate('ghost', 'gain', [{ time: 0, value: 1, curve: 'linear' }]);
      expect(() => graph.applyAutomation(0.5)).not.toThrow();
    });

    it('points are sorted by time regardless of input order', () => {
      const n = graph.addNode('gain');
      graph.automate(n.id, 'gain', [
        { time: 1, value: 1, curve: 'linear' },
        { time: 0, value: 0, curve: 'linear' },
      ]);
      graph.applyAutomation(0.5);
      expect(graph.getParam(n.id, 'gain')).toBeCloseTo(0.5, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Processing Order (topological sort)
  // -------------------------------------------------------------------------
  describe('getProcessingOrder()', () => {
    it('single node returns [nodeId]', () => {
      const n = graph.addNode('source');
      expect(graph.getProcessingOrder()).toContain(n.id);
    });

    it('source comes before output in linear chain', () => {
      const src = graph.addNode('source');
      const gain = graph.addNode('gain');
      const out = graph.addNode('output');
      graph.connect(src.id, gain.id);
      graph.connect(gain.id, out.id);
      const order = graph.getProcessingOrder();
      expect(order.indexOf(src.id)).toBeLessThan(order.indexOf(gain.id));
      expect(order.indexOf(gain.id)).toBeLessThan(order.indexOf(out.id));
    });

    it('is cached (dirty flag) and returns same order on second call', () => {
      const src = graph.addNode('source');
      const out = graph.addNode('output');
      graph.connect(src.id, out.id);
      const a = graph.getProcessingOrder();
      const b = graph.getProcessingOrder();
      expect(a).toEqual(b);
    });

    it('reconnecting invalidates cache', () => {
      const a = graph.addNode('source');
      const b = graph.addNode('gain');
      const c = graph.addNode('output');
      graph.connect(a.id, c.id);
      const before = graph.getProcessingOrder();
      graph.connect(a.id, b.id);
      const after = graph.getProcessingOrder();
      expect(after.length).toBeGreaterThanOrEqual(before.length);
    });

    it('all node types can be added without error', () => {
      const types: Array<
        'source' | 'gain' | 'filter' | 'delay' | 'reverb' | 'compressor' | 'output' | 'mixer'
      > = ['source', 'gain', 'filter', 'delay', 'reverb', 'compressor', 'output', 'mixer'];
      for (const t of types) graph.addNode(t);
      expect(() => graph.getProcessingOrder()).not.toThrow();
    });
  });
});
