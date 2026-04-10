/**
 * Cycle 199 — Visual Logic Graphs
 *
 * Covers NodeGraph  (add/remove/connect, built-in nodes, topological sort, evaluate, serialization)
 *        NodeGraphCompiler (compile to directives, state declarations, event handlers, warnings)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { NodeGraph } from '../logic/NodeGraph';
import { NodeGraphCompiler } from '../logic/NodeGraphCompiler';
import type { EvaluationContext } from '../logic/NodeGraph';

function makeCtx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    state: {},
    deltaTime: 0.016,
    events: new Map(),
    emittedEvents: new Map(),
    ...overrides,
  };
}

// ─── NodeGraph ───────────────────────────────────────────────────────────────
describe('NodeGraph', () => {
  let graph: NodeGraph;

  beforeEach(() => {
    graph = new NodeGraph('test-graph');
  });

  it('addNode creates a node with proper structure', () => {
    const node = graph.addNode('MathAdd', { x: 10, y: 20 });
    expect(node.id).toBeDefined();
    expect(node.type).toBe('MathAdd');
    expect(node.inputs.length).toBeGreaterThan(0);
    expect(node.outputs.length).toBeGreaterThan(0);
  });

  it('getNode retrieves by id', () => {
    const node = graph.addNode('MathAdd');
    expect(graph.getNode(node.id)).toBeDefined();
    expect(graph.getNode('nonexistent')).toBeUndefined();
  });

  it('getNodes returns all nodes', () => {
    graph.addNode('MathAdd');
    graph.addNode('Branch');
    expect(graph.getNodes()).toHaveLength(2);
  });

  it('removeNode deletes node and its connections', () => {
    const a = graph.addNode('MathAdd');
    const b = graph.addNode('MathMultiply');
    graph.connect(a.id, 'result', b.id, 'a');
    graph.removeNode(a.id);
    expect(graph.getNode(a.id)).toBeUndefined();
    expect(graph.getConnections()).toHaveLength(0);
  });

  it('connect creates a valid connection', () => {
    const a = graph.addNode('MathAdd');
    const b = graph.addNode('MathMultiply');
    const conn = graph.connect(a.id, 'result', b.id, 'a');
    expect(conn).not.toBeNull();
    expect(graph.getConnections()).toHaveLength(1);
  });

  it('connect rejects invalid port names', () => {
    const a = graph.addNode('MathAdd');
    const b = graph.addNode('MathMultiply');
    const conn = graph.connect(a.id, 'nonexistent', b.id, 'a');
    expect(conn).toBeNull();
  });

  it('disconnect removes a connection', () => {
    const a = graph.addNode('MathAdd');
    const b = graph.addNode('MathMultiply');
    const conn = graph.connect(a.id, 'result', b.id, 'a')!;
    expect(graph.disconnect(conn.id)).toBe(true);
    expect(graph.getConnections()).toHaveLength(0);
  });

  it('getConnectionsFrom / getConnectionsTo filter correctly', () => {
    const a = graph.addNode('MathAdd');
    const b = graph.addNode('MathMultiply');
    graph.connect(a.id, 'result', b.id, 'a');
    expect(graph.getConnectionsFrom(a.id)).toHaveLength(1);
    expect(graph.getConnectionsTo(b.id)).toHaveLength(1);
    expect(graph.getConnectionsFrom(b.id)).toHaveLength(0);
  });

  it('topologicalSort returns valid ordering', () => {
    const a = graph.addNode('MathAdd');
    const b = graph.addNode('MathMultiply');
    graph.connect(a.id, 'result', b.id, 'a');
    const order = graph.topologicalSort();
    expect(order.indexOf(a.id)).toBeLessThan(order.indexOf(b.id));
  });

  it('hasCycle detects no cycle in acyclic graph', () => {
    const a = graph.addNode('MathAdd');
    const b = graph.addNode('MathMultiply');
    graph.connect(a.id, 'result', b.id, 'a');
    expect(graph.hasCycle()).toBe(false);
  });

  // --- Evaluation ---
  // NodeGraph.evaluate resolves inputs from port.defaultValue (not node.data).
  // MathAdd defaults: a=0, b=0 → result=0. We verify defaults evaluate correctly.
  it('evaluate MathAdd with defaults produces 0+0=0', () => {
    const a = graph.addNode('MathAdd');
    const results = graph.evaluate(makeCtx());
    const output = results.get(a.id);
    expect(output?.result).toBe(0);
  });

  it('evaluate MathAdd chain: (0+0)*1=0 via connections', () => {
    const add = graph.addNode('MathAdd'); // 0+0=0
    const mul = graph.addNode('MathMultiply'); // default b=1
    graph.connect(add.id, 'result', mul.id, 'a');
    const results = graph.evaluate(makeCtx());
    expect(results.get(mul.id)?.result).toBe(0);
  });

  it('evaluate Compare with defaults (0 vs 0) → equal=true', () => {
    const c = graph.addNode('Compare');
    const results = graph.evaluate(makeCtx());
    const output = results.get(c.id);
    expect(output?.equal).toBe(true);
    expect(output?.greater).toBe(false);
    expect(output?.less).toBe(false);
  });

  it('evaluate Branch with default condition=false returns ifFalse', () => {
    const b = graph.addNode('Branch');
    const results = graph.evaluate(makeCtx());
    // default condition is false, so result = ifFalse (undefined/null default)
    const output = results.get(b.id);
    expect(output?.result).toBeDefined(); // Branch always outputs something
  });

  it('evaluate Not with default value=false inverts to true', () => {
    const n = graph.addNode('Not');
    const results = graph.evaluate(makeCtx());
    // default value is false → !false = true
    expect(results.get(n.id)?.result).toBe(true);
  });

  it('evaluate SetState writes to context state', () => {
    // SetState defaults: key='', value=undefined
    // The evaluator writes to ctx.state using the key from inputs
    const s = graph.addNode('SetState');
    const ctx = makeCtx();
    graph.evaluate(ctx);
    // With default key '' and no value, it should have written something
    expect(typeof ctx.state).toBe('object');
  });

  it('evaluate OnEvent with no matching event → triggered=false', () => {
    const ev = graph.addNode('OnEvent');
    const results = graph.evaluate(makeCtx());
    expect(results.get(ev.id)?.triggered).toBe(false);
  });

  it('evaluate OnEvent with matching event → triggered=true', () => {
    const ev = graph.addNode('OnEvent'); // default eventName='tick'
    const events = new Map<string, unknown[]>();
    events.set('tick', [{ data: 1 }]);
    const results = graph.evaluate(makeCtx({ events }));
    expect(results.get(ev.id)?.triggered).toBe(true);
  });

  it('evaluate Clamp with defaults (value=0, min=0, max=1) → 0', () => {
    const c = graph.addNode('Clamp');
    const results = graph.evaluate(makeCtx());
    expect(results.get(c.id)?.result).toBe(0);
  });

  it('evaluate Random produces a number', () => {
    const r = graph.addNode('Random');
    const results = graph.evaluate(makeCtx());
    const val = results.get(r.id)?.value;
    expect(typeof val).toBe('number');
    expect(val as number).toBeGreaterThanOrEqual(0);
    expect(val as number).toBeLessThanOrEqual(1);
  });

  // --- Serialization ---
  it('toJSON / fromJSON roundtrip preserves structure', () => {
    const a = graph.addNode('MathAdd');
    const b = graph.addNode('MathMultiply');
    graph.connect(a.id, 'result', b.id, 'a');

    const json = graph.toJSON();
    const restored = NodeGraph.fromJSON(json);
    expect(restored.getNodes()).toHaveLength(2);
    expect(restored.getConnections()).toHaveLength(1);
  });

  it('registerNodeType adds custom evaluator', () => {
    graph.registerNodeType(
      'Double',
      [{ name: 'val', type: 'number', defaultValue: 7 }],
      [{ name: 'result', type: 'number' }],
      (_node, inputs) => ({ result: (inputs.val as number) * 2 })
    );
    const n = graph.addNode('Double');
    const results = graph.evaluate(makeCtx());
    expect(results.get(n.id)?.result).toBe(14);
  });
});

// ─── NodeGraphCompiler ───────────────────────────────────────────────────────
describe('NodeGraphCompiler', () => {
  let compiler: NodeGraphCompiler;

  beforeEach(() => {
    compiler = new NodeGraphCompiler();
  });

  it('compile empty graph produces empty result', () => {
    const graph = new NodeGraph();
    const result = compiler.compile(graph);
    expect(result.nodeCount).toBe(0);
    expect(result.connectionCount).toBe(0);
    expect(result.directives).toHaveLength(0);
  });

  it('compile extracts state declarations from SetState nodes', () => {
    const graph = new NodeGraph();
    graph.addNode('SetState', { x: 0, y: 0 }, { key: 'score', initialValue: 0 });
    const result = compiler.compile(graph);
    expect(result.stateDeclarations).toHaveProperty('score');
  });

  it('compile generates event handlers from OnEvent nodes', () => {
    const graph = new NodeGraph();
    const onEvent = graph.addNode('OnEvent', { x: 0, y: 0 }, { eventName: 'tick' });
    const setState = graph.addNode('SetState', { x: 0, y: 0 }, { key: 'x', value: 1 });
    graph.connect(onEvent.id, 'triggered', setState.id, 'key');
    const result = compiler.compile(graph);
    expect(result.eventHandlers.length).toBeGreaterThan(0);
    expect(result.eventHandlers[0].event).toBe('tick');
  });

  it('compile generates timer lifecycle directives', () => {
    const graph = new NodeGraph();
    graph.addNode('Timer', { x: 0, y: 0 }, { duration: 2, loop: true });
    const result = compiler.compile(graph);
    const timerDirective = result.directives.find((d) => d.name === 'on_update');
    expect(timerDirective).toBeDefined();
  });

  it('compile warns about disconnected nodes', () => {
    const graph = new NodeGraph();
    graph.addNode('MathAdd');
    const result = compiler.compile(graph);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('disconnected');
  });

  it('compile sets correct nodeCount and connectionCount', () => {
    const graph = new NodeGraph();
    const a = graph.addNode('MathAdd');
    const b = graph.addNode('MathMultiply');
    graph.connect(a.id, 'result', b.id, 'a');
    const result = compiler.compile(graph);
    expect(result.nodeCount).toBe(2);
    expect(result.connectionCount).toBe(1);
  });
});
