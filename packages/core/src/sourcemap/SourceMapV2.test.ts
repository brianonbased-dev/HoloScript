/**
 * Source Maps v2 Tests
 *
 * Sprint 4 Priority 4: Source Maps v2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SourceMapGeneratorV2,
  SourceMapConsumerV2,
  createSourceMapV2,
  createIndexMap,
  combineSourceMapsV2,
  type SourceMapV2,
  type Position,
  type Scope,
  type ScopeType,
} from './SourceMapV2';

describe('SourceMapGeneratorV2', () => {
  let generator: SourceMapGeneratorV2;

  beforeEach(() => {
    generator = createSourceMapV2({ file: 'output.js' });
  });

  describe('Basic Mappings', () => {
    it('should create a source map with basic structure', () => {
      const sourceMap = generator.generate();

      expect(sourceMap.version).toBe(3);
      expect(sourceMap.file).toBe('output.js');
      expect(sourceMap.sources).toEqual([]);
      expect(sourceMap.names).toEqual([]);
    });

    it('should add source files', () => {
      const idx1 = generator.addSource('src/main.holo', 'orb "Test" {}');
      const idx2 = generator.addSource('src/utils.holo', 'template "Helper" {}');

      const sourceMap = generator.generate();

      expect(sourceMap.sources).toEqual(['src/main.holo', 'src/utils.holo']);
      expect(sourceMap.sourcesContent).toEqual(['orb "Test" {}', 'template "Helper" {}']);
      expect(idx1).toBe(0);
      expect(idx2).toBe(1);
    });

    it('should deduplicate source files', () => {
      const idx1 = generator.addSource('src/main.holo');
      const idx2 = generator.addSource('src/main.holo');

      expect(idx1).toBe(0);
      expect(idx2).toBe(0);
    });

    it('should add names', () => {
      const idx1 = generator.addName('myOrb');
      const idx2 = generator.addName('myHandler');
      const idx3 = generator.addName('myOrb'); // duplicate

      const sourceMap = generator.generate();

      expect(sourceMap.names).toEqual(['myOrb', 'myHandler']);
      expect(idx1).toBe(0);
      expect(idx2).toBe(1);
      expect(idx3).toBe(0); // returns existing index
    });

    it('should add mappings', () => {
      generator.addSource('src/main.holo');

      generator.addMapping({
        generated: { line: 0, column: 0 },
        original: { line: 0, column: 0 },
        source: 'src/main.holo',
        name: 'Test',
      });

      generator.addMapping({
        generated: { line: 1, column: 4 },
        original: { line: 1, column: 2 },
        source: 'src/main.holo',
      });

      const sourceMap = generator.generate();

      expect(sourceMap.mappings).toBeDefined();
      expect(sourceMap.mappings.length).toBeGreaterThan(0);
    });
  });

  describe('Scope Tracking', () => {
    it('should track scope hierarchy', () => {
      generator.addSource('src/main.holo');

      // Enter file scope
      const fileScope = generator.enterScope({
        type: 'file',
        name: 'main.holo',
        range: { start: { line: 0, column: 0 }, end: { line: 100, column: 0 } },
      });

      // Enter object scope
      const objectScope = generator.enterScope({
        type: 'object',
        name: 'TestOrb',
        range: { start: { line: 1, column: 0 }, end: { line: 10, column: 1 } },
      });

      generator.exitScope(); // exit object
      generator.exitScope(); // exit file

      const sourceMap = generator.generate();

      expect(sourceMap.x_scopes).toBeDefined();
      expect(sourceMap.x_scopes!.length).toBe(2);

      const scopes = sourceMap.x_scopes!;
      expect(scopes[0].type).toBe('file');
      expect(scopes[0].name).toBe('main.holo');
      expect(scopes[0].children).toContain(objectScope);

      expect(scopes[1].type).toBe('object');
      expect(scopes[1].name).toBe('TestOrb');
      expect(scopes[1].parentId).toBe(fileScope);
    });

    it('should track symbols within scopes', () => {
      generator.enterScope({
        type: 'object',
        name: 'TestOrb',
        range: { start: { line: 0, column: 0 }, end: { line: 10, column: 1 } },
      });

      generator.addSymbol({
        name: 'color',
        type: 'property',
        range: { start: { line: 1, column: 2 }, end: { line: 1, column: 12 } },
        definedAt: { line: 1, column: 2 },
      });

      generator.addSymbol({
        name: 'size',
        type: 'property',
        range: { start: { line: 2, column: 2 }, end: { line: 2, column: 10 } },
        definedAt: { line: 2, column: 2 },
      });

      generator.exitScope();

      const sourceMap = generator.generate();
      const objectScope = sourceMap.x_scopes![0];

      expect(objectScope.symbols.length).toBe(2);
      expect(objectScope.symbols[0].name).toBe('color');
      expect(objectScope.symbols[1].name).toBe('size');
    });

    it('should track symbol references', () => {
      generator.enterScope({
        type: 'function',
        name: 'onClick',
        range: { start: { line: 0, column: 0 }, end: { line: 10, column: 1 } },
      });

      generator.addSymbol({
        name: 'count',
        type: 'variable',
        range: { start: { line: 1, column: 2 }, end: { line: 1, column: 10 } },
        definedAt: { line: 1, column: 2 },
      });

      // Reference the symbol multiple times
      generator.addSymbolReference('count', { line: 3, column: 10 });
      generator.addSymbolReference('count', { line: 5, column: 5 });

      generator.exitScope();

      const sourceMap = generator.generate();
      const symbol = sourceMap.x_scopes![0].symbols[0];

      expect(symbol.references.length).toBe(2);
      expect(symbol.references[0]).toEqual({ line: 3, column: 10 });
      expect(symbol.references[1]).toEqual({ line: 5, column: 5 });
    });
  });

  describe('Expression Types', () => {
    it('should track expression types in mappings', () => {
      generator.addSource('src/main.holo');

      generator.addMapping({
        generated: { line: 0, column: 0 },
        original: { line: 0, column: 0 },
        source: 'src/main.holo',
        expressionType: 'identifier',
      });

      generator.addMapping({
        generated: { line: 0, column: 10 },
        original: { line: 0, column: 10 },
        source: 'src/main.holo',
        expressionType: 'property-access',
      });

      generator.addMapping({
        generated: { line: 1, column: 0 },
        original: { line: 1, column: 0 },
        source: 'src/main.holo',
        expressionType: 'call',
      });

      const sourceMap = generator.generate();

      expect(sourceMap.x_expressionTypes).toBeDefined();
      expect(sourceMap.x_expressionTypes).toContain('identifier');
      expect(sourceMap.x_expressionTypes).toContain('property-access');
      expect(sourceMap.x_expressionTypes).toContain('call');
    });
  });

  describe('Breakpoints', () => {
    it('should track breakpoint locations', () => {
      generator.addSource('src/main.holo');

      generator.addMapping({
        generated: { line: 0, column: 0 },
        original: { line: 0, column: 0 },
        source: 'src/main.holo',
        isBreakpoint: true,
      });

      generator.addMapping({
        generated: { line: 5, column: 4 },
        original: { line: 5, column: 2 },
        source: 'src/main.holo',
        isBreakpoint: true,
      });

      generator.addMapping({
        generated: { line: 10, column: 0 },
        original: { line: 10, column: 0 },
        source: 'src/main.holo',
        isBreakpoint: false,
      });

      const sourceMap = generator.generate();

      expect(sourceMap.x_breakpoints).toBeDefined();
      expect(sourceMap.x_breakpoints!.length).toBe(2);
      expect(sourceMap.x_breakpoints).toContainEqual({ line: 0, column: 0 });
      expect(sourceMap.x_breakpoints).toContainEqual({ line: 5, column: 4 });
    });
  });

  describe('Debug Names', () => {
    it('should track mangled to original name mappings', () => {
      generator.addDebugName('_a', 'myOrb');
      generator.addDebugName('_b', 'handleClick');
      generator.addDebugName('_c', 'stateValue');

      const sourceMap = generator.generate();

      expect(sourceMap.x_debugNames).toBeDefined();
      expect(sourceMap.x_debugNames!['_a']).toBe('myOrb');
      expect(sourceMap.x_debugNames!['_b']).toBe('handleClick');
      expect(sourceMap.x_debugNames!['_c']).toBe('stateValue');
    });
  });

  describe('Hot Reload Mappings', () => {
    it('should track hot reload mappings', () => {
      generator.addHotReloadMapping({
        objectId: 'obj_1',
        originalRange: { start: { line: 1, column: 0 }, end: { line: 10, column: 1 } },
        generatedRange: { start: { line: 0, column: 0 }, end: { line: 5, column: 1 } },
        hash: 'abc123',
        dependencies: ['src/utils.holo'],
      });

      const mapping = generator.getHotReloadMapping('obj_1');

      expect(mapping).toBeDefined();
      expect(mapping!.objectId).toBe('obj_1');
      expect(mapping!.hash).toBe('abc123');
    });

    it('should update hot reload mappings', () => {
      generator.addHotReloadMapping({
        objectId: 'obj_1',
        originalRange: { start: { line: 1, column: 0 }, end: { line: 10, column: 1 } },
        generatedRange: { start: { line: 0, column: 0 }, end: { line: 5, column: 1 } },
        hash: 'abc123',
        dependencies: [],
      });

      generator.updateHotReloadMapping(
        'obj_1',
        { start: { line: 0, column: 0 }, end: { line: 8, column: 1 } },
        'def456'
      );

      const mapping = generator.getHotReloadMapping('obj_1');

      expect(mapping!.hash).toBe('def456');
      expect(mapping!.generatedRange.end.line).toBe(8);
    });
  });

  describe('Output Formats', () => {
    it('should generate JSON string', () => {
      generator.addSource('src/main.holo');
      generator.addMapping({
        generated: { line: 0, column: 0 },
        original: { line: 0, column: 0 },
        source: 'src/main.holo',
      });

      const json = generator.toString();
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe(3);
      expect(parsed.file).toBe('output.js');
    });

    it('should generate data URL', () => {
      generator.addSource('src/main.holo');

      const dataUrl = generator.toDataURL();

      expect(dataUrl).toMatch(/^data:application\/json;charset=utf-8;base64,/);
    });

    it('should generate source map comment', () => {
      const inlineComment = generator.toComment();
      expect(inlineComment).toMatch(/^\/\/# sourceMappingURL=data:/);

      const fileComment = generator.toComment('output.js.map');
      expect(fileComment).toBe('//# sourceMappingURL=output.js.map');
    });
  });

  describe('Cloning', () => {
    it('should clone generator', () => {
      generator.addSource('src/main.holo');
      generator.addMapping({
        generated: { line: 0, column: 0 },
        original: { line: 0, column: 0 },
        source: 'src/main.holo',
      });

      const cloned = generator.clone();

      // Modify original
      generator.addSource('src/other.holo');

      const originalMap = generator.generate();
      const clonedMap = cloned.generate();

      expect(originalMap.sources.length).toBe(2);
      expect(clonedMap.sources.length).toBe(1);
    });
  });
});

describe('SourceMapConsumerV2', () => {
  let sourceMap: SourceMapV2;
  let consumer: SourceMapConsumerV2;

  beforeEach(() => {
    const generator = createSourceMapV2({ file: 'output.js' });
    generator.addSource('src/main.holo', 'orb "Test" { color: "red" }');

    generator.addMapping({
      generated: { line: 0, column: 0 },
      original: { line: 0, column: 0 },
      source: 'src/main.holo',
      name: 'Test',
    });

    generator.addMapping({
      generated: { line: 0, column: 10 },
      original: { line: 0, column: 5 },
      source: 'src/main.holo',
    });

    generator.addMapping({
      generated: { line: 1, column: 2 },
      original: { line: 0, column: 14 },
      source: 'src/main.holo',
      name: 'color',
    });

    generator.enterScope({
      type: 'object',
      name: 'Test',
      range: { start: { line: 0, column: 0 }, end: { line: 0, column: 25 } },
    });
    generator.exitScope();

    sourceMap = generator.generate();
    consumer = new SourceMapConsumerV2(sourceMap);
  });

  describe('Position Lookups', () => {
    it('should find original position for exact match', () => {
      const original = consumer.originalPositionFor({ line: 0, column: 0 });

      expect(original.source).toBe('src/main.holo');
      expect(original.line).toBe(0);
      expect(original.column).toBe(0);
      expect(original.name).toBe('Test');
    });

    it('should find closest match when no exact match', () => {
      const original = consumer.originalPositionFor({ line: 0, column: 8 });

      expect(original.source).toBe('src/main.holo');
      // Should find closest column on same line
      expect(original.line).not.toBeNull();
    });

    it('should return nulls for unmapped position', () => {
      const original = consumer.originalPositionFor({ line: 100, column: 0 });

      expect(original.source).toBeNull();
      expect(original.line).toBeNull();
    });

    it('should find generated position for original', () => {
      const generated = consumer.generatedPositionFor({
        source: 'src/main.holo',
        line: 0,
        column: 0,
      });

      expect(generated).not.toBeNull();
      expect(generated!.line).toBe(0);
      expect(generated!.column).toBe(0);
    });
  });

  describe('Source Content', () => {
    it('should return source content', () => {
      const content = consumer.sourceContentFor('src/main.holo');
      expect(content).toBe('orb "Test" { color: "red" }');
    });

    it('should return null for unknown source', () => {
      const content = consumer.sourceContentFor('unknown.holo');
      expect(content).toBeNull();
    });

    it('should list all sources', () => {
      expect(consumer.sources).toEqual(['src/main.holo']);
    });
  });

  describe('Scope Lookups', () => {
    it('should find scope at position', () => {
      const scope = consumer.getScopeAt({ line: 0, column: 0 });

      expect(scope).not.toBeNull();
      expect(scope!.type).toBe('object');
      expect(scope!.name).toBe('Test');
    });

    it('should list all scopes', () => {
      expect(consumer.scopes.length).toBe(1);
      expect(consumer.scopes[0].type).toBe('object');
    });
  });

  describe('Breakpoints', () => {
    it('should return breakpoint locations', () => {
      const generator = createSourceMapV2({ file: 'test.js' });
      generator.addSource('test.holo');
      generator.addMapping({
        generated: { line: 5, column: 0 },
        original: { line: 0, column: 0 },
        source: 'test.holo',
        isBreakpoint: true,
      });

      const map = generator.generate();
      const c = new SourceMapConsumerV2(map);

      const breakpoints = c.getBreakpoints();
      expect(breakpoints).toContainEqual({ line: 5, column: 0 });
    });
  });

  describe('Debug Names', () => {
    it('should resolve debug names', () => {
      const generator = createSourceMapV2({ file: 'test.js' });
      generator.addDebugName('_x', 'realName');

      const map = generator.generate();
      const c = new SourceMapConsumerV2(map);

      expect(c.getDebugName('_x')).toBe('realName');
      expect(c.getDebugName('unknown')).toBeNull();
    });
  });

  describe('JSON Parsing', () => {
    it('should accept JSON string', () => {
      const json = JSON.stringify(sourceMap);
      const c = new SourceMapConsumerV2(json);

      expect(c.sources).toEqual(['src/main.holo']);
    });
  });
});

describe('Index Maps', () => {
  it('should create index map for bundle splitting', () => {
    const map1: SourceMapV2 = {
      version: 3,
      file: 'chunk1.js',
      sources: ['src/a.holo'],
      names: [],
      mappings: 'AAAA',
    };

    const map2: SourceMapV2 = {
      version: 3,
      file: 'chunk2.js',
      sources: ['src/b.holo'],
      names: [],
      mappings: 'AAAA',
    };

    const indexMap = createIndexMap('bundle.js', [
      { offset: { line: 0, column: 0 }, map: map1 },
      { offset: { line: 100, column: 0 }, map: map2 },
    ]);

    expect(indexMap.version).toBe(3);
    expect(indexMap.file).toBe('bundle.js');
    expect(indexMap.sections.length).toBe(2);
    expect(indexMap.sections[0].offset).toEqual({ line: 0, column: 0 });
    expect(indexMap.sections[1].offset).toEqual({ line: 100, column: 0 });
  });
});

describe('Combining Source Maps', () => {
  it('should combine multiple source maps', () => {
    const gen1 = createSourceMapV2({ file: 'part1.js' });
    gen1.addSource('src/a.holo', 'content a');
    gen1.addMapping({
      generated: { line: 0, column: 0 },
      original: { line: 0, column: 0 },
      source: 'src/a.holo',
    });

    const gen2 = createSourceMapV2({ file: 'part2.js' });
    gen2.addSource('src/b.holo', 'content b');
    gen2.addMapping({
      generated: { line: 0, column: 0 },
      original: { line: 0, column: 0 },
      source: 'src/b.holo',
    });

    const combined = combineSourceMapsV2([gen1.generate(), gen2.generate()], 'combined.js');

    expect(combined.file).toBe('combined.js');
    expect(combined.sources).toContain('src/a.holo');
    expect(combined.sources).toContain('src/b.holo');
  });
});
