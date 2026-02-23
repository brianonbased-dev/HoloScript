/**
 * StateCompiler Production Tests
 *
 * Tests the per-node reactive state extraction from HS+ AST stateBlock fields.
 */

import { describe, it, expect } from 'vitest';
import { StateCompiler } from '../../compiler/StateCompiler';
import type { HSPlusAST, HSPlusNode } from '../../types/HoloScriptPlus';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(name: string, stateBlock?: Record<string, unknown>, children?: HSPlusNode[]): HSPlusNode {
  return {
    type: 'Object',
    name,
    stateBlock,
    children: children ?? [],
  };
}

function makeAST(root: HSPlusNode): HSPlusAST {
  return { type: 'Program', root, body: [] };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StateCompiler — Production', () => {
  const compiler = new StateCompiler();

  // ─── compile() ─────────────────────────────────────────────────────

  it('returns empty map for node with no stateBlock', () => {
    const ast = makeAST(makeNode('empty'));
    expect(compiler.compile(ast).size).toBe(0);
  });

  it('extracts a single state variable', () => {
    const ast = makeAST(makeNode('Player', { hp: 100 }));
    const map = compiler.compile(ast);
    expect(map.has('Player')).toBe(true);
    expect(map.get('Player')!.initialState.hp).toBe(100);
  });

  it('extracts multiple state variables', () => {
    const ast = makeAST(makeNode('Enemy', { hp: 50, mana: 80, speed: 3.5 }));
    const shape = compiler.compile(ast).get('Enemy')!;
    expect(shape.initialState.hp).toBe(50);
    expect(shape.initialState.mana).toBe(80);
    expect(shape.initialState.speed).toBe(3.5);
    expect(shape.vars).toHaveLength(3);
  });

  it('skips internal __spread_ keys', () => {
    const ast = makeAST(makeNode('Obj', {
      score: 0,
      __spread_0: { type: 'spread', argument: 'baseState' },
    }));
    const shape = compiler.compile(ast).get('Obj')!;
    expect(shape.vars.map(v => v.name)).toEqual(['score']);
    expect(shape.initialState.__spread_0).toBeUndefined();
  });

  it('recursively finds state in nested children', () => {
    const child = makeNode('Item', { equipped: false });
    const root = makeNode('Player', { hp: 100 }, [child]);
    const map = compiler.compile(makeAST(root));
    expect(map.has('Player')).toBe(true);
    expect(map.has('Item')).toBe(true);
    expect(map.get('Item')!.initialState.equipped).toBe(false);
  });

  it('handles string, bool, number, and array initial values', () => {
    const ast = makeAST(makeNode('Hero', {
      name: 'Aria',
      alive: true,
      position: [0, 1, 0],
      maxHp: 200,
    }));
    const shape = compiler.compile(ast).get('Hero')!;
    expect(shape.initialState.name).toBe('Aria');
    expect(shape.initialState.alive).toBe(true);
    expect(shape.initialState.position).toEqual([0, 1, 0]);
    expect(shape.initialState.maxHp).toBe(200);
  });

  // ─── compileNode() ─────────────────────────────────────────────────

  it('compileNode() returns null for node with no stateBlock', () => {
    expect(compiler.compileNode(makeNode('NoState'))).toBeNull();
  });

  it('compileNode() returns null for empty stateBlock', () => {
    expect(compiler.compileNode(makeNode('EmptyState', {}))).toBeNull();
  });

  it('compileNode() extracts vars for a node with stateBlock', () => {
    const node = makeNode('Boss', { phase: 1, rage: 0 });
    const shape = compiler.compileNode(node)!;
    expect(shape.nodeId).toBe('Boss');
    expect(shape.vars).toHaveLength(2);
    expect(shape.initialState.phase).toBe(1);
  });

  // ─── nodeId resolution ─────────────────────────────────────────────

  it('falls back to type@loc for anonymous nodes', () => {
    const node: HSPlusNode = {
      type: 'Inline',
      stateBlock: { x: 0 },
      loc: { start: { line: 5, column: 3 }, end: { line: 5, column: 20 } },
    };
    const shape = compiler.compileNode(node)!;
    expect(shape.nodeId).toBe('Inline@5:3');
  });

  it('uses a random id for anonymous nodes with no loc', () => {
    const node: HSPlusNode = { type: 'Anon', stateBlock: { v: 1 } };
    const shape = compiler.compileNode(node)!;
    expect(shape.nodeId).toMatch(/^Anon_/);
  });

  // ─── initialState shape ────────────────────────────────────────────

  it('initialState is a plain object (not a Proxy)', () => {
    const ast = makeAST(makeNode('Widget', { count: 0 }));
    const shape = compiler.compile(ast).get('Widget')!;
    // Should be safe to use as ReactiveState initial state
    expect(Object.keys(shape.initialState)).toEqual(['count']);
  });

  it('vars descriptors match keys in initialState', () => {
    const ast = makeAST(makeNode('Obj', { a: 1, b: 2, c: 3 }));
    const shape = compiler.compile(ast).get('Obj')!;
    const varNames = shape.vars.map(v => v.name).sort();
    const initKeys = Object.keys(shape.initialState).sort();
    expect(varNames).toEqual(initKeys);
  });

  // ─── Multiple sibling nodes ────────────────────────────────────────

  it('handles multiple root-level children each with stateBlock', () => {
    const a = makeNode('A', { x: 0 });
    const b = makeNode('B', { y: 1 });
    // Root acts as a container with no stateBlock
    const root: HSPlusNode = { type: 'Scene', children: [a, b] };
    const map = compiler.compile(makeAST(root));
    expect(map.size).toBe(2);
    expect(map.has('A')).toBe(true);
    expect(map.has('B')).toBe(true);
  });
});
