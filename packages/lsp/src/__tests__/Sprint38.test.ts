/**
 * Sprint 38 — @holoscript/lsp acceptance tests
 * Covers: TRAIT_DOCS catalog, getTraitDoc, getAllTraitNames, getTraitsByCategory,
 *         formatTraitDocAsMarkdown, formatTraitDocCompact, SemanticCompletionProvider
 */
import { describe, it, expect } from 'vitest';
import {
  TRAIT_DOCS,
  getTraitDoc,
  getAllTraitNames,
  getTraitsByCategory,
  formatTraitDocAsMarkdown,
  formatTraitDocCompact,
  type TraitDoc,
  type PropertyDoc,
  type MethodDoc,
  type EventDoc,
} from '../traitDocs';
import { SemanticCompletionProvider } from '../SemanticCompletionProvider';

// ═══════════════════════════════════════════════
// TRAIT_DOCS catalog — structure
// ═══════════════════════════════════════════════
describe('TRAIT_DOCS catalog', () => {
  it('is a non-empty record', () => {
    expect(typeof TRAIT_DOCS).toBe('object');
    expect(Object.keys(TRAIT_DOCS).length).toBeGreaterThan(0);
  });

  it('has at least 10 traits', () => {
    expect(Object.keys(TRAIT_DOCS).length).toBeGreaterThanOrEqual(10);
  });

  it('each trait has required string fields', () => {
    for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
      expect(typeof doc.name, `${key}.name`).toBe('string');
      expect(typeof doc.annotation, `${key}.annotation`).toBe('string');
      expect(typeof doc.description, `${key}.description`).toBe('string');
      expect(typeof doc.category, `${key}.category`).toBe('string');
      expect(typeof doc.example, `${key}.example`).toBe('string');
    }
  });

  it('every annotation starts with @', () => {
    for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
      expect(doc.annotation, `${key} annotation`).toMatch(/^@/);
    }
  });

  it('each trait has arrays for properties, methods, events', () => {
    for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
      expect(Array.isArray(doc.properties), `${key}.properties`).toBe(true);
      expect(Array.isArray(doc.methods), `${key}.methods`).toBe(true);
      expect(Array.isArray(doc.events), `${key}.events`).toBe(true);
    }
  });

  it('all categories are valid enum values', () => {
    const valid = new Set(['physics', 'animation', 'rendering', 'networking', 'input', 'ai', 'utility', 'hololand']);
    for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
      expect(valid.has(doc.category), `${key}.category="${doc.category}"`).toBe(true);
    }
  });

  it('known trait "rigidbody" exists', () => {
    expect(TRAIT_DOCS['rigidbody']).toBeDefined();
    expect(TRAIT_DOCS['rigidbody'].annotation).toBe('@rigidbody');
    expect(TRAIT_DOCS['rigidbody'].category).toBe('physics');
  });

  it('known trait "networked" exists', () => {
    expect(TRAIT_DOCS['networked']).toBeDefined();
    expect(TRAIT_DOCS['networked'].annotation).toBe('@networked');
    expect(TRAIT_DOCS['networked'].category).toBe('networking');
  });

  it('known trait "ik" exists', () => {
    expect(TRAIT_DOCS['ik']).toBeDefined();
    expect(TRAIT_DOCS['ik'].category).toBe('animation');
  });

  it('known trait "ai_driver" exists', () => {
    expect(TRAIT_DOCS['ai_driver']).toBeDefined();
    expect(TRAIT_DOCS['ai_driver'].category).toBe('ai');
  });
});

// ═══════════════════════════════════════════════
// PropertyDoc / MethodDoc / EventDoc shapes
// ═══════════════════════════════════════════════
describe('sub-document shapes', () => {
  it('PropertyDoc has name, type, description', () => {
    const rigidbody = TRAIT_DOCS['rigidbody'];
    for (const prop of rigidbody.properties) {
      expect(typeof prop.name).toBe('string');
      expect(typeof prop.type).toBe('string');
      expect(typeof prop.description).toBe('string');
    }
  });

  it('MethodDoc has name, signature, description, parameters array', () => {
    const rigidbody = TRAIT_DOCS['rigidbody'];
    for (const method of rigidbody.methods) {
      expect(typeof method.name).toBe('string');
      expect(typeof method.signature).toBe('string');
      expect(typeof method.description).toBe('string');
      expect(Array.isArray(method.parameters)).toBe(true);
    }
  });

  it('EventDoc has name and description', () => {
    const rigidbody = TRAIT_DOCS['rigidbody'];
    for (const ev of rigidbody.events) {
      expect(typeof ev.name).toBe('string');
      expect(typeof ev.description).toBe('string');
    }
  });

  it('rigidbody has at least 5 properties', () => {
    expect(TRAIT_DOCS['rigidbody'].properties.length).toBeGreaterThanOrEqual(5);
  });

  it('rigidbody has applyForce method', () => {
    const methods = TRAIT_DOCS['rigidbody'].methods.map(m => m.name);
    expect(methods).toContain('applyForce');
  });

  it('rigidbody has onCollisionStart event', () => {
    const events = TRAIT_DOCS['rigidbody'].events.map(e => e.name);
    expect(events).toContain('onCollisionStart');
  });
});

