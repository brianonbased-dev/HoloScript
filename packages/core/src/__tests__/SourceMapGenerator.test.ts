import { describe, it, expect, beforeEach } from 'vitest';
import { SourceMapGenerator, SourceMapConsumer, combineSourceMaps } from '../SourceMapGenerator';

describe('SourceMapGenerator', () => {
  let gen: SourceMapGenerator;

  beforeEach(() => {
    gen = new SourceMapGenerator({ file: 'bundle.js', sourceRoot: '/src' });
  });

  it('creates a valid v3 source map', () => {
    const map = gen.generate();
    expect(map.version).toBe(3);
    expect(map.file).toBe('bundle.js');
    expect(map.sourceRoot).toBe('/src');
  });

  it('adds sources', () => {
    const idx = gen.addSource('main.holo', 'let x = 1;');
    expect(idx).toBe(0);
    const map = gen.generate();
    expect(map.sources).toContain('main.holo');
    expect(map.sourcesContent![0]).toBe('let x = 1;');
  });

  it('deduplicates sources', () => {
    gen.addSource('a.holo');
    gen.addSource('a.holo');
    const map = gen.generate();
    expect(map.sources.filter(s => s === 'a.holo').length).toBe(1);
  });

  it('adds names', () => {
    const idx = gen.addName('myFunction');
    expect(idx).toBe(0);
    const map = gen.generate();
    expect(map.names).toContain('myFunction');
  });

  it('adds mappings', () => {
    gen.addSource('main.holo');
    gen.addMapping({
      generated: { line: 1, column: 0 },
      original: { line: 1, column: 0 },
      source: 'main.holo',
    });
    const map = gen.generate();
    expect(map.mappings.length).toBeGreaterThan(0);
  });

  it('generates JSON string', () => {
    gen.addSource('test.holo');
    const json = gen.toString();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(3);
  });

  it('generates data URL', () => {
    gen.addSource('test.holo');
    const url = gen.toDataURL();
    expect(url).toContain('data:application/json;charset=utf-8;base64,');
  });

  it('generates source map comment', () => {
    const comment = gen.toComment('bundle.js.map');
    expect(comment).toContain('sourceMappingURL=bundle.js.map');
  });

  it('generates inline comment when no file given', () => {
    gen.addSource('test.holo');
    const comment = gen.toComment();
    expect(comment).toContain('data:application/json');
  });
});

describe('SourceMapConsumer', () => {
  function makeSourceMap() {
    const gen = new SourceMapGenerator({ file: 'out.js' });
    gen.addSource('input.holo', 'let x = 1;\nlet y = 2;');
    gen.addMapping({
      generated: { line: 1, column: 0 },
      original: { line: 1, column: 0 },
      source: 'input.holo',
      name: 'x',
    });
    gen.addMapping({
      generated: { line: 2, column: 0 },
      original: { line: 2, column: 0 },
      source: 'input.holo',
      name: 'y',
    });
    return gen.generate();
  }

  it('parses from a SourceMap object', () => {
    const consumer = new SourceMapConsumer(makeSourceMap());
    expect(consumer.sources).toContain('input.holo');
  });

  it('parses from a JSON string', () => {
    const json = JSON.stringify(makeSourceMap());
    const consumer = new SourceMapConsumer(json);
    expect(consumer.sources).toContain('input.holo');
  });

  it('resolves original position', () => {
    const consumer = new SourceMapConsumer(makeSourceMap());
    const pos = consumer.originalPositionFor({ line: 1, column: 0 });
    expect(pos.source).toBe('input.holo');
    expect(pos.line).toBe(1);
    expect(pos.column).toBe(0);
  });

  it('returns nulls for unmapped position', () => {
    const consumer = new SourceMapConsumer(makeSourceMap());
    const pos = consumer.originalPositionFor({ line: 999, column: 0 });
    expect(pos.source).toBeNull();
  });

  it('returns source content', () => {
    const consumer = new SourceMapConsumer(makeSourceMap());
    expect(consumer.sourceContentFor('input.holo')).toBe('let x = 1;\nlet y = 2;');
  });

  it('returns null for unknown source content', () => {
    const consumer = new SourceMapConsumer(makeSourceMap());
    expect(consumer.sourceContentFor('nope.holo')).toBeNull();
  });
});

describe('combineSourceMaps', () => {
  it('combines multiple source maps', () => {
    const gen1 = new SourceMapGenerator({ file: 'a.js' });
    gen1.addSource('a.holo');
    const gen2 = new SourceMapGenerator({ file: 'b.js' });
    gen2.addSource('b.holo');

    const combined = combineSourceMaps(
      [gen1.generate(), gen2.generate()],
      'combined.js'
    );

    expect(combined.file).toBe('combined.js');
    expect(combined.sources).toContain('a.holo');
    expect(combined.sources).toContain('b.holo');
  });
});
