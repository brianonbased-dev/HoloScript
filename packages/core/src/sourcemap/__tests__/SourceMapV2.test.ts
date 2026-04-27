/**
 * SourceMapV2.test.ts — Unit tests for packages/core/src/sourcemap/SourceMapV2.ts
 */
import { describe, it, expect } from 'vitest';
import {
  SourceMapGeneratorV2,
  SourceMapConsumerV2,
  createIndexMap,
  combineSourceMapsV2,
  createSourceMapV2,
} from '../SourceMapV2.js';
import type {
  Position,
  Range,
  Scope,
  ScopeSymbol,
  EnhancedMappingSegment,
  SourceMapV2,
  IndexMap,
  HotReloadMapping,
} from '../SourceMapV2.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRange(sl: number, sc: number, el: number, ec: number): Range {
  return { start: { line: sl, column: sc }, end: { line: el, column: ec } };
}

function makeSimpleGenerator(): SourceMapGeneratorV2 {
  const gen = new SourceMapGeneratorV2({ file: 'out.js', sourceRoot: '' });
  const srcIdx = gen.addSource('input.hs', 'object Ball {}');
  gen.addMapping({
    generated: { line: 0, column: 0 },
    original: { line: 0, column: 0 },
    source: 'input.hs',
  });
  return gen;
}

// ─── SourceMapGeneratorV2: constructor ───────────────────────────────────────

describe('SourceMapGeneratorV2 constructor', () => {
  it('creates an instance', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    expect(gen).toBeDefined();
  });

  it('generates a map with the correct file name', () => {
    const gen = new SourceMapGeneratorV2({ file: 'bundle.js' });
    const map = gen.generate();
    expect(map.file).toBe('bundle.js');
  });

  it('generates a map with sourceRoot when provided', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js', sourceRoot: '/src/' });
    const map = gen.generate();
    expect(map.sourceRoot).toBe('/src/');
  });

  it('generates a map with version 3', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    expect(gen.generate().version).toBe(3);
  });
});

// ─── addSource ───────────────────────────────────────────────────────────────

describe('SourceMapGeneratorV2.addSource', () => {
  it('returns index 0 for first source', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    expect(gen.addSource('a.hs')).toBe(0);
  });

  it('returns index 1 for second source', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addSource('a.hs');
    expect(gen.addSource('b.hs')).toBe(1);
  });

  it('returns same index for duplicate source', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addSource('a.hs');
    expect(gen.addSource('a.hs')).toBe(0);
  });

  it('includes source in generated map sources array', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addSource('x.hs');
    const map = gen.generate();
    expect(map.sources).toContain('x.hs');
  });

  it('includes content in sourcesContent when provided', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addSource('x.hs', 'object X {}');
    const map = gen.generate();
    expect(map.sourcesContent).toBeDefined();
    expect(map.sourcesContent![0]).toBe('object X {}');
  });

  it('sourcesContent is null for source added without content', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addSource('x.hs');
    const map = gen.generate();
    // No content → sourcesContent may be omitted or contain null
    if (map.sourcesContent) {
      expect(map.sourcesContent[0]).toBeNull();
    }
  });
});

// ─── addName ─────────────────────────────────────────────────────────────────

describe('SourceMapGeneratorV2.addName', () => {
  it('returns index 0 for first name', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    expect(gen.addName('myVar')).toBe(0);
  });

  it('returns same index for duplicate name', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addName('x');
    expect(gen.addName('x')).toBe(0);
  });

  it('includes name in generated map names array', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addName('ballObj');
    const map = gen.generate();
    expect(map.names).toContain('ballObj');
  });
});

// ─── addMapping ──────────────────────────────────────────────────────────────