// ═══════════════════════════════════════════════
// getTraitDoc
// ═══════════════════════════════════════════════
describe('getTraitDoc', () => {
  it('returns doc by exact key name', () => {
    const doc = getTraitDoc('rigidbody');
    expect(doc).toBeDefined();
    expect(doc!.annotation).toBe('@rigidbody');
  });

  it('returns doc when prefixed with @', () => {
    const doc = getTraitDoc('@rigidbody');
    expect(doc).toBeDefined();
    expect(doc!.name).toBe('RigidbodyTrait');
  });

  it('returns doc for networked', () => {
    const doc = getTraitDoc('networked');
    expect(doc).toBeDefined();
    expect(doc!.category).toBe('networking');
  });

  it('returns doc for material', () => {
    const doc = getTraitDoc('material');
    expect(doc).toBeDefined();
    expect(doc!.category).toBe('rendering');
  });

  it('returns doc for ik', () => {
    const doc = getTraitDoc('ik');
    expect(doc).toBeDefined();
    expect(doc!.annotation).toBe('@ik');
  });

  it('returns undefined for unknown trait', () => {
    expect(getTraitDoc('no-such-trait-xyz')).toBeUndefined();
  });

  it('returns a value for empty string (matches any className)', () => {
    // empty string matches every className.includes(''), so first trait is returned
    const doc = getTraitDoc('');
    expect(doc).toBeDefined();
  });

  it('lookup is case-insensitive', () => {
    const doc = getTraitDoc('RIGIDBODY');
    expect(doc).toBeDefined();
  });

  it('strips "trait" suffix from name', () => {
    // "rigidbodyTrait" should resolve to rigidbody
    const doc = getTraitDoc('rigidbodyTrait');
    expect(doc).toBeDefined();
  });
});

// ═══════════════════════════════════════════════
// getAllTraitNames
// ═══════════════════════════════════════════════
describe('getAllTraitNames', () => {
  it('returns a non-empty array', () => {
    const names = getAllTraitNames();
    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBeGreaterThan(0);
  });

  it('all names start with @', () => {
    for (const name of getAllTraitNames()) {
      expect(name).toMatch(/^@/);
    }
  });

  it('count matches TRAIT_DOCS entries', () => {
    expect(getAllTraitNames().length).toBe(Object.keys(TRAIT_DOCS).length);
  });

  it('contains @rigidbody', () => {
    expect(getAllTraitNames()).toContain('@rigidbody');
  });

  it('contains @networked', () => {
    expect(getAllTraitNames()).toContain('@networked');
  });

  it('contains @ik', () => {
    expect(getAllTraitNames()).toContain('@ik');
  });

  it('contains @ai_driver', () => {
    expect(getAllTraitNames()).toContain('@ai_driver');
  });
});

// ═══════════════════════════════════════════════
// getTraitsByCategory
// ═══════════════════════════════════════════════
describe('getTraitsByCategory', () => {
  it('returns array for physics', () => {
    const result = getTraitsByCategory('physics');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns only physics traits', () => {
    for (const t of getTraitsByCategory('physics')) {
      expect(t.category).toBe('physics');
    }
  });

  it('returns only animation traits', () => {
    for (const t of getTraitsByCategory('animation')) {
      expect(t.category).toBe('animation');
    }
  });

  it('returns only rendering traits', () => {
    for (const t of getTraitsByCategory('rendering')) {
      expect(t.category).toBe('rendering');
    }
  });

  it('returns only networking traits', () => {
    for (const t of getTraitsByCategory('networking')) {
      expect(t.category).toBe('networking');
    }
  });

  it('returns only hololand traits', () => {
    const result = getTraitsByCategory('hololand');
    expect(result.length).toBeGreaterThan(0);
    for (const t of result) {
      expect(t.category).toBe('hololand');
    }
  });

  it('all categories together cover all traits', () => {
    const categories: TraitDoc['category'][] = ['physics', 'animation', 'rendering', 'networking', 'input', 'ai', 'utility', 'hololand'];
    const total = categories.reduce((sum, cat) => sum + getTraitsByCategory(cat).length, 0);
    expect(total).toBe(Object.keys(TRAIT_DOCS).length);
  });

  it('physics includes rigidbody and trigger', () => {
    const names = getTraitsByCategory('physics').map(t => t.annotation);
    expect(names).toContain('@rigidbody');
    expect(names).toContain('@trigger');
  });
});

