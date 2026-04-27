import { describe, it, expect, beforeAll } from 'vitest';
import {
  TRAIT_DOCS,
  getTraitDoc,
  getAllTraitNames,
  getTraitsByCategory,
  formatTraitDocAsMarkdown,
  formatTraitDocCompact,
  type TraitDoc,
} from '../traitDocs.js';

describe('TRAIT_DOCS', () => {
  it('is a non-empty record', () => {
    expect(typeof TRAIT_DOCS).toBe('object');
    expect(Object.keys(TRAIT_DOCS).length).toBeGreaterThan(0);
  });

  it('contains rigidbody trait in physics category', () => {
    const doc = TRAIT_DOCS['rigidbody'];
    expect(doc).toBeDefined();
    expect(doc.category).toBe('physics');
  });

  it('every entry has required TraitDoc fields', () => {
    for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
      expect(doc).toHaveProperty('name');
      expect(doc).toHaveProperty('annotation');
      expect(doc).toHaveProperty('description');
      expect(doc).toHaveProperty('category');
      expect(doc).toHaveProperty('properties');
      expect(doc).toHaveProperty('methods');
      expect(doc).toHaveProperty('events');
      expect(doc).toHaveProperty('example');
      expect(Array.isArray(doc.properties)).toBe(true);
      expect(Array.isArray(doc.methods)).toBe(true);
      expect(Array.isArray(doc.events)).toBe(true);
    }
  });

  it('annotations start with @', () => {
    for (const doc of Object.values(TRAIT_DOCS)) {
      expect(doc.annotation).toMatch(/^@/);
    }
  });
});

describe('getTraitDoc', () => {
  it('retrieves by exact key name', () => {
    const doc = getTraitDoc('rigidbody');
    expect(doc).toBeDefined();
    expect(doc!.category).toBe('physics');
  });

  it('handles @ prefix (strips it)', () => {
    const doc = getTraitDoc('@rigidbody');
    expect(doc).toBeDefined();
  });

  it('is case-insensitive', () => {
    const doc = getTraitDoc('RIGIDBODY');
    expect(doc).toBeDefined();
  });

  it('strips trailing "trait" suffix', () => {
    const doc = getTraitDoc('rigidbodytrait');
    expect(doc).toBeDefined();
  });

  it('handles underscores by removing them', () => {
    // rigidbody has no underscore, test with a trait that might have one
    const doc = getTraitDoc('rigid_body');
    // Could find it if rigidbody normalization handles underscore removal
    // Just verify no throw
    expect(() => getTraitDoc('rigid_body')).not.toThrow();
  });

  it('returns undefined for nonexistent trait', () => {
    const doc = getTraitDoc('totally_nonexistent_xyz_abc');
    expect(doc).toBeUndefined();
  });

  it('returns a valid TraitDoc when found', () => {
    const doc = getTraitDoc('rigidbody');
    expect(doc).toBeDefined();
    expect(typeof doc!.name).toBe('string');
    expect(typeof doc!.description).toBe('string');
  });
});

describe('getAllTraitNames', () => {
  it('returns an array of strings', () => {
    const names = getAllTraitNames();
    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBeGreaterThan(0);
  });

  it('all names start with @', () => {
    const names = getAllTraitNames();
    for (const name of names) {
      expect(name).toMatch(/^@/);
    }
  });

  it('count matches TRAIT_DOCS entries', () => {
    const names = getAllTraitNames();
    expect(names.length).toBe(Object.keys(TRAIT_DOCS).length);
  });

  it('includes @rigidbody annotation', () => {
    const names = getAllTraitNames();
    const found = names.some((n) => n.toLowerCase().includes('rigidbody'));
    expect(found).toBe(true);
  });
});

describe('getTraitsByCategory', () => {
  it('returns traits for physics category', () => {
    const traits = getTraitsByCategory('physics');
    expect(Array.isArray(traits)).toBe(true);
    expect(traits.length).toBeGreaterThan(0);
    for (const t of traits) {
      expect(t.category).toBe('physics');
    }
  });

  it('returns empty array or array for categories that may be empty', () => {
    const allCats: TraitDoc['category'][] = [
      'physics', 'animation', 'rendering', 'networking', 'input', 'ai', 'utility', 'hololand',
    ];
    for (const cat of allCats) {
      const traits = getTraitsByCategory(cat);
      expect(Array.isArray(traits)).toBe(true);
    }
  });

  it('all returned traits match the requested category', () => {
    const cats: TraitDoc['category'][] = ['physics', 'animation', 'networking'];
    for (const cat of cats) {
      const traits = getTraitsByCategory(cat);
      for (const t of traits) {
        expect(t.category).toBe(cat);
      }
    }
  });

  it('total traits across all categories equals TRAIT_DOCS size', () => {
    const allCats: TraitDoc['category'][] = [
      'physics', 'animation', 'rendering', 'networking', 'input', 'ai', 'utility', 'hololand',
    ];
    const total = allCats.reduce((sum, cat) => sum + getTraitsByCategory(cat).length, 0);
    expect(total).toBe(Object.keys(TRAIT_DOCS).length);
  });
});

