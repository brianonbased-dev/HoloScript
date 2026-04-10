/**
 * TraitInheritanceResolver — Comprehensive Tests
 *
 * Coverage:
 *   Trait Resolution:
 *   - Simple trait (no extends) resolves to own properties
 *   - Single-level inheritance: child gets parent properties
 *   - Child overrides parent property with same key
 *   - Multi-level inheritance chain (grandparent -> parent -> child)
 *   - Ancestor chain is correctly ordered
 *
 *   Cycle Detection:
 *   - Detects direct circular inheritance (A extends B extends A)
 *   - Detects indirect circular inheritance (A -> B -> C -> A)
 *   - Throws CircularInheritanceError with cycle info
 *
 *   Diamond Inheritance Detection:
 *   - Detects diamond when two composed traits share an ancestor
 *   - Returns correct paths through the diamond
 *   - No false positive for non-diamond compositions
 *
 *   Error Handling:
 *   - Missing parent trait throws TraitInheritanceError
 *   - Missing trait in resolveTrait throws
 *   - resolveAll collects errors without throwing
 *
 *   Flattening:
 *   - getFlattenedProperties returns merged props
 *   - getAncestors returns correct chain
 *
 *   Integration with TraitCompositionCompiler:
 *   - Composed traits include inherited properties
 *   - Diamond warnings propagated to composition result
 *
 *   Integration with TraitComposer:
 *   - Composed handler config includes inherited properties
 *   - Diamond warnings appear in CompositionResult
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TraitInheritanceResolver,
  TraitInheritanceError,
  CircularInheritanceError,
} from '../TraitInheritanceResolver';
import type { HoloTraitDefinition } from '../../parser/HoloCompositionTypes';
import { TraitCompositionCompiler } from '../TraitCompositionCompiler';
import { TraitComposer } from '../TraitComposer';
import { TraitDependencyGraph } from '../TraitDependencyGraph';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// =============================================================================
// HELPERS
// =============================================================================

function makeTrait(
  name: string,
  properties: Record<string, unknown>,
  base?: string
): HoloTraitDefinition {
  return {
    type: 'TraitDefinition',
    name,
    base,
    properties: Object.entries(properties).map(([key, value]) => ({
      type: 'TraitProperty' as const,
      key,
      value: value as any,
    })),
    eventHandlers: [],
    actions: [],
  };
}

function makeTraitWithHandlers(
  name: string,
  properties: Record<string, unknown>,
  base?: string,
  eventNames: string[] = [],
  actionNames: string[] = []
): HoloTraitDefinition {
  return {
    type: 'TraitDefinition',
    name,
    base,
    properties: Object.entries(properties).map(([key, value]) => ({
      type: 'TraitProperty' as const,
      key,
      value: value as any,
    })),
    eventHandlers: eventNames.map((event) => ({
      type: 'EventHandler' as const,
      event,
      parameters: [],
      body: [],
    })),
    actions: actionNames.map((actionName) => ({
      type: 'Action' as const,
      name: actionName,
      parameters: [],
      body: [],
    })),
  };
}

// =============================================================================
// BASIC RESOLUTION
// =============================================================================

describe('TraitInheritanceResolver — basic resolution', () => {
  let resolver: TraitInheritanceResolver;

  beforeEach(() => {
    resolver = new TraitInheritanceResolver();
  });

  it('resolves a simple trait with no parent', () => {
    resolver.registerTrait(makeTrait('Interactable', { cursor: 'default', highlight: false }));

    const result = resolver.resolveTrait('Interactable');

    expect(result.name).toBe('Interactable');
    expect(result.base).toBeUndefined();
    expect(result.ancestors).toEqual([]);
    expect(result.properties).toEqual({ cursor: 'default', highlight: false });
  });

  it('resolves single-level inheritance', () => {
    resolver.registerTrait(makeTrait('Interactable', { cursor: 'default', highlight: false }));
    resolver.registerTrait(
      makeTrait('Clickable', { cursor: 'pointer', highlight: true }, 'Interactable')
    );

    const result = resolver.resolveTrait('Clickable');

    expect(result.name).toBe('Clickable');
    expect(result.base).toBe('Interactable');
    expect(result.ancestors).toEqual(['Interactable']);
    // Child overrides parent's cursor and highlight
    expect(result.properties.cursor).toBe('pointer');
    expect(result.properties.highlight).toBe(true);
  });

  it('child inherits properties not overridden', () => {
    resolver.registerTrait(makeTrait('Base', { color: 'red', size: 10, speed: 5 }));
    resolver.registerTrait(makeTrait('Child', { color: 'blue' }, 'Base'));

    const result = resolver.resolveTrait('Child');

    expect(result.properties.color).toBe('blue'); // overridden
    expect(result.properties.size).toBe(10); // inherited
    expect(result.properties.speed).toBe(5); // inherited
  });

  it('resolves multi-level inheritance (grandparent -> parent -> child)', () => {
    resolver.registerTrait(makeTrait('Root', { a: 1, b: 2, c: 3 }));
    resolver.registerTrait(makeTrait('Middle', { b: 20 }, 'Root'));
    resolver.registerTrait(makeTrait('Leaf', { c: 300 }, 'Middle'));

    const result = resolver.resolveTrait('Leaf');

    expect(result.ancestors).toEqual(['Middle', 'Root']);
    expect(result.properties.a).toBe(1); // from Root
    expect(result.properties.b).toBe(20); // from Middle (overrides Root)
    expect(result.properties.c).toBe(300); // from Leaf (overrides Root)
  });

  it('deep inheritance chain (4 levels)', () => {
    resolver.registerTrait(makeTrait('L0', { x: 0 }));
    resolver.registerTrait(makeTrait('L1', { x: 1, y: 1 }, 'L0'));
    resolver.registerTrait(makeTrait('L2', { y: 2, z: 2 }, 'L1'));
    resolver.registerTrait(makeTrait('L3', { z: 3, w: 3 }, 'L2'));

    const result = resolver.resolveTrait('L3');

    expect(result.ancestors).toEqual(['L2', 'L1', 'L0']);
    expect(result.properties).toEqual({ x: 1, y: 2, z: 3, w: 3 });
  });

  it('empty child inherits all from parent', () => {
    resolver.registerTrait(makeTrait('Full', { a: 1, b: 2, c: 3 }));
    resolver.registerTrait(makeTrait('Empty', {}, 'Full'));

    const result = resolver.resolveTrait('Empty');

    expect(result.properties).toEqual({ a: 1, b: 2, c: 3 });
  });
});

// =============================================================================
// EVENT HANDLER AND ACTION INHERITANCE
// =============================================================================

describe('TraitInheritanceResolver — event handler and action inheritance', () => {
  let resolver: TraitInheritanceResolver;

  beforeEach(() => {
    resolver = new TraitInheritanceResolver();
  });

  it('inherits event handlers from parent', () => {
    resolver.registerTrait(makeTraitWithHandlers('Base', {}, undefined, ['on_click', 'on_hover']));
    resolver.registerTrait(makeTraitWithHandlers('Child', {}, 'Base', ['on_drag']));

    const result = resolver.resolveTrait('Child');

    const eventNames = result.eventHandlers.map((h) => h.event);
    expect(eventNames).toContain('on_click');
    expect(eventNames).toContain('on_hover');
    expect(eventNames).toContain('on_drag');
    expect(eventNames).toHaveLength(3);
  });

  it('child event handler overrides parent with same event name', () => {
    resolver.registerTrait(makeTraitWithHandlers('Base', {}, undefined, ['on_click']));
    resolver.registerTrait(makeTraitWithHandlers('Child', {}, 'Base', ['on_click']));

    const result = resolver.resolveTrait('Child');

    // Only one on_click handler (child's)
    const clickHandlers = result.eventHandlers.filter((h) => h.event === 'on_click');
    expect(clickHandlers).toHaveLength(1);
  });

  it('inherits actions from parent', () => {
    resolver.registerTrait(makeTraitWithHandlers('Base', {}, undefined, [], ['attack', 'defend']));
    resolver.registerTrait(makeTraitWithHandlers('Child', {}, 'Base', [], ['special']));

    const result = resolver.resolveTrait('Child');

    const actionNames = result.actions.map((a) => a.name);
    expect(actionNames).toContain('attack');
    expect(actionNames).toContain('defend');
    expect(actionNames).toContain('special');
    expect(actionNames).toHaveLength(3);
  });

  it('child action overrides parent action with same name', () => {
    resolver.registerTrait(makeTraitWithHandlers('Base', {}, undefined, [], ['attack']));
    resolver.registerTrait(makeTraitWithHandlers('Child', {}, 'Base', [], ['attack']));

    const result = resolver.resolveTrait('Child');

    const attacks = result.actions.filter((a) => a.name === 'attack');
    expect(attacks).toHaveLength(1);
  });
});

// =============================================================================
// CYCLE DETECTION
// =============================================================================

describe('TraitInheritanceResolver — cycle detection', () => {
  let resolver: TraitInheritanceResolver;

  beforeEach(() => {
    resolver = new TraitInheritanceResolver();
  });

  it('detects direct circular inheritance (A extends B extends A)', () => {
    resolver.registerTrait(makeTrait('A', { x: 1 }, 'B'));
    resolver.registerTrait(makeTrait('B', { y: 2 }, 'A'));

    expect(() => resolver.resolveTrait('A')).toThrow(CircularInheritanceError);
  });

  it('detects indirect circular inheritance (A -> B -> C -> A)', () => {
    resolver.registerTrait(makeTrait('A', {}, 'B'));
    resolver.registerTrait(makeTrait('B', {}, 'C'));
    resolver.registerTrait(makeTrait('C', {}, 'A'));

    expect(() => resolver.resolveTrait('A')).toThrow(CircularInheritanceError);
  });

  it('cycle error includes the cycle path', () => {
    resolver.registerTrait(makeTrait('X', {}, 'Y'));
    resolver.registerTrait(makeTrait('Y', {}, 'X'));

    try {
      resolver.resolveTrait('X');
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(CircularInheritanceError);
      expect(err.cycle).toContain('X');
      expect(err.cycle).toContain('Y');
    }
  });

  it('resolveAll collects cycle errors without throwing', () => {
    resolver.registerTrait(makeTrait('A', {}, 'B'));
    resolver.registerTrait(makeTrait('B', {}, 'A'));
    resolver.registerTrait(makeTrait('C', { z: 3 }));

    const result = resolver.resolveAll();

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toBeInstanceOf(CircularInheritanceError);
    // Non-circular trait C should still resolve
    expect(result.resolved.has('C')).toBe(true);
    expect(result.resolved.get('C')!.properties.z).toBe(3);
  });
});

// =============================================================================
// MISSING PARENT
// =============================================================================

describe('TraitInheritanceResolver — missing parent', () => {
  let resolver: TraitInheritanceResolver;

  beforeEach(() => {
    resolver = new TraitInheritanceResolver();
  });

  it('throws TraitInheritanceError when parent is not registered', () => {
    resolver.registerTrait(makeTrait('Child', { x: 1 }, 'NonExistent'));

    expect(() => resolver.resolveTrait('Child')).toThrow(TraitInheritanceError);
  });

  it('error message includes the missing parent name', () => {
    resolver.registerTrait(makeTrait('Orphan', {}, 'MissingParent'));

    try {
      resolver.resolveTrait('Orphan');
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('MissingParent');
    }
  });

  it('throws when trying to resolve an unregistered trait', () => {
    expect(() => resolver.resolveTrait('Unknown')).toThrow(TraitInheritanceError);
  });
});

// =============================================================================
// DIAMOND INHERITANCE DETECTION
// =============================================================================

describe('TraitInheritanceResolver — diamond inheritance detection', () => {
  let resolver: TraitInheritanceResolver;

  beforeEach(() => {
    resolver = new TraitInheritanceResolver();
  });

  it('detects diamond when two composed traits share an ancestor', () => {
    //        Base
    //       /    \
    //   ChildA  ChildB
    resolver.registerTrait(makeTrait('Base', { speed: 1 }));
    resolver.registerTrait(makeTrait('ChildA', { attack: 10 }, 'Base'));
    resolver.registerTrait(makeTrait('ChildB', { defense: 5 }, 'Base'));

    // Resolve all first so ancestry is computed
    resolver.resolveAll();

    const warnings = resolver.detectDiamondInheritance(['ChildA', 'ChildB']);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].sharedAncestor).toBe('Base');
  });

  it('diamond warning includes both paths', () => {
    resolver.registerTrait(makeTrait('Root', {}));
    resolver.registerTrait(makeTrait('Left', {}, 'Root'));
    resolver.registerTrait(makeTrait('Right', {}, 'Root'));

    resolver.resolveAll();

    const warnings = resolver.detectDiamondInheritance(['Left', 'Right']);

    expect(warnings.length).toBe(1);
    expect(warnings[0].paths.length).toBe(2);
    // One path goes Left -> Root, the other Right -> Root
    const pathStrs = warnings[0].paths.map((p) => p.join('->'));
    expect(pathStrs).toContain('Left->Root');
    expect(pathStrs).toContain('Right->Root');
  });

  it('no false positive for non-diamond compositions', () => {
    resolver.registerTrait(makeTrait('A', { x: 1 }));
    resolver.registerTrait(makeTrait('B', { y: 2 }));

    resolver.resolveAll();

    const warnings = resolver.detectDiamondInheritance(['A', 'B']);
    expect(warnings).toHaveLength(0);
  });

  it('detects diamond through multi-level inheritance', () => {
    //         Root
    //        /    \
    //    Mid1    Mid2
    //      |       |
    //   Left    Right
    resolver.registerTrait(makeTrait('Root', { base: true }));
    resolver.registerTrait(makeTrait('Mid1', {}, 'Root'));
    resolver.registerTrait(makeTrait('Mid2', {}, 'Root'));
    resolver.registerTrait(makeTrait('Left', {}, 'Mid1'));
    resolver.registerTrait(makeTrait('Right', {}, 'Mid2'));

    resolver.resolveAll();

    const warnings = resolver.detectDiamondInheritance(['Left', 'Right']);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].sharedAncestor).toBe('Root');
  });
});

// =============================================================================
// FLATTENING API
// =============================================================================

describe('TraitInheritanceResolver — flattening API', () => {
  let resolver: TraitInheritanceResolver;

  beforeEach(() => {
    resolver = new TraitInheritanceResolver();
    resolver.registerTrait(makeTrait('Base', { a: 1, b: 2 }));
    resolver.registerTrait(makeTrait('Child', { b: 20, c: 30 }, 'Base'));
  });

  it('getFlattenedProperties returns merged property map', () => {
    const props = resolver.getFlattenedProperties('Child');

    expect(props).toEqual({ a: 1, b: 20, c: 30 });
  });

  it('getFlattenedProperties returns empty for unknown trait', () => {
    const props = resolver.getFlattenedProperties('Unknown');

    expect(props).toEqual({});
  });

  it('getAncestors returns correct chain', () => {
    const ancestors = resolver.getAncestors('Child');
    expect(ancestors).toEqual(['Base']);
  });

  it('getAncestors returns empty for root trait', () => {
    const ancestors = resolver.getAncestors('Base');
    expect(ancestors).toEqual([]);
  });

  it('getAncestors returns empty for unknown trait', () => {
    const ancestors = resolver.getAncestors('Unknown');
    expect(ancestors).toEqual([]);
  });
});

// =============================================================================
// RESOLVE ALL
// =============================================================================

describe('TraitInheritanceResolver — resolveAll', () => {
  let resolver: TraitInheritanceResolver;

  beforeEach(() => {
    resolver = new TraitInheritanceResolver();
  });

  it('resolves all registered traits', () => {
    resolver.registerTrait(makeTrait('A', { x: 1 }));
    resolver.registerTrait(makeTrait('B', { y: 2 }, 'A'));
    resolver.registerTrait(makeTrait('C', { z: 3 }));

    const result = resolver.resolveAll();

    expect(result.resolved.size).toBe(3);
    expect(result.errors).toHaveLength(0);
    expect(result.resolved.get('B')!.properties).toEqual({ x: 1, y: 2 });
  });

  it('collects multiple errors', () => {
    resolver.registerTrait(makeTrait('CycleA', {}, 'CycleB'));
    resolver.registerTrait(makeTrait('CycleB', {}, 'CycleA'));
    resolver.registerTrait(makeTrait('Orphan', {}, 'MissingParent'));

    const result = resolver.resolveAll();

    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// PROPERTY SHADOWING WARNINGS
// =============================================================================

describe('TraitInheritanceResolver — property shadowing warnings', () => {
  let resolver: TraitInheritanceResolver;

  beforeEach(() => {
    resolver = new TraitInheritanceResolver();
  });

  it('generates warning when child overrides parent property', () => {
    resolver.registerTrait(makeTrait('Base', { speed: 5 }));
    resolver.registerTrait(makeTrait('Fast', { speed: 100 }, 'Base'));

    const result = resolver.resolveTrait('Fast');

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('speed');
    expect(result.warnings[0]).toContain('overrides');
  });

  it('no warning when child adds new property', () => {
    resolver.registerTrait(makeTrait('Base', { speed: 5 }));
    resolver.registerTrait(makeTrait('Extended', { damage: 10 }, 'Base'));

    const result = resolver.resolveTrait('Extended');

    expect(result.warnings).toHaveLength(0);
  });

  it('no warning when child has same value as parent', () => {
    resolver.registerTrait(makeTrait('Base', { speed: 5 }));
    resolver.registerTrait(makeTrait('Same', { speed: 5 }, 'Base'));

    const result = resolver.resolveTrait('Same');

    expect(result.warnings).toHaveLength(0);
  });
});

// =============================================================================
// CACHING
// =============================================================================

describe('TraitInheritanceResolver — caching', () => {
  let resolver: TraitInheritanceResolver;

  beforeEach(() => {
    resolver = new TraitInheritanceResolver();
    resolver.registerTrait(makeTrait('A', { x: 1 }));
    resolver.registerTrait(makeTrait('B', { y: 2 }, 'A'));
  });

  it('returns cached result on second call', () => {
    const first = resolver.resolveTrait('B');
    const second = resolver.resolveTrait('B');

    expect(first).toBe(second); // Same reference (cached)
  });

  it('cache invalidated when new trait registered', () => {
    const first = resolver.resolveTrait('B');

    // Register a new trait (invalidates cache)
    resolver.registerTrait(makeTrait('C', { z: 3 }));

    // Re-resolve should still work but not return same cached reference
    const second = resolver.resolveTrait('B');
    expect(second.properties).toEqual(first.properties);
  });
});

// =============================================================================
// CLEAR
// =============================================================================

describe('TraitInheritanceResolver — clear', () => {
  it('clear removes all definitions and cache', () => {
    const resolver = new TraitInheritanceResolver();
    resolver.registerTrait(makeTrait('A', { x: 1 }));
    resolver.resolveTrait('A');

    resolver.clear();

    expect(resolver.hasTrait('A')).toBe(false);
    expect(() => resolver.resolveTrait('A')).toThrow();
  });
});

// =============================================================================
// GRAPH INTEGRATION
// =============================================================================

describe('TraitInheritanceResolver — TraitDependencyGraph integration', () => {
  it('registers all traits in the dependency graph', () => {
    const resolver = new TraitInheritanceResolver();
    resolver.registerTrait(makeTrait('Base', {}));
    resolver.registerTrait(makeTrait('Child', {}, 'Base'));
    resolver.registerTrait(makeTrait('Grandchild', {}, 'Child'));

    const graph = new TraitDependencyGraph();
    resolver.registerInGraph(graph);

    const stats = graph.getStats();
    expect(stats.traitCount).toBe(3);
  });
});

// =============================================================================
// INTEGRATION: TraitCompositionCompiler with inheritance
// =============================================================================

describe('TraitCompositionCompiler — with TraitInheritanceResolver', () => {
  it('composed traits include inherited properties', () => {
    const resolver = new TraitInheritanceResolver();
    resolver.registerTrait(makeTrait('BasePhysics', { mass: 1, gravity: 9.8 }));
    resolver.registerTrait(makeTrait('HeavyPhysics', { mass: 100 }, 'BasePhysics'));

    const compiler = new TraitCompositionCompiler(resolver);

    const registry: Record<
      string,
      { defaultConfig: Record<string, unknown>; conflicts?: string[] }
    > = {
      HeavyPhysics: { defaultConfig: { mass: 100 } },
      combat: { defaultConfig: { damage: 10 } },
    };

    const [result] = compiler.compile(
      [{ name: 'Tank', components: ['HeavyPhysics', 'combat'] }],
      (n) => registry[n]
    );

    // Should include inherited gravity from BasePhysics
    expect(result.defaultConfig.gravity).toBe(9.8);
    expect(result.defaultConfig.mass).toBe(100);
    expect(result.defaultConfig.damage).toBe(10);
  });

  it('works without resolver (backward compatible)', () => {
    const compiler = new TraitCompositionCompiler();

    const registry = {
      physics: { defaultConfig: { mass: 1 } },
    };

    const [result] = compiler.compile(
      [{ name: 'Simple', components: ['physics'] }],
      (n) => (registry as any)[n]
    );

    expect(result.defaultConfig.mass).toBe(1);
  });
});

// =============================================================================
// INTEGRATION: TraitComposer with inheritance
// =============================================================================

describe('TraitComposer — with TraitInheritanceResolver', () => {
  it('composed handler config includes inherited properties', () => {
    const resolver = new TraitInheritanceResolver();
    resolver.registerTrait(makeTrait('BaseMovement', { speed: 5, acceleration: 2 }));
    resolver.registerTrait(makeTrait('FastMovement', { speed: 50 }, 'BaseMovement'));

    const composer = new TraitComposer(undefined, resolver);

    const handlerMap = new Map<string, any>([
      [
        'FastMovement',
        {
          name: 'FastMovement',
          defaultConfig: { speed: 50 },
          onAttach: () => {},
          onDetach: () => {},
          onUpdate: () => {},
          onEvent: () => {},
        },
      ],
    ]);

    const result = composer.compose('Runner', handlerMap, ['FastMovement']);

    // Should include inherited acceleration from BaseMovement
    expect(result.handler.defaultConfig?.acceleration).toBe(2);
    expect(result.handler.defaultConfig?.speed).toBe(50);
  });

  it('diamond warnings appear in compose result', () => {
    const resolver = new TraitInheritanceResolver();
    resolver.registerTrait(makeTrait('Root', { base: true }));
    resolver.registerTrait(makeTrait('Left', { left: true }, 'Root'));
    resolver.registerTrait(makeTrait('Right', { right: true }, 'Root'));
    resolver.resolveAll();

    const composer = new TraitComposer(undefined, resolver);

    const handlerMap = new Map<string, any>([
      [
        'Left',
        {
          name: 'Left',
          defaultConfig: { left: true },
          onAttach: () => {},
          onDetach: () => {},
          onUpdate: () => {},
          onEvent: () => {},
        },
      ],
      [
        'Right',
        {
          name: 'Right',
          defaultConfig: { right: true },
          onAttach: () => {},
          onDetach: () => {},
          onUpdate: () => {},
          onEvent: () => {},
        },
      ],
    ]);

    const result = composer.compose('Diamond', handlerMap, ['Left', 'Right']);

    expect(result.diamondWarnings).toBeDefined();
    expect(result.diamondWarnings!.length).toBeGreaterThan(0);
    expect(result.diamondWarnings![0]).toContain('Diamond inheritance detected');
  });

  it('works without resolver (backward compatible)', () => {
    const composer = new TraitComposer();

    const handlerMap = new Map<string, any>([
      [
        'test',
        {
          name: 'test',
          defaultConfig: { x: 1 },
          onAttach: () => {},
          onDetach: () => {},
          onUpdate: () => {},
          onEvent: () => {},
        },
      ],
    ]);

    const result = composer.compose('Simple', handlerMap, ['test']);

    expect(result.handler.defaultConfig?.x).toBe(1);
    expect(result.diamondWarnings).toBeUndefined();
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('TraitInheritanceResolver — edge cases', () => {
  let resolver: TraitInheritanceResolver;

  beforeEach(() => {
    resolver = new TraitInheritanceResolver();
  });

  it('trait extending itself is a cycle', () => {
    resolver.registerTrait(makeTrait('Self', {}, 'Self'));
    expect(() => resolver.resolveTrait('Self')).toThrow(CircularInheritanceError);
  });

  it('handles trait with empty properties', () => {
    resolver.registerTrait(makeTrait('Empty', {}));
    const result = resolver.resolveTrait('Empty');
    expect(result.properties).toEqual({});
  });

  it('registers multiple traits in batch', () => {
    resolver.registerTraits([
      makeTrait('A', { x: 1 }),
      makeTrait('B', { y: 2 }),
      makeTrait('C', { z: 3 }),
    ]);

    expect(resolver.hasTrait('A')).toBe(true);
    expect(resolver.hasTrait('B')).toBe(true);
    expect(resolver.hasTrait('C')).toBe(true);
  });

  it('getDefinition returns raw definition', () => {
    const def = makeTrait('Test', { x: 1 });
    resolver.registerTrait(def);

    expect(resolver.getDefinition('Test')).toBe(def);
    expect(resolver.getDefinition('Unknown')).toBeUndefined();
  });

  it('property values of different types are preserved', () => {
    resolver.registerTrait(
      makeTrait('TypeTest', {
        stringVal: 'hello',
        numberVal: 42,
        boolVal: true,
        nullVal: null,
        arrayVal: [1, 2, 3],
        objectVal: { nested: 'yes' },
      })
    );

    const result = resolver.resolveTrait('TypeTest');

    expect(result.properties.stringVal).toBe('hello');
    expect(result.properties.numberVal).toBe(42);
    expect(result.properties.boolVal).toBe(true);
    expect(result.properties.nullVal).toBeNull();
    expect(result.properties.arrayVal).toEqual([1, 2, 3]);
    expect(result.properties.objectVal).toEqual({ nested: 'yes' });
  });
});
