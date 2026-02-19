/**
 * SemanticAnnotation + SemanticRegistry Production Tests
 *
 * Tests schema registration, annotation indexing, category/intent
 * queries, validation, AI context generation, and property suggestions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SemanticRegistry,
} from '../../semantics/SemanticAnnotation';
import type {
  SemanticSchema,
  SemanticAnnotation,
} from '../../semantics/SemanticAnnotation';

function makeAnnotation(id: string, opts: Partial<SemanticAnnotation> = {}): SemanticAnnotation {
  return {
    id,
    propertyPath: opts.propertyPath || id,
    label: opts.label || id,
    category: opts.category || 'transform',
    intent: opts.intent || 'position',
    flags: opts.flags || {
      mutable: true, networked: false, persistent: false,
      inspectable: true, animatable: false, affectsRender: true,
      affectsPhysics: false, required: false, deprecated: false,
      sensitive: false,
    },
    constraints: opts.constraints || {},
    relations: opts.relations || [],
    tags: opts.tags || [],
    metadata: opts.metadata || {},
    ...opts,
  };
}

function makeSchema(id: string, entityType: string, annotations: SemanticAnnotation[]): SemanticSchema {
  const annMap = new Map<string, SemanticAnnotation>();
  for (const a of annotations) annMap.set(a.propertyPath, a);
  return {
    id,
    name: entityType,
    version: '1.0.0',
    entityType,
    annotations: annMap,
    tags: [],
    metadata: {},
  };
}

describe('SemanticRegistry — Production', () => {
  let registry: SemanticRegistry;

  beforeEach(() => {
    SemanticRegistry.resetInstance();
    registry = SemanticRegistry.getInstance();
  });

  // ─── Singleton ────────────────────────────────────────────────────

  it('getInstance returns same instance', () => {
    const a = SemanticRegistry.getInstance();
    const b = SemanticRegistry.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance creates fresh instance', () => {
    const a = SemanticRegistry.getInstance();
    SemanticRegistry.resetInstance();
    const b = SemanticRegistry.getInstance();
    expect(a).not.toBe(b);
  });

  // ─── Schema Registration ──────────────────────────────────────────

  it('registerSchema and getSchema roundtrip', () => {
    const schema = makeSchema('s1', 'Player', [makeAnnotation('health')]);
    registry.registerSchema(schema);
    expect(registry.getSchema('s1')).toBe(schema);
  });

  it('getSchema returns undefined for unknown', () => {
    expect(registry.getSchema('nonexistent')).toBeUndefined();
  });

  it('getSchemaForEntity finds by entityType', () => {
    const schema = makeSchema('s2', 'Enemy', []);
    registry.registerSchema(schema);
    expect(registry.getSchemaForEntity('Enemy')).toBe(schema);
  });

  it('getAllSchemas returns all registered', () => {
    registry.registerSchema(makeSchema('a', 'A', []));
    registry.registerSchema(makeSchema('b', 'B', []));
    expect(registry.getAllSchemas().length).toBe(2);
  });

  // ─── Annotation Index ─────────────────────────────────────────────

  it('getAnnotation retrieves by entity + property path', () => {
    const ann = makeAnnotation('pos', { propertyPath: 'position.x' });
    registry.registerSchema(makeSchema('s3', 'Cube', [ann]));
    const result = registry.getAnnotation('Cube', 'position.x');
    expect(result).toBeDefined();
    expect(result!.id).toBe('pos');
  });

  it('getAnnotation returns undefined for unknown path', () => {
    registry.registerSchema(makeSchema('s4', 'Sphere', []));
    expect(registry.getAnnotation('Sphere', 'missing')).toBeUndefined();
  });

  // ─── Category / Intent Queries ────────────────────────────────────

  it('findByCategory returns matching annotations', () => {
    registry.registerSchema(makeSchema('s5', 'Box', [
      makeAnnotation('t1', { category: 'physics', propertyPath: 'mass' }),
      makeAnnotation('t2', { category: 'visual', propertyPath: 'color' }),
    ]));
    const physics = registry.findByCategory('physics');
    expect(physics.length).toBe(1);
    expect(physics[0].propertyPath).toBe('mass');
  });

  it('findByIntent returns matching annotations', () => {
    registry.registerSchema(makeSchema('s6', 'Light', [
      makeAnnotation('i1', { intent: 'color', propertyPath: 'color' }),
      makeAnnotation('i2', { intent: 'intensity', propertyPath: 'brightness' }),
    ]));
    const colorAnns = registry.findByIntent('color');
    expect(colorAnns.length).toBe(1);
  });

  // ─── AI Context ───────────────────────────────────────────────────

  it('generateAIContext returns string for registered entity', () => {
    registry.registerSchema(makeSchema('s7', 'NPC', [
      makeAnnotation('npc_health', { propertyPath: 'health', label: 'Health Points' }),
    ]));
    const ctx = registry.generateAIContext('NPC');
    expect(typeof ctx).toBe('string');
    expect(ctx.length).toBeGreaterThan(0);
  });

  it('generateAIContext returns empty for unknown entity', () => {
    const ctx = registry.generateAIContext('Unknown');
    expect(ctx).toBe('');
  });

  // ─── Property Suggestions ─────────────────────────────────────────

  it('getPropertySuggestions matches partial path', () => {
    registry.registerSchema(makeSchema('s8', 'Character', [
      makeAnnotation('a1', { propertyPath: 'position.x' }),
      makeAnnotation('a2', { propertyPath: 'position.y' }),
      makeAnnotation('a3', { propertyPath: 'rotation.z' }),
    ]));
    const suggestions = registry.getPropertySuggestions('Character', 'pos');
    expect(suggestions.length).toBe(2);
  });

  it('getPropertySuggestions returns empty for no match', () => {
    registry.registerSchema(makeSchema('s9', 'Tree', [
      makeAnnotation('a1', { propertyPath: 'height' }),
    ]));
    const suggestions = registry.getPropertySuggestions('Tree', 'zzz');
    expect(suggestions.length).toBe(0);
  });
});
