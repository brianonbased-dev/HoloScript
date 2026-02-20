/**
 * ScriptingSystems.prod.test.ts
 *
 * Production tests for the visual scripting / VM subsystem.
 * Covers: ScriptVM (OpCodes, registers, functions), NodeGraph, NodeLibrary.
 * Pure in-memory, deterministic, no I/O.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptVM, OpCode } from '../ScriptVM';
import type { Instruction } from '../ScriptVM';
import { NodeGraph } from '../NodeGraph';
import type { GraphNode } from '../NodeGraph';
import { NodeLibrary } from '../NodeLibrary';

// Helpers
function p(v: number): Instruction { return { op: OpCode.PUSH, operand: v }; }
function halt(): Instruction { return { op: OpCode.HALT }; }
function op(o: OpCode): Instruction { return { op: o }; }
function load(n: string): Instruction { return { op: OpCode.LOAD, operand: n }; }
function store(n: string): Instruction { return { op: OpCode.STORE, operand: n }; }
function jmp(a: number): Instruction { return { op: OpCode.JMP, operand: a }; }
function jmpIf(a: number): Instruction { return { op: OpCode.JMP_IF, operand: a }; }
function jmpNot(a: number): Instruction { return { op: OpCode.JMP_NOT, operand: a }; }
function call(n: string): Instruction { return { op: OpCode.CALL, operand: n }; }

function makeNode(id: string, portSpecs?: Array<{id: string, dir: 'input'|'output', type?: string}>): GraphNode {
  const ports = (portSpecs ?? [{ id: 'out', dir: 'output', type: 'number' }]).map(ps => ({
    id: ps.id, name: ps.id, type: (ps.type ?? 'number') as any, direction: ps.dir,
  }));
  return { id, type: 'test', label: id, ports, position: { x: 0, y: 0 }, data: {} };
}

// =============================================================================
// ScriptVM — arithmetic
// =============================================================================

describe('ScriptVM — Core OpCodes', () => {
  let vm: ScriptVM;
  beforeEach(() => { vm = new ScriptVM(); });

  it('HALT stops execution immediately', () => {
    vm.load([halt(), p(99), halt()]);
    const s = vm.run();
    expect(s.stack).toHaveLength(0);
    expect(s.instructionsExecuted).toBe(1);
  });

  it('NOP executes without error', () => {
    vm.load([{ op: OpCode.NOP }, halt()]);
    expect(vm.run().error).toBeNull();
  });

  it('PUSH stacks a value', () => {
    vm.load([p(42), halt()]);
    expect(vm.run().stack[0]).toBe(42);
  });

  it('POP removes top of stack', () => {
    vm.load([p(1), p(2), { op: OpCode.POP }, halt()]);
    expect(vm.run().stack).toEqual([1]);
  });

  it('ADD', () => { vm.load([p(10), p(3), op(OpCode.ADD), halt()]); expect(vm.run().stack[0]).toBe(13); });
  it('SUB', () => { vm.load([p(10), p(3), op(OpCode.SUB), halt()]); expect(vm.run().stack[0]).toBe(7); });
  it('MUL', () => { vm.load([p(6), p(7), op(OpCode.MUL), halt()]); expect(vm.run().stack[0]).toBe(42); });
  it('DIV', () => { vm.load([p(10), p(4), op(OpCode.DIV), halt()]); expect(vm.run().stack[0]).toBeCloseTo(2.5); });
  it('MOD', () => { vm.load([p(10), p(3), op(OpCode.MOD), halt()]); expect(vm.run().stack[0]).toBe(1); });
  it('NEG', () => { vm.load([p(5), op(OpCode.NEG), halt()]); expect(vm.run().stack[0]).toBe(-5); });

  it('DIV by zero sets error', () => {
    vm.load([p(1), p(0), op(OpCode.DIV), halt()]);
    expect(vm.run().error).toMatch(/division by zero/i);
  });
});

describe('ScriptVM — Comparison & Logic', () => {
  let vm: ScriptVM;
  beforeEach(() => { vm = new ScriptVM(); });

  it('EQ equal → 1', () => { vm.load([p(3), p(3), op(OpCode.EQ), halt()]); expect(vm.run().stack[0]).toBe(1); });
  it('EQ not equal → 0', () => { vm.load([p(3), p(4), op(OpCode.EQ), halt()]); expect(vm.run().stack[0]).toBe(0); });
  it('NEQ works', () => { vm.load([p(3), p(4), op(OpCode.NEQ), halt()]); expect(vm.run().stack[0]).toBe(1); });
  it('LT a<b → 1', () => { vm.load([p(2), p(5), op(OpCode.LT), halt()]); expect(vm.run().stack[0]).toBe(1); });
  it('LT a==b → 0', () => { vm.load([p(5), p(5), op(OpCode.LT), halt()]); expect(vm.run().stack[0]).toBe(0); });
  it('GT a>b → 1', () => { vm.load([p(7), p(3), op(OpCode.GT), halt()]); expect(vm.run().stack[0]).toBe(1); });
  it('LTE at boundary → 1', () => { vm.load([p(5), p(5), op(OpCode.LTE), halt()]); expect(vm.run().stack[0]).toBe(1); });
  it('GTE at boundary → 1', () => { vm.load([p(5), p(5), op(OpCode.GTE), halt()]); expect(vm.run().stack[0]).toBe(1); });

  it('AND both truthy → 1', () => { vm.load([p(1), p(1), op(OpCode.AND), halt()]); expect(vm.run().stack[0]).toBe(1); });
  it('AND one zero → 0', () => { vm.load([p(0), p(1), op(OpCode.AND), halt()]); expect(vm.run().stack[0]).toBe(0); });
  it('OR one truthy → 1', () => { vm.load([p(0), p(1), op(OpCode.OR), halt()]); expect(vm.run().stack[0]).toBe(1); });
  it('OR both zero → 0', () => { vm.load([p(0), p(0), op(OpCode.OR), halt()]); expect(vm.run().stack[0]).toBe(0); });
  it('NOT 0 → 1', () => { vm.load([p(0), op(OpCode.NOT), halt()]); expect(vm.run().stack[0]).toBe(1); });
  it('NOT non-zero → 0', () => { vm.load([p(5), op(OpCode.NOT), halt()]); expect(vm.run().stack[0]).toBe(0); });
});

describe('ScriptVM — Registers, Jumps, Functions', () => {
  let vm: ScriptVM;
  beforeEach(() => { vm = new ScriptVM(); });

  it('STORE and LOAD roundtrip', () => {
    vm.load([p(42), store('x'), load('x'), halt()]);
    const s = vm.run();
    expect(s.stack[0]).toBe(42);
    expect(s.registers.get('x')).toBe(42);
  });

  it('LOAD uninitialised register → 0', () => {
    vm.load([load('?'), halt()]);
    expect(vm.run().stack[0]).toBe(0);
  });

  it('JMP unconditional', () => {
    vm.load([jmp(2), p(99), halt()]); // skip p(99)
    expect(vm.run().stack).toHaveLength(0);
  });

  it('JMP_IF jumps when truthy', () => {
    vm.load([p(1), jmpIf(3), p(99), halt()]);
    expect(vm.run().stack).toHaveLength(0);
  });

  it('JMP_IF does not jump when falsy', () => {
    vm.load([p(0), jmpIf(3), p(99), halt()]);
    expect(vm.run().stack[0]).toBe(99);
  });

  it('JMP_NOT jumps when falsy', () => {
    vm.load([p(0), jmpNot(3), p(99), halt()]);
    expect(vm.run().stack).toHaveLength(0);
  });

  it('CALL abs', () => {
    vm.load([p(-5), p(1), call('abs'), halt()]);
    expect(vm.run().stack[0]).toBe(5);
  });

  it('CALL min', () => {
    vm.load([p(3), p(7), p(2), call('min'), halt()]);
    expect(vm.run().stack[0]).toBe(3);
  });

  it('CALL max', () => {
    vm.load([p(3), p(7), p(2), call('max'), halt()]);
    expect(vm.run().stack[0]).toBe(7);
  });

  it('CALL sqrt', () => {
    vm.load([p(16), p(1), call('sqrt'), halt()]);
    expect(vm.run().stack[0]).toBe(4);
  });

  it('CALL unknown function sets error', () => {
    vm.load([p(1), call('nope'), halt()]);
    expect(vm.run().error).toMatch(/unknown function/i);
  });

  it('RET halts execution', () => {
    vm.load([p(5), { op: OpCode.RET }, p(99), halt()]);
    const s = vm.run();
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0]).toBe(5);
  });

  it('registerFunction registers custom native', () => {
    vm.registerFunction('double', (x) => x * 2);
    vm.load([p(21), p(1), call('double'), halt()]);
    expect(vm.run().stack[0]).toBe(42);
  });

  it('setRegister / getRegister work independently', () => {
    vm.setRegister('hp', 100);
    expect(vm.getRegister('hp')).toBe(100);
    expect(vm.getRegister('missing')).toBe(0);
  });

  it('max instructions guard stops infinite loop', () => {
    vm.load([jmp(0)]);
    expect(vm.run().error).toMatch(/max instructions/i);
  });

  it('ADD chain 1+2+3=6', () => {
    vm.load([p(1), p(2), op(OpCode.ADD), p(3), op(OpCode.ADD), halt()]);
    expect(vm.run().stack[0]).toBe(6);
  });

  it('getState snapshot is accurate', () => {
    vm.load([p(7), halt()]);
    const s = vm.run();
    expect(s.stack).toEqual([7]);
    expect(s.running).toBe(false);
    expect(s.instructionsExecuted).toBeGreaterThan(0);
  });

  it('load() resets stack', () => {
    vm.load([p(5), halt()]);
    vm.run();
    expect(vm.getStackSize()).toBe(1);
    vm.load([]);
    expect(vm.getStackSize()).toBe(0);
  });
});

// =============================================================================
// NodeGraph
// =============================================================================

describe('NodeGraph', () => {
  let graph: NodeGraph;
  beforeEach(() => { graph = new NodeGraph(); });

  it('starts empty', () => {
    expect(graph.getNodeCount()).toBe(0);
    expect(graph.getWireCount()).toBe(0);
  });

  it('addNode and getNode', () => {
    graph.addNode(makeNode('A'));
    expect(graph.getNodeCount()).toBe(1);
    expect(graph.getNode('A')).toBeDefined();
  });

  it('removeNode returns true and deletes', () => {
    graph.addNode(makeNode('A'));
    expect(graph.removeNode('A')).toBe(true);
    expect(graph.getNodeCount()).toBe(0);
  });

  it('removeNode returns false for missing', () => {
    expect(graph.removeNode('ghost')).toBe(false);
  });

  it('connect creates wire between compatible ports', () => {
    graph.addNode(makeNode('src', [{ id: 'out', dir: 'output' }]));
    graph.addNode(makeNode('dst', [{ id: 'in', dir: 'input' }]));
    const wId = graph.connect('src', 'out', 'dst', 'in');
    expect(wId).not.toBeNull();
    expect(graph.getWireCount()).toBe(1);
  });

  it('connect rejects missing nodes', () => {
    graph.addNode(makeNode('A'));
    expect(graph.connect('A', 'out', 'missing', 'in')).toBeNull();
  });

  it('connect rejects type mismatch', () => {
    graph.addNode(makeNode('a', [{ id: 'out', dir: 'output', type: 'number' }]));
    graph.addNode(makeNode('b', [{ id: 'in', dir: 'input', type: 'string' }]));
    expect(graph.connect('a', 'out', 'b', 'in')).toBeNull();
  });

  it('connect allows "any" type wildcard', () => {
    graph.addNode(makeNode('a', [{ id: 'out', dir: 'output', type: 'any' }]));
    graph.addNode(makeNode('b', [{ id: 'in', dir: 'input', type: 'number' }]));
    expect(graph.connect('a', 'out', 'b', 'in')).not.toBeNull();
  });

  it('disconnect removes wire', () => {
    graph.addNode(makeNode('src', [{ id: 'out', dir: 'output' }]));
    graph.addNode(makeNode('dst', [{ id: 'in', dir: 'input' }]));
    const wId = graph.connect('src', 'out', 'dst', 'in')!;
    expect(graph.disconnect(wId)).toBe(true);
    expect(graph.getWireCount()).toBe(0);
  });

  it('removeNode cascades wire deletion', () => {
    graph.addNode(makeNode('src', [{ id: 'out', dir: 'output' }]));
    graph.addNode(makeNode('dst', [{ id: 'in', dir: 'input' }]));
    graph.connect('src', 'out', 'dst', 'in');
    graph.removeNode('src');
    expect(graph.getWireCount()).toBe(0);
  });

  it('getTopologicalOrder is correct for linear DAG', () => {
    graph.addNode(makeNode('A', [{ id: 'out', dir: 'output' }]));
    graph.addNode(makeNode('B', [{ id: 'out', dir: 'output' }, { id: 'in', dir: 'input' }]));
    graph.addNode(makeNode('C', [{ id: 'in', dir: 'input' }]));
    graph.connect('A', 'out', 'B', 'in');
    graph.connect('B', 'out', 'C', 'in');
    const order = graph.getTopologicalOrder();
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'));
  });

  it('hasCycle returns false for DAG', () => {
    graph.addNode(makeNode('A', [{ id: 'out', dir: 'output' }]));
    graph.addNode(makeNode('B', [{ id: 'in', dir: 'input' }]));
    graph.connect('A', 'out', 'B', 'in');
    expect(graph.hasCycle()).toBe(false);
  });

  it('getWiresForNode returns adjacent wires', () => {
    graph.addNode(makeNode('src', [{ id: 'out', dir: 'output' }]));
    graph.addNode(makeNode('dst', [{ id: 'in', dir: 'input' }]));
    graph.connect('src', 'out', 'dst', 'in');
    expect(graph.getWiresForNode('src')).toHaveLength(1);
    expect(graph.getWiresForNode('dst')).toHaveLength(1);
  });

  it('getAllNodes returns all nodes', () => {
    graph.addNode(makeNode('A')); graph.addNode(makeNode('B'));
    expect(graph.getAllNodes()).toHaveLength(2);
  });
});

// =============================================================================
// NodeLibrary
// =============================================================================

describe('NodeLibrary', () => {
  let lib: NodeLibrary;
  beforeEach(() => { lib = new NodeLibrary(); });

  it('registers built-ins on construction', () => { expect(lib.getCount()).toBeGreaterThan(0); });

  it('math.add has 2 inputs and 1 output', () => {
    const def = lib.get('math.add')!;
    expect(def.ports.filter(p => p.direction === 'input')).toHaveLength(2);
    expect(def.ports.filter(p => p.direction === 'output')).toHaveLength(1);
  });

  it('math.add evaluate sums correctly', () => {
    expect(lib.get('math.add')!.evaluate!({ a: 4, b: 5 })['result']).toBe(9);
  });

  it('math.multiply evaluate', () => {
    expect(lib.get('math.multiply')!.evaluate!({ a: 3, b: 7 })['result']).toBe(21);
  });

  it('math.clamp clamps out-of-range values', () => {
    const clamp = lib.get('math.clamp')!.evaluate!;
    expect(clamp({ value: -5, min: 0, max: 1 })['result']).toBe(0);
    expect(clamp({ value: 5, min: 0, max: 1 })['result']).toBe(1);
    expect(clamp({ value: 0.5, min: 0, max: 1 })['result']).toBe(0.5);
  });

  it('logic.and evaluate', () => {
    const and = lib.get('logic.and')!.evaluate!;
    expect(and({ a: true, b: true })['result']).toBe(true);
    expect(and({ a: true, b: false })['result']).toBe(false);
  });

  it('logic.not evaluate', () => {
    const not = lib.get('logic.not')!.evaluate!;
    expect(not({ input: false })['result']).toBe(true);
    expect(not({ input: true })['result']).toBe(false);
  });

  it('logic.compare equal/greater/less', () => {
    const cmp = lib.get('logic.compare')!.evaluate!;
    const eq = cmp({ a: 5, b: 5 });
    expect(eq['equal']).toBe(true); expect(eq['greater']).toBe(false); expect(eq['less']).toBe(false);
    expect(cmp({ a: 7, b: 3 })['greater']).toBe(true);
    expect(cmp({ a: 1, b: 9 })['less']).toBe(true);
  });

  it('getByCategory returns correct subset', () => {
    const math = lib.getByCategory('math');
    expect(math.length).toBeGreaterThan(0);
    expect(math.every(d => d.category === 'math')).toBe(true);
  });

  it('getCategories has no duplicates', () => {
    const cats = lib.getCategories();
    expect(new Set(cats).size).toBe(cats.length);
    expect(cats).toContain('math');
    expect(cats).toContain('logic');
  });

  it('search by label is case-insensitive', () => {
    expect(lib.search('ADD').some(d => d.type === 'math.add')).toBe(true);
    expect(lib.search('multiply').some(d => d.type === 'math.multiply')).toBe(true);
  });

  it('search returns empty for unknown term', () => {
    expect(lib.search('zyxwvutsrqp')).toHaveLength(0);
  });

  it('createNode shapes a valid GraphNode', () => {
    const n = lib.createNode('math.add', 'n1', { x: 10, y: 20 });
    expect(n).not.toBeNull();
    expect(n!.id).toBe('n1');
    expect(n!.type).toBe('math.add');
    expect(n!.position).toEqual({ x: 10, y: 20 });
  });

  it('createNode returns null for unknown type', () => {
    expect(lib.createNode('unknown.node', 'x')).toBeNull();
  });

  it('register adds custom node and evaluate works', () => {
    lib.register({
      type: 'custom.lerp', label: 'Lerp', category: 'custom', description: 'lerp',
      ports: [], evaluate: (i) => ({ result: (i.a as number) + ((i.b as number) - (i.a as number)) * (i.t as number) }),
    });
    expect(lib.get('custom.lerp')!.evaluate!({ a: 0, b: 10, t: 0.5 })['result']).toBe(5);
  });

  it('getAllTypes length matches getCount', () => {
    expect(lib.getAllTypes().length).toBe(lib.getCount());
  });
});
