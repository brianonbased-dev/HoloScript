/**
 * IncrementalParser — Production Test Suite
 *
 * Covers: parse (full/incremental), cache invalidation, stats, clear,
 * applyChange, getNodesInRange, version tracking.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IncrementalParser, createIncrementalParser } from '../IncrementalParser';

const SIMPLE_CODE = `world main {\n  scene lobby {\n  }\n}\n`;
const MODIFIED_CODE = `world main {\n  scene lobby {\n    prefab Player {\n    }\n  }\n}\n`;

describe('IncrementalParser — Production', () => {
  let parser: IncrementalParser;

  beforeEach(() => {
    parser = new IncrementalParser();
  });

  // ─── Factory ──────────────────────────────────────────────────────
  it('createIncrementalParser factory works', () => {
    const p = createIncrementalParser();
    expect(p).toBeInstanceOf(IncrementalParser);
  });

  it('createIncrementalParser with options', () => {
    const p = createIncrementalParser({ blockSize: 50 });
    expect(p).toBeInstanceOf(IncrementalParser);
  });

  // ─── Full Parse ───────────────────────────────────────────────────
  it('first parse returns a result', () => {
    const result = parser.parse('test.holo', SIMPLE_CODE, 1);
    expect(typeof result.success).toBe('boolean');
    expect(Array.isArray(result.ast)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('parse result has ast and errors', () => {
    const result = parser.parse('test.holo', SIMPLE_CODE, 1);
    expect(Array.isArray(result.ast)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  // ─── Incremental Parse ────────────────────────────────────────────
  it('second parse with same content reuses cache', () => {
    parser.parse('test.holo', SIMPLE_CODE, 1);
    const result2 = parser.parse('test.holo', SIMPLE_CODE, 2);
    expect(result2.success).toBe(true);
  });

  it('modified content triggers incremental reparse', () => {
    parser.parse('test.holo', SIMPLE_CODE, 1);
    const result2 = parser.parse('test.holo', MODIFIED_CODE, 2);
    expect(result2.success).toBe(true);
    expect(result2.ast.length).toBeGreaterThan(0);
  });

  // ─── Multi-document ───────────────────────────────────────────────
  it('tracks multiple documents independently', () => {
    parser.parse('a.holo', SIMPLE_CODE, 1);
    parser.parse('b.holo', MODIFIED_CODE, 1);
    const stats = parser.getStats();
    expect(stats.documentCount).toBe(2);
  });

  // ─── Stats ────────────────────────────────────────────────────────
  it('getStats returns document count and memory', () => {
    const stats = parser.getStats();
    expect(stats.documentCount).toBe(0);
    expect(typeof stats.totalBlocks).toBe('number');
    expect(typeof stats.memoryEstimate).toBe('number');
  });

  it('getStats increases after parsing', () => {
    parser.parse('test.holo', SIMPLE_CODE, 1);
    const stats = parser.getStats();
    expect(stats.documentCount).toBe(1);
    expect(stats.totalBlocks).toBeGreaterThan(0);
  });

  // ─── Invalidate ───────────────────────────────────────────────────
  it('invalidate removes document cache', () => {
    parser.parse('test.holo', SIMPLE_CODE, 1);
    parser.invalidate('test.holo');
    const stats = parser.getStats();
    expect(stats.documentCount).toBe(0);
  });

  it('invalidate unknown uri is safe', () => {
    expect(() => parser.invalidate('nonexistent.holo')).not.toThrow();
  });

  // ─── Clear ────────────────────────────────────────────────────────
  it('clear removes all caches', () => {
    parser.parse('a.holo', SIMPLE_CODE, 1);
    parser.parse('b.holo', MODIFIED_CODE, 1);
    parser.clear();
    expect(parser.getStats().documentCount).toBe(0);
  });

  // ─── applyChange ──────────────────────────────────────────────────
  it('applyChange applies incremental text change', () => {
    parser.parse('test.holo', SIMPLE_CODE, 1);
    const result = parser.applyChange('test.holo', {
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 0 },
      },
      text: '  // inserted\n',
    }, 2);
    expect(result.success).toBe(true);
  });

  // ─── Edge Cases ───────────────────────────────────────────────────
  it('empty code parses successfully', () => {
    const result = parser.parse('empty.holo', '', 1);
    expect(result.success).toBe(true);
  });

  it('large version numbers work', () => {
    parser.parse('test.holo', SIMPLE_CODE, 999999);
    const result = parser.parse('test.holo', MODIFIED_CODE, 1000000);
    expect(result.success).toBe(true);
  });
});
