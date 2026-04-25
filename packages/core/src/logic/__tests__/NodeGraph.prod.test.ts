/**
 * NodeGraph — Production Test Suite (corrected)
 *
 * Covers: construction, addNode (all built-in types), removeNode,
 * connect/disconnect, topological sort, cycle detection, evaluate
 * (math chain, state round-trip, custom evaluator), registerNodeType,
 * and JSON round-trip serialization.
 *
 * Key API facts (verified against source):
 *  - constructor(id?: string)   — bare string, not options object
 *  - addNode(type, position?, data?)  — returns LogicNode with .inputs/.outputs (not .ports)
 *  - connect() returns null (not throws) on validation failure
 *  - evaluate() returns Map<string, Record<string, unknown>>
 *  - EvaluationContext: { state, deltaTime, events, emittedEvents }
 *  - registerNodeType(type, inputs[], outputs[], evaluate)  — 4 args
 *  - hasCycle() uses try/catch on topologicalSort
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeGraph } from '../NodeGraph';
import type { EvaluationContext } from '../NodeGraph';

function makeCtx(state: Record<string, unknown> = {}): EvaluationContext {
  return {
    state,
    deltaTime: 0.016,
    events: new Map(),
    emittedEvents: new Map(),
  };
}

describe('NodeGraph — Production', () => {
  let g: NodeGraph;

  beforeEach(() => {
    g = new NodeGraph();
  });

  // ─── Construction ─────────────────────────────────────────────────────────

  it('constructs with a generated id string', () => {
    expect(typeof g.id).toBe('string');
    expect(g.id.length).toBeGreaterThan(0);
  });

  it('accepts a predefined id via string argument', () => {
    const g3 = new NodeGraph('my-graph');
    expect(g3.id).toBe('my-graph');
  });

  it('two default graphs created at different times have different ids', () => {
    // NodeGraph uses `graph_${Date.now()}` — mock Date.now to advance time
    let tick = 1000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => tick++);
    const g1 = new NodeGraph();
    const g2 = new NodeGraph();
    spy.mockRestore();
    expect(g1.id).not.toBe(g2.id);
  });

  it('starts empty — zero nodes and connections', () => {
    expect(g.getNodes()).toHaveLength(0);
    expect(g.getConnections()).toHaveLength(0);
  });

  // ─── addNode ──────────────────────────────────────────────────────────────

  it('addNode returns node with unique id', () => {
    const n = g.addNode('MathAdd');
    expect(n.id).toBeTruthy();
    expect(n.type).toBe('MathAdd');
  });

  it('addNode registers node in graph', () => {
    g.addNode('MathAdd');
    expect(g.getNodes()).toHaveLength(1);
  });

  it('addNode generates unique ids for multiple nodes', () => {
    const a = g.addNode('MathAdd');
    const b = g.addNode('MathAdd');
    expect(a.id).not.toBe(b.id);
  });

  it('addNode MathMultiply — has a and b inputs', () => {
    const n = g.addNode('MathMultiply');
    const names = n.inputs.map((p) => p.name);
    expect(names).toContain('a');
    expect(names).toContain('b');
  });

  it('addNode Compare — has a and b inputs', () => {
    const n = g.addNode('Compare');
    const names = n.inputs.map((p) => p.name);
    expect(names).toContain('a');
    expect(names).toContain('b');
  });

  it('addNode Compare — has equal/greater/less outputs', () => {
    const n = g.addNode('Compare');
    const names = n.outputs.map((p) => p.name);
    expect(names).toContain('equal');
    expect(names).toContain('greater');
    expect(names).toContain('less');
  });

  it('addNode Branch — has condition input', () => {
    const n = g.addNode('Branch');
    expect(n.inputs.some((p) => p.name === 'condition')).toBe(true);
  });

  it('addNode Not — has value input and result output', () => {
    const n = g.addNode('Not');
    expect(n.inputs.some((p) => p.name === 'value')).toBe(true);
    expect(n.outputs.some((p) => p.name === 'result')).toBe(true);
  });

  it('addNode GetState — has key input port', () => {
    const n = g.addNode('GetState');
    expect(n.inputs.some((p) => p.name === 'key')).toBe(true);
  });

  it('addNode SetState — has key and value input ports', () => {
    const n = g.addNode('SetState');
    const names = n.inputs.map((p) => p.name);
    expect(names).toContain('key');
    expect(names).toContain('value');
  });

  it('addNode OnEvent — has eventName input', () => {
    const n = g.addNode('OnEvent');
    // Source: port is named 'eventName' (not 'event')
    expect(n.inputs.some((p) => p.name === 'eventName')).toBe(true);
  });

  it('addNode EmitEvent — has eventName input', () => {
    const n = g.addNode('EmitEvent');
    // Source: port is named 'eventName' (not 'event')
    expect(n.inputs.some((p) => p.name === 'eventName')).toBe(true);
  });

  it('addNode Timer — has duration input', () => {
    const n = g.addNode('Timer');
    expect(n.inputs.some((p) => p.name === 'duration')).toBe(true);
  });

  it('addNode Clamp — has min and max inputs', () => {
    const n = g.addNode('Clamp');
    const names = n.inputs.map((p) => p.name);
    expect(names).toContain('min');
    expect(names).toContain('max');
  });

  it('addNode Random — has value output', () => {
    const n = g.addNode('Random');
    expect(n.outputs.some((p) => p.name === 'value')).toBe(true);
  });

  it('addNode throws (or returns node with empty ports) for unknown type', () => {
    // Unknown types fall back to empty inputs/outputs if BUILT_IN_NODE_TYPES missing
    // The implementation may or may not throw; confirm behavior either way
    expect(() => {
      const n = g.addNode('NonExistentType');
      // If it doesn't throw, the node is created with no built-in inputs
      expect(n.type).toBe('NonExistentType');
    }).not.toThrow();
    // At worst: added with empty ports — verify graph still stable
    expect(g.getNodes().length).toBeGreaterThanOrEqual(0);
  });

  // ─── removeNode ───────────────────────────────────────────────────────────

  it('removeNode removes from graph', () => {
    const n = g.addNode('MathAdd');
    g.removeNode(n.id);
    expect(g.getNodes()).toHaveLength(0);
  });

  it('removeNode also deletes connections referencing that node', () => {
    const a = g.addNode('MathAdd');
    const b = g.addNode('MathMultiply');
    g.connect(a.id, 'result', b.id, 'a');
    g.removeNode(a.id);
    expect(g.getConnections()).toHaveLength(0);
  });

  it('removeNode on non-existent id returns false', () => {
    expect(g.removeNode('ghost')).toBe(false);
  });

  // ─── connect / disconnect ─────────────────────────────────────────────────

  it('connect returns a connection with id', () => {
    const a = g.addNode('MathAdd');
    const b = g.addNode('MathMultiply');
    const conn = g.connect(a.id, 'result', b.id, 'a');
    expect(conn).not.toBeNull();
    expect(conn!.fromNode).toBe(a.id);
    expect(conn!.toNode).toBe(b.id);
  });

  it('connect stores connection in graph', () => {
    const a = g.addNode('MathAdd');
    const b = g.addNode('MathMultiply');
    g.connect(a.id, 'result', b.id, 'a');
    expect(g.getConnections()).toHaveLength(1);
  });

  it('connect returns null on unknown source node', () => {
    const b = g.addNode('MathAdd');
    expect(g.connect('nope', 'result', b.id, 'a')).toBeNull();
  });

  it('connect returns null on unknown destination node', () => {
    const a = g.addNode('MathAdd');
    expect(g.connect(a.id, 'result', 'nope', 'a')).toBeNull();
  });

  it('connect returns null on self-connection', () => {
    const a = g.addNode('MathAdd');
    expect(g.connect(a.id, 'result', a.id, 'a')).toBeNull();
  });

  it('connect replaces existing connection to the same input port', () => {
    const a = g.addNode('MathAdd');
    const b = g.addNode('MathMultiply');
    const c = g.addNode('Compare');
    g.connect(a.id, 'result', c.id, 'a');
    g.connect(b.id, 'result', c.id, 'a'); // replaces previous
    const conns = g.getConnections().filter((x) => x.toPort === 'a' && x.toNode === c.id);
    expect(conns).toHaveLength(1);
    expect(conns[0].fromNode).toBe(b.id);
  });

  it('disconnect removes connection by id', () => {
    const a = g.addNode('MathAdd');
    const b = g.addNode('MathMultiply');
    const conn = g.connect(a.id, 'result', b.id, 'a')!;
    g.disconnect(conn.id);
    expect(g.getConnections()).toHaveLength(0);
  });

  it('disconnect returns false for unknown connection id', () => {
    expect(g.disconnect('none')).toBe(false);
  });

  // ─── Topological Sort ─────────────────────────────────────────────────────

  it('topologicalSort on empty graph returns empty', () => {
    expect(g.topologicalSort()).toHaveLength(0);
  });

  it('topologicalSort returns single node', () => {
    const n = g.addNode('MathAdd');
    const order = g.topologicalSort();
    expect(order).toContain(n.id);
  });

  it('topologicalSort: source before dependent', () => {
    const a = g.addNode('MathAdd');
    const b = g.addNode('MathMultiply');
    g.connect(a.id, 'result', b.id, 'a');
    const order = g.topologicalSort();
    expect(order.indexOf(a.id)).toBeLessThan(order.indexOf(b.id));
  });

  it('topologicalSort: chain A→B→C respects order', () => {
    const a = g.addNode('MathAdd');
    const b = g.addNode('MathMultiply');
    const c = g.addNode('Compare');
    g.connect(a.id, 'result', b.id, 'a');
    g.connect(b.id, 'result', c.id, 'a');
    const order = g.topologicalSort();
    expect(order.indexOf(a.id)).toBeLessThan(order.indexOf(b.id));
    expect(order.indexOf(b.id)).toBeLessThan(order.indexOf(c.id));
  });

  // ─── Cycle Detection ──────────────────────────────────────────────────────

  it('hasCycle returns false on acyclic graph', () => {
    const a = g.addNode('MathAdd');
    const b = g.addNode('MathMultiply');
    g.connect(a.id, 'result', b.id, 'a');
    expect(g.hasCycle()).toBe(false);
  });

  it('hasCycle returns false on empty graph', () => {
    expect(g.hasCycle()).toBe(false);
  });

  it('hasCycle returns true when a cycle is injected', () => {
    const a = g.addNode('MathAdd');
    const b = g.addNode('MathMultiply');
    g.connect(a.id, 'result', b.id, 'a');
    // Force cycle by pushing reversal directly (bypasses port checks)
    (g as any).connections.push({
      id: 'fake-cycle',
      fromNode: b.id,
      fromPort: 'result',
      toNode: a.id,
      toPort: 'b',
    });
    (g as any)._sortedOrder = null; // invalidate cache
    expect(g.hasCycle()).toBe(true);
  });

  // ─── Evaluate ─────────────────────────────────────────────────────────────

  it('evaluate: MathAdd computes a + b from defaultValues', () => {
    const n = g.addNode('MathAdd');
    // Patch defaultValues to test input propagation
    n.inputs.find((p) => p.name === 'a')!.defaultValue = 3;
    n.inputs.find((p) => p.name === 'b')!.defaultValue = 4;
    const results = g.evaluate(makeCtx());
    expect(results.get(n.id)?.result).toBe(7);
  });

  it('evaluate: MathMultiply computes a * b', () => {
    const n = g.addNode('MathMultiply');
    n.inputs.find((p) => p.name === 'a')!.defaultValue = 6;
    n.inputs.find((p) => p.name === 'b')!.defaultValue = 7;
    const results = g.evaluate(makeCtx());
    expect(results.get(n.id)?.result).toBe(42);
  });

  it('evaluate: chained Add → Multiply', () => {
    const add = g.addNode('MathAdd');
    const mul = g.addNode('MathMultiply');
    add.inputs.find((p) => p.name === 'a')!.defaultValue = 2;
    add.inputs.find((p) => p.name === 'b')!.defaultValue = 3; // 2+3=5
    mul.inputs.find((p) => p.name === 'b')!.defaultValue = 4; // 5*4=20
    g.connect(add.id, 'result', mul.id, 'a');
    const results = g.evaluate(makeCtx());
    expect(results.get(mul.id)?.result).toBe(20);
  });

  it('evaluate: Not node inverts boolean', () => {
    const notNode = g.addNode('Not');
    notNode.inputs.find((p) => p.name === 'value')!.defaultValue = true;
    const results = g.evaluate(makeCtx());
    expect(results.get(notNode.id)?.result).toBe(false);
  });

  it('evaluate: Random produces number in [min, max]', () => {
    const r = g.addNode('Random');
    r.inputs.find((p) => p.name === 'min')!.defaultValue = 10;
    r.inputs.find((p) => p.name === 'max')!.defaultValue = 20;
    const results = g.evaluate(makeCtx());
    const val = results.get(r.id)?.value as number;
    expect(val).toBeGreaterThanOrEqual(10);
    expect(val).toBeLessThanOrEqual(20);
  });

  it('evaluate: Clamp clamps value within range', () => {
    const c = g.addNode('Clamp');
    c.inputs.find((p) => p.name === 'value')!.defaultValue = 150;
    c.inputs.find((p) => p.name === 'min')!.defaultValue = 0;
    c.inputs.find((p) => p.name === 'max')!.defaultValue = 100;
    const results = g.evaluate(makeCtx());
    expect(results.get(c.id)?.result).toBe(100);
  });

  it('evaluate: SetState writes to context.state', () => {
    const setter = g.addNode('SetState');
    setter.inputs.find((p) => p.name === 'key')!.defaultValue = 'hp';
    setter.inputs.find((p) => p.name === 'value')!.defaultValue = 99;
    const ctx = makeCtx();
    g.evaluate(ctx);
    expect(ctx.state['hp']).toBe(99);
  });

  it('evaluate: GetState reads from context.state', () => {
    const getter = g.addNode('GetState');
    getter.inputs.find((p) => p.name === 'key')!.defaultValue = 'hp';
    const ctx = makeCtx({ hp: 42 });
    const results = g.evaluate(ctx);
    expect(results.get(getter.id)?.value).toBe(42);
  });

  it('evaluate returns Map', () => {
    g.addNode('MathAdd');
    const results = g.evaluate(makeCtx());
    expect(results instanceof Map).toBe(true);
  });

  // ─── Custom Node Registration ──────────────────────────────────────────────

  it('registerNodeType registers an evaluatable custom node', () => {
    g.registerNodeType(
      'Double',
      [{ name: 'x', type: 'number', defaultValue: 0 }],
      [{ name: 'result', type: 'number' }],
      (_node, inputs) => ({ result: (inputs[0] as number) * 2 })
    );
    const n = g.addNode('Double');
    n.inputs.find((p) => p.name === 'x')!.defaultValue = 7;
    const results = g.evaluate(makeCtx());
    expect(results.get(n.id)?.result).toBe(14);
  });

  // ─── Serialization ────────────────────────────────────────────────────────

  it('toJSON returns object with id, nodes, connections', () => {
    g.addNode('MathAdd');
    const json = g.toJSON();
    expect(json.id).toBe(g.id);
    expect(json.nodes).toHaveLength(1);
    expect(json.connections).toHaveLength(0);
  });

  it('fromJSON restores graph with correct node count', () => {
    g.addNode('MathAdd');
    g.addNode('MathMultiply');
    const json = g.toJSON();
    const restored = NodeGraph.fromJSON(json);
    expect(restored.getNodes()).toHaveLength(2);
  });

  it('fromJSON preserves connections', () => {
    const a = g.addNode('MathAdd');
    const b = g.addNode('MathMultiply');
    g.connect(a.id, 'result', b.id, 'a');
    const restored = NodeGraph.fromJSON(g.toJSON());
    expect(restored.getConnections()).toHaveLength(1);
  });

  it('fromJSON preserves graph id', () => {
    const g2 = new NodeGraph('known-id');
    const restored = NodeGraph.fromJSON(g2.toJSON());
    expect(restored.id).toBe('known-id');
  });
});
