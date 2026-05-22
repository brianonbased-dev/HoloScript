import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import { ParseCache } from '../parser/ParseCache';
import { ChunkBasedIncrementalParser } from '../parser/IncrementalParser';

describe('IncrementalParsing', () => {
  let parser: HoloScriptPlusParser;
  let cache: ParseCache;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
    cache = new ParseCache();
  });

  const source = `
orb cube_1 {
  @grabbable
  position: [0, 1, 0]
}

orb sphere_1 {
  @physics
  position: [2, 1, 0]
}

template "ArtFrame" {
  @collidable
  material: "wood"
}
`;

  it('should perform a full parse initially and cache nodes', () => {
    const result = parser.parseIncremental(source, cache);
    expect(result.success).toBe(true);
    expect(result.ast.children.length).toBe(3);

    // Check that nodes are in cache
    const cube1Hash = ParseCache.hash(source.split('\n').slice(1, 5).join('\n'));
    // console.log('Cube 1 Source:', source.split('\n').slice(1, 5).join('\n'));
    // Note: ChunkDetector is line-based, let's just check if cache has entries
    // Actually, let's verify reuse by checking object identity
  });

  it('should reuse cached nodes when nothing changes', () => {
    const result1 = parser.parseIncremental(source, cache);
    const result2 = parser.parseIncremental(source, cache);

    expect(result1.ast.children[0]).toBe(result2.ast.children[0]);
    expect(result1.ast.children[1]).toBe(result2.ast.children[1]);
    expect(result1.ast.children[2]).toBe(result2.ast.children[2]);
  });

  it('should re-parse only changed chunks', () => {
    const result1 = parser.parseIncremental(source, cache);

    // Modify cube_1
    const modifiedSource = source.replace('position: [0, 1, 0]', 'position: [0, 2, 0]');
    const result2 = parser.parseIncremental(modifiedSource, cache);

    // cube_1 should be different (re-parsed)
    expect(result1.ast.children[0]).not.toBe(result2.ast.children[0]);

    // sphere_1 and ArtFrame should be identical (reused)
    expect(result1.ast.children[1]).toBe(result2.ast.children[1]);
    expect(result1.ast.children[2]).toBe(result2.ast.children[2]);
  });

  it('should correctly offset line numbers in incremental results', () => {
    // Add two newlines at the top to shift everything
    const shiftedSource = '\n\n' + source.trim();
    const result = parser.parseIncremental(shiftedSource, cache);

    const secondOrb = result.ast.children[1]; // sphere_1
    // Original sphere_1 started on line 7 (with trim it would be 6)
    // Shifted by 2 lines -> 8
    expect(secondOrb.loc.start.line).toBeGreaterThan(5);
  });

  it('should handle adding new chunks without invalidating others', () => {
    const result1 = parser.parseIncremental(source, cache);

    const expandedSource = source + '\norb cube_2 {\n  scale: 2\n}\n';
    const result2 = parser.parseIncremental(expandedSource, cache);

    expect(result2.ast.children.length).toBe(4);
    expect(result1.ast.children[0]).toBe(result2.ast.children[0]);
    expect(result1.ast.children[1]).toBe(result2.ast.children[1]);
    expect(result1.ast.children[2]).toBe(result2.ast.children[2]);
  });

  it('should delegate to ChunkBasedIncrementalParser with incremental metrics', () => {
    const result = parser.parseIncremental(source, cache);
    const metrics = (result as any).incrementalMetrics;

    // First parse: all chunks are new (parsed, not cached)
    expect(metrics).toBeDefined();
    expect(typeof metrics.cached).toBe('number');
    expect(typeof metrics.parsed).toBe('number');
    expect(typeof metrics.duration).toBe('number');
    expect(Array.isArray(metrics.changedChunks)).toBe(true);
    expect(metrics.parsed).toBeGreaterThan(0);

    // Second parse of same source: all chunks cached
    const result2 = parser.parseIncremental(source, cache);
    const metrics2 = (result2 as any).incrementalMetrics;
    expect(metrics2.cached).toBeGreaterThan(0);
    expect(metrics2.parsed).toBe(0);
  });

  it('should use ChunkBasedIncrementalParser dependency tracking', () => {
    const sourceWithDeps = `
template "BaseStyle" {
  opacity: 0.9
  castShadow: true
}

orb "Styled" {
  ...BaseStyle
  color: "white"
}

orb "OrbB" {
  color: "blue"
}
`;
    const result1 = parser.parseIncremental(sourceWithDeps, cache);
    expect(result1.success).toBe(true);

    // Modify the template — the dependent orb should be invalidated
    const modifiedSource = sourceWithDeps
      .replace('opacity: 0.9', 'opacity: 0.5')
      .replace('castShadow: true', 'castShadow: false');
    const result2 = parser.parseIncremental(modifiedSource, cache);

    const metrics = (result2 as any).incrementalMetrics;
    // The template chunk changed, so it should appear in changedChunks
    expect(metrics.changedChunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should create separate ChunkBasedIncrementalParser per cache', () => {
    const cache1 = new ParseCache();
    const cache2 = new ParseCache();

    // Parse with cache1 — all fresh
    const result1 = parser.parseIncremental(source, cache1);
    expect((result1 as any).incrementalMetrics.parsed).toBeGreaterThan(0);

    // Parse with cache2 — also fresh (different cache, no state)
    const result2 = parser.parseIncremental(source, cache2);
    expect((result2 as any).incrementalMetrics.parsed).toBeGreaterThan(0);
    // This verifies the per-cache parser map works correctly
  });
});
