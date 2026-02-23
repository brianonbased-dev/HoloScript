/**
 * TraitCompositionCompiler Production Tests
 *
 * Tests composition declaration compilation: config merging,
 * conflict detection, override precedence, and graph registration.
 */

import { describe, it, expect } from 'vitest';
import {
  TraitCompositionCompiler,
  CompositionConflictError,
  MissingComponentError,
  type TraitCompositionDecl,
  type ComponentTraitHandler,
} from '../../compiler/TraitCompositionCompiler';
import { TraitDependencyGraph } from '../../compiler/TraitDependencyGraph';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeHandler(
  defaults: Record<string, unknown> = {},
  conflicts: string[] = [],
): ComponentTraitHandler {
  return { defaultConfig: defaults, conflicts };
}

function makeRegistry(
  entries: Record<string, ComponentTraitHandler>,
): (name: string) => ComponentTraitHandler | undefined {
  return (name) => entries[name];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TraitCompositionCompiler — Production', () => {
  const compiler = new TraitCompositionCompiler();

  // ─── Basic compilation ─────────────────────────────────────────────

  it('compiles a single-component composition', () => {
    const decl: TraitCompositionDecl = { name: 'Warrior', components: ['combat'] };
    const registry = makeRegistry({ combat: makeHandler({ damage: 10 }) });
    const [def] = compiler.compile([decl], registry);
    expect(def.name).toBe('Warrior');
    expect(def.components).toEqual(['combat']);
    expect(def.defaultConfig.damage).toBe(10);
  });

  it('compiles a two-component composition and merges configs', () => {
    const decl: TraitCompositionDecl = {
      name: 'Knight',
      components: ['combat', 'armor'],
    };
    const registry = makeRegistry({
      combat: makeHandler({ damage: 10, speed: 5 }),
      armor: makeHandler({ defense: 20 }),
    });
    const [def] = compiler.compile([decl], registry);
    expect(def.defaultConfig.damage).toBe(10);
    expect(def.defaultConfig.defense).toBe(20);
  });

  it('later components override same-named keys from earlier ones', () => {
    const decl: TraitCompositionDecl = {
      name: 'Speedy',
      components: ['base', 'enhanced'],
    };
    const registry = makeRegistry({
      base: makeHandler({ speed: 5 }),
      enhanced: makeHandler({ speed: 15 }),
    });
    const [def] = compiler.compile([decl], registry);
    expect(def.defaultConfig.speed).toBe(15);
  });

  it('overrides win over all component defaults', () => {
    const decl: TraitCompositionDecl = {
      name: 'CustomKnight',
      components: ['combat', 'armor'],
      overrides: { damage: 999 },
    };
    const registry = makeRegistry({
      combat: makeHandler({ damage: 10 }),
      armor: makeHandler({ defense: 20 }),
    });
    const [def] = compiler.compile([decl], registry);
    expect(def.defaultConfig.damage).toBe(999);
    expect(def.defaultConfig.defense).toBe(20);
  });

  it('handles component with no defaultConfig gracefully', () => {
    const decl: TraitCompositionDecl = { name: 'Ghost', components: ['stealth'] };
    const registry = makeRegistry({ stealth: {} }); // no defaultConfig
    const [def] = compiler.compile([decl], registry);
    expect(def.defaultConfig).toEqual({});
  });

  it('preserves component order in compiled def', () => {
    const decl: TraitCompositionDecl = {
      name: 'Triple',
      components: ['a', 'b', 'c'],
    };
    const registry = makeRegistry({
      a: makeHandler({}),
      b: makeHandler({}),
      c: makeHandler({}),
    });
    const [def] = compiler.compile([decl], registry);
    expect(def.components).toEqual(['a', 'b', 'c']);
  });

  it('compiles multiple declarations in one call', () => {
    const decls: TraitCompositionDecl[] = [
      { name: 'A', components: ['x'] },
      { name: 'B', components: ['y'] },
    ];
    const registry = makeRegistry({
      x: makeHandler({ xp: 1 }),
      y: makeHandler({ yp: 2 }),
    });
    const defs = compiler.compile(decls, registry);
    expect(defs).toHaveLength(2);
    expect(defs[0].name).toBe('A');
    expect(defs[1].name).toBe('B');
  });

  // ─── Conflict detection ────────────────────────────────────────────

  it('throws CompositionConflictError when A conflicts with B', () => {
    const decl: TraitCompositionDecl = {
      name: 'Bad',
      components: ['fire', 'ice'],
    };
    const registry = makeRegistry({
      fire: makeHandler({}, ['ice']),
      ice: makeHandler({}),
    });
    expect(() => compiler.compile([decl], registry)).toThrow(CompositionConflictError);
  });

  it('throws CompositionConflictError when B conflicts with A', () => {
    const decl: TraitCompositionDecl = {
      name: 'Bad2',
      components: ['a', 'b'],
    };
    const registry = makeRegistry({
      a: makeHandler({}),
      b: makeHandler({}, ['a']),
    });
    expect(() => compiler.compile([decl], registry)).toThrow(CompositionConflictError);
  });

  it('two non-conflicting traits compile without error', () => {
    const decl: TraitCompositionDecl = { name: 'OK', components: ['p', 'q'] };
    const registry = makeRegistry({ p: makeHandler({}), q: makeHandler({}) });
    expect(() => compiler.compile([decl], registry)).not.toThrow();
  });

  // ─── Missing component ─────────────────────────────────────────────

  it('throws MissingComponentError for unknown component', () => {
    const decl: TraitCompositionDecl = { name: 'Broken', components: ['missing'] };
    const registry = makeRegistry({});
    expect(() => compiler.compile([decl], registry)).toThrow(MissingComponentError);
  });

  // ─── TraitDependencyGraph integration ─────────────────────────────

  it('registers composed trait into TraitDependencyGraph.requires', () => {
    const graph = new TraitDependencyGraph();
    const decl: TraitCompositionDecl = {
      name: 'Paladin',
      components: ['combat', 'holy'],
    };
    const registry = makeRegistry({
      combat: makeHandler({ dmg: 5 }),
      holy: makeHandler({ heal: 3 }),
    });
    compiler.compile([decl], registry, graph);
    const deps = graph.getDependentTraits('combat');
    // Paladin requires combat, so 'Paladin' should appear in dependents of 'combat'
    expect(deps.has('Paladin')).toBe(true);
  });

  it('does not register into graph when no graph provided', () => {
    const decl: TraitCompositionDecl = { name: 'Solo', components: ['x'] };
    const registry = makeRegistry({ x: makeHandler({}) });
    // Should not throw even without graph
    expect(() => compiler.compile([decl], registry)).not.toThrow();
  });
});
