import { describe, it, expect, beforeEach } from 'vitest';
import { NodeLibrary } from '../NodeLibrary';

describe('NodeLibrary', () => {
  let lib: NodeLibrary;

  beforeEach(() => { lib = new NodeLibrary(); });

  it('starts with built-in nodes', () => {
    expect(lib.getCount()).toBeGreaterThan(0);
  });

  it('get retrieves by type', () => {
    expect(lib.get('math.add')).toBeDefined();
    expect(lib.get('math.add')!.label).toBe('Add');
  });

  it('get returns undefined for missing', () => {
    expect(lib.get('nonexistent')).toBeUndefined();
  });

  it('register adds custom node', () => {
    const before = lib.getCount();
    lib.register({
      type: 'custom.test', label: 'Test', category: 'custom',
      description: 'A test node', ports: [],
    });
    expect(lib.getCount()).toBe(before + 1);
    expect(lib.get('custom.test')).toBeDefined();
  });

  it('getByCategory returns correct nodes', () => {
    const math = lib.getByCategory('math');
    expect(math.length).toBeGreaterThan(0);
    for (const n of math) expect(n.category).toBe('math');
  });

  it('getCategories returns distinct categories', () => {
    const cats = lib.getCategories();
    expect(cats).toContain('math');
    expect(cats).toContain('logic');
    expect(new Set(cats).size).toBe(cats.length); // unique
  });

  it('search finds by label', () => {
    const results = lib.search('Add');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('math.add');
  });

  it('search finds by description', () => {
    const results = lib.search('Logical');
    expect(results.length).toBeGreaterThan(0);
  });

  it('search returns empty for no match', () => {
    expect(lib.search('zzzznotfound')).toHaveLength(0);
  });

  it('createNode creates GraphNode from definition', () => {
    const node = lib.createNode('math.add', 'n1', { x: 10, y: 20 });
    expect(node).not.toBeNull();
    expect(node!.id).toBe('n1');
    expect(node!.type).toBe('math.add');
    expect(node!.position).toEqual({ x: 10, y: 20 });
    expect(node!.ports.length).toBeGreaterThan(0);
  });

  it('createNode returns null for unknown type', () => {
    expect(lib.createNode('nope', 'n1')).toBeNull();
  });

  it('getAllTypes lists all registered types', () => {
    const types = lib.getAllTypes();
    expect(types).toContain('math.add');
    expect(types).toContain('logic.and');
  });

  // Built-in evaluate functions
  it('math.add evaluate works', () => {
    const def = lib.get('math.add')!;
    const result = def.evaluate!({ a: 3, b: 4 });
    expect(result.result).toBe(7);
  });

  it('math.multiply evaluate works', () => {
    const def = lib.get('math.multiply')!;
    const result = def.evaluate!({ a: 5, b: 6 });
    expect(result.result).toBe(30);
  });

  it('math.clamp evaluate works', () => {
    const def = lib.get('math.clamp')!;
    expect(def.evaluate!({ value: 5, min: 0, max: 3 }).result).toBe(3);
    expect(def.evaluate!({ value: -1, min: 0, max: 3 }).result).toBe(0);
  });

  it('logic.and evaluate works', () => {
    const def = lib.get('logic.and')!;
    expect(def.evaluate!({ a: true, b: true }).result).toBe(true);
    expect(def.evaluate!({ a: true, b: false }).result).toBe(false);
  });

  it('logic.not evaluate works', () => {
    const def = lib.get('logic.not')!;
    expect(def.evaluate!({ input: false }).result).toBe(true);
  });
});
