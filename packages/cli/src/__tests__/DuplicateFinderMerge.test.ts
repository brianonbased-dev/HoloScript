/**
 * DuplicateFinder + Config Merge Production Tests
 *
 * Tests file duplication detection (exact/similar), report formatting,
 * and deep config merge utility.
 */

import { describe, it, expect } from 'vitest';
import { DuplicateFinder } from '../analyze/DuplicateFinder';
import { mergeConfigs } from '../config/merge';

describe('DuplicateFinder — Production', () => {
  it('findExactDuplicates detects identical content', () => {
    const finder = new DuplicateFinder();
    const files = new Map([
      ['a.ts', 'const x = 1;'],
      ['b.ts', 'const x = 1;'],
      ['c.ts', 'const y = 2;'],
    ]);
    const groups = finder.findExactDuplicates(files);
    expect(groups.length).toBe(1);
    expect(groups[0].paths).toContain('a.ts');
    expect(groups[0].paths).toContain('b.ts');
    expect(groups[0].wastedBytes).toBeGreaterThan(0);
  });

  it('findExactDuplicates returns empty for unique files', () => {
    const finder = new DuplicateFinder();
    const files = new Map([
      ['a.ts', 'unique content 1'],
      ['b.ts', 'unique content 2'],
    ]);
    expect(finder.findExactDuplicates(files)).toEqual([]);
  });

  it('findExactDuplicates respects minSize', () => {
    const finder = new DuplicateFinder();
    const files = new Map([
      ['a.ts', 'x'],
      ['b.ts', 'x'],
    ]);
    expect(finder.findExactDuplicates(files, 100)).toEqual([]);
    expect(finder.findExactDuplicates(files, 1).length).toBe(1);
  });

  it('findExactDuplicates sorts by wasted bytes desc', () => {
    const finder = new DuplicateFinder();
    const files = new Map([
      ['small1.ts', 'ab'],
      ['small2.ts', 'ab'],
      ['big1.ts', 'a'.repeat(100)],
      ['big2.ts', 'a'.repeat(100)],
      ['big3.ts', 'a'.repeat(100)],
    ]);
    const groups = finder.findExactDuplicates(files);
    expect(groups.length).toBe(2);
    expect(groups[0].wastedBytes).toBeGreaterThan(groups[1].wastedBytes);
  });

  it('findSimilarFiles detects high similarity', () => {
    const finder = new DuplicateFinder();
    const common = 'line1\nline2\nline3\nline4\nline5';
    const files = new Map([
      ['a.ts', common],
      ['b.ts', common + '\nextra line'],
      ['c.ts', 'totally different\nno match\nat all'],
    ]);
    const groups = finder.findSimilarFiles(files, 60);
    expect(groups.length).toBeGreaterThanOrEqual(1);
    const abGroup = groups.find(g => g.paths.includes('a.ts') && g.paths.includes('b.ts'));
    expect(abGroup).toBeDefined();
    expect(abGroup!.similarity).toBeGreaterThanOrEqual(60);
  });

  it('findSimilarFiles respects threshold', () => {
    const finder = new DuplicateFinder();
    const files = new Map([
      ['a.ts', 'line1\nline2'],
      ['b.ts', 'line1\nline3'],
    ]);
    expect(finder.findSimilarFiles(files, 100).length).toBe(0);
    expect(finder.findSimilarFiles(files, 40).length).toBeGreaterThanOrEqual(1);
  });

  it('formatReport with no duplicates', () => {
    const finder = new DuplicateFinder();
    expect(finder.formatReport([])).toContain('No exact duplicates');
  });

  it('formatReport with duplicates', () => {
    const finder = new DuplicateFinder();
    const report = finder.formatReport([
      { hash: 'abc', paths: ['a.ts', 'b.ts'], sizePerCopy: 100, wastedBytes: 100 },
    ]);
    expect(report).toContain('1 duplicate group');
    expect(report).toContain('a.ts');
    expect(report).toContain('100 bytes');
  });
});

describe('mergeConfigs — Production', () => {
  it('shallow merge', () => {
    const result = mergeConfigs({ a: 1, b: 2 }, { b: 3 });
    expect(result).toEqual({ a: 1, b: 3 });
  });

  it('deep merge nested objects', () => {
    const result = mergeConfigs(
      { db: { host: 'localhost', port: 5432 }, name: 'app' },
      { db: { port: 3306 } }
    );
    expect(result.db.host).toBe('localhost');
    expect(result.db.port).toBe(3306);
    expect(result.name).toBe('app');
  });

  it('arrays are replaced, not merged', () => {
    const result = mergeConfigs({ tags: ['a', 'b'] }, { tags: ['c'] });
    expect(result.tags).toEqual(['c']);
  });

  it('undefined values are skipped', () => {
    const result = mergeConfigs({ a: 1, b: 2 }, { a: undefined, b: 3 });
    expect(result.a).toBe(1);
    expect(result.b).toBe(3);
  });

  it('deeply nested merge', () => {
    const result = mergeConfigs(
      { level1: { level2: { level3: { value: 'old' } } } },
      { level1: { level2: { level3: { value: 'new' } } } }
    );
    expect(result.level1.level2.level3.value).toBe('new');
  });
});
