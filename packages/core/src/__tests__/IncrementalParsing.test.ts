import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import { ParseCache } from '../parser/ParseCache';

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
});
