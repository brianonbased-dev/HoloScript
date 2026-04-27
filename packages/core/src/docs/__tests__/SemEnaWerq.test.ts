import { describe, it, expect, beforeEach } from 'vitest';
import {
  SemEnaWerqRegistry,
  type SemAnnotation,
  type EnaWerqDoc,
  type SemEnaWerqEntry,
  type SemParam,
  type SemEvent,
  type SemConstraint,
  type DocExample,
  type TutorialStep,
  type DocReference,
} from '../SemEnaWerq.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeSem(overrides: Partial<SemAnnotation> = {}): SemAnnotation {
  return {
    name: 'TestTrait',
    category: 'interaction',
    version: '1.0.0',
    description: 'A test trait for spinning objects',
    params: [],
    events: [],
    constraints: {},
    tags: ['test', 'demo'],
    since: '1.0.0',
    ...overrides,
  };
}

function makeEnaWerq(overrides: Partial<EnaWerqDoc> = {}): EnaWerqDoc {
  return {
    title: 'Test Trait Documentation',
    summary: 'Short summary for testing',
    narrative: 'A full narrative explaining the trait in detail.',
    examples: [],
    bestPractices: ['Keep it simple'],
    pitfalls: ['Avoid overuse'],
    references: [],
    changelog: [{ version: '1.0.0', date: '2024-01-01', changes: ['Initial release'] }],
    ...overrides,
  };
}

function makeEntry(semOverrides: Partial<SemAnnotation> = {}, docOverrides: Partial<EnaWerqDoc> = {}): SemEnaWerqEntry {
  return {
    sem: makeSem(semOverrides),
    enaWerq: makeEnaWerq(docOverrides),
  };
}

// ─── SemEnaWerqRegistry ────────────────────────────────────────────────────

