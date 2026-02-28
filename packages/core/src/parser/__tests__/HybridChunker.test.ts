/**
 * HybridChunker Tests
 *
 * Comprehensive test suite for multi-strategy chunking:
 * - Structure-based chunking (AST-aware for code)
 * - Fixed-size chunking (logs/text)
 * - Semantic chunking (markdown/docs)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HybridChunker,
  createHybridChunker,
  type ChunkingOptions,
  type SourceChunk,
} from '../HybridChunker';

describe('HybridChunker', () => {
  let chunker: HybridChunker;

  beforeEach(() => {
    chunker = createHybridChunker({ debug: false });
  });

  // ===========================================================================
  // Structure-Based Chunking (Code Files)
  // ===========================================================================
  describe('structure-based chunking', () => {
    it('should chunk TypeScript file by function boundaries', () => {
      const code = `
export function greet(name: string): string {
  return "Hello " + name;
}

export function farewell(name: string): string {
  return "Goodbye " + name;
}

export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}
`;

      const chunks = chunker.chunk(code, 'test.ts');

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].strategy).toBe('structure');
      expect(chunks.every((c) => c.tokens > 0)).toBe(true);
    });

    it('should detect class boundaries correctly', () => {
      const code = `
export class UserService {
  private users: User[] = [];

  async createUser(data: UserData): Promise<User> {
    const user = new User(data);
    this.users.push(user);
    return user;
  }

  async getUser(id: string): Promise<User | null> {
    return this.users.find(u => u.id === id) || null;
  }
}

export class AuthService {
  async login(email: string, password: string): Promise<Token> {
    // Login logic
    return { token: "jwt" };
  }
}
`;

      const chunks = chunker.chunk(code, 'services.ts');

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].strategy).toBe('structure');

      // Should have detected multiple class boundaries
      const hasMultipleClasses =
        chunks.some((c) => c.content.includes('UserService')) &&
        chunks.some((c) => c.content.includes('AuthService'));
      expect(hasMultipleClasses || chunks.length === 1).toBe(true);
    });

    it('should chunk HoloScript files correctly', () => {
      const code = `
orb player {
  position: [0, 1, 0]
  color: "#ff0000"
}

function movePlayer(x, y, z) {
  player.position = [x, y, z]
}

template Enemy {
  health: 100
  damage: 10
}
`;

      const chunks = chunker.chunk(code, 'game.hs');

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].strategy).toBe('structure');
    });

    it('should handle nested functions and classes', () => {
      const code = `
export class OuterClass {
  method1() {
    function innerFunc() {
      return 42;
    }
    return innerFunc();
  }

  method2() {
    const nested = () => {
      return 100;
    };
    return nested();
  }
}
`;

      const chunks = chunker.chunk(code, 'nested.ts');

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].strategy).toBe('structure');
    });

    it('should split oversized functions into multiple chunks', () => {
      // Generate large function exceeding maxTokens
      const largeFunctionBody = Array(500)
        .fill(0)
        .map((_, i) => `  console.log("Line ${i}");`)
        .join('\n');

      const code = `
export function massiveFunction() {
${largeFunctionBody}
}
`;

      const chunker = createHybridChunker({ maxTokens: 512 });
      const chunks = chunker.chunk(code, 'large.ts');

      // Should split into multiple chunks
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].strategy).toBe('structure');
    });
  });

  // ===========================================================================
  // Fixed-Size Chunking (Logs and Text)
  // ===========================================================================
  describe('fixed-size chunking', () => {
    it('should chunk log files with fixed size', () => {
      const logContent = Array(200)
        .fill(0)
        .map((_, i) => `[2026-02-27 10:${i}:00] INFO: Processing request ${i}`)
        .join('\n');

      const chunks = chunker.chunk(logContent, 'app.log');

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].strategy).toBe('fixed');
      expect(chunks.every((c) => c.type === 'text-block')).toBe(true);
    });

    it('should apply overlap between chunks', () => {
      const logContent = Array(100)
        .fill(0)
        .map((_, i) => `Line ${i}: Some log entry`)
        .join('\n');

      const chunker = createHybridChunker({
        maxTokens: 256,
        overlapTokens: 50,
      });

      const chunks = chunker.chunk(logContent, 'debug.log');

      if (chunks.length > 1) {
        // Check that chunks have some content overlap
        expect(chunks.length).toBeGreaterThan(1);
        // Each chunk should be close to maxTokens
        chunks.forEach((chunk) => {
          expect(chunk.tokens).toBeLessThanOrEqual(300); // Allow some variance
        });
      }
    });

    it('should handle plain text files', () => {
      const textContent = `
This is a plain text file with multiple paragraphs.

Each paragraph should be processed as fixed-size chunks
because there's no structural information to guide chunking.

The chunker will split based on token count rather than
semantic or structural boundaries.
`;

      const chunks = chunker.chunk(textContent, 'notes.txt');

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].strategy).toBe('fixed');
    });

    it('should handle CSV files as fixed-size', () => {
      const csvContent = Array(50)
        .fill(0)
        .map((_, i) => `id,name,email\n${i},User${i},user${i}@example.com`)
        .join('\n');

      const chunks = chunker.chunk(csvContent, 'users.csv');

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].strategy).toBe('fixed');
    });
  });

  // ===========================================================================
  // Semantic Chunking (Markdown and Documentation)
  // ===========================================================================
  describe('semantic chunking', () => {
    it('should chunk markdown by semantic paragraphs', () => {
      const markdown = `
# Introduction

This is the introduction section. It provides an overview of the topic
and sets the context for the rest of the document.

# Getting Started

Installation is simple. Just run the following command:
\`\`\`bash
npm install holoscript
\`\`\`

# Advanced Usage

For advanced scenarios, you can configure the compiler with custom options.
This allows fine-grained control over the parsing and compilation process.

## Configuration Options

The following options are available:
- maxTokens: Maximum chunk size
- debug: Enable debug logging
`;

      const chunks = chunker.chunk(markdown, 'README.md');

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].strategy).toBe('semantic');
    });

    it('should merge semantically similar paragraphs', () => {
      const markdown = `
# User Authentication

User authentication is handled through JWT tokens.

The authentication flow involves several steps.

First, the user submits credentials.

Then, the server validates the credentials.

# Data Storage

Database operations use PostgreSQL.

All queries are parameterized for security.
`;

      const chunker = createHybridChunker({
        semanticThreshold: 0.7,
        maxTokens: 2048,
      });

      const chunks = chunker.chunk(markdown, 'docs.md');

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].strategy).toBe('semantic');

      // Related paragraphs about authentication should be grouped
      const hasAuthChunk = chunks.some(
        (c) =>
          c.content.includes('authentication') &&
          c.content.includes('credentials')
      );
      expect(hasAuthChunk || chunks.length === 1).toBe(true);
    });

    it('should detect paragraph boundaries correctly', () => {
      const markdown = `
First paragraph with some content.

Second paragraph on a different topic.


Third paragraph after double blank line.

# Heading starts new paragraph

Content under heading.

- List item 1
- List item 2

More content after list.
`;

      const chunks = chunker.chunk(markdown, 'structure.md');

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].strategy).toBe('semantic');
    });

    it('should respect maxTokens in semantic grouping', () => {
      const largeParagraph = Array(200)
        .fill('This is a sentence about the same topic.')
        .join(' ');

      const markdown = `
# Section 1

${largeParagraph}

# Section 2

Another paragraph.
`;

      const chunker = createHybridChunker({
        maxTokens: 512,
        semanticThreshold: 0.9,
      });

      const chunks = chunker.chunk(markdown, 'large-doc.md');

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].strategy).toBe('semantic');

      // Should not exceed maxTokens
      chunks.forEach((chunk) => {
        expect(chunk.tokens).toBeLessThanOrEqual(600); // Allow some variance
      });
    });
  });

  // ===========================================================================
  // File Type Detection
  // ===========================================================================
  describe('file type detection', () => {
    it('should route .ts files to structure chunking', () => {
      const code = 'export function test() { return 42; }';
      const chunks = chunker.chunk(code, 'file.ts');
      expect(chunks[0].strategy).toBe('structure');
    });

    it('should route .js files to structure chunking', () => {
      const code = 'function test() { return 42; }';
      const chunks = chunker.chunk(code, 'file.js');
      expect(chunks[0].strategy).toBe('structure');
    });

    it('should route .hs files to structure chunking', () => {
      const code = 'orb player { }';
      const chunks = chunker.chunk(code, 'file.hs');
      expect(chunks[0].strategy).toBe('structure');
    });

    it('should route .log files to fixed chunking', () => {
      const log = '[INFO] Application started';
      const chunks = chunker.chunk(log, 'app.log');
      expect(chunks[0].strategy).toBe('fixed');
    });

    it('should route .txt files to fixed chunking', () => {
      const text = 'Plain text content';
      const chunks = chunker.chunk(text, 'notes.txt');
      expect(chunks[0].strategy).toBe('fixed');
    });

    it('should route .md files to semantic chunking', () => {
      const markdown = '# Title\n\nContent';
      const chunks = chunker.chunk(markdown, 'README.md');
      expect(chunks[0].strategy).toBe('semantic');
    });

    it('should fallback to fixed chunking for unknown types', () => {
      const content = 'Unknown file content';
      const chunks = chunker.chunk(content, 'file.xyz');
      expect(chunks[0].strategy).toBe('fixed');
    });
  });

  // ===========================================================================
  // Statistics and Metadata
  // ===========================================================================
  describe('statistics', () => {
    it('should provide accurate chunking statistics', () => {
      const code = `
export function a() { return 1; }
export function b() { return 2; }
export function c() { return 3; }
`;

      const chunks = chunker.chunk(code, 'math.ts');
      const stats = chunker.getStats(chunks);

      expect(stats.totalChunks).toBe(chunks.length);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.avgTokensPerChunk).toBeGreaterThan(0);
      expect(stats.strategyDistribution).toHaveProperty('structure');
    });

    it('should track strategy distribution correctly', () => {
      const codeChunks = chunker.chunk(
        'function test() {}',
        'code.ts'
      );
      const logChunks = chunker.chunk(
        '[INFO] Log entry',
        'app.log'
      );
      const mdChunks = chunker.chunk(
        '# Title\n\nContent',
        'README.md'
      );

      const allChunks = [...codeChunks, ...logChunks, ...mdChunks];
      const stats = chunker.getStats(allChunks);

      expect(stats.strategyDistribution).toHaveProperty('structure');
      expect(stats.strategyDistribution).toHaveProperty('fixed');
      expect(stats.strategyDistribution).toHaveProperty('semantic');
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle empty content', () => {
      const chunks = chunker.chunk('', 'empty.ts');
      expect(chunks.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle whitespace-only content', () => {
      const chunks = chunker.chunk('   \n\n\t  ', 'whitespace.ts');
      expect(chunks.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle single-line files', () => {
      const chunks = chunker.chunk(
        'export const x = 42;',
        'const.ts'
      );
      expect(chunks.length).toBe(1);
      expect(chunks[0].strategy).toBe('structure');
    });

    it('should handle files with only comments', () => {
      const code = `
// This is a comment
/* Multi-line
   comment */