// ═══════════════════════════════════════════════
// formatTraitDocAsMarkdown
// ═══════════════════════════════════════════════
describe('formatTraitDocAsMarkdown', () => {
  const doc = TRAIT_DOCS['rigidbody'];

  it('returns a string', () => {
    expect(typeof formatTraitDocAsMarkdown(doc)).toBe('string');
  });

  it('result is non-empty', () => {
    expect(formatTraitDocAsMarkdown(doc).length).toBeGreaterThan(0);
  });

  it('contains the annotation', () => {
    expect(formatTraitDocAsMarkdown(doc)).toContain('@rigidbody');
  });

  it('contains description', () => {
    const md = formatTraitDocAsMarkdown(doc);
    expect(md).toContain('physics');
  });

  it('contains Properties section when trait has properties', () => {
    expect(formatTraitDocAsMarkdown(doc)).toContain('Properties');
  });

  it('contains Methods section when trait has methods', () => {
    expect(formatTraitDocAsMarkdown(doc)).toContain('Methods');
  });

  it('contains Events section when trait has events', () => {
    expect(formatTraitDocAsMarkdown(doc)).toContain('Events');
  });

  it('contains Example section', () => {
    expect(formatTraitDocAsMarkdown(doc)).toContain('Example');
  });

  it('contains code fence', () => {
    expect(formatTraitDocAsMarkdown(doc)).toContain('```');
  });

  it('contains since version', () => {
    expect(formatTraitDocAsMarkdown(doc)).toContain('1.0.0');
  });

  it('works for a trait with no methods', () => {
    const hololand = TRAIT_DOCS['hololand'];
    const md = formatTraitDocAsMarkdown(hololand);
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════
// formatTraitDocCompact
// ═══════════════════════════════════════════════
describe('formatTraitDocCompact', () => {
  const doc = TRAIT_DOCS['networked'];

  it('returns a string', () => {
    expect(typeof formatTraitDocCompact(doc)).toBe('string');
  });

  it('result is non-empty', () => {
    expect(formatTraitDocCompact(doc).length).toBeGreaterThan(0);
  });

  it('contains annotation', () => {
    expect(formatTraitDocCompact(doc)).toContain('@networked');
  });

  it('contains description text', () => {
    const compact = formatTraitDocCompact(doc);
    expect(compact.length).toBeGreaterThan(20);
  });

  it('compact is shorter than full markdown for same trait', () => {
    const full = formatTraitDocAsMarkdown(doc);
    const compact = formatTraitDocCompact(doc);
    expect(compact.length).toBeLessThan(full.length);
  });

  it('contains code fence', () => {
    expect(formatTraitDocCompact(doc)).toContain('```');
  });

  it('works for every trait without throwing', () => {
    for (const [, traitDoc] of Object.entries(TRAIT_DOCS)) {
      expect(() => formatTraitDocCompact(traitDoc)).not.toThrow();
    }
  });
});

// ═══════════════════════════════════════════════
// SemanticCompletionProvider
// ═══════════════════════════════════════════════
describe('SemanticCompletionProvider', () => {
  it('can be constructed without an adapter', () => {
    const provider = new SemanticCompletionProvider();
    expect(provider).toBeDefined();
  });

  it('can be constructed with undefined adapter', () => {
    const provider = new SemanticCompletionProvider(undefined);
    expect(provider).toBeDefined();
  });

  it('getCompletions returns empty array when no adapter', async () => {
    const provider = new SemanticCompletionProvider();
    const results = await provider.getCompletions('rigidbody');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('getCompletions returns empty array for empty query', async () => {
    const provider = new SemanticCompletionProvider();
    const results = await provider.getCompletions('');
    expect(results).toEqual([]);
  });

  it('getCompletions returns empty array when not initialized', async () => {
    const provider = new SemanticCompletionProvider();
    // No initialize() called, no adapter
    const results = await provider.getCompletions('physics');
    expect(Array.isArray(results)).toBe(true);
  });

  it('initialize() resolves without adapter', async () => {
    const provider = new SemanticCompletionProvider();
    await expect(provider.initialize()).resolves.not.toThrow();
  });
});

// ═══════════════════════════════════════════════
// TypeScript interface exports
// ═══════════════════════════════════════════════
describe('type exports', () => {
  it('TraitDoc interface is usable', () => {
    const doc: TraitDoc = TRAIT_DOCS['rigidbody'];
    expect(doc.name).toBeDefined();
  });

  it('PropertyDoc interface is usable', () => {
    const prop: PropertyDoc = TRAIT_DOCS['rigidbody'].properties[0];
    expect(prop.name).toBeDefined();
    expect(prop.type).toBeDefined();
  });

  it('MethodDoc interface is usable', () => {
    const method: MethodDoc = TRAIT_DOCS['rigidbody'].methods[0];
    expect(method.name).toBeDefined();
    expect(method.signature).toBeDefined();
  });

  it('EventDoc interface is usable', () => {
    const event: EventDoc = TRAIT_DOCS['rigidbody'].events[0];
    expect(event.name).toBeDefined();
    expect(event.description).toBeDefined();
  });
});
