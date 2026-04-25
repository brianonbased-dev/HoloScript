/**
 * TraitCompositionCompiler + TraitComposer — Comprehensive Tests
 *
 * Coverage:
 *   TraitCompositionCompiler:
 *   - compile() single trait composition
 *   - compile() multiple declarations in one call
 *   - config merge: left-to-right, later wins
 *   - override values beat component defaults
 *   - MissingComponentError when handler absent
 *   - CompositionConflictError for declared conflicts
 *   - Graph registration via TraitDependencyGraph
 *   - Empty components array (edge case)
 *   - Override with no components (identity)
 *
 *   TraitComposer:
 *   - compose() merges defaultConfigs right-side-wins
 *   - onAttach dispatched to all components in order
 *   - onDetach dispatched in REVERSE order
 *   - onUpdate dispatched in order
 *   - onEvent dispatched in order
 *   - conflict detection via graph.traitConflicts
 *   - missing handler produces warning (not crash)
 *   - graph registration after compose()
 *
 *   TraitComposer.parseCompositionLine:
 *   - "@turret = @physics + @targeting"
 *   - "@hero = @movement + @combat + @magic"
 *   - returns null for non-matching lines
 *   - strips @ prefix from source names
 */

import { describe, it, expect, vi } from 'vitest';
import {
  TraitCompositionCompiler,
  CompositionConflictError,
  MissingComponentError,
} from '../../compiler/TraitCompositionCompiler';
import { TraitComposer } from '../../compiler/TraitComposer';
import { TraitDependencyGraph } from '../../compiler/TraitDependencyGraph';

// =============================================================================
// HELPERS
// =============================================================================

function makeHandler(defaultConfig: Record<string, unknown> = {}, conflicts: string[] = []) {
  return {
    defaultConfig,
    conflicts,
  };
}

function makeTraitHandler(
  defaultConfig: Record<string, unknown> = {},
  callbacks: Record<string, (...args: unknown[]) => void> = {}
) {
  return {
    name: 'test' as any,
    defaultConfig,
    onAttach: callbacks.onAttach ?? vi.fn(),
    onDetach: callbacks.onDetach ?? vi.fn(),
    onUpdate: callbacks.onUpdate ?? vi.fn(),
    onEvent: callbacks.onEvent ?? vi.fn(),
  };
}

// =============================================================================
// TraitCompositionCompiler — basic compile
// =============================================================================