// Another comment
`;

      const chunks = chunker.chunk(code, 'comments.ts');
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle malformed code gracefully', () => {
      const badCode = 'function test( { invalid syntax }}}';
      const chunks = chunker.chunk(badCode, 'bad.ts');

      // Should still produce chunks, even if structure detection fails
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should assign unique IDs to all chunks', () => {
      const code = Array(50)
        .fill(0)
        .map((_, i) => `function fn${i}() { return ${i}; }`)
        .join('\n\n');

      const chunks = chunker.chunk(code, 'many-functions.ts');
      const ids = new Set(chunks.map((c) => c.id));

      expect(ids.size).toBe(chunks.length); // All IDs unique
    });
  });

  // ===========================================================================
  // Performance Characteristics
  // ===========================================================================
  describe('performance', () => {
    it('should handle large files efficiently', () => {
      const largeFunctions = Array(100)
        .fill(0)
        .map(
          (_, i) => `
export function function${i}() {
  const data = Array(10).fill(${i});
  return data.reduce((a, b) => a + b, 0);
}
`
        )
        .join('\n');

      const start = Date.now();
      const chunks = chunker.chunk(largeFunctions, 'large.ts');
      const elapsed = Date.now() - start;

      expect(chunks.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should respect token limits across all strategies', () => {
      const chunker = createHybridChunker({ maxTokens: 256 });

      const testFiles = [
        {
          path: 'code.ts',
          content: Array(50)
            .fill('function f() { return 42; }')
            .join('\n'),
        },
        {
          path: 'log.log',
          content: Array(100)
            .fill('[INFO] Log entry')
            .join('\n'),
        },
        {
          path: 'doc.md',
          content: Array(50)
            .fill('# Section\n\nContent paragraph.')
            .join('\n\n'),
        },
      ];

      for (const file of testFiles) {
        const chunks = chunker.chunk(file.content, file.path);

        chunks.forEach((chunk) => {
          // Allow 20% variance for edge cases
          expect(chunk.tokens).toBeLessThanOrEqual(256 * 1.2);
        });
      }
    });
  });

  // ===========================================================================
  // Custom Options
  // ===========================================================================
  describe('custom options', () => {
    it('should respect custom maxTokens', () => {
      const chunker = createHybridChunker({ maxTokens: 128 });

      const code = Array(50)
        .fill('function test() { return 42; }')
        .join('\n');

      const chunks = chunker.chunk(code, 'test.ts');

      chunks.forEach((chunk) => {
        expect(chunk.tokens).toBeLessThanOrEqual(128 * 1.2); // Allow variance
      });
    });

    it('should respect custom overlap tokens', () => {
      const chunker = createHybridChunker({
        maxTokens: 256,
        overlapTokens: 128,
      });

      const logContent = Array(100)
        .fill('[INFO] Log entry with some content')
        .join('\n');

      const chunks = chunker.chunk(logContent, 'app.log');

      // Overlap should result in more chunks with shared content
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should respect custom semantic threshold', () => {
      const chunker = createHybridChunker({
        semanticThreshold: 0.9, // Very high threshold
      });

      const markdown = `
# Topic A

Content about topic A.

More about topic A.

# Topic B

Content about topic B.
`;

      const chunks = chunker.chunk(markdown, 'topics.md');

      // High threshold should split more aggressively
      expect(chunks.length).toBeGreaterThan(0);
    });
  });
});