describe('SourceMapGeneratorV2.addMapping', () => {
  it('generates a non-empty mappings string with one mapping', () => {
    const gen = makeSimpleGenerator();
    const map = gen.generate();
    expect(map.mappings).toBeDefined();
    expect(map.mappings.length).toBeGreaterThan(0);
  });

  it('adds breakpoint info to x_breakpoints when isBreakpoint=true', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addMapping({
      generated: { line: 1, column: 0 },
      isBreakpoint: true,
    });
    const map = gen.generate();
    expect(map.x_breakpoints).toBeDefined();
    expect(map.x_breakpoints!.length).toBeGreaterThan(0);
  });

  it('adds expressionType to x_expressionTypes', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addMapping({
      generated: { line: 0, column: 0 },
      expressionType: 'literal',
    });
    const map = gen.generate();
    expect(map.x_expressionTypes).toBeDefined();
    expect(map.x_expressionTypes![0]).toBe('literal');
  });

  it('round-trips source position via consumer', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addSource('foo.hs');
    gen.addMapping({
      generated: { line: 0, column: 0 },
      original: { line: 0, column: 0 },
      source: 'foo.hs',
    });
    const consumer = new SourceMapConsumerV2(gen.generate());
    const orig = consumer.originalPositionFor({ line: 0, column: 0 });
    expect(orig.source).toBe('foo.hs');
    expect(orig.line).toBe(0);
    expect(orig.column).toBe(0);
  });
});

// ─── enterScope / exitScope / addSymbol ──────────────────────────────────────

describe('SourceMapGeneratorV2 scopes', () => {
  it('enterScope returns a scope id string', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    const id = gen.enterScope({
      type: 'composition',
      name: 'Scene',
      range: makeRange(0, 0, 10, 1),
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generate includes x_scopes when scope is added', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.enterScope({ type: 'object', name: 'Ball', range: makeRange(1, 0, 5, 1) });
    gen.exitScope();
    const map = gen.generate();
    expect(map.x_scopes).toBeDefined();
    expect(map.x_scopes!.length).toBeGreaterThan(0);
  });

  it('nested scopes have parent-child relationship', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.enterScope({ type: 'composition', name: 'Root', range: makeRange(0, 0, 20, 1) });
    gen.enterScope({ type: 'object', name: 'Child', range: makeRange(1, 2, 5, 3) });
    gen.exitScope();
    gen.exitScope();
    const map = gen.generate();
    const scopes = map.x_scopes!;
    const root = scopes.find((s) => s.name === 'Root')!;
    const child = scopes.find((s) => s.name === 'Child')!;
    expect(root.children).toContain(child.id);
    expect(child.parentId).toBe(root.id);
  });

  it('addSymbol attaches symbol to current scope', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.enterScope({ type: 'object', name: 'Ball', range: makeRange(0, 0, 10, 1) });
    gen.addSymbol({
      name: 'position',
      type: 'property',
      range: makeRange(1, 2, 1, 20),
      definedAt: { line: 1, column: 2 },
    });
    gen.exitScope();
    const map = gen.generate();
    const scope = map.x_scopes![0];
    expect(scope.symbols).toHaveLength(1);
    expect(scope.symbols[0].name).toBe('position');
  });

  it('addSymbolReference adds ref to existing symbol', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.enterScope({ type: 'object', name: 'Ball', range: makeRange(0, 0, 10, 1) });
    gen.addSymbol({
      name: 'x',
      type: 'variable',
      range: makeRange(1, 0, 1, 5),
      definedAt: { line: 1, column: 0 },
    });
    gen.addSymbolReference('x', { line: 2, column: 4 });
    gen.exitScope();
    const scope = gen.generate().x_scopes![0];
    expect(scope.symbols[0].references).toHaveLength(1);
    expect(scope.symbols[0].references[0]).toEqual({ line: 2, column: 4 });
  });
});

// ─── addDebugName ─────────────────────────────────────────────────────────────

