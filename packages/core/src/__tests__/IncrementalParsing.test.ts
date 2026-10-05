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

// Task 9a7o: parseIncremental fails the way a full parse does when a chunk is refused, and puts
// every block at its document line on every pass (before 2026-09-29 a block at line 5 read 13
// on the first pass and 25 on the second).
const WITH_REFUSED_CHUNK = `orb "Before" {
  color: "blue"
}

orb "Lamp" {
  color: "red"
  function glow(): i32 {
    return missing(1)
  }
}

orb "After" {
  color: "green"
}
`;

describe('parseIncremental - refused chunks and document lines (task 9a7o)', () => {
  it('fails with the refused chunk error, at the position a full parse gives', () => {
    const full = new HoloScriptPlusParser({ enableVRTraits: true }).parse(WITH_REFUSED_CHUNK);
    const incremental = new HoloScriptPlusParser({ enableVRTraits: true }).parseIncremental(
      WITH_REFUSED_CHUNK,
      new ParseCache()
    );
    expect(incremental.success).toBe(false);
    expect(incremental.errors.map((error) => [error.line, error.column, error.code])).toEqual(
      full.errors.map((error) => [error.line, error.column, error.code])
    );
    expect(incremental.errors[0]).toMatchObject({ line: 8, column: 12, code: 'HS-NAME-002' });
  });

  it('keeps every block at its document line, on every pass and after a refused block', () => {
    const clean = `orb "Before" {
  color: "blue"
}

orb "Middle" {
  color: "red"
}

orb "After" {
  color: "green"
}
`;
    const parser = new HoloScriptPlusParser({ enableVRTraits: true });
    const cache = new ParseCache();
    const lines = (source: string, parseCache: ParseCache) =>
      (parser.parseIncremental(source, parseCache).ast.children ?? []).map(
        (child) => child.loc?.start.line
      );
    expect(lines(clean, cache)).toEqual([1, 5, 9]);
    expect(lines(clean, cache)).toEqual([1, 5, 9]);
    expect(lines(WITH_REFUSED_CHUNK, new ParseCache())).toEqual([1, 12]);
    // Two lines inserted above: the unchanged blocks come from the cache and must move by two,
    // not by their old shift plus the new one.
    expect(lines(`\n\n${clean}`, cache)).toEqual([3, 7, 11]);
  });
});

// Review of PR #461 (claude3): parseIncremental must never report success while it leaves code
// out, nor report an error a full parse does not. Measured before this: 166 tracked files
// reported success while missing 1,207 blocks, and 8 valid files reported errors.
describe('parseIncremental - nothing skipped, nothing invented (review of #461)', () => {
  const full = (source: string) => new HoloScriptPlusParser({ enableVRTraits: true }).parse(source);
  const incremental = (source: string) =>
    new HoloScriptPlusParser({ enableVRTraits: true }).parseIncremental(source, new ParseCache());
  /** Top-level blocks as [type, name, line], through the incremental tree's per-chunk wrappers. */
  const blocks = (ast: { children?: unknown[] }) =>
    (ast.children ?? [])
      .flatMap((child) => {
        const node = child as { type?: string; children?: unknown[] };
        return node.type === 'Program' ? (node.children ?? []) : [child];
      })
      .map((child) => {
        const node = child as {
          type?: string;
          name?: string;
          id?: string;
          loc?: { start?: { line?: number } };
        };
        return [node.type, node.name ?? node.id, node.loc?.start?.line];
      });
  const errorKeys = (errors: Array<{ line?: number; column?: number; code?: string }>) =>
    errors.map((error) => [error.line, error.column, error.code]);

  it('parses a document with a composition, struct or top-level function whole', () => {
    const composition = `composition "Main" {
  object "Cube" {
    geometry: "cube"
  }
}

orb "Lamp" {
  color: "red"
}
`;
    const result = incremental(composition);
    expect(result.success).toBe(true);
    expect(blocks(result.ast)).toEqual(blocks(full(composition).ast));
    expect(blocks(result.ast).map((block) => block[0])).toContain('composition');
    expect(
      (result as unknown as { incrementalMetrics: Record<string, unknown> }).incrementalMetrics
    ).toMatchObject({ wholeDocument: true, firstUncoveredLine: 1 });

    // A top-level typed function the checker refuses: reported, as a full parse reports it.
    const refused = 'function f(): i32 {\n  return missing(1)\n}\n';
    const refusedResult = incremental(refused);
    expect(refusedResult.success).toBe(false);
    expect(errorKeys(refusedResult.errors)).toEqual(errorKeys(full(refused).errors));
    expect(refusedResult.errors[0]).toMatchObject({ line: 2, column: 10, code: 'HS-NAME-002' });

    // Orbs alone are still parsed chunk by chunk.
    expect(
      (
        incremental('orb "A" {\n  color: "red"\n}\n') as unknown as {
          incrementalMetrics: Record<string, unknown>;
        }
      ).incrementalMetrics
    ).toMatchObject({ wholeDocument: false, firstUncoveredLine: null });
  });

  it('keeps a block whose string or comment holds a brace, with no error', () => {
    for (const source of [
      'orb "A" {\n  color: "}"\n}\n\norb "B" {\n  color: "red"\n}\n',
      'orb "A" {\n  /* } */\n  color: "blue"\n}\n\norb "B" {\n  color: "red"\n}\n',
    ]) {
      const result = incremental(source);
      expect(result.errors, source).toEqual([]);
      expect(result.success, source).toBe(true);
      expect(blocks(result.ast), source).toEqual(blocks(full(source).ast));
    }
  });

  it('leaves an error with no position at 0:0, as a full parse does', () => {
    // An unclosed function at the end of the second block: the parser gives one of its errors
    // no line. It read 4:0, the chunk offset added to nothing.
    const source = `orb "A" {
  color: "red"
}

orb "B" {
  function f(): i32 {
`;
    const fullErrors = errorKeys(full(source).errors);
    expect(fullErrors).toContainEqual([0, 0, 'HSP004']);
    expect(errorKeys(incremental(source).errors)).toEqual(fullErrors);
  });

  it('keeps both blocks when names share a first word, repeat, or are not ASCII', () => {
    const source = `orb "My Lamp" {
  color: "red"
}

orb "My Light" {
  color: "blue"
}

orb "灯" {
  color: "green"
}

orb "灯" {
  color: "white"
}
`;
    const result = incremental(source);
    expect(result.success).toBe(true);
    expect(blocks(result.ast)).toEqual(blocks(full(source).ast));
    expect(blocks(result.ast).map((block) => block[2])).toEqual([1, 5, 9, 13]);
  });
});
