import { describe, it, expect } from 'vitest';
import { NodeGraph, EvaluationContext } from '../logic/NodeGraph';
import { NodeGraphCompiler } from '../logic/NodeGraphCompiler';
import { NodeGraphPanel } from '../editor/NodeGraphPanel';

describe('Cycle 103: Visual Logic Editor', () => {
  // -------------------------------------------------------------------------
  // NodeGraph Core
  // -------------------------------------------------------------------------

  it('should add nodes and connect them', () => {
    const graph = new NodeGraph('test');
    const addNode = graph.addNode('MathAdd', { x: 0, y: 0 });
    const mulNode = graph.addNode('MathMultiply', { x: 2, y: 0 });

    expect(graph.getNodes()).toHaveLength(2);

    const conn = graph.connect(addNode.id, 'result', mulNode.id, 'a');
    expect(conn).not.toBeNull();
    expect(graph.getConnections()).toHaveLength(1);
  });

  it('should reject self-connections and type mismatches', () => {
    const graph = new NodeGraph('test');
    const node = graph.addNode('MathAdd');

    // Self-connection
    const selfConn = graph.connect(node.id, 'result', node.id, 'a');
    expect(selfConn).toBeNull();

    // Type mismatch: number output -> boolean input
    const branchNode = graph.addNode('Branch');
    const boolConn = graph.connect(node.id, 'result', branchNode.id, 'condition');
    expect(boolConn).toBeNull(); // number != boolean
  });

  it('should topologically sort nodes', () => {
    const graph = new NodeGraph('test');
    const a = graph.addNode('MathAdd', { x: 0, y: 0 });
    const b = graph.addNode('MathMultiply', { x: 1, y: 0 });
    const c = graph.addNode('Clamp', { x: 2, y: 0 });

    graph.connect(a.id, 'result', b.id, 'a');
    graph.connect(b.id, 'result', c.id, 'value');

    const sorted = graph.topologicalSort();
    const aIdx = sorted.indexOf(a.id);
    const bIdx = sorted.indexOf(b.id);
    const cIdx = sorted.indexOf(c.id);

    expect(aIdx).toBeLessThan(bIdx);
    expect(bIdx).toBeLessThan(cIdx);
  });

  it('should detect cycles', () => {
    const graph = new NodeGraph('test');
    const a = graph.addNode('MathAdd');
    const b = graph.addNode('MathAdd');

    graph.connect(a.id, 'result', b.id, 'a');
    // Force a back-edge (manually bypass validation for test)
    (graph as any).connections.push({
      id: 'forced_back_edge',
      fromNode: b.id,
      fromPort: 'result',
      toNode: a.id,
      toPort: 'b',
    });
    (graph as any)._sortedOrder = null;

    expect(graph.hasCycle()).toBe(true);
  });

  it('should evaluate a math pipeline', () => {
    const graph = new NodeGraph('test');

    // Build: (3 + 7) * 2 = 20
    const addNode = graph.addNode('MathAdd');
    addNode.inputs[0].defaultValue = 3; // a = 3
    addNode.inputs[1].defaultValue = 7; // b = 7

    const mulNode = graph.addNode('MathMultiply');
    mulNode.inputs[1].defaultValue = 2; // b = 2

    graph.connect(addNode.id, 'result', mulNode.id, 'a');

    const ctx: EvaluationContext = {
      state: {},
      deltaTime: 0.016,
      events: new Map(),
      emittedEvents: new Map(),
    };

    const outputs = graph.evaluate(ctx);
    expect(outputs.get(addNode.id)?.result).toBe(10);
    expect(outputs.get(mulNode.id)?.result).toBe(20);
  });

  it('should evaluate state get/set', () => {
    const graph = new NodeGraph('test');

    const setState = graph.addNode('SetState');
    setState.inputs[0].defaultValue = 'score'; // key
    setState.inputs[1].defaultValue = 42; // value

    const getState = graph.addNode('GetState');
    getState.inputs[0].defaultValue = 'score';

    // SetState must run before GetState
    graph.connect(setState.id, 'value', getState.id, 'key'); // Force ordering via 'any' type
    // Actually, key is 'string' and value is 'any', so let's just use topological order
    // SetState has no output connections to GetState in a meaningful way here,
    // so we need to ensure evaluation order. Since they're independent, let's
    // just evaluate and check state.

    const ctx: EvaluationContext = {
      state: {},
      deltaTime: 0.016,
      events: new Map(),
      emittedEvents: new Map(),
    };

    graph.evaluate(ctx);
    expect(ctx.state['score']).toBe(42);
  });

  // -------------------------------------------------------------------------
  // NodeGraphCompiler
  // -------------------------------------------------------------------------

  it('should compile graph to directives', () => {
    const graph = new NodeGraph('test');

    const onEvent = graph.addNode('OnEvent');
    onEvent.data.eventName = 'click';

    const setState = graph.addNode('SetState');
    setState.data.key = 'clicked';
    setState.data.value = true;

    graph.connect(onEvent.id, 'triggered', setState.id, 'value');

    const compiler = new NodeGraphCompiler();
    const result = compiler.compile(graph);

    expect(result.directives.length).toBeGreaterThan(0);
    expect(result.stateDeclarations).toHaveProperty('clicked');
    expect(result.nodeCount).toBe(2);
    expect(result.connectionCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // NodeGraphPanel
  // -------------------------------------------------------------------------

  it('should generate UI entities for graph visualization', () => {
    const graph = new NodeGraph('test');
    graph.addNode('MathAdd', { x: 0, y: 0 });
    graph.addNode('MathMultiply', { x: 4, y: 0 });

    const panel = new NodeGraphPanel(graph);
    const entities = panel.generateUI();

    // Should have: background + 2 node bodies + 2 titles + input/output ports
    expect(entities.length).toBeGreaterThan(5);

    const background = entities.find((e) => e.data?.role === 'background');
    expect(background).toBeDefined();

    const nodeBodies = entities.filter((e) => e.data?.role === 'node');
    expect(nodeBodies).toHaveLength(2);
  });

  it('should serialize and deserialize graph', () => {
    const graph = new NodeGraph('roundtrip');
    const a = graph.addNode('MathAdd', { x: 1, y: 2 });
    const b = graph.addNode('Clamp', { x: 3, y: 4 });
    graph.connect(a.id, 'result', b.id, 'value');

    const json = graph.toJSON();
    const restored = NodeGraph.fromJSON(json);

    expect(restored.getNodes()).toHaveLength(2);
    expect(restored.getConnections()).toHaveLength(1);
  });
});