describe('SourceMapGeneratorV2.addDebugName', () => {
  it('adds x_debugNames to generated map', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addDebugName('_ball$1', 'ball');
    const map = gen.generate();
    expect(map.x_debugNames).toBeDefined();
    expect(map.x_debugNames!['_ball$1']).toBe('ball');
  });

  it('consumer can look up debug name', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addDebugName('_trait$abc', 'grabbable');
    const consumer = new SourceMapConsumerV2(gen.generate());
    expect(consumer.getDebugName('_trait$abc')).toBe('grabbable');
  });

  it('consumer returns null for unknown mangled name', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    const consumer = new SourceMapConsumerV2(gen.generate());
    expect(consumer.getDebugName('not_there')).toBeNull();
  });
});

// ─── HotReload mappings ───────────────────────────────────────────────────────

describe('SourceMapGeneratorV2 hot reload mappings', () => {
  function makeHRL(id: string): HotReloadMapping {
    return {
      objectId: id,
      originalRange: makeRange(0, 0, 5, 1),
      generatedRange: makeRange(10, 0, 15, 1),
      hash: 'abc123',
      dependencies: ['dep1'],
    };
  }

  it('addHotReloadMapping + getHotReloadMapping round-trips', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addHotReloadMapping(makeHRL('ball-obj'));
    const retrieved = gen.getHotReloadMapping('ball-obj');
    expect(retrieved).toBeDefined();
    expect(retrieved!.objectId).toBe('ball-obj');
    expect(retrieved!.hash).toBe('abc123');
  });

  it('returns undefined for unknown objectId', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    expect(gen.getHotReloadMapping('missing')).toBeUndefined();
  });

  it('updateHotReloadMapping updates range and hash', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addHotReloadMapping(makeHRL('cube'));
    const newRange = makeRange(20, 0, 25, 1);
    gen.updateHotReloadMapping('cube', newRange, 'newhash');
    const m = gen.getHotReloadMapping('cube');
    expect(m!.hash).toBe('newhash');
    expect(m!.generatedRange.start.line).toBe(20);
  });

  it('getHotReloadMappings returns a copy of all mappings', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addHotReloadMapping(makeHRL('a'));
    gen.addHotReloadMapping(makeHRL('b'));
    const all = gen.getHotReloadMappings();
    expect(all.size).toBe(2);
  });
});

// ─── getScopeAt ──────────────────────────────────────────────────────────────

describe('SourceMapGeneratorV2.getScopeAt', () => {
  it('returns scope when position is inside range', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.enterScope({ type: 'object', name: 'Ball', range: makeRange(0, 0, 10, 50) });
    gen.exitScope();
    const scope = gen.getScopeAt({ line: 5, column: 10 });
    expect(scope).not.toBeNull();
    expect(scope!.name).toBe('Ball');
  });

  it('returns null when position is outside all scopes', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.enterScope({ type: 'object', name: 'Ball', range: makeRange(0, 0, 5, 0) });
    gen.exitScope();
    expect(gen.getScopeAt({ line: 100, column: 0 })).toBeNull();
  });
});

// ─── toString / toDataURL / toComment ────────────────────────────────────────

describe('SourceMapGeneratorV2 serialisation', () => {
  it('toString returns a valid JSON string', () => {
    const gen = makeSimpleGenerator();
    const str = gen.toString();
    expect(() => JSON.parse(str)).not.toThrow();
    const obj = JSON.parse(str);
    expect(obj.version).toBe(3);
  });

  it('toDataURL returns base64 data URL', () => {
    const gen = makeSimpleGenerator();
    const url = gen.toDataURL();
    expect(url.startsWith('data:application/json;charset=utf-8;base64,')).toBe(true);
  });

  it('toComment without arg returns inline mapping comment', () => {
    const gen = makeSimpleGenerator();
    const comment = gen.toComment();
    expect(comment.startsWith('//# sourceMappingURL=data:')).toBe(true);
  });

  it('toComment with file arg references the file', () => {
    const gen = makeSimpleGenerator();
    const comment = gen.toComment('out.js.map');
    expect(comment).toBe('//# sourceMappingURL=out.js.map');
  });
});

