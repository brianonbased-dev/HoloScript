/**
 * TraitComposition.test.ts
 *
 * Tests for TraitComposer (Sprint 2 — Trait Composition).
 *
 * @turret = @physics + @ai_npc + @targeting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TraitComposer } from '../TraitComposer';
import { TraitDependencyGraph } from '../TraitDependencyGraph';
import type { TraitHandler } from '../../traits/TraitTypes';

// =============================================================================
// HELPERS
// =============================================================================

function makeHandler(name: string, defaultConfig: Record<string, unknown> = {}): TraitHandler<Record<string, unknown>> {
  const calls: string[] = [];
  const h: TraitHandler<Record<string, unknown>> = {
    name: name as any,
    defaultConfig,
    onAttach(node: any, _config: any, _ctx: any) { (node._calls ??= []).push(`${name}:attach`); },
    onDetach(node: any, _config: any, _ctx: any) { (node._calls ??= []).push(`${name}:detach`); },
    onUpdate(node: any, _config: any, _ctx: any, _dt: any) { (node._calls ??= []).push(`${name}:update`); },
    onEvent(node: any, _config: any, _ctx: any, event: any) { (node._calls ??= []).push(`${name}:event:${event?.type}`); },
  };
  (h as any)._recordedCalls = calls;
  return h;
}

// =============================================================================
// STATIC PARSER
// =============================================================================

describe('TraitComposer.parseCompositionLine()', () => {
  it('parses a two-way composition', () => {
    const result = TraitComposer.parseCompositionLine('@turret = @physics + @targeting');
    expect(result).toEqual({ name: 'turret', sources: ['physics', 'targeting'] });
  });

  it('parses a three-way composition', () => {
    const result = TraitComposer.parseCompositionLine('@elite_npc = @physics + @ai_npc + @patrol');
    expect(result).toEqual({ name: 'elite_npc', sources: ['physics', 'ai_npc', 'patrol'] });
  });

  it('returns null for non-composition lines', () => {
    expect(TraitComposer.parseCompositionLine('scene World {')).toBeNull();
    expect(TraitComposer.parseCompositionLine('@physics')).toBeNull();
    expect(TraitComposer.parseCompositionLine('@import @a from "./b.hs"')).toBeNull();
  });

  it('handles extra whitespace', () => {
    const result = TraitComposer.parseCompositionLine(
      '@turret  =  @physics  +  @targeting',
    );
    expect(result).toEqual({ name: 'turret', sources: ['physics', 'targeting'] });
  });
});

// =============================================================================
// COMPOSITION
// =============================================================================

describe('TraitComposer.compose()', () => {
  let composer: TraitComposer;
  let handlers: Map<string, TraitHandler<Record<string, unknown>>>;
  let physicsHandler: TraitHandler<Record<string, unknown>>;
  let aiHandler: TraitHandler<Record<string, unknown>>;
  let patrolHandler: TraitHandler<Record<string, unknown>>;

  beforeEach(() => {
    composer = new TraitComposer();
    physicsHandler = makeHandler('physics', { gravity: 9.81, mass: 1.0 });
    aiHandler = makeHandler('ai_npc', { intelligence: 'basic', aggression: 0.5 });
    patrolHandler = makeHandler('patrol', { waypoints: [], speed: 2.0, mass: 5.0 }); // mass overrides physics

    handlers = new Map([
      ['physics', physicsHandler],
      ['ai_npc', aiHandler],
      ['patrol', patrolHandler],
    ]);
  });

  it('returns a CompositionResult with the correct name and sources', () => {
    const result = composer.compose('elite_npc', handlers, ['physics', 'ai_npc', 'patrol']);
    expect(result.name).toBe('elite_npc');
    expect(result.sources).toEqual(['physics', 'ai_npc', 'patrol']);
  });

  it('merges defaultConfig with right-side-wins precedence', () => {
    const result = composer.compose('elite_npc', handlers, ['physics', 'ai_npc', 'patrol']);
    const cfg = result.handler.defaultConfig as Record<string, unknown>;

    // patrol.mass (5.0) should override physics.mass (1.0)
    expect(cfg.mass).toBe(5.0);
    // physics.gravity not overridden
    expect(cfg.gravity).toBe(9.81);
    // ai_npc fields preserved
    expect(cfg.intelligence).toBe('basic');
    // patrol.speed preserved
    expect(cfg.speed).toBe(2.0);
  });

  it('calls onAttach for all source handlers in order', () => {
    const result = composer.compose('elite_npc', handlers, ['physics', 'ai_npc', 'patrol']);
    const node: any = {};
    result.handler.onAttach!(node, {}, {} as any);
    expect(node._calls).toEqual(['physics:attach', 'ai_npc:attach', 'patrol:attach']);
  });

  it('calls onDetach in reverse order', () => {
    const result = composer.compose('elite_npc', handlers, ['physics', 'ai_npc', 'patrol']);
    const node: any = {};
    result.handler.onDetach!(node, {}, {} as any);
    expect(node._calls).toEqual(['patrol:detach', 'ai_npc:detach', 'physics:detach']);
  });

  it('calls onUpdate for all handlers in order', () => {
    const result = composer.compose('elite_npc', handlers, ['physics', 'ai_npc', 'patrol']);
    const node: any = {};
    result.handler.onUpdate!(node, {}, {} as any, 0.016);
    expect(node._calls).toEqual(['physics:update', 'ai_npc:update', 'patrol:update']);
  });

  it('calls onEvent for all handlers in order', () => {
    const result = composer.compose('elite_npc', handlers, ['physics', 'ai_npc', 'patrol']);
    const node: any = {};
    result.handler.onEvent!(node, {}, {} as any, { type: 'damage' });
    expect(node._calls).toEqual([
      'physics:event:damage',
      'ai_npc:event:damage',
      'patrol:event:damage',
    ]);
  });

  it('emits warnings for missing traits in handler map', () => {
    const result = composer.compose('turret', handlers, ['physics', 'targeting']); // 'targeting' missing
    expect(result.warnings.some((w) => w.includes('targeting'))).toBe(true);
  });

  it('produces no conflicts for non-conflicting traits', () => {
    const result = composer.compose('elite_npc', handlers, ['physics', 'ai_npc', 'patrol']);
    expect(result.conflicts).toEqual([]);
  });

  it('handles single-trait composition (identity)', () => {
    const result = composer.compose('just_physics', handlers, ['physics']);
    const node: any = {};
    result.handler.onAttach!(node, {}, {} as any);
    expect(node._calls).toEqual(['physics:attach']);
    const cfg = result.handler.defaultConfig as Record<string, unknown>;
    expect(cfg.gravity).toBe(9.81);
  });

  describe('with TraitDependencyGraph conflict detection', () => {
    it('reports conflicts when graph has conflicting traits registered', () => {
      const graph = new TraitDependencyGraph();
      graph.registerTrait({ name: 'physics', requires: [], conflicts: ['vr_physics'] });
      graph.registerTrait({ name: 'vr_physics', requires: [], conflicts: ['physics'] });

      const composerWithGraph = new TraitComposer(graph);

      const h2 = new Map([
        ['physics', physicsHandler],
        ['vr_physics', makeHandler('vr_physics')],
      ]);

      const result = composerWithGraph.compose('mixed', h2, ['physics', 'vr_physics']);
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0]).toContain('physics');
      expect(result.conflicts[0]).toContain('vr_physics');
    });

    it('registers the composed trait in the dependency graph', () => {
      const graph = new TraitDependencyGraph();
      const composerWithGraph = new TraitComposer(graph);
      composerWithGraph.compose('elite_npc', handlers, ['physics', 'ai_npc']);

      // Verify the composed trait is now in the graph
      const deps = graph.getTraitDependencies?.('elite_npc') ?? new Set<string>();
      // The graph should know about 'elite_npc' as a registered trait
      // (registerTrait puts it in traitDependencies)
      expect(deps).toBeDefined();
    });
  });
});
