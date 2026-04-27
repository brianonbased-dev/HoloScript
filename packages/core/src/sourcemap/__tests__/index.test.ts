/**
 * index.test.ts — Verifies that sourcemap/index.ts re-exports everything from SourceMapV2
 */
import { describe, it, expect } from 'vitest';
import * as SourceMapIndex from '../index.js';

describe('sourcemap/index barrel exports', () => {
  it('exports SourceMapGeneratorV2', () => {
    expect(SourceMapIndex.SourceMapGeneratorV2).toBeDefined();
    expect(typeof SourceMapIndex.SourceMapGeneratorV2).toBe('function');
  });

  it('exports SourceMapConsumerV2', () => {
    expect(SourceMapIndex.SourceMapConsumerV2).toBeDefined();
    expect(typeof SourceMapIndex.SourceMapConsumerV2).toBe('function');
  });

  it('exports createIndexMap', () => {
    expect(SourceMapIndex.createIndexMap).toBeDefined();
    expect(typeof SourceMapIndex.createIndexMap).toBe('function');
  });

  it('exports combineSourceMapsV2', () => {
    expect(SourceMapIndex.combineSourceMapsV2).toBeDefined();
    expect(typeof SourceMapIndex.combineSourceMapsV2).toBe('function');
  });

  it('exports createSourceMapV2', () => {
    expect(SourceMapIndex.createSourceMapV2).toBeDefined();
    expect(typeof SourceMapIndex.createSourceMapV2).toBe('function');
  });

  it('SourceMapGeneratorV2 is constructable via barrel', () => {
    const gen = new SourceMapIndex.SourceMapGeneratorV2({ file: 'test.js' });
    expect(gen).toBeDefined();
    expect(gen.generate().version).toBe(3);
  });

  it('SourceMapConsumerV2 is constructable via barrel with generator output', () => {
    const gen = new SourceMapIndex.SourceMapGeneratorV2({ file: 'test.js' });
    const consumer = new SourceMapIndex.SourceMapConsumerV2(gen.generate());
    expect(consumer).toBeDefined();
    expect(consumer.sources).toBeDefined();
  });

  it('createSourceMapV2 returns a SourceMapGeneratorV2 via barrel', () => {
    const gen = SourceMapIndex.createSourceMapV2({ file: 'via-barrel.js' });
    expect(gen).toBeInstanceOf(SourceMapIndex.SourceMapGeneratorV2);
  });

  it('createIndexMap is callable via barrel', () => {
    const gen = new SourceMapIndex.SourceMapGeneratorV2({ file: 'seg.js' });
    const idx = SourceMapIndex.createIndexMap('bundle.js', [
      { offset: { line: 0, column: 0 }, map: gen.generate() },
    ]);
    expect(idx.version).toBe(3);
    expect(idx.file).toBe('bundle.js');
  });

  it('combineSourceMapsV2 is callable via barrel', () => {
    const gen = new SourceMapIndex.SourceMapGeneratorV2({ file: 'a.js' });
    gen.addSource('a.hs');
    gen.addMapping({ generated: { line: 0, column: 0 } });
    const combined = SourceMapIndex.combineSourceMapsV2([gen.generate()], 'out.js');
    expect(combined.version).toBe(3);
  });
});
