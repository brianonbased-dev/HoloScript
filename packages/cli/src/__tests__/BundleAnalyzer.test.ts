/**
 * BundleAnalyzer Tests - Sprint 4
 */

import { describe, it, expect } from 'vitest';
import { BundleAnalyzer } from '../analyze/BundleAnalyzer';
import { DuplicateFinder } from '../analyze/DuplicateFinder';
import { TreemapGenerator, type TreemapNode } from '../analyze/TreemapGenerator';

// =============================================================================
// BundleAnalyzer
// =============================================================================

describe('BundleAnalyzer', () => {
  const analyzer = new BundleAnalyzer();

  function makeFiles(entries: Record<string, string>): Map<string, string> {
    return new Map(Object.entries(entries));
  }

  it('analyzes empty bundle', () => {
    const result = analyzer.analyze(new Map());
    expect(result.totalSize).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it('calculates total size correctly', () => {
    const files = makeFiles({
      'dist/scene.js': 'a'.repeat(1000),
      'dist/utils.js': 'b'.repeat(500),
    });
    const result = analyzer.analyze(files);
    expect(result.totalSize).toBe(1500);
  });

  it('estimates gzipped size less than raw', () => {
    const files = makeFiles({ 'dist/a.js': 'x'.repeat(1000) });
    const result = analyzer.analyze(files);
    expect(result.totalGzipped).toBeGreaterThan(0);
    expect(result.totalGzipped).toBeLessThan(result.totalSize);
  });

  it('sorts entries by size descending', () => {
    const files = makeFiles({
      'dist/small.js': 'a'.repeat(100),
      'dist/large.js': 'b'.repeat(1000),
      'dist/medium.js': 'c'.repeat(500),
    });
    const result = analyzer.analyze(files);
    expect(result.entries[0].size).toBeGreaterThanOrEqual(result.entries[1].size);
    expect(result.entries[1].size).toBeGreaterThanOrEqual(result.entries[2].size);
  });

  it('categorizes files by path keywords', () => {
    const files = makeFiles({
      'dist/scene-graph.js': 'content',
      'dist/physics-trait.js': 'content2',
      'dist/runtime-engine.js': 'content3',
      'dist/utils-helpers.js': 'content4',
    });
    const result = analyzer.analyze(files);
    const cats = result.entries.map((e) => e.category);
    expect(cats).toContain('scene');
    expect(cats).toContain('traits');
    expect(cats).toContain('runtime');
    expect(cats).toContain('utils');
  });

  it('builds category breakdown', () => {
    const files = makeFiles({
      'dist/scene.js': 'a'.repeat(1000),
      'dist/scene2.js': 'b'.repeat(500),
      'dist/trait.js': 'c'.repeat(200),
    });
    const result = analyzer.analyze(files);
    expect(result.byCategory['scene']).toBeDefined();
    expect(result.byCategory['scene'].count).toBe(2);
    expect(result.byCategory['scene'].size).toBe(1500);
  });

  it('detects duplicate files', () => {
    const content = 'exact same content here';
    const files = makeFiles({
      'dist/a.js': content,
      'dist/b.js': content,
      'dist/c.js': 'different content',
    });
    const result = analyzer.analyze(files);
    expect(result.duplicates.length).toBeGreaterThan(0);
    expect(result.duplicates[0].paths).toHaveLength(2);
  });

  it('no duplicates when all files unique', () => {
    const files = makeFiles({
      'dist/a.js': 'unique A',
      'dist/b.js': 'unique B',
      'dist/c.js': 'unique C',
    });
    const result = analyzer.analyze(files);
    expect(result.duplicates).toHaveLength(0);
  });

  it('formatTerminal returns non-empty string with header', () => {
    const files = makeFiles({ 'dist/app.js': 'content'.repeat(100) });
    const result = analyzer.analyze(files);
    const output = analyzer.formatTerminal(result);
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('Bundle Analysis');
  });

  it('formatJSON returns valid JSON with entries', () => {
    const files = makeFiles({ 'dist/app.js': 'content' });
    const result = analyzer.analyze(files);
    const json = analyzer.formatJSON(result);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.entries).toBeDefined();
    expect(parsed.totalSize).toBeGreaterThan(0);
  });

  it('analyzedAt timestamp is set', () => {
    const before = Date.now();
    const result = analyzer.analyze(new Map());
    const after = Date.now();
    expect(result.analyzedAt).toBeGreaterThanOrEqual(before);
    expect(result.analyzedAt).toBeLessThanOrEqual(after);
  });

  it('each entry has a hash', () => {
    const files = makeFiles({ 'dist/app.js': 'content' });
    const result = analyzer.analyze(files);
    expect(result.entries[0].hash).toBeDefined();
    expect(result.entries[0].hash.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// DuplicateFinder
// =============================================================================

describe('DuplicateFinder', () => {
  const finder = new DuplicateFinder();

  it('finds exact duplicate files', () => {
    const content = 'duplicate content here';
    const files = new Map([
      ['a.js', content],
      ['b.js', content],
      ['c.js', 'different'],
    ]);
    const dups = finder.findExactDuplicates(files);
    expect(dups).toHaveLength(1);
    expect(dups[0].paths).toContain('a.js');
    expect(dups[0].paths).toContain('b.js');
    expect(dups[0].paths).not.toContain('c.js');
  });

  it('no duplicates returns empty array', () => {
    const files = new Map([
      ['a.js', 'content A'],
      ['b.js', 'content B'],
    ]);
    expect(finder.findExactDuplicates(files)).toHaveLength(0);
  });

  it('calculates wastedBytes correctly', () => {
    const content = 'x'.repeat(1000);
    const files = new Map([
      ['a.js', content],
      ['b.js', content],
      ['c.js', content],
    ]);
    const dups = finder.findExactDuplicates(files);
    expect(dups[0].wastedBytes).toBe(2000);
    expect(dups[0].sizePerCopy).toBe(1000);
  });

  it('sorts by wasted bytes descending', () => {
    const bigContent = 'x'.repeat(10000);
    const smallContent = 'y'.repeat(100);
    const files = new Map([
      ['small1.js', smallContent],
      ['small2.js', smallContent],
      ['big1.js', bigContent],
      ['big2.js', bigContent],
    ]);
    const dups = finder.findExactDuplicates(files);
    expect(dups[0].wastedBytes).toBeGreaterThan(dups[1].wastedBytes);
  });

  it('findSimilarFiles identifies highly similar content', () => {
    const base = Array.from({ length: 20 }, (_, i) => `const line${i} = "value_${i}";`).join('\n');
    const modified = base + '\n// small addition at the end of the file';
    const files = new Map([
      ['a.js', base],
      ['b.js', modified],
      ['c.js', 'completely different content nothing matches here at all xyz abc'],
    ]);
    const similar = finder.findSimilarFiles(files, 50);
    expect(similar.length).toBeGreaterThan(0);
    expect(similar[0].paths).toContain('a.js');
    expect(similar[0].paths).toContain('b.js');
  });

  it('formatReport returns no-duplicate message when empty', () => {
    const report = finder.formatReport([]);
    expect(report).toContain('No exact duplicates');
  });

  it('formatReport lists duplicates', () => {
    const dups = [
      { hash: 'abc123', paths: ['a.js', 'b.js'], sizePerCopy: 1024, wastedBytes: 1024 },
    ];
    const report = finder.formatReport(dups);
    expect(report).toContain('a.js');
    expect(report).toContain('b.js');
    expect(report).toContain('Wasted');
  });
});

// =============================================================================
// TreemapGenerator
// =============================================================================

describe('TreemapGenerator', () => {
  const gen = new TreemapGenerator();

  function makeNodes(entries: Array<{ name: string; size: number; category?: string }>): TreemapNode[] {
    return entries.map(({ name, size, category }) => ({ name, size, category }));
  }

  it('generates valid HTML with DOCTYPE', () => {
    const nodes = makeNodes([
      { name: 'dist/scene.js', size: 5000, category: 'scene' },
      { name: 'dist/trait.js', size: 2000, category: 'traits' },
    ]);
    const html = gen.generate(nodes);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('HoloScript Bundle Analysis');
  });

  it('HTML contains file names from node data', () => {
    const nodes = makeNodes([{ name: 'dist/app.js', size: 5000 }]);
    const html = gen.generate(nodes);
    expect(html).toContain('app.js');
  });

  it('generates for empty nodes without throwing', () => {
    expect(() => gen.generate([])).not.toThrow();
  });

  it('accepts a custom title', () => {
    const nodes = makeNodes([{ name: 'a.js', size: 100 }]);
    const html = gen.generate(nodes, 'My Custom Analysis');
    expect(html).toContain('My Custom Analysis');
  });

  it('HTML is self-contained (no external CDN scripts)', () => {
    const nodes = makeNodes([{ name: 'a.js', size: 100 }]);
    const html = gen.generate(nodes);
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(html).not.toContain('unpkg.com');
  });
});
