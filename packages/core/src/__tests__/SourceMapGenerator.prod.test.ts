/**
 * SourceMapGenerator + SourceMapConsumer — Production Test Suite
 *
 * Covers: addSource, addName, addMapping, encodeVLQ, generate,
 * toString, toDataURL, toComment, SourceMapConsumer (originalPositionFor,
 * sourceContentFor, sources), combineSourceMaps.
 */
import { describe, it, expect } from 'vitest';
import { SourceMapGenerator, SourceMapConsumer, combineSourceMaps } from '../SourceMapGenerator';

describe('SourceMapGenerator — Production', () => {
  function mkGenerator() {
    const gen = new SourceMapGenerator({ file: 'output.js' });
    gen.addSource('input.holo', 'orb Player { health: 100 }');
    return gen;
  }

  // ─── Sources ──────────────────────────────────────────────────────
  it('addSource returns index', () => {
    const gen = new SourceMapGenerator({ file: 'out.js' });
    const idx = gen.addSource('a.holo');
    expect(idx).toBe(0);
    const idx2 = gen.addSource('b.holo');
    expect(idx2).toBe(1);
  });

  it('addSource deduplicates', () => {
    const gen = new SourceMapGenerator({ file: 'out.js' });
    gen.addSource('a.holo');
    const idx = gen.addSource('a.holo');
    expect(idx).toBe(0); // same index
  });

  // ─── Names ────────────────────────────────────────────────────────
  it('addName returns index', () => {
    const gen = new SourceMapGenerator({ file: 'out.js' });
    expect(gen.addName('foo')).toBe(0);
    expect(gen.addName('bar')).toBe(1);
  });

  // ─── Mappings ─────────────────────────────────────────────────────
  it('addMapping creates mapping entry', () => {
    const gen = mkGenerator();
    gen.addMapping({
      generated: { line: 1, column: 0 },
      original: { line: 1, column: 0 },
      source: 'input.holo',
    });
    const map = gen.generate();
    expect(map.mappings.length).toBeGreaterThan(0);
  });

  // ─── Generate ─────────────────────────────────────────────────────
  it('generate returns v3 source map', () => {
    const gen = mkGenerator();
    gen.addMapping({
      generated: { line: 1, column: 0 },
      original: { line: 1, column: 0 },
      source: 'input.holo',
    });
    const map = gen.generate();
    expect(map.version).toBe(3);
    expect(map.file).toBe('output.js');
    expect(map.sources).toContain('input.holo');
  });

  it('generate includes sourcesContent', () => {
    const gen = mkGenerator();
    const map = gen.generate();
    expect(map.sourcesContent).toBeDefined();
    expect(map.sourcesContent![0]).toBe('orb Player { health: 100 }');
  });

  // ─── Serialization ────────────────────────────────────────────────
  it('toString returns valid JSON', () => {
    const gen = mkGenerator();
    const json = gen.toString();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(3);
  });

  it('toDataURL returns data URI', () => {
    const gen = mkGenerator();
    const url = gen.toDataURL();
    expect(url.startsWith('data:application/json')).toBe(true);
  });

  it('toComment returns sourceMappingURL', () => {
    const gen = mkGenerator();
    const comment = gen.toComment('output.js.map');
    expect(comment).toContain('sourceMappingURL');
    expect(comment).toContain('output.js.map');
  });

  // ─── VLQ Encoding ────────────────────────────────────────────────
  it('encodeVLQ produces valid base64 VLQ', () => {
    const gen = new SourceMapGenerator({ file: 'out.js' });
    // 0 = A, 1 = C, -1 = D
    expect((gen as any).encodeVLQ(0)).toBe('A');
    expect((gen as any).encodeVLQ(1)).toBe('C');
    expect((gen as any).encodeVLQ(-1)).toBe('D');
  });
});

describe('SourceMapConsumer — Production', () => {
  function mkMap() {
    const gen = new SourceMapGenerator({ file: 'output.js' });
    gen.addSource('input.holo', 'orb Player { health: 100 }');
    gen.addMapping({
      generated: { line: 1, column: 0 },
      original: { line: 1, column: 0 },
      source: 'input.holo',
    });
    gen.addMapping({
      generated: { line: 2, column: 4 },
      original: { line: 1, column: 13 },
      source: 'input.holo',
      name: 'health',
    });
    return gen.generate();
  }

  it('originalPositionFor returns source position', () => {
    const consumer = new SourceMapConsumer(mkMap());
    const pos = consumer.originalPositionFor({ line: 1, column: 0 });
    expect(pos.source).toBe('input.holo');
    expect(pos.line).toBe(1);
  });

  it('originalPositionFor returns null for unmapped', () => {
    const consumer = new SourceMapConsumer(mkMap());
    const pos = consumer.originalPositionFor({ line: 999, column: 0 });
    expect(pos.source).toBeNull();
  });

  it('sourceContentFor returns content', () => {
    const consumer = new SourceMapConsumer(mkMap());
    expect(consumer.sourceContentFor('input.holo')).toBe('orb Player { health: 100 }');
  });

  it('sources returns all source files', () => {
    const consumer = new SourceMapConsumer(mkMap());
    expect(consumer.sources).toContain('input.holo');
  });

  it('accepts JSON string input', () => {
    const consumer = new SourceMapConsumer(JSON.stringify(mkMap()));
    expect(consumer.sources).toContain('input.holo');
  });
});

describe('combineSourceMaps — Production', () => {
  it('merges multiple source maps', () => {
    const gen1 = new SourceMapGenerator({ file: 'a.js' });
    gen1.addSource('a.holo');
    const gen2 = new SourceMapGenerator({ file: 'b.js' });
    gen2.addSource('b.holo');
    const combined = combineSourceMaps([gen1.generate(), gen2.generate()], 'bundle.js');
    expect(combined.file).toBe('bundle.js');
    expect(combined.sources).toContain('a.holo');
    expect(combined.sources).toContain('b.holo');
  });
});