describe('TraitCompositionCompiler — basic compile', () => {
  const compiler = new TraitCompositionCompiler();

  it('compiles a single declaration with two components', () => {
    const registry: Record<string, ReturnType<typeof makeHandler>> = {
      physics: makeHandler({ gravity: 9.8, bounce: 0.2 }),
      combat: makeHandler({ damage: 10, range: 5 }),
    };

    const result = compiler.compile(
      [{ name: 'Warrior', components: ['physics', 'combat'] }],
      (n) => registry[n]
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Warrior');
    expect(result[0].components).toEqual(['physics', 'combat']);
    expect(result[0].defaultConfig.gravity).toBe(9.8);
    expect(result[0].defaultConfig.damage).toBe(10);
  });

  it('compiles multiple declarations in one call', () => {
    const registry = {
      a: makeHandler({ x: 1 }),
      b: makeHandler({ y: 2 }),
      c: makeHandler({ z: 3 }),
    };

    const results = compiler.compile(
      [
        { name: 'AB', components: ['a', 'b'] },
        { name: 'ABC', components: ['a', 'b', 'c'] },
      ],
      (n) => (registry as Record<string, any>)[n]
    );

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('AB');
    expect(results[1].name).toBe('ABC');
  });

  it('returns empty array for empty declarations list', () => {
    const result = compiler.compile([], () => undefined);
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// TraitCompositionCompiler — config merge semantics
// =============================================================================

describe('TraitCompositionCompiler — config merge (semiring-based)', () => {
  const compiler = new TraitCompositionCompiler();

  it('throws CompositionConflictError for shared key without resolution rule', () => {
    const registry = {
      base: makeHandler({ speed: 1, color: 'red' }),
      upgrade: makeHandler({ speed: 5 }), // speed conflict — no semiring rule
    };

    // Semiring requires explicit rules or authority; arbitrary right-side wins is banned.
    expect(() =>
      compiler.compile(
        [{ name: 'Fast', components: ['base', 'upgrade'] }],
        (n) => (registry as Record<string, any>)[n]
      )
    ).toThrow(CompositionConflictError);
  });

  it('override values beat all component defaults', () => {
    const registry = {
      physics: makeHandler({ gravity: 9.8 }),
      movement: makeHandler({ speed: 5 }),
    };

    const [result] = compiler.compile(
      [
        {
          name: 'MoonWalker',
          components: ['physics', 'movement'],
          overrides: { gravity: 1.6, speed: 2 }, // moon values
        },
      ],
      (n) => (registry as Record<string, any>)[n]
    );

    expect(result.defaultConfig.gravity).toBe(1.6);
    expect(result.defaultConfig.speed).toBe(2);
  });

  it('component with empty defaultConfig contributes nothing', () => {
    const registry = {
      noConfig: makeHandler({}),
      withConfig: makeHandler({ hp: 100 }),
    };

    const [result] = compiler.compile(
      [{ name: 'Mixed', components: ['noConfig', 'withConfig'] }],
      (n) => (registry as Record<string, any>)[n]
    );

    expect(result.defaultConfig.hp).toBe(100);
  });

  it('empty components array → empty defaultConfig (no override)', () => {
    const [result] = compiler.compile([{ name: 'Empty', components: [] }], () => undefined);

    expect(result.defaultConfig).toEqual({});
    expect(result.components).toHaveLength(0);
  });

  it('empty components with overrides → override wins as sole config', () => {
    const [result] = compiler.compile(
      [{ name: 'Overridden', components: [], overrides: { x: 42 } }],
      () => undefined
    );

    expect(result.defaultConfig[0]).toBe(42);
  });
});

// =============================================================================
// TraitCompositionCompiler — error cases
// =============================================================================

describe('TraitCompositionCompiler — error cases', () => {
  const compiler = new TraitCompositionCompiler();

  it('throws MissingComponentError when handler not in registry', () => {
    expect(() =>
      compiler.compile([{ name: 'Broken', components: ['nonexistent'] }], () => undefined)
    ).toThrow(MissingComponentError);
  });

  it('MissingComponentError carries composedName and missingComponent', () => {
    try {
      compiler.compile([{ name: 'Hero', components: ['missing_trait'] }], () => undefined);
    } catch (err: any) {
      expect(err.composedName).toBe('Hero');
      expect(err.missingComponent).toBe('missing_trait');
    }
  });

  it('throws CompositionConflictError when component A conflicts with B', () => {
    const registry = {
      fire: makeHandler({}, ['water']), // fire conflicts with water
      water: makeHandler({}, ['fire']),
    };

    expect(() =>
      compiler.compile(
        [{ name: 'FW', components: ['fire', 'water'] }],
        (n) => (registry as Record<string, any>)[n]
      )
    ).toThrow(CompositionConflictError);
  });

  it('ConflictError carries traitA and traitB names', () => {
    const registry = {
      berserker: makeHandler({}, ['paladin']),
      paladin: makeHandler({}, []),
    };

    try {
      compiler.compile(
        [{ name: 'HybridFail', components: ['berserker', 'paladin'] }],
        (n) => (registry as Record<string, any>)[n]
      );
    } catch (err: any) {
      expect([err.traitA, err.traitB]).toContain('berserker');
      expect([err.traitA, err.traitB]).toContain('paladin');
    }
  });

  it('non-conflicting distinct-key components compile without error', () => {
    const registry = {
      a: makeHandler({ speed: 5 }, []),
      b: makeHandler({ defense: 10 }, []),
    };

    expect(() =>
      compiler.compile(
        [{ name: 'SpeedBike', components: ['a', 'b'] }],
        (n) => (registry as Record<string, any>)[n]
      )
    ).not.toThrow();
  });

  it('same-value equal-key components compile without error (idempotent)', () => {
    const registry = {
      a: makeHandler({ speed: 5 }, []),
      b: makeHandler({ speed: 5 }, []), // same value = no conflict
    };

    expect(() =>
      compiler.compile(
        [{ name: 'Twins', components: ['a', 'b'] }],
        (n) => (registry as Record<string, any>)[n]
      )
    ).not.toThrow();
  });
});

// =============================================================================
// TraitCompositionCompiler — graph registration
// =============================================================================

describe('TraitCompositionCompiler — TraitDependencyGraph registration', () => {
  it('registers composed trait in provided graph', () => {
    const compiler = new TraitCompositionCompiler();
    const graph = new TraitDependencyGraph();

    const registry = {
      physics: makeHandler({ mass: 1 }),
      navmesh: makeHandler({ speed: 5 }),
    };

    compiler.compile(
      [{ name: 'Hovercraft', components: ['physics', 'navmesh'] }],
      (n) => (registry as Record<string, any>)[n],
      graph
    );

    // The composed trait should now be in the graph
    const stats = graph.getStats();
    expect(stats.traitCount).toBeGreaterThanOrEqual(1);
  });

  it('compiles without error when no graph is provided', () => {
    const compiler = new TraitCompositionCompiler();
    const registry = { a: makeHandler({ x: 1 }) };

    expect(() =>
      compiler.compile(
        [{ name: 'Solo', components: ['a'] }],
        (n) => (registry as Record<string, any>)[n]
        // No graph — optional
      )
    ).not.toThrow();
  });
});

// =============================================================================
// TraitComposer — lifecycle dispatch
// =============================================================================

describe('TraitComposer — lifecycle dispatch', () => {
  it('onAttach called for each component in forward order', () => {
    const order: string[] = [];
    const handlerA = makeTraitHandler({}, { onAttach: () => order.push('A') });
    const handlerB = makeTraitHandler({}, { onAttach: () => order.push('B') });
    const handlerC = makeTraitHandler({}, { onAttach: () => order.push('C') });

    const composer = new TraitComposer();
    const result = composer.compose(
      'ABC',
      new Map([
        ['a', handlerA],
        ['b', handlerB],
        ['c', handlerC],
      ]),
      ['a', 'b', 'c']
    );

    result.handler.onAttach?.({} as any, {}, {} as any);
    expect(order).toEqual(['A', 'B', 'C']);
  });

  it('onDetach called in REVERSE order', () => {
    const order: string[] = [];
    const handlerA = makeTraitHandler({}, { onDetach: () => order.push('A') });
    const handlerB = makeTraitHandler({}, { onDetach: () => order.push('B') });
    const handlerC = makeTraitHandler({}, { onDetach: () => order.push('C') });

    const composer = new TraitComposer();
    const result = composer.compose(
      'ABC',
      new Map([
        ['a', handlerA],
        ['b', handlerB],
        ['c', handlerC],
      ]),
      ['a', 'b', 'c']
    );

    result.handler.onDetach?.({} as any, {}, {} as any);
    expect(order).toEqual(['C', 'B', 'A']); // reverse order
  });

  it('onUpdate called in forward order', () => {
    const order: string[] = [];
    const handlerA = makeTraitHandler({}, { onUpdate: () => order.push('A') });
    const handlerB = makeTraitHandler({}, { onUpdate: () => order.push('B') });

    const composer = new TraitComposer();
    const result = composer.compose(
      'AB',
      new Map([
        ['a', handlerA],
        ['b', handlerB],
      ]),
      ['a', 'b']
    );

    result.handler.onUpdate?.({} as any, {}, {} as any, 16);
    expect(order).toEqual(['A', 'B']);
  });

  it('onEvent called in forward order', () => {
    const order: string[] = [];
    const handlerA = makeTraitHandler({}, { onEvent: () => order.push('A') });
    const handlerB = makeTraitHandler({}, { onEvent: () => order.push('B') });

    const composer = new TraitComposer();
    const result = composer.compose(
      'AB',
      new Map([
        ['a', handlerA],
        ['b', handlerB],
      ]),
      ['a', 'b']
    );

    result.handler.onEvent?.({} as any, {}, {} as any, { type: 'hit' } as any);
    expect(order).toEqual(['A', 'B']);
  });
});

// =============================================================================
// TraitComposer — config merge
// =============================================================================

describe('TraitComposer — defaultConfig merge (semiring-based)', () => {
  it('merges distinct-key configs without conflict', () => {
    const handlerA = makeTraitHandler({ speed: 1, color: 'blue' });
    const handlerB = makeTraitHandler({ defense: 5 }); // no overlap

    const composer = new TraitComposer();
    const result = composer.compose(
      'AB',
      new Map([
        ['a', handlerA],
        ['b', handlerB],
      ]),
      ['a', 'b']
    );

    expect(result.handler.defaultConfig?.speed).toBe(1);
    expect(result.handler.defaultConfig?.color).toBe('blue');
    expect(result.handler.defaultConfig?.defense).toBe(5);
  });

  it('reports warning for shared-key conflict and retains first value', () => {
    const handlerA = makeTraitHandler({ speed: 1, color: 'blue' });
    const handlerB = makeTraitHandler({ speed: 5 }); // conflict

    const composer = new TraitComposer();
    const result = composer.compose(
      'AB',
      new Map([
        ['a', handlerA],
        ['b', handlerB],
      ]),
      ['a', 'b']
    );

    // Semiring reports unresolved conflict as warning; first value retained
    expect(result.warnings.some((w) => w.includes('speed'))).toBe(true);
    expect(result.handler.defaultConfig?.speed).toBe(1);
    expect(result.handler.defaultConfig?.color).toBe('blue');
  });

  it('missing handler produces warning but does not crash', () => {
    const handlerA = makeTraitHandler({ x: 1 });

    const composer = new TraitComposer();
    const result = composer.compose(
      'AX',
      new Map([['a', handlerA]]), // 'x' is in traitNames but not in map
      ['a', 'x']
    );

    expect(result.warnings.some((w) => w.includes('x'))).toBe(true);
    expect(result.handler.defaultConfig[0]).toBe(1);
  });
});

// =============================================================================
// TraitComposer — conflict detection via graph
// =============================================================================

describe('TraitComposer — conflict detection', () => {
  it('detects conflict via graph.traitConflicts', () => {
    const graph = new TraitDependencyGraph();
    // Register two conflicting traits via registerTrait (the actual API)
    graph.registerTrait({ name: 'fire', requires: [], conflicts: ['water'] });
    graph.registerTrait({ name: 'water', requires: [], conflicts: ['fire'] });

    const composer = new TraitComposer(graph);
    const result = composer.compose(
      'FireWater',
      new Map([
        ['fire', makeTraitHandler()],
        ['water', makeTraitHandler()],
      ]),
      ['fire', 'water']
    );

    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('no conflict detected when traits are compatible', () => {
    const composer = new TraitComposer();
    const result = composer.compose(
      'Friendly',
      new Map([
        ['a', makeTraitHandler()],
        ['b', makeTraitHandler()],
      ]),
      ['a', 'b']
    );

    expect(result.conflicts).toHaveLength(0);
  });

  it('result name matches input name', () => {
    const composer = new TraitComposer();
    const result = composer.compose('MyComposed', new Map([['t', makeTraitHandler()]]), ['t']);
    expect(result.name).toBe('MyComposed');
    expect(result.sources).toEqual(['t']);
  });
});

// =============================================================================
// TraitComposer — graph registration
// =============================================================================

describe('TraitComposer — graph registration', () => {
  it('registers composed trait in graph after compose()', () => {
    const graph = new TraitDependencyGraph();
    const composer = new TraitComposer(graph);

    composer.compose(
      'SuperTrait',
      new Map([
        ['physics', makeTraitHandler()],
        ['ai', makeTraitHandler()],
      ]),
      ['physics', 'ai']
    );

    const stats = graph.getStats();
    expect(stats.traitCount).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// TraitComposer.parseCompositionLine — static parser
// =============================================================================

describe('TraitComposer.parseCompositionLine', () => {
  it('parses "@turret = @physics + @targeting"', () => {
    const result = TraitComposer.parseCompositionLine('@turret = @physics + @targeting');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('turret');
    expect(result!.sources).toEqual(['physics', 'targeting']);
  });

  it('parses 3-way composition "@hero = @movement + @combat + @magic"', () => {
    const result = TraitComposer.parseCompositionLine('@hero = @movement + @combat + @magic');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('hero');
    expect(result!.sources).toEqual(['movement', 'combat', 'magic']);
  });

  it('returns null for non-matching line', () => {
    expect(TraitComposer.parseCompositionLine('object Foo {}')).toBeNull();
    expect(TraitComposer.parseCompositionLine('// @custom = @a + @b')).toBeNull();
    expect(TraitComposer.parseCompositionLine('@test')).toBeNull();
  });

  it('strips @ prefix from all source names', () => {
    const result = TraitComposer.parseCompositionLine('@out = @in1 + @in2');
    expect(result!.sources.every((s) => !s.startsWith('@'))).toBe(true);
  });

  it('handles single-component "composition"', () => {
    const result = TraitComposer.parseCompositionLine('@alias = @original');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('alias');
    expect(result!.sources).toEqual(['original']);
  });

  it('handles extra whitespace around operators', () => {
    const result = TraitComposer.parseCompositionLine('@x  =  @a  +  @b');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('x');
    expect(result!.sources).toContain('a');
    expect(result!.sources).toContain('b');
  });
});