describe('SemEnaWerqRegistry', () => {
  let registry: SemEnaWerqRegistry;

  beforeEach(() => {
    registry = new SemEnaWerqRegistry();
  });

  describe('initial state', () => {
    it('starts empty', () => {
      expect(registry.size).toBe(0);
    });

    it('returns empty categories list', () => {
      expect(registry.getCategories()).toEqual([]);
    });

    it('returns empty tags list', () => {
      expect(registry.getTags()).toEqual([]);
    });
  });

  describe('register()', () => {
    it('registers an entry', () => {
      registry.register(makeEntry());
      expect(registry.size).toBe(1);
    });

    it('registers multiple entries', () => {
      registry.register(makeEntry({ name: 'A', category: 'interaction' }));
      registry.register(makeEntry({ name: 'B', category: 'physics' }));
      registry.register(makeEntry({ name: 'C', category: 'interaction' }));
      expect(registry.size).toBe(3);
    });

    it('overwrites entry with same category/name key', () => {
      registry.register(makeEntry({ name: 'Foo', category: 'visual' }));
      registry.register(makeEntry({ name: 'Foo', category: 'visual', description: 'Updated' }));
      expect(registry.size).toBe(1);
      const entry = registry.get('visual/Foo');
      expect(entry?.sem.description).toBe('Updated');
    });

    it('indexes by category', () => {
      registry.register(makeEntry({ name: 'X', category: 'physics' }));
      expect(registry.getCategories()).toContain('physics');
    });

    it('indexes by tags', () => {
      registry.register(makeEntry({ tags: ['spatial', 'xr'] }));
      expect(registry.getTags()).toContain('spatial');
      expect(registry.getTags()).toContain('xr');
    });

    it('deduplicates tags across entries', () => {
      registry.register(makeEntry({ name: 'A', tags: ['shared'] }));
      registry.register(makeEntry({ name: 'B', tags: ['shared'] }));
      const tags = registry.getTags();
      expect(tags.filter((t) => t === 'shared').length).toBe(1);
    });
  });

  describe('get()', () => {
    it('returns entry by category/name key', () => {
      registry.register(makeEntry({ name: 'Spin', category: 'animation' }));
      const entry = registry.get('animation/Spin');
      expect(entry).toBeDefined();
      expect(entry?.sem.name).toBe('Spin');
    });

    it('returns undefined for unknown key', () => {
      expect(registry.get('unknown/key')).toBeUndefined();
    });

    it('returns undefined after no entries are registered', () => {
      expect(registry.get('interaction/TestTrait')).toBeUndefined();
    });
  });

  describe('search()', () => {
    beforeEach(() => {
      registry.register(makeEntry({ name: 'Grabbable', category: 'interaction', description: 'Allows picking up objects' }));
      registry.register(makeEntry({ name: 'Spinning', category: 'animation', description: 'Rotates objects continuously' }));
      registry.register(makeEntry({ name: 'Physics', category: 'physics', description: 'Applies rigid body simulation' }));
    });

    it('finds entries matching name', () => {
      const results = registry.search('grab');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((e) => e.sem.name === 'Grabbable')).toBe(true);
    });

    it('finds entries matching description', () => {
      const results = registry.search('rotates');
      expect(results.length).toBeGreaterThan(0);
    });

    it('finds entries matching summary (enaWerq)', () => {
      // The Spinning entry has 'Short summary for testing' — search for that
      const results = registry.search('short summary');
      expect(results.length).toBeGreaterThan(0);
    });

    it('is case-insensitive', () => {
      const lower = registry.search('grabBable');
      const upper = registry.search('GRABBABLE');
      expect(lower.length).toBe(upper.length);
    });

    it('returns empty array when no matches', () => {
      expect(registry.search('xyznonexistent12345')).toEqual([]);
    });

    it('partial matches work', () => {
      const results = registry.search('rab');
      expect(results.some((e) => e.sem.name === 'Grabbable')).toBe(true);
    });
  });

  describe('getByCategory()', () => {
    beforeEach(() => {
      registry.register(makeEntry({ name: 'A', category: 'physics' }));
      registry.register(makeEntry({ name: 'B', category: 'physics' }));
      registry.register(makeEntry({ name: 'C', category: 'animation' }));
    });

    it('returns all entries in a category', () => {
      const results = registry.getByCategory('physics');
      expect(results.length).toBe(2);
    });

    it('returns entries only for the specified category', () => {
      const results = registry.getByCategory('animation');
      expect(results.length).toBe(1);
      expect(results[0].sem.name).toBe('C');
    });

    it('returns empty array for unknown category', () => {
      expect(registry.getByCategory('nonexistent')).toEqual([]);
    });
  });

  describe('getByTag()', () => {
    beforeEach(() => {
      registry.register(makeEntry({ name: 'A', category: 'x', tags: ['xr', 'spatial'] }));
      registry.register(makeEntry({ name: 'B', category: 'x', tags: ['xr', 'physics'] }));
      registry.register(makeEntry({ name: 'C', category: 'x', tags: ['audio'] }));
    });

    it('returns all entries with a tag', () => {
      const results = registry.getByTag('xr');
      expect(results.length).toBe(2);
    });

    it('returns empty array for unused tag', () => {
      expect(registry.getByTag('nonexistent-tag')).toEqual([]);
    });

    it('returns single entry for unique tag', () => {
      const results = registry.getByTag('audio');
      expect(results.length).toBe(1);
      expect(results[0].sem.name).toBe('C');
    });
  });

  describe('getCategories()', () => {
    it('returns sorted list of categories', () => {
      registry.register(makeEntry({ name: 'A', category: 'visual' }));
      registry.register(makeEntry({ name: 'B', category: 'audio' }));
      registry.register(makeEntry({ name: 'C', category: 'physics' }));
      const cats = registry.getCategories();
      expect(cats).toEqual([...cats].sort());
    });

    it('deduplicates categories', () => {
      registry.register(makeEntry({ name: 'A', category: 'visual' }));
      registry.register(makeEntry({ name: 'B', category: 'visual' }));
      const cats = registry.getCategories();
      expect(cats.filter((c) => c === 'visual').length).toBe(1);
    });
  });

  describe('getTags()', () => {
    it('returns sorted list of tags', () => {
      registry.register(makeEntry({ tags: ['xr', 'animation', 'physics'] }));
      const tags = registry.getTags();
      expect(tags).toEqual([...tags].sort());
    });
  });

  describe('exportSemForLSP()', () => {
    it('returns structured LSP data for a registered entry', () => {
      const sem = makeSem({
        name: 'Grab',
        category: 'interaction',
        version: '2.0.0',
        description: 'Grab things',
        params: [
          { name: 'force', type: 'number', description: 'Grab force', required: true },
        ],
      });
      registry.register({ sem, enaWerq: makeEnaWerq() });

      const lsp = registry.exportSemForLSP('interaction/Grab');
      expect(lsp).not.toBeNull();
      expect(lsp?.label).toBe('Grab');
      expect(lsp?.detail).toContain('interaction');
      expect(lsp?.detail).toContain('2.0.0');
      expect(lsp?.documentation).toBe('Grab things');
      expect(lsp?.params.length).toBe(1);
      expect(lsp?.params[0].name).toBe('force');
    });

    it('returns null for unknown key', () => {
      expect(registry.exportSemForLSP('unknown/key')).toBeNull();
    });

    it('returns empty params array when no params', () => {
      registry.register(makeEntry({ name: 'Simple', category: 'test', params: [] }));
      const lsp = registry.exportSemForLSP('test/Simple');
      expect(lsp?.params).toEqual([]);
    });
  });

  describe('exportSemAsJSONSchema()', () => {
    it('returns a valid JSON Schema object', () => {
      const sem = makeSem({
        name: 'Physics',
        category: 'physics',
        params: [
          { name: 'mass', type: 'number', description: 'Mass in kg', required: true, range: { min: 0.001, max: 1000 }, units: 'kg' },
          { name: 'restitution', type: 'number', description: 'Bounciness', default: 0.5, required: false },
        ],
      });
      registry.register({ sem, enaWerq: makeEnaWerq() });

      const schema = registry.exportSemAsJSONSchema('physics/Physics');
      expect(schema).not.toBeNull();
      expect(schema?.['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(schema?.title).toBe('Physics');
      expect(schema?.type).toBe('object');
      expect(schema?.properties).toBeDefined();
    });

    it('includes required fields in schema', () => {
      const sem = makeSem({
        name: 'Req',
        category: 'test',
        params: [
          { name: 'id', type: 'string', description: 'ID', required: true },
          { name: 'optional', type: 'string', description: 'Optional', required: false },
        ],
      });
      registry.register({ sem, enaWerq: makeEnaWerq() });
      const schema = registry.exportSemAsJSONSchema('test/Req') as { required: string[] };
      expect(schema?.required).toContain('id');
      expect(schema?.required).not.toContain('optional');
    });

    it('includes range constraints', () => {
      const sem = makeSem({
        name: 'Ranged',
        category: 'test',
        params: [
          { name: 'speed', type: 'number', description: 'Speed', range: { min: 0, max: 100 }, required: false },
        ],
      });
      registry.register({ sem, enaWerq: makeEnaWerq() });
      const schema = registry.exportSemAsJSONSchema('test/Ranged') as { properties: Record<string, { minimum: number; maximum: number }> };
      expect(schema?.properties?.speed?.minimum).toBe(0);
      expect(schema?.properties?.speed?.maximum).toBe(100);
    });

    it('includes units as x-units extension', () => {
      const sem = makeSem({
        name: 'Unitted',
        category: 'test',
        params: [
          { name: 'velocity', type: 'number', description: 'Velocity', units: 'm/s', required: false },
        ],
      });
      registry.register({ sem, enaWerq: makeEnaWerq() });
      const schema = registry.exportSemAsJSONSchema('test/Unitted') as { properties: Record<string, { 'x-units': string }> };
      expect(schema?.properties?.velocity?.['x-units']).toBe('m/s');
    });

    it('returns null for unknown key', () => {
      expect(registry.exportSemAsJSONSchema('unknown/key')).toBeNull();
    });

    it('omits required field when no params are required', () => {
      const sem = makeSem({ name: 'NoReq', category: 'test', params: [] });
      registry.register({ sem, enaWerq: makeEnaWerq() });
      const schema = registry.exportSemAsJSONSchema('test/NoReq') as { required?: string[] };
      expect(schema?.required).toBeUndefined();
    });
  });

  describe('exportEnaWerqAsMarkdown()', () => {
    it('returns null for unknown key', () => {
      expect(registry.exportEnaWerqAsMarkdown('unknown/key')).toBeNull();
    });

    it('returns a non-empty string for a registered entry', () => {
      registry.register(makeEntry({ name: 'Doc', category: 'docs' }));
      const md = registry.exportEnaWerqAsMarkdown('docs/Doc');
      expect(md).not.toBeNull();
      expect(typeof md).toBe('string');
      expect(md!.length).toBeGreaterThan(0);
    });
  });

  describe('size getter', () => {
    it('increments with each register', () => {
      expect(registry.size).toBe(0);
      registry.register(makeEntry({ name: 'A', category: 'x' }));
      expect(registry.size).toBe(1);
      registry.register(makeEntry({ name: 'B', category: 'x' }));
      expect(registry.size).toBe(2);
    });
  });

  describe('complex entry with full fields', () => {
    it('handles full SemAnnotation with params and events', () => {
      const param: SemParam = {
        name: 'speed',
        type: 'number',
        description: 'Rotation speed in radians/second',
        default: 1.0,
        range: { min: -10, max: 10 },
        units: 'rad/s',
        required: false,
        deprecated: false,
        since: '1.0.0',
      };
      const event: SemEvent = {
        name: 'onSpinStart',
        description: 'Emitted when spinning begins',
        payload: [{ name: 'speed', type: 'number', description: 'Initial speed' }],
        since: '1.0.0',
      };
      const constraint: SemConstraint = {
        requires: ['@physics'],
        conflicts: ['@static'],
        maxPerEntity: 1,
        platforms: ['desktop', 'quest3'],
      };
      const sem: SemAnnotation = {
        name: 'Spin',
        category: 'animation',
        version: '1.2.0',
        description: 'Makes an entity rotate continuously',
        params: [param],
        events: [event],
        constraints: constraint,
        tags: ['animation', 'rotation', 'continuous'],
        since: '1.0.0',
        deprecated: false,
      };
      registry.register({ sem, enaWerq: makeEnaWerq() });

      const entry = registry.get('animation/Spin');
      expect(entry?.sem.params.length).toBe(1);
      expect(entry?.sem.events.length).toBe(1);
      expect(entry?.sem.constraints.requires).toContain('@physics');
      expect(entry?.sem.constraints.conflicts).toContain('@static');
      expect(entry?.sem.constraints.maxPerEntity).toBe(1);
      expect(entry?.sem.constraints.platforms).toContain('quest3');
    });

    it('handles full EnaWerqDoc with examples and tutorial', () => {
      const example: DocExample = {
        title: 'Basic Usage',
        language: 'holoscript',
        code: '@grabbable { force: 10 }',
        description: 'Simple grabbable example',
      };
      const tutorialStep: TutorialStep = {
        title: 'Step 1: Add the trait',
        content: 'Add @spin to your object',
        examples: [example],
        tips: ['Use low speeds for realism'],
        warnings: ['High speeds cause physics issues'],
      };
      const reference: DocReference = {
        name: 'Physics Trait',
        type: 'trait',
        path: 'physics/PhysicsTrait',
      };
      const doc: EnaWerqDoc = {
        title: 'Spin Documentation',
        summary: 'Rotate objects with the @spin trait',
        narrative: 'Detailed narrative here',
        examples: [example],
        tutorial: [tutorialStep],
        bestPractices: ['Use with @physics'],
        pitfalls: ['Avoid infinite spin on server'],
        references: [reference],
        changelog: [
          { version: '1.0.0', date: '2024-01-01', changes: ['Initial'] },
          { version: '1.2.0', date: '2024-06-01', changes: ['Added event support'] },
        ],
      };
      registry.register({ sem: makeSem(), enaWerq: doc });
      const entry = registry.get('interaction/TestTrait');
      expect(entry?.enaWerq.examples.length).toBe(1);
      expect(entry?.enaWerq.tutorial?.length).toBe(1);
      expect(entry?.enaWerq.references.length).toBe(1);
      expect(entry?.enaWerq.changelog.length).toBe(2);
    });
  });
});

// ─── Interface shape tests (compile-time + runtime structure validation) ─────

describe('SemParam interface', () => {
  it('accepts minimal required fields', () => {
    const p: SemParam = { name: 'x', type: 'number', description: 'x position' };
    expect(p.name).toBe('x');
    expect(p.type).toBe('number');
  });

  it('accepts all optional fields', () => {
    const p: SemParam = {
      name: 'speed',
      type: 'number',
      description: 'Speed',
      default: 1.0,
      range: { min: 0, max: 10 },
      units: 'm/s',
      required: true,
      deprecated: false,
      since: '1.0.0',
    };
    expect(p.range?.min).toBe(0);
    expect(p.range?.max).toBe(10);
    expect(p.units).toBe('m/s');
  });
});

describe('SemConstraint interface', () => {
  it('accepts empty constraint', () => {
    const c: SemConstraint = {};
    expect(c.requires).toBeUndefined();
  });

  it('accepts full constraint', () => {
    const c: SemConstraint = {
      requires: ['@physics'],
      conflicts: ['@static'],
      maxPerEntity: 2,
      platforms: ['desktop'],
    };
    expect(c.requires?.length).toBe(1);
    expect(c.maxPerEntity).toBe(2);
  });
});

describe('DocExample interface', () => {
  it('supports all valid language values', () => {
    const languages: DocExample['language'][] = ['holoscript', 'typescript', 'wgsl', 'json', 'rust'];
    for (const lang of languages) {
      const ex: DocExample = { title: 'Test', language: lang, code: '// test' };
      expect(ex.language).toBe(lang);
    }
  });
});

describe('SemAnnotation interface', () => {
  it('supports deprecated flag and replacedBy', () => {
    const sem: SemAnnotation = {
      ...makeSem(),
      deprecated: true,
      replacedBy: 'NewTrait',
    };
    expect(sem.deprecated).toBe(true);
    expect(sem.replacedBy).toBe('NewTrait');
  });
});
