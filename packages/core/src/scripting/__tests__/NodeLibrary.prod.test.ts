/**
 * NodeLibrary — production test suite
 *
 * Tests: builtin registration count, get/getByCategory/getCategories,
 * search (label/description), evaluate functions (math.add, math.multiply,
 * math.clamp, logic.and, logic.not, logic.compare), createNode, register
 * custom node, getAllTypes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NodeLibrary } from '../NodeLibrary';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('NodeLibrary: production', () => {
  let lib: NodeLibrary;

  beforeEach(() => {
    lib = new NodeLibrary();
  });

  // ─── Built-in registration ────────────────────────────────────────────────
  describe('built-in registration', () => {
    it('starts with multiple built-in nodes', () => {
      expect(lib.getCount()).toBeGreaterThanOrEqual(8);
    });

    it('getAllTypes returns all registered type strings', () => {
      const types = lib.getAllTypes();
      expect(types).toContain('math.add');
      expect(types).toContain('logic.and');
      expect(types).toContain('flow.branch');
      expect(types).toContain('event.onStart');
    });
  });

  // ─── get ──────────────────────────────────────────────────────────────────
  describe('get', () => {
    it('returns definition for known type', () => {
      const def = lib.get('math.add');
      expect(def).toBeDefined();
      expect(def!.label).toBe('Add');
    });

    it('returns undefined for unknown type', () => {
      expect(lib.get('does.not.exist')).toBeUndefined();
    });
  });

  // ─── getByCategory ────────────────────────────────────────────────────────
  describe('getByCategory', () => {
    it('returns math nodes', () => {
      const nodes = lib.getByCategory('math');
      expect(nodes.length).toBeGreaterThanOrEqual(3);
    });

    it('returns logic nodes', () => {
      const nodes = lib.getByCategory('logic');
      expect(nodes.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty array for unknown category', () => {
      expect(lib.getByCategory('nonexistent')).toEqual([]);
    });
  });

  // ─── getCategories ────────────────────────────────────────────────────────
  describe('getCategories', () => {
    it('includes math, logic, flow, events categories', () => {
      const cats = lib.getCategories();
      expect(cats).toContain('math');
      expect(cats).toContain('logic');
      expect(cats).toContain('flow');
      expect(cats).toContain('events');
    });

    it('has no duplicate categories', () => {
      const cats = lib.getCategories();
      expect(new Set(cats).size).toBe(cats.length);
    });
  });

  // ─── search ───────────────────────────────────────────────────────────────
  describe('search', () => {
    it('finds nodes by label substring', () => {
      const results = lib.search('add');
      expect(results.some(d => d.type === 'math.add')).toBe(true);
    });

    it('finds nodes by description substring (case-insensitive)', () => {
      const results = lib.search('clamp');
      expect(results.some(d => d.type === 'math.clamp')).toBe(true);
    });

    it('returns empty for no match', () => {
      expect(lib.search('zzz_no_match')).toEqual([]);
    });
  });

  // ─── evaluate: math nodes ─────────────────────────────────────────────────
  describe('evaluate: math nodes', () => {
    it('math.add evaluates correctly', () => {
      const def = lib.get('math.add')!;
      expect(def.evaluate!({ a: 3, b: 4 })).toEqual({ result: 7 });
    });

    it('math.multiply evaluates correctly', () => {
      const def = lib.get('math.multiply')!;
      expect(def.evaluate!({ a: 6, b: 7 })).toEqual({ result: 42 });
    });

    it('math.clamp clamps within range', () => {
      const def = lib.get('math.clamp')!;
      expect(def.evaluate!({ value: 2, min: 0, max: 1 })).toEqual({ result: 1 });
      expect(def.evaluate!({ value: -1, min: 0, max: 1 })).toEqual({ result: 0 });
      expect(def.evaluate!({ value: 0.5, min: 0, max: 1 })).toEqual({ result: 0.5 });
    });
  });

  // ─── evaluate: logic nodes ────────────────────────────────────────────────
  describe('evaluate: logic nodes', () => {
    it('logic.and true && true = true', () => {
      const def = lib.get('logic.and')!;
      expect(def.evaluate!({ a: true, b: true })).toEqual({ result: true });
    });

    it('logic.and true && false = false', () => {
      const def = lib.get('logic.and')!;
      expect(def.evaluate!({ a: true, b: false })).toEqual({ result: false });
    });

    it('logic.not negates true', () => {
      const def = lib.get('logic.not')!;
      expect(def.evaluate!({ input: true })).toEqual({ result: false });
    });

    it('logic.not negates false', () => {
      const def = lib.get('logic.not')!;
      expect(def.evaluate!({ input: false })).toEqual({ result: true });
    });

    it('logic.compare returns equal/greater/less', () => {
      const def = lib.get('logic.compare')!;
      expect(def.evaluate!({ a: 5, b: 5 })).toMatchObject({ equal: true, greater: false, less: false });
      expect(def.evaluate!({ a: 6, b: 3 })).toMatchObject({ equal: false, greater: true, less: false });
      expect(def.evaluate!({ a: 1, b: 9 })).toMatchObject({ equal: false, greater: false, less: true });
    });
  });

  // ─── createNode ──────────────────────────────────────────────────────────
  describe('createNode', () => {
    it('creates node from known type', () => {
      const node = lib.createNode('math.add', 'n1');
      expect(node).not.toBeNull();
      expect(node!.id).toBe('n1');
      expect(node!.type).toBe('math.add');
    });

    it('created node has correct ports', () => {
      const node = lib.createNode('math.add', 'n1');
      const portIds = node!.ports.map(p => p.id);
      expect(portIds).toContain('a');
      expect(portIds).toContain('b');
      expect(portIds).toContain('result');
    });

    it('created node has provided id', () => {
      const node = lib.createNode('math.multiply', 'special-id');
      expect(node!.id).toBe('special-id');
    });

    it('returns null for unknown type', () => {
      expect(lib.createNode('does.not.exist', 'n1')).toBeNull();
    });

    it('uses provided position', () => {
      const node = lib.createNode('math.add', 'n1', { x: 100, y: 200 });
      expect(node!.position).toEqual({ x: 100, y: 200 });
    });
  });

  // ─── register custom ─────────────────────────────────────────────────────
  describe('register custom node', () => {
    it('custom node is retrievable after registration', () => {
      lib.register({
        type: 'custom.double', label: 'Double', category: 'custom',
        description: 'Doubles a number',
        ports: [
          { id: 'n', name: 'N', type: 'number', direction: 'input', defaultValue: 0 },
          { id: 'out', name: 'Out', type: 'number', direction: 'output' },
        ],
        evaluate: (inputs) => ({ out: (inputs.n as number) * 2 }),
      });
      const def = lib.get('custom.double');
      expect(def).toBeDefined();
      expect(def!.evaluate!({ n: 21 })).toEqual({ out: 42 });
    });
  });
});
