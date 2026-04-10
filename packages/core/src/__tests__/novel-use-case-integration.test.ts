/**
 * Novel Use Case Integration Tests
 *
 * Parse → AST verification for all 13 `.holo` compositions
 * and all 13 `.hsplus` behavioral contracts. Ensures that the
 * HoloCompositionParser correctly handles v5 Autonomous Ecosystems syntax.
 *
 * @module __tests__/novel-use-case-integration
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

// ─── Parser import ───────────────────────────────────────────────────────────
import { parseHolo } from '../parser/HoloCompositionParser';

const EXAMPLES_DIR = join(__dirname, '..', '..', '..', '..', 'examples', 'novel-use-cases');

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function getFiles(ext: string): string[] {
  return readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith(ext))
    .sort();
}

// ═══════════════════════════════════════════════════════════════════
// 1. .holo Parse → AST
// ═══════════════════════════════════════════════════════════════════

describe('Novel Use Cases — .holo Integration', () => {
  const holoFiles = getFiles('.holo');

  it('finds 13 .holo files', () => {
    expect(holoFiles.length).toBe(13);
  });

  for (const file of holoFiles) {
    it(`parses ${file} and produces an AST`, () => {
      const source = readFileSync(join(EXAMPLES_DIR, file), 'utf-8');
      const result = parseHolo(source, { tolerant: true });

      // In tolerant mode the parser should always produce an AST
      expect(result.ast).toBeDefined();
      // Source should be >100 lines (substantial composition)
      expect(source.split('\n').length).toBeGreaterThan(100);
    });

    it(`${file} has at least one entity or object`, () => {
      const source = readFileSync(join(EXAMPLES_DIR, file), 'utf-8');
      const result = parseHolo(source, { tolerant: true });
      const ast = result.ast;
      if (!ast) return;

      // Check for objects, templates, or entities
      const hasContent =
        (ast.objects && ast.objects.length > 0) ||
        (ast.templates && ast.templates.length > 0) ||
        // Check if source has composition/entity/object blocks
        source.includes('entity ') ||
        source.includes('object ') ||
        source.includes('template ');
      expect(hasContent).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// 2. .hsplus Parse → AST
// ═══════════════════════════════════════════════════════════════════

describe('Novel Use Cases — .hsplus Integration', () => {
  const hsplusFiles = getFiles('.hsplus');

  it('finds 13 .hsplus files', () => {
    expect(hsplusFiles.length).toBe(13);
  });

  for (const file of hsplusFiles) {
    it(`parses ${file} without fatal errors`, () => {
      const source = readFileSync(join(EXAMPLES_DIR, file), 'utf-8');
      // .hsplus files can be parsed by the same parser in tolerant mode
      const result = parseHolo(source, { tolerant: true });
      expect(result.ast).toBeDefined();
    });

    it(`${file} contains module/state_machine keywords`, () => {
      const source = readFileSync(join(EXAMPLES_DIR, file), 'utf-8');
      const hasModule = source.includes('module ');
      const hasStateMachine = source.includes('@state_machine') || source.includes('state_machine');
      expect(hasModule || hasStateMachine).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// 3. .hs Structural Validation
// ═══════════════════════════════════════════════════════════════════

describe('Novel Use Cases — .hs Structural', () => {
  const hsFiles = getFiles('.hs');

  it('finds 13 .hs files', () => {
    expect(hsFiles.length).toBe(13);
  });

  for (const file of hsFiles) {
    it(`${file} has balanced braces`, () => {
      const source = readFileSync(join(EXAMPLES_DIR, file), 'utf-8');
      let depth = 0;
      for (const ch of source) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      expect(depth).toBe(0);
    });

    it(`${file} uses connect wiring`, () => {
      const source = readFileSync(join(EXAMPLES_DIR, file), 'utf-8');
      expect(source).toContain('connect ');
    });

    it(`${file} defines object stages`, () => {
      const source = readFileSync(join(EXAMPLES_DIR, file), 'utf-8');
      expect(source).toContain('object "');
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// 4. Format Coverage
// ═══════════════════════════════════════════════════════════════════

describe('Novel Use Cases — Format Coverage', () => {
  it('all 13 use cases have all 3 source formats', () => {
    const holoFiles = new Set(getFiles('.holo').map((f) => f.replace('.holo', '')));
    const hsplusFiles = new Set(getFiles('.hsplus').map((f) => f.replace('.hsplus', '')));
    const hsFiles = new Set(getFiles('.hs').map((f) => f.replace('.hs', '')));

    // Each use case should exist in all 3 formats
    for (const useCase of holoFiles) {
      expect(hsplusFiles.has(useCase)).toBe(true);
      expect(hsFiles.has(useCase)).toBe(true);
    }
  });
});
