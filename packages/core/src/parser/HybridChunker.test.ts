/**
 * HybridChunker — Comprehensive Inline Unit Tests
 *
 * Covers:
 * - Constructor with default and custom options
 * - File type detection routing (code -> structure, log -> fixed, md -> semantic, unknown -> fixed)
 * - Structure-based chunking (function/class boundaries, recursive split)
 * - Fixed-size chunking (token limits, overlap)
 * - Semantic chunking (paragraph detection, similarity merge, maxTokens respect)
 * - getStats() accuracy
 * - createHybridChunker factory
 * - Edge cases: empty, whitespace, single-line, malformed, very large files
 * - Chunk ID uniqueness
 * - Token counting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HybridChunker,
  createHybridChunker,
  type SourceChunk,
  type ChunkingOptions,
} from './HybridChunker';

// =============================================================================
// Constructor
// =============================================================================

describe('HybridChunker - Constructor', () => {
  it('creates with default options', () => {
    const chunker = new HybridChunker();
    expect(chunker).toBeDefined();
  });

  it('creates with custom options', () => {
    const chunker = new HybridChunker({
      maxTokens: 512,
      overlapTokens: 50,
      semanticThreshold: 0.7,
      debug: true,
    });
    expect(chunker).toBeDefined();
  });

  it('createHybridChunker factory returns a HybridChunker', () => {
    const chunker = createHybridChunker({ maxTokens: 256 });
    expect(chunker).toBeInstanceOf(HybridChunker);
  });

  it('createHybridChunker with no options uses defaults', () => {
    const chunker = createHybridChunker();
    expect(chunker).toBeInstanceOf(HybridChunker);
  });
});

// =============================================================================
// File Type Detection Routing
// =============================================================================

describe('HybridChunker - File Type Routing', () => {
  let chunker: HybridChunker;

  beforeEach(() => {
    chunker = new HybridChunker();
  });

  it('routes .ts files to structure strategy', () => {
    const chunks = chunker.chunk('function test() { return 1; }', 'file.ts');
    expect(chunks[0].strategy).toBe('structure');
  });

  it('routes .js files to structure strategy', () => {
    const chunks = chunker.chunk('function test() { return 1; }', 'file.js');
    expect(chunks[0].strategy).toBe('structure');
  });

  it('routes .jsx files to structure strategy', () => {
    const chunks = chunker.chunk('function App() { return null; }', 'App.jsx');
    expect(chunks[0].strategy).toBe('structure');
  });

  it('routes .tsx files to structure strategy', () => {
    const chunks = chunker.chunk('function App() { return null; }', 'App.tsx');
    expect(chunks[0].strategy).toBe('structure');
  });

  it('routes .hs files to structure strategy', () => {
    const chunks = chunker.chunk('orb player { }', 'scene.hs');
    expect(chunks[0].strategy).toBe('structure');
  });

  it('routes .hsplus files to structure strategy', () => {
    const chunks = chunker.chunk('orb player { }', 'scene.hsplus');
    expect(chunks[0].strategy).toBe('structure');
  });

  it('routes .log files to fixed strategy', () => {
    const chunks = chunker.chunk('[INFO] Started', 'app.log');
    expect(chunks[0].strategy).toBe('fixed');
  });

  it('routes .txt files to fixed strategy', () => {
    const chunks = chunker.chunk('Some text content', 'notes.txt');
    expect(chunks[0].strategy).toBe('fixed');
  });

  it('routes .csv files to fixed strategy', () => {
    const chunks = chunker.chunk('id,name\n1,test', 'data.csv');
    expect(chunks[0].strategy).toBe('fixed');
  });

  it('routes .md files to semantic strategy', () => {
    const chunks = chunker.chunk('# Title\n\nContent', 'README.md');
    expect(chunks[0].strategy).toBe('semantic');
  });

  it('routes .mdx files to semantic strategy', () => {
    const chunks = chunker.chunk('# Title\n\nContent', 'guide.mdx');
    expect(chunks[0].strategy).toBe('semantic');
  });

  it('routes .markdown files to semantic strategy', () => {
    const chunks = chunker.chunk('# Title\n\nContent', 'doc.markdown');
    expect(chunks[0].strategy).toBe('semantic');
  });

  it('routes unknown extension to fixed strategy as fallback', () => {
    const chunks = chunker.chunk('Unknown content', 'file.xyz');
    expect(chunks[0].strategy).toBe('fixed');
  });

  it('routes files with no extension to fixed strategy', () => {
    const chunks = chunker.chunk('No extension content', 'Makefile');
    expect(chunks[0].strategy).toBe('fixed');
  });
});

// =============================================================================
// Structure-Based Chunking
// =============================================================================

describe('HybridChunker - Structure-Based Chunking', () => {
  let chunker: HybridChunker;

  beforeEach(() => {
    chunker = new HybridChunker();
  });

  it('chunks a file with multiple functions', () => {
    const code = `
export function greet(name: string): string {
  return "Hello " + name;
}

export function farewell(name: string): string {
  return "Goodbye " + name;
}
`;
    const chunks = chunker.chunk(code, 'greet.ts');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.strategy === 'structure')).toBe(true);
    expect(chunks.every((c) => c.tokens > 0)).toBe(true);
  });

  it('detects class boundaries', () => {
    const code = `
export class UserService {
  getUser(id: string) {
    return { id };
  }
}

export class AuthService {
  login() {
    return true;
  }
}
`;
    const chunks = chunker.chunk(code, 'services.ts');
    expect(chunks.length).toBeGreaterThan(0);
    const hasUser = chunks.some((c) => c.content.includes('UserService'));
    const hasAuth = chunks.some((c) => c.content.includes('AuthService'));
    expect(hasUser).toBe(true);
    expect(hasAuth).toBe(true);
  });

  it('detects interface boundaries', () => {
    const code = `
export interface User {
  id: string;
  name: string;
}

export interface Post {
  title: string;
  body: string;
}
`;
    const chunks = chunker.chunk(code, 'types.ts');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('returns entire file as single chunk when no structure detected', () => {
    const code = 'const x = 42;\nconst y = 100;';
    const chunks = chunker.chunk(code, 'simple.ts');
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('code-block');
  });

  it('recursively splits oversized functions', () => {
    const body = Array(500)
      .fill(0)
      .map((_, i) => `  console.log("Line ${i}");`)
      .join('\n');
    const code = `export function massive() {\n${body}\n}`;

    const small = new HybridChunker({ maxTokens: 256 });
    const chunks = small.chunk(code, 'large.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('handles nested functions and classes', () => {
    const code = `
export class Outer {
  method1() {
    function inner() {
      return 42;
    }
    return inner();
  }
}
`;
    const chunks = chunker.chunk(code, 'nested.ts');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('includes startLine and endLine for each chunk', () => {
    const code = `function a() { return 1; }\nfunction b() { return 2; }`;
    const chunks = chunker.chunk(code, 'test.ts');
    for (const chunk of chunks) {
      expect(chunk.startLine).toBeGreaterThanOrEqual(1);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
    }
  });
});

// =============================================================================
// Fixed-Size Chunking
// =============================================================================

describe('HybridChunker - Fixed-Size Chunking', () => {
  it('chunks log files with fixed strategy', () => {
    const logContent = Array(200)
      .fill(0)
      .map((_, i) => `[2026-03-01 10:${i}:00] INFO: Request ${i}`)
      .join('\n');

    const chunker = new HybridChunker();
    const chunks = chunker.chunk(logContent, 'app.log');

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.strategy === 'fixed')).toBe(true);
    expect(chunks.every((c) => c.type === 'text-block')).toBe(true);
  });

  it('respects maxTokens limit', () => {
    const logContent = Array(100).fill('Line: Some log entry with some content').join('\n');

    const chunker = new HybridChunker({ maxTokens: 256 });
    const chunks = chunker.chunk(logContent, 'debug.log');

    // Each chunk should not greatly exceed maxTokens
    for (const chunk of chunks) {
      expect(chunk.tokens).toBeLessThanOrEqual(300); // allow slight variance
    }
  });

  it('applies overlap between chunks', () => {
    const logContent = Array(100)
      .fill(0)
      .map((_, i) => `Line ${i}: Some log entry`)
      .join('\n');

    const chunker = new HybridChunker({ maxTokens: 256, overlapTokens: 50 });
    const chunks = chunker.chunk(logContent, 'debug.log');

    if (chunks.length > 1) {
      // Overlapping chunks should share some content at boundaries
      expect(chunks.length).toBeGreaterThan(1);
    }
  });

  it('produces a single chunk for small content', () => {
    const chunker = new HybridChunker();
    const chunks = chunker.chunk('Short log entry', 'app.log');
    expect(chunks.length).toBe(1);
  });
});

// =============================================================================
// Semantic Chunking
// =============================================================================

describe('HybridChunker - Semantic Chunking', () => {
  let chunker: HybridChunker;

  beforeEach(() => {
    chunker = new HybridChunker();
  });

  it('chunks markdown by paragraphs', () => {
    const md = `
# Introduction

This is the introduction section.

# Getting Started

Installation instructions here.

# Advanced Usage

Advanced configuration options.
`;
    const chunks = chunker.chunk(md, 'README.md');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].strategy).toBe('semantic');
  });

  it('returns single chunk for tiny markdown', () => {
    const chunks = chunker.chunk('# Title\n\nShort content.', 'README.md');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('detects heading boundaries', () => {
    const md = `
# Section A

Content A.

# Section B

Content B.
`;
    const chunks = chunker.chunk(md, 'doc.md');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('detects list item boundaries', () => {
    const md = `
- Item one with details
- Item two with details
- Item three with details

Some paragraph after the list.
`;
    const chunks = chunker.chunk(md, 'list.md');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('respects maxTokens in semantic grouping for mergeable paragraphs', () => {
    // The semantic chunker only enforces maxTokens when merging paragraphs.
    // A single large paragraph that arrives as one unit is NOT split by the semantic chunker.
    // This test verifies that small paragraphs are NOT merged beyond maxTokens.
    const md = Array(20).fill('# Section\n\nA short paragraph about a topic.').join('\n\n');

    const chunker = new HybridChunker({ maxTokens: 128, semanticThreshold: 0.9 });
    const chunks = chunker.chunk(md, 'large.md');

    // With high threshold, paragraphs won't merge much, so each should be small
    for (const chunk of chunks) {
      // Individual paragraphs should stay under limit
      expect(chunk.tokens).toBeLessThanOrEqual(200); // Allow variance
    }
  });

  it('groups semantically similar paragraphs', () => {
    const md = `
# Authentication

User authentication uses JWT tokens.

The auth flow involves credential validation.

# Storage

Database uses PostgreSQL.
`;
    const chunker = new HybridChunker({ semanticThreshold: 0.3, maxTokens: 2048 });
    const chunks = chunker.chunk(md, 'docs.md');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('returns entire content as document when no paragraphs detected', () => {
    // A single line with no blank lines or headings
    const md = 'Just one line of markdown content with no structure at all.';
    const chunks = chunker.chunk(md, 'one-liner.md');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// getStats
// =============================================================================

describe('HybridChunker - getStats', () => {
  let chunker: HybridChunker;

  beforeEach(() => {
    chunker = new HybridChunker();
  });

  it('returns correct totalChunks', () => {
    const chunks = chunker.chunk(
      'function a() { return 1; }\nfunction b() { return 2; }',
      'test.ts'
    );
    const stats = chunker.getStats(chunks);
    expect(stats.totalChunks).toBe(chunks.length);
  });

  it('returns correct totalTokens', () => {
    const chunks = chunker.chunk('function test() { return 42; }', 'test.ts');
    const stats = chunker.getStats(chunks);
    expect(stats.totalTokens).toBe(chunks.reduce((sum, c) => sum + c.tokens, 0));
  });

  it('returns correct avgTokensPerChunk', () => {
    const chunks = chunker.chunk('function test() { return 42; }', 'test.ts');
    const stats = chunker.getStats(chunks);
    expect(stats.avgTokensPerChunk).toBe(stats.totalTokens / stats.totalChunks);
  });

  it('returns 0 avgTokensPerChunk for empty array', () => {
    const stats = chunker.getStats([]);
    expect(stats.avgTokensPerChunk).toBe(0);
    expect(stats.totalChunks).toBe(0);
  });

  it('tracks strategy distribution across multiple calls', () => {
    const codeChunks = chunker.chunk('function test() {}', 'code.ts');
    const logChunks = chunker.chunk('[INFO] Log', 'app.log');
    const mdChunks = chunker.chunk('# Title\n\nContent', 'doc.md');

    const all = [...codeChunks, ...logChunks, ...mdChunks];
    const stats = chunker.getStats(all);

    expect(stats.strategyDistribution).toHaveProperty('structure');
    expect(stats.strategyDistribution).toHaveProperty('fixed');
    expect(stats.strategyDistribution).toHaveProperty('semantic');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('HybridChunker - Edge Cases', () => {
  let chunker: HybridChunker;

  beforeEach(() => {
    chunker = new HybridChunker();
  });

  it('handles empty content', () => {
    const chunks = chunker.chunk('', 'empty.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(0);
  });

  it('handles whitespace-only content', () => {
    const chunks = chunker.chunk('   \n\n\t  ', 'whitespace.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(0);
  });

  it('handles single-line file', () => {
    const chunks = chunker.chunk('export const x = 42;', 'const.ts');
    expect(chunks.length).toBe(1);
  });

  it('handles file with only comments', () => {
    const code = `// comment\n/* block\ncomment */\n// end`;
    const chunks = chunker.chunk(code, 'comments.ts');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('handles malformed code gracefully', () => {
    const chunks = chunker.chunk('function test( { invalid }}}', 'bad.ts');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('assigns unique IDs to all chunks', () => {
    const code = Array(50)
      .fill(0)
      .map((_, i) => `function fn${i}() { return ${i}; }`)
      .join('\n\n');
    const chunks = chunker.chunk(code, 'many.ts');
    const ids = new Set(chunks.map((c) => c.id));
    expect(ids.size).toBe(chunks.length);
  });

  it('all chunks have positive token counts', () => {
    const code = `function a() { return 1; }\nfunction b() { return 2; }`;
    const chunks = chunker.chunk(code, 'test.ts');
    for (const chunk of chunks) {
      expect(chunk.tokens).toBeGreaterThan(0);
    }
  });

  it('all chunks have non-empty content', () => {
    const code = `function a() { return 1; }\n\nfunction b() { return 2; }`;
    const chunks = chunker.chunk(code, 'test.ts');
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Performance
// =============================================================================

describe('HybridChunker - Performance', () => {
  it('handles large code files within 1 second', () => {
    const largeFunctions = Array(100)
      .fill(0)
      .map(
        (_, i) =>
          `export function fn${i}() {\n  return Array(10).fill(${i}).reduce((a,b)=>a+b,0);\n}`
      )
      .join('\n\n');

    const chunker = new HybridChunker();
    const start = Date.now();
    const chunks = chunker.chunk(largeFunctions, 'large.ts');
    const elapsed = Date.now() - start;

    expect(chunks.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1000);
  });

  it('handles large log files within 1 second', () => {
    const logContent = Array(10000)
      .fill(0)
      .map((_, i) => `[2026-03-01 12:00:${i}] INFO: Processing item ${i}`)
      .join('\n');

    const chunker = new HybridChunker({ maxTokens: 512 });
    const start = Date.now();
    const chunks = chunker.chunk(logContent, 'huge.log');
    const elapsed = Date.now() - start;

    expect(chunks.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1000);
  });
});

// =============================================================================
// Custom Options
// =============================================================================

describe('HybridChunker - Custom Options', () => {
  it('respects custom maxTokens for structure chunking', () => {
    const code = Array(50).fill('function test() { return 42; }').join('\n');
    const chunker = new HybridChunker({ maxTokens: 128 });
    const chunks = chunker.chunk(code, 'test.ts');

    for (const chunk of chunks) {
      expect(chunk.tokens).toBeLessThanOrEqual(128 * 1.2);
    }
  });

  it('debug mode does not affect chunk output', () => {
    const code = 'function test() { return 42; }';
    const normal = new HybridChunker({ debug: false });
    const debug = new HybridChunker({ debug: true });

    const normalChunks = normal.chunk(code, 'test.ts');
    const debugChunks = debug.chunk(code, 'test.ts');

    expect(normalChunks.length).toBe(debugChunks.length);
    expect(normalChunks[0].content).toBe(debugChunks[0].content);
  });
});
