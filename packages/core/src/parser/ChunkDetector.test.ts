/**
 * ChunkDetector — Comprehensive Inline Unit Tests
 *
 * Covers:
 * - detect() static method:
 *   - orb blocks (named, quoted, hash-prefixed)
 *   - template blocks
 *   - environment blocks
 *   - logic blocks
 *   - directive blocks (single-line and multi-line)
 *   - multiple chunks in sequence
 *   - skipping comments and empty lines
 *   - unclosed chunk at EOF
 *   - empty/blank source input
 *   - nested braces
 *   - Windows-style line endings (\r\n)
 * - detectHybrid() static method:
 *   - routes to HybridChunker
 *   - maps chunk types
 *   - accepts custom options and filePath
 * - mapChunkType() (indirectly via detectHybrid)
 */

import { describe, it, expect } from 'vitest';
import { ChunkDetector, type SourceChunk } from './ChunkDetector';

// =============================================================================
// detect() - Orb Blocks
// =============================================================================

describe('ChunkDetector.detect - Orb Blocks', () => {
  it('detects a simple named orb', () => {
    const source = `orb MyCube {
  position: [0, 1, 0]
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('orb');
    expect(chunks[0].name).toBe('MyCube');
    expect(chunks[0].id).toBe('orb:MyCube');
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(3);
  });

  it('detects a quoted orb name (regex captures up to first space)', () => {
    // The regex ^orb\s+([a-zA-Z0-9_#"]+) captures "Player from 'orb "Player" {...}'
    // After stripping quotes, the name is 'Player'
    const source = `orb "Player" {
  health: 100
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('orb');
    expect(chunks[0].name).toBe('Player');
  });

  it('detects a hash-prefixed orb name', () => {
    const source = `orb #MainCamera {
  fov: 90
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('orb');
    expect(chunks[0].name).toBe('MainCamera');
  });

  it('captures full orb content including nested braces', () => {
    const source = `orb Complex {
  position: [0, 0, 0]
  nested: {
    inner: true
  }
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain('nested');
    expect(chunks[0].content).toContain('inner');
    expect(chunks[0].endLine).toBe(6);
  });
});

// =============================================================================
// detect() - Template Blocks
// =============================================================================

describe('ChunkDetector.detect - Template Blocks', () => {
  it('detects a template block', () => {
    const source = `template "Enemy" {
  health: 100
  damage: 10
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('template');
    expect(chunks[0].name).toBe('Enemy');
    expect(chunks[0].id).toBe('template:Enemy');
  });

  it('detects template with complex content', () => {
    const source = `template "Weapon" {
  stats: {
    damage: 50
    range: 10
  }
  effects: ["fire", "ice"]
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('template');
    expect(chunks[0].content).toContain('damage: 50');
  });
});

// =============================================================================
// detect() - Environment Blocks
// =============================================================================

describe('ChunkDetector.detect - Environment Blocks', () => {
  it('detects an environment block', () => {
    const source = `environment {
  skybox: "sky_day"
  lighting: "dynamic"
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('environment');
    expect(chunks[0].id).toContain('environment:');
  });
});

// =============================================================================
// detect() - Logic Blocks
// =============================================================================

describe('ChunkDetector.detect - Logic Blocks', () => {
  it('detects a logic block', () => {
    const source = `logic {
  on_event { doSomething() }
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('logic');
    expect(chunks[0].id).toContain('logic:');
  });
});

// =============================================================================
// detect() - Directives
// =============================================================================

describe('ChunkDetector.detect - Directives', () => {
  it('detects a single-line directive', () => {
    const source = `@import "other.holo"`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('directive');
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(1);
  });

  it('detects a multi-line directive block', () => {
    const source = `@config {
  version: "2.0"
  strict: true
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('directive');
    expect(chunks[0].endLine).toBe(4);
  });

  it('detects multiple directives', () => {
    const source = `@import "a.holo"
@import "b.holo"`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(2);
    expect(chunks[0].type).toBe('directive');
    expect(chunks[1].type).toBe('directive');
  });
});

// =============================================================================
// detect() - Multiple Chunks
// =============================================================================

describe('ChunkDetector.detect - Multiple Chunks', () => {
  it('detects multiple chunks in sequence', () => {
    const source = `orb A {
  x: 1
}

template "B" {
  y: 2
}

environment {
  z: 3
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(3);
    expect(chunks[0].type).toBe('orb');
    expect(chunks[1].type).toBe('template');
    expect(chunks[2].type).toBe('environment');
  });

  it('detects mixed directives and blocks', () => {
    const source = `@import "lib.holo"

orb Player {
  health: 100
}

logic {
  update() { }
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(3);
    expect(chunks[0].type).toBe('directive');
    expect(chunks[1].type).toBe('orb');
    expect(chunks[2].type).toBe('logic');
  });

  it('assigns correct startLine and endLine to each chunk', () => {
    const source = `orb A {
  x: 1
}

orb B {
  y: 2
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(3);
    expect(chunks[1].startLine).toBe(5);
    expect(chunks[1].endLine).toBe(7);
  });
});

// =============================================================================
// detect() - Comments and Blank Lines
// =============================================================================

describe('ChunkDetector.detect - Comments and Blank Lines', () => {
  it('skips comment lines outside chunks', () => {
    const source = `// This is a comment

orb Test {
  value: 1
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].name).toBe('Test');
  });

  it('skips empty lines between chunks', () => {
    const source = `

orb A {
  x: 1
}


orb B {
  y: 2
}

`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(2);
  });

  it('returns empty array for empty source', () => {
    expect(ChunkDetector.detect('')).toEqual([]);
  });

  it('returns empty array for comment-only source', () => {
    expect(ChunkDetector.detect('// just comments')).toEqual([]);
  });

  it('returns empty array for blank-line-only source', () => {
    expect(ChunkDetector.detect('\n\n\n')).toEqual([]);
  });
});

// =============================================================================
// detect() - Unclosed Chunks
// =============================================================================

describe('ChunkDetector.detect - Unclosed Chunks', () => {
  it('handles unclosed brace at EOF', () => {
    const source = `orb Broken {
  missing_close: true`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].endLine).toBe(2);
  });

  it('handles deeply nested unclosed brace', () => {
    const source = `orb Nested {
  outer: {
    inner: {
      deep: true`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].name).toBe('Nested');
  });
});

// =============================================================================
// detect() - Line Ending Handling
// =============================================================================

describe('ChunkDetector.detect - Line Endings', () => {
  it('handles Windows-style \\r\\n line endings', () => {
    const source = 'orb WinOrb {\r\n  color: "blue"\r\n}';
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('orb');
    expect(chunks[0].name).toBe('WinOrb');
  });

  it('handles mixed line endings', () => {
    const source = 'orb Mixed {\n  x: 1\r\n  y: 2\n}';
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
  });
});

// =============================================================================
// detect() - Edge Cases
// =============================================================================

describe('ChunkDetector.detect - Edge Cases', () => {
  it('handles orb with no properties (empty block)', () => {
    const source = 'orb Empty {}';
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].name).toBe('Empty');
  });

  it('handles single-line orb definition', () => {
    const source = 'orb Compact { color: "red" }';
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(1);
  });

  it('handles many chunks without issue', () => {
    const orbs = Array.from({ length: 50 }, (_, i) => `orb O${i} {\n  v: ${i}\n}`).join('\n\n');
    const chunks = ChunkDetector.detect(orbs);
    expect(chunks.length).toBe(50);
  });

  it('each chunk has a unique id', () => {
    const source = `orb A { x: 1 }

template "B" { y: 2 }

environment { z: 3 }

logic { w: 4 }`;
    const chunks = ChunkDetector.detect(source);
    const ids = new Set(chunks.map((c) => c.id));
    expect(ids.size).toBe(chunks.length);
  });

  it('chunk content includes all lines of the block', () => {
    const source = `orb Detailed {
  prop1: "a"
  prop2: "b"
  prop3: "c"
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks[0].content).toContain('prop1');
    expect(chunks[0].content).toContain('prop2');
    expect(chunks[0].content).toContain('prop3');
  });
});

// =============================================================================
// detectHybrid()
// =============================================================================

describe('ChunkDetector.detectHybrid', () => {
  it('returns an array of SourceChunk objects', () => {
    const source = `function test() { return 42; }`;
    const chunks = ChunkDetector.detectHybrid(source, 'test.ts');
    expect(Array.isArray(chunks)).toBe(true);
    for (const chunk of chunks) {
      expect(chunk).toHaveProperty('id');
      expect(chunk).toHaveProperty('type');
      expect(chunk).toHaveProperty('startLine');
      expect(chunk).toHaveProperty('endLine');
      expect(chunk).toHaveProperty('content');
    }
  });

  it('uses default .hsplus file path if none provided', () => {
    const source = `function test() { return 1; }`;
    const chunks = ChunkDetector.detectHybrid(source);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('accepts custom ChunkingOptions', () => {
    const source = Array(50).fill('function f() { return 1; }').join('\n');
    const chunks = ChunkDetector.detectHybrid(source, 'test.ts', { maxTokens: 128 });
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('maps chunk types to ChunkDetector types', () => {
    const source = `function test() { return 1; }`;
    const chunks = ChunkDetector.detectHybrid(source, 'test.ts');
    for (const chunk of chunks) {
      expect(['orb', 'template', 'environment', 'logic', 'directive', 'unknown']).toContain(
        chunk.type
      );
    }
  });

  it('includes tokens and strategy from HybridChunker', () => {
    const source = `function test() { return 1; }`;
    const chunks = ChunkDetector.detectHybrid(source, 'test.ts');
    for (const chunk of chunks) {
      expect(chunk.tokens).toBeGreaterThan(0);
      expect(['structure', 'fixed', 'semantic']).toContain(chunk.strategy);
    }
  });

  it('routes .md files to semantic strategy', () => {
    const source = '# Title\n\nContent paragraph.';
    const chunks = ChunkDetector.detectHybrid(source, 'doc.md');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].strategy).toBe('semantic');
  });

  it('routes .log files to fixed strategy', () => {
    const source = '[INFO] Log entry';
    const chunks = ChunkDetector.detectHybrid(source, 'app.log');
    expect(chunks[0].strategy).toBe('fixed');
  });

  it('handles empty source', () => {
    const chunks = ChunkDetector.detectHybrid('', 'empty.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(0);
  });
});