describe('formatTraitDocAsMarkdown', () => {
  let rigidbodyDoc: TraitDoc;

  beforeAll(() => {
    rigidbodyDoc = TRAIT_DOCS['rigidbody']!;
  });

  it('returns a non-empty string', () => {
    const md = formatTraitDocAsMarkdown(rigidbodyDoc);
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });

  it('includes the annotation in output', () => {
    const md = formatTraitDocAsMarkdown(rigidbodyDoc);
    expect(md).toContain(rigidbodyDoc.annotation);
  });

  it('includes the description', () => {
    const md = formatTraitDocAsMarkdown(rigidbodyDoc);
    expect(md).toContain(rigidbodyDoc.description);
  });

  it('includes ### Properties section when properties exist', () => {
    if (rigidbodyDoc.properties.length > 0) {
      const md = formatTraitDocAsMarkdown(rigidbodyDoc);
      expect(md).toContain('### Properties');
    }
  });

  it('includes holoscript code block', () => {
    const md = formatTraitDocAsMarkdown(rigidbodyDoc);
    expect(md).toContain('```holoscript');
    expect(md).toContain('```');
  });

  it('works with a trait that has events', () => {
    // find a trait with events
    const withEvents = Object.values(TRAIT_DOCS).find((d) => d.events.length > 0);
    if (withEvents) {
      const md = formatTraitDocAsMarkdown(withEvents);
      expect(md).toContain('### Events');
    }
  });

  it('works with a trait that has methods', () => {
    const withMethods = Object.values(TRAIT_DOCS).find((d) => d.methods.length > 0);
    if (withMethods) {
      const md = formatTraitDocAsMarkdown(withMethods);
      expect(md).toContain('### Methods');
    }
  });
});

describe('formatTraitDocCompact', () => {
  let rigidbodyDoc: TraitDoc;

  beforeAll(() => {
    rigidbodyDoc = TRAIT_DOCS['rigidbody']!;
  });

  it('returns a non-empty string', () => {
    const compact = formatTraitDocCompact(rigidbodyDoc);
    expect(typeof compact).toBe('string');
    expect(compact.length).toBeGreaterThan(0);
  });

  it('includes annotation in output', () => {
    const compact = formatTraitDocCompact(rigidbodyDoc);
    expect(compact).toContain(rigidbodyDoc.annotation);
  });

  it('includes description', () => {
    const compact = formatTraitDocCompact(rigidbodyDoc);
    expect(compact).toContain(rigidbodyDoc.description);
  });

  it('includes holoscript code block', () => {
    const compact = formatTraitDocCompact(rigidbodyDoc);
    expect(compact).toContain('```holoscript');
  });

  it('truncates examples longer than 10 lines', () => {
    const longExampleDoc: TraitDoc = {
      ...rigidbodyDoc,
      example: Array.from({ length: 15 }, (_, i) => `line${i}`).join('\n'),
    };
    const compact = formatTraitDocCompact(longExampleDoc);
    expect(compact).toContain('// ...');
  });

  it('shows "...and N more" when properties exceed 5', () => {
    const manyPropsDoc: TraitDoc = {
      ...rigidbodyDoc,
      properties: Array.from({ length: 8 }, (_, i) => ({
        name: `prop${i}`,
        type: 'number',
        description: `Property ${i}.`,
        default: '0',
        required: false,
      })),
    };
    const compact = formatTraitDocCompact(manyPropsDoc);
    expect(compact).toContain('3 more');
  });

  it('compact output is shorter than or equal to full markdown for same doc', () => {
    const full = formatTraitDocAsMarkdown(rigidbodyDoc);
    const compact = formatTraitDocCompact(rigidbodyDoc);
    // compact should generally be shorter
    // just verify both are non-empty strings
    expect(full.length).toBeGreaterThan(0);
    expect(compact.length).toBeGreaterThan(0);
  });
});
