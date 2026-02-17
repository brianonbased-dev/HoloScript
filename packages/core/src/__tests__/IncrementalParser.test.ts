import { describe, it, expect, beforeEach } from 'vitest';
import { IncrementalParser, createIncrementalParser } from '../IncrementalParser';

const SAMPLE_SOURCE = `
node "box" {
  type: "mesh"
  position: vec3(0, 0, 0)
}

node "sphere" {
  type: "mesh"
  position: vec3(1, 0, 0)
}
`.trim();

describe('IncrementalParser', () => {
  let parser: IncrementalParser;

  beforeEach(() => {
    parser = new IncrementalParser();
  });

  it('performs a full parse on first call', () => {
    const result = parser.parse('test://file.holo', SAMPLE_SOURCE, 1);
    expect(result).toBeDefined();
    expect(result.ast).toBeDefined();
  });

  it('reuses cache on identical re-parse', () => {
    parser.parse('test://a.holo', SAMPLE_SOURCE, 1);
    const result2 = parser.parse('test://a.holo', SAMPLE_SOURCE, 2);
    expect(result2).toBeDefined();
    expect(result2.ast).toBeDefined();
  });

  it('detects changes and re-parses incrementally', () => {
    parser.parse('test://b.holo', SAMPLE_SOURCE, 1);
    const modified = SAMPLE_SOURCE.replace('"box"', '"cube"');
    const result2 = parser.parse('test://b.holo', modified, 2);
    expect(result2).toBeDefined();
    expect(result2.ast).toBeDefined();
  });

  it('tracks multiple documents', () => {
    parser.parse('file:///a.holo', 'node "a" { type: "mesh" }', 1);
    parser.parse('file:///b.holo', 'node "b" { type: "mesh" }', 1);
    const stats = parser.getStats();
    expect(stats.documentCount).toBe(2);
  });

  it('invalidates a document cache', () => {
    parser.parse('file:///c.holo', SAMPLE_SOURCE, 1);
    parser.invalidate('file:///c.holo');
    const stats = parser.getStats();
    expect(stats.documentCount).toBe(0);
  });

  it('clears all caches', () => {
    parser.parse('file:///d.holo', SAMPLE_SOURCE, 1);
    parser.parse('file:///e.holo', SAMPLE_SOURCE, 1);
    parser.clear();
    expect(parser.getStats().documentCount).toBe(0);
  });

  it('getStats returns correct memory estimate', () => {
    parser.parse('file:///f.holo', SAMPLE_SOURCE, 1);
    const stats = parser.getStats();
    expect(stats.totalBlocks).toBeGreaterThan(0);
    expect(stats.memoryEstimate).toBeGreaterThan(0);
  });

  it('handles empty source gracefully', () => {
    const result = parser.parse('empty.holo', '', 1);
    expect(result).toBeDefined();
    expect(result.ast).toBeDefined();
  });
});

describe('createIncrementalParser', () => {
  it('factory creates an IncrementalParser', () => {
    const parser = createIncrementalParser();
    expect(parser).toBeInstanceOf(IncrementalParser);
  });

  it('accepts custom block size option', () => {
    const parser = createIncrementalParser({ blockSize: 5 });
    expect(parser).toBeInstanceOf(IncrementalParser);
  });
});