// ─── clone ───────────────────────────────────────────────────────────────────

describe('SourceMapGeneratorV2.clone', () => {
  it('produces an independent copy', () => {
    const gen = makeSimpleGenerator();
    const cloned = gen.clone();
    expect(cloned).toBeDefined();
    expect(cloned).not.toBe(gen);
    expect(cloned.generate().file).toBe(gen.generate().file);
  });

  it('mutations to clone do not affect original', () => {
    const gen = makeSimpleGenerator();
    const cloned = gen.clone();
    cloned.addSource('extra.hs');
    const origSources = gen.generate().sources;
    expect(origSources).not.toContain('extra.hs');
  });
});

// ─── createSourceMapV2 factory ───────────────────────────────────────────────

describe('createSourceMapV2', () => {
  it('returns a SourceMapGeneratorV2 instance', () => {
    const gen = createSourceMapV2({ file: 'foo.js' });
    expect(gen).toBeInstanceOf(SourceMapGeneratorV2);
  });
});

// ─── SourceMapConsumerV2 ─────────────────────────────────────────────────────

describe('SourceMapConsumerV2', () => {
  function makeConsumer(): { gen: SourceMapGeneratorV2; consumer: SourceMapConsumerV2 } {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addSource('src.hs', 'object Ball {}');
    gen.addName('ball');
    gen.addMapping({
      generated: { line: 0, column: 0 },
      original: { line: 0, column: 7 },
      source: 'src.hs',
      name: 'ball',
    });
    gen.addMapping({
      generated: { line: 1, column: 4 },
      original: { line: 1, column: 0 },
      source: 'src.hs',
    });
    const consumer = new SourceMapConsumerV2(gen.generate());
    return { gen, consumer };
  }

  it('creates from SourceMapV2 object', () => {
    const { consumer } = makeConsumer();
    expect(consumer).toBeDefined();
  });

  it('creates from JSON string', () => {
    const { gen } = makeConsumer();
    const consumer = new SourceMapConsumerV2(gen.toString());
    expect(consumer).toBeDefined();
  });

  it('sources returns the source list', () => {
    const { consumer } = makeConsumer();
    expect(consumer.sources).toContain('src.hs');
  });

  it('sourceContentFor returns content', () => {
    const { consumer } = makeConsumer();
    expect(consumer.sourceContentFor('src.hs')).toBe('object Ball {}');
  });

  it('sourceContentFor returns null for unknown source', () => {
    const { consumer } = makeConsumer();
    expect(consumer.sourceContentFor('missing.hs')).toBeNull();
  });

  it('originalPositionFor returns correct mapping', () => {
    const { consumer } = makeConsumer();
    const orig = consumer.originalPositionFor({ line: 0, column: 0 });
    expect(orig.source).toBe('src.hs');
    expect(orig.line).toBe(0);
    expect(orig.column).toBe(7);
    expect(orig.name).toBe('ball');
  });

  it('originalPositionFor returns null values for unmapped position', () => {
    const { consumer } = makeConsumer();
    const orig = consumer.originalPositionFor({ line: 99, column: 99 });
    expect(orig.source).toBeNull();
    expect(orig.line).toBeNull();
  });

  it('generatedPositionFor returns mapped position', () => {
    const { consumer } = makeConsumer();
    const gen = consumer.generatedPositionFor({ source: 'src.hs', line: 0, column: 7 });
    expect(gen).not.toBeNull();
    expect(gen!.line).toBe(0);
    expect(gen!.column).toBe(0);
  });

  it('generatedPositionFor returns null for unknown source', () => {
    const { consumer } = makeConsumer();
    expect(consumer.generatedPositionFor({ source: 'nope.hs', line: 0, column: 0 })).toBeNull();
  });

  it('getBreakpoints returns empty array with no breakpoints', () => {
    const { consumer } = makeConsumer();
    expect(consumer.getBreakpoints()).toEqual([]);
  });

  it('getBreakpoints returns breakpoints set on generator', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.addMapping({ generated: { line: 2, column: 0 }, isBreakpoint: true });
    const consumer = new SourceMapConsumerV2(gen.generate());
    const bps = consumer.getBreakpoints();
    expect(bps.length).toBeGreaterThan(0);
    expect(bps[0]).toMatchObject({ line: 2, column: 0 });
  });

  it('scopes returns empty array when no scopes', () => {
    const { consumer } = makeConsumer();
    expect(consumer.scopes).toEqual([]);
  });

  it('scopes returns scopes set on generator', () => {
    const gen = new SourceMapGeneratorV2({ file: 'out.js' });
    gen.enterScope({ type: 'composition', name: 'Root', range: makeRange(0, 0, 20, 1) });
    gen.exitScope();
    const consumer = new SourceMapConsumerV2(gen.generate());
    expect(consumer.scopes).toHaveLength(1);
    expect(consumer.scopes[0].name).toBe('Root');
  });
});

