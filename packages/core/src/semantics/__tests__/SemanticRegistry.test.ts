import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticRegistry } from '../SemanticAnnotation';
import type { SemanticSchema, SemanticAnnotation } from '../SemanticAnnotation';

function makeAnnotation(id: string, opts: Partial<SemanticAnnotation> = {}): SemanticAnnotation {
  return {
    id,
    propertyPath: opts.propertyPath ?? `prop.${id}`,
    label: opts.label ?? `Label ${id}`,
    category: opts.category ?? 'transform',
    intent: opts.intent ?? 'position',
    flags: opts.flags ?? { mutable: true, networked: false, persistent: false, inspectable: true, animatable: false, affectsRender: false, affectsPhysics: false, required: false, deprecated: false, sensitive: false },
    constraints: opts.constraints ?? {},
    relations: opts.relations ?? [],
    tags: opts.tags ?? [],
    metadata: opts.metadata ?? {},
  };
}

function makeSchema(id: string, entityType: string, annotations: SemanticAnnotation[] = []): SemanticSchema {
  const annMap = new Map<string, SemanticAnnotation>();
  for (const a of annotations) annMap.set(a.propertyPath, a);
  return {
    id,
    name: `Schema ${id}`,
    version: '1.0.0',
    entityType,
    annotations: annMap,
    tags: [],
    metadata: {},
  };
}

describe('SemanticRegistry', () => {
  let registry: SemanticRegistry;

  beforeEach(() => {
    SemanticRegistry.resetInstance();
    registry = SemanticRegistry.getInstance();
  });

  // ---- Singleton ----

  it('getInstance returns same instance', () => {
    const a = SemanticRegistry.getInstance();
    const b = SemanticRegistry.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance creates new instance', () => {
    const before = SemanticRegistry.getInstance();
    SemanticRegistry.resetInstance();
    const after = SemanticRegistry.getInstance();
    expect(before).not.toBe(after);
  });

  // ---- Schema Registration ----

  it('registerSchema stores schema', () => {
    const schema = makeSchema('s1', 'Player');
    registry.registerSchema(schema);
    expect(registry.getSchema('s1')).toBeDefined();
  });

  it('getSchemaForEntity finds by entity type', () => {
    const schema = makeSchema('s1', 'NPC');
    registry.registerSchema(schema);
    expect(registry.getSchemaForEntity('NPC')).toBeDefined();
  });

  it('getAllSchemas returns registered schemas', () => {
    registry.registerSchema(makeSchema('a', 'TypeA'));
    registry.registerSchema(makeSchema('b', 'TypeB'));
    expect(registry.getAllSchemas().length).toBe(2);
  });

  // ---- Annotations ----

  it('getAnnotation retrieves by entity and path', () => {
    const ann = makeAnnotation('pos', { propertyPath: 'transform.position' });
    const schema = makeSchema('s1', 'Entity', [ann]);
    registry.registerSchema(schema);
    const result = registry.getAnnotation('Entity', 'transform.position');
    expect(result).toBeDefined();
    expect(result!.id).toBe('pos');
  });

  it('findByCategory returns matching annotations', () => {
    const ann = makeAnnotation('a', { category: 'physics' });
    registry.registerSchema(makeSchema('s', 'E', [ann]));
    const results = registry.findByCategory('physics');
    expect(results.length).toBe(1);
  });

  it('findByIntent returns matching annotations', () => {
    const ann = makeAnnotation('a', { intent: 'velocity' });
    registry.registerSchema(makeSchema('s', 'E', [ann]));
    const results = registry.findByIntent('velocity');
    expect(results.length).toBe(1);
  });

  // ---- AI Context ----

  it('generateAIContext returns non-empty string', () => {
    const ann = makeAnnotation('hp', { propertyPath: 'stats.health', category: 'gameplay' });
    registry.registerSchema(makeSchema('s', 'Hero', [ann]));
    const context = registry.generateAIContext('Hero');
    expect(context.length).toBeGreaterThan(0);
    expect(context).toContain('Schema s');
  });

  // ---- Property Suggestions ----

  it('getPropertySuggestions filters by partial path', () => {
    const a1 = makeAnnotation('a1', { propertyPath: 'transform.position' });
    const a2 = makeAnnotation('a2', { propertyPath: 'transform.rotation' });
    const a3 = makeAnnotation('a3', { propertyPath: 'stats.health' });
    registry.registerSchema(makeSchema('s', 'E', [a1, a2, a3]));
    const suggestions = registry.getPropertySuggestions('E', 'transform');
    expect(suggestions.length).toBe(2);
  });

  it('getPropertySuggestions returns empty for unknown entity', () => {
    const suggestions = registry.getPropertySuggestions('Unknown', 'foo');
    expect(suggestions.length).toBe(0);
  });
});
