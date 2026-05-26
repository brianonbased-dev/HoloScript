import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeGraph } from '../NodeGraph';
import { NodeGraphCompiler } from '../NodeGraphCompiler';

// Mock NodeGraph
function mockGraph(nodes: any[], connections: any[] = []) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return {
    getNodes: () => nodes,
    getConnections: () => connections,
    getNode: (id: string) => nodeMap.get(id) || null,
    getConnectionsFrom: (id: string) => connections.filter((c: any) => c.fromNode === id),
  } as any;
}

function makeNode(id: string, type: string, data: any = {}, inputs: any[] = []) {
  return { id, type, data, inputs, outputs: [] };
}

describe('NodeGraphCompiler', () => {
  let compiler: NodeGraphCompiler;

  beforeEach(() => {
    compiler = new NodeGraphCompiler();
  });

  it('compiles empty graph', () => {
    const result = compiler.compile(mockGraph([]));
    expect(result.nodeCount).toBe(0);
    expect(result.connectionCount).toBe(0);
    expect(result.directives.length).toBe(0);
  });

  it('extracts state declarations from SetState nodes', () => {
    const graph = mockGraph([makeNode('n1', 'SetState', { key: 'health', initialValue: 100 })]);
    const result = compiler.compile(graph);
    expect(result.stateDeclarations.health).toBe(100);
    expect(result.directives.some((d) => d.type === 'state')).toBe(true);
  });

  it('extracts state from GetState nodes', () => {
    const graph = mockGraph([makeNode('n1', 'GetState', { key: 'score' })]);
    const result = compiler.compile(graph);
    expect('score' in result.stateDeclarations).toBe(true);
  });

  it('compiles OnEvent nodes to lifecycle directives', () => {
    const graph = mockGraph([makeNode('n1', 'OnEvent', { eventName: 'click' })]);
    const result = compiler.compile(graph);
    expect(result.eventHandlers.length).toBe(1);
    expect(result.eventHandlers[0].event).toBe('click');
    expect(result.directives.some((d) => d.name === 'on_click')).toBe(true);
  });

  it('compiles Timer nodes to on_update directive', () => {
    const graph = mockGraph([makeNode('t1', 'Timer', { duration: 2, loop: true })]);
    const result = compiler.compile(graph);
    expect(result.directives.some((d) => d.name === 'on_update')).toBe(true);
  });

  it('warns about disconnected nodes', () => {
    const graph = mockGraph([makeNode('orphan', 'MathAdd', {})]);
    const result = compiler.compile(graph);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('disconnected');
  });

  it('does not warn about disconnected OnEvent nodes', () => {
    const graph = mockGraph([makeNode('ev', 'OnEvent', { eventName: 'start' })]);
    const result = compiler.compile(graph);
    expect(result.warnings.length).toBe(0);
  });

  it('traces downstream and generates handler code', () => {
    const nodes = [
      makeNode('ev', 'OnEvent', { eventName: 'grab' }),
      makeNode('set', 'SetState', { key: 'held', value: true }),
    ];
    const connections = [{ fromNode: 'ev', toNode: 'set', fromPort: 'out', toPort: 'in' }];
    const graph = mockGraph(nodes, connections);
    const result = compiler.compile(graph);
    expect(result.eventHandlers[0].handler).toContain('state.held');
  });

  it('generates EmitEvent in handler', () => {
    const nodes = [
      makeNode('ev', 'OnEvent', { eventName: 'loaded' }),
      makeNode('emit', 'EmitEvent', { eventName: 'ready', payload: { ok: true } }),
    ];
    const connections = [{ fromNode: 'ev', toNode: 'emit', fromPort: 'out', toPort: 'in' }];
    const result = compiler.compile(mockGraph(nodes, connections));
    expect(result.eventHandlers[0].handler).toContain("emit('ready'");
  });

  it('counts nodes and connections', () => {
    const nodes = [makeNode('a', 'MathAdd'), makeNode('b', 'MathMultiply')];
    const conns = [{ fromNode: 'a', toNode: 'b', fromPort: 'out', toPort: 'in' }];
    const result = compiler.compile(mockGraph(nodes, conns));
    expect(result.nodeCount).toBe(2);
    expect(result.connectionCount).toBe(1);
  });

  it('emits executable value flow across connected ports', () => {
    const graph = new NodeGraph();
    const event = graph.addNode('OnEvent', { x: 0, y: 0 }, { eventName: 'score' });
    const add = graph.addNode('MathAdd');
    const multiply = graph.addNode('MathMultiply');
    const setState = graph.addNode('SetState', { x: 0, y: 0 }, { key: 'score', initialValue: 0 });

    add.inputs.find((port) => port.name === 'b')!.defaultValue = 3;
    multiply.inputs.find((port) => port.name === 'b')!.defaultValue = 4;

    expect(graph.connect(event.id, 'payload', add.id, 'a')).not.toBeNull();
    expect(graph.connect(add.id, 'result', multiply.id, 'a')).not.toBeNull();
    expect(graph.connect(multiply.id, 'result', setState.id, 'value')).not.toBeNull();

    const result = compiler.compile(graph);
    const handler = result.eventHandlers[0].handler;
    const state: Record<string, unknown> = {};
    const emit = vi.fn();
    const runHandler = new Function('state', 'emit', `return (${handler});`)(state, emit) as (
      payload?: unknown
    ) => void;

    expect(handler).not.toContain('MathAdd: a + b');
    runHandler(2);
    expect(state.score).toBe(20);
  });

  it('MathMultiply with b=0 produces 0, not 1', () => {
    const graph = new NodeGraph();
    const event = graph.addNode('OnEvent', { x: 0, y: 0 }, { eventName: 'zero' });
    const multiply = graph.addNode('MathMultiply');
    const setState = graph.addNode('SetState', { x: 0, y: 0 }, { key: 'result' });

    multiply.inputs.find((port) => port.name === 'b')!.defaultValue = 0;

    expect(graph.connect(event.id, 'payload', multiply.id, 'a')).not.toBeNull();
    expect(graph.connect(multiply.id, 'result', setState.id, 'value')).not.toBeNull();

    const result = compiler.compile(graph);
    const state: Record<string, unknown> = {};
    const runHandler = new Function(
      'state',
      'emit',
      `return (${result.eventHandlers[0].handler});`
    )(state, vi.fn()) as (payload?: unknown) => void;

    runHandler(99);
    expect(state.result).toBe(0);
  });

  it('emits executable branch selection across connected ports', () => {
    const graph = new NodeGraph();
    const event = graph.addNode('OnEvent', { x: 0, y: 0 }, { eventName: 'choice' });
    const branch = graph.addNode('Branch');
    const setState = graph.addNode('SetState', { x: 0, y: 0 }, { key: 'choice' });

    branch.inputs.find((port) => port.name === 'ifTrue')!.defaultValue = 'left';
    branch.inputs.find((port) => port.name === 'ifFalse')!.defaultValue = 'right';

    expect(graph.connect(event.id, 'payload', branch.id, 'condition')).not.toBeNull();
    expect(graph.connect(branch.id, 'result', setState.id, 'value')).not.toBeNull();

    const result = compiler.compile(graph);
    const state: Record<string, unknown> = {};
    const runHandler = new Function(
      'state',
      'emit',
      `return (${result.eventHandlers[0].handler});`
    )(state, vi.fn()) as (payload?: unknown) => void;

    runHandler(true);
    expect(state.choice).toBe('left');
    runHandler(false);
    expect(state.choice).toBe('right');
  });
});