// ─── createIndexMap ──────────────────────────────────────────────────────────

describe('createIndexMap', () => {
  function makeMap(file: string): SourceMapV2 {
    const gen = new SourceMapGeneratorV2({ file });
    gen.addSource('a.hs');
    return gen.generate();
  }

  it('returns version 3 index map', () => {
    const idx = createIndexMap('bundle.js', [
      { offset: { line: 0, column: 0 }, map: makeMap('a.js') },
    ]);
    expect(idx.version).toBe(3);
  });

  it('sets file property', () => {
    const idx = createIndexMap('bundle.js', []);
    expect(idx.file).toBe('bundle.js');
  });

  it('sections array matches input', () => {
    const m1 = makeMap('a.js');
    const m2 = makeMap('b.js');
    const idx = createIndexMap('out.js', [
      { offset: { line: 0, column: 0 }, map: m1 },
      { offset: { line: 100, column: 0 }, map: m2 },
    ]);
    expect(idx.sections).toHaveLength(2);
    expect(idx.sections[1].offset.line).toBe(100);
  });

  it('sections contain the provided map', () => {
    const m = makeMap('a.js');
    const idx = createIndexMap('out.js', [{ offset: { line: 0, column: 0 }, map: m }]);
    expect(idx.sections[0].map).toBe(m);
  });
});

// ─── combineSourceMapsV2 ─────────────────────────────────────────────────────

describe('combineSourceMapsV2', () => {
  function makeMapWithMapping(file: string, source: string): SourceMapV2 {
    const gen = new SourceMapGeneratorV2({ file });
    gen.addSource(source, `// ${source} content`);
    gen.addMapping({
      generated: { line: 0, column: 0 },
      original: { line: 0, column: 0 },
      source,
    });
    return gen.generate();
  }

  it('returns a SourceMapV2 with version 3', () => {
    const combined = combineSourceMapsV2([makeMapWithMapping('a.js', 'a.hs')], 'out.js');
    expect(combined.version).toBe(3);
  });

  it('combined map includes sources from all inputs', () => {
    const m1 = makeMapWithMapping('a.js', 'a.hs');
    const m2 = makeMapWithMapping('b.js', 'b.hs');
    const combined = combineSourceMapsV2([m1, m2], 'out.js');
    expect(combined.sources).toContain('a.hs');
    expect(combined.sources).toContain('b.hs');
  });

  it('returns empty-sources map for empty input array', () => {
    const combined = combineSourceMapsV2([], 'out.js');
    expect(combined).toBeDefined();
    expect(combined.file).toBe('out.js');
    expect(combined.sources).toHaveLength(0);
  });

  it('combined map has non-empty mappings string for non-empty input', () => {
    const combined = combineSourceMapsV2(
      [makeMapWithMapping('a.js', 'x.hs')],
      'out.js',
    );
    expect(combined.mappings.length).toBeGreaterThan(0);
  });
});
