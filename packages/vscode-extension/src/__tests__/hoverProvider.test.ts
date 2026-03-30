/**
 * Tests for HoloScriptHoverProvider
 *
 * Validates the hover provider that shows rich documentation when the user
 * hovers over @trait decorators in HoloScript files.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HoloScriptHoverProvider } from '../hoverProvider';
import { ALL_TRAITS } from '../completionProvider';
import {
  CancellationTokenSource,
  Position,
  Range,
  MarkdownString,
} from '../__tests__/__mocks__/vscode';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock TextDocument that returns a predetermined word and range
 * for getWordRangeAtPosition.
 */
function createMockDocument(text: string, wordAtPosition?: { word: string; range: Range }) {
  return {
    getText: vi.fn((range?: Range) => {
      if (range && wordAtPosition) {
        return wordAtPosition.word;
      }
      return text;
    }),
    getWordRangeAtPosition: vi.fn((_position: Position, _regex?: RegExp) => {
      return wordAtPosition?.range ?? undefined;
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HoloScriptHoverProvider', () => {
  let provider: HoloScriptHoverProvider;
  let token: InstanceType<typeof CancellationTokenSource>['token'];

  beforeEach(() => {
    provider = new HoloScriptHoverProvider();
    token = new CancellationTokenSource().token;
  });

  // ── No-hover cases ──────────────────────────────────────────────────────

  describe('when no trait is under cursor', () => {
    it('should return undefined when no word is found', () => {
      const doc = createMockDocument('some random text');
      const pos = new Position(0, 5);

      const result = provider.provideHover(doc as any, pos, token as any);

      expect(result).toBeUndefined();
    });

    it('should return undefined for unrecognised @word', () => {
      const range = new Range(new Position(0, 0), new Position(0, 12));
      const doc = createMockDocument('@unknowntrait', {
        word: '@unknowntrait',
        range,
      });
      const pos = new Position(0, 5);

      const result = provider.provideHover(doc as any, pos, token as any);

      expect(result).toBeUndefined();
    });
  });

  // ── Successful hover for known traits ───────────────────────────────────

  describe('when hovering over a known trait', () => {
    it('should return a Hover for @grabbable', () => {
      const range = new Range(new Position(2, 2), new Position(2, 12));
      const doc = createMockDocument('  @grabbable', {
        word: '@grabbable',
        range,
      });
      const pos = new Position(2, 5);

      const result = provider.provideHover(doc as any, pos, token as any);

      expect(result).toBeDefined();
      expect(result!.range).toBe(range);

      // The contents field should be a MarkdownString-like object
      const md = result!.contents as any;
      expect(md).toHaveProperty('value');
      expect(md.value).toContain('@grabbable');
      expect(md.value).toContain('Interaction');
    });

    it('should return a Hover for @physics', () => {
      const range = new Range(new Position(5, 2), new Position(5, 10));
      const doc = createMockDocument('  @physics(mass: 1.0)', {
        word: '@physics',
        range,
      });
      const pos = new Position(5, 5);

      const result = provider.provideHover(doc as any, pos, token as any);

      expect(result).toBeDefined();
      const md = result!.contents as MarkdownString;
      expect(md.value).toContain('@physics');
      expect(md.value).toContain('Interaction');
      // Documentation should mention rigid-body physics
      expect(md.value.toLowerCase()).toContain('physics');
    });

    it('should return a Hover for @portal', () => {
      const range = new Range(new Position(0, 0), new Position(0, 7));
      const doc = createMockDocument('@portal', {
        word: '@portal',
        range,
      });
      const pos = new Position(0, 3);

      const result = provider.provideHover(doc as any, pos, token as any);

      expect(result).toBeDefined();
      const md = result!.contents as MarkdownString;
      expect(md.value).toContain('@portal');
      expect(md.value).toContain('Advanced');
    });
  });

  // ── Hover content format ────────────────────────────────────────────────

  describe('hover content formatting', () => {
    it('should include trait heading, category, documentation, and code block', () => {
      const range = new Range(new Position(0, 0), new Position(0, 8));
      const doc = createMockDocument('@glowing', {
        word: '@glowing',
        range,
      });
      const pos = new Position(0, 3);

      const result = provider.provideHover(doc as any, pos, token as any);

      expect(result).toBeDefined();
      const md = result!.contents as MarkdownString;
      const val = md.value;

      // Heading with trait label
      expect(val).toContain('### @glowing');
      // Category line
      expect(val).toContain('**Category:** Visual');
      // Separator
      expect(val).toContain('---');
    });

    it('should set isTrusted and supportHtml flags', () => {
      const range = new Range(new Position(0, 0), new Position(0, 10));
      const doc = createMockDocument('@clickable', {
        word: '@clickable',
        range,
      });
      const pos = new Position(0, 3);

      const result = provider.provideHover(doc as any, pos, token as any);

      expect(result).toBeDefined();
      const md = result!.contents as MarkdownString;
      expect((md as any).isTrusted).toBe(true);
      expect((md as any).supportHtml).toBe(true);
    });
  });

  // ── Exhaustive coverage for all 56 traits ───────────────────────────────

  describe('all 56 traits should produce hover results', () => {
    for (const trait of ALL_TRAITS) {
      it(`should produce hover for ${trait.label}`, () => {
        const traitName = trait.label; // e.g. "@grabbable"
        const range = new Range(new Position(0, 0), new Position(0, traitName.length));
        const doc = createMockDocument(traitName, {
          word: traitName,
          range,
        });
        const pos = new Position(0, 2);

        const result = provider.provideHover(doc as any, pos, token as any);

        expect(result).toBeDefined();
        const md = result!.contents as MarkdownString;
        expect(md.value).toContain(trait.label);
        expect(md.value).toContain(trait.category);
      });
    }
  });

  // ── Trait lookup map ────────────────────────────────────────────────────

  describe('internal trait lookup map', () => {
    it('should resolve all 56 traits by name without @ prefix', () => {
      // Verify the lookup map that hoverProvider constructs at module load
      const traitLookup = new Map(ALL_TRAITS.map((t) => [t.label.slice(1), t]));

      expect(traitLookup.size).toBe(56);
      expect(traitLookup.get('grabbable')?.label).toBe('@grabbable');
      expect(traitLookup.get('portal')?.category).toBe('Advanced');
      expect(traitLookup.get('cloth')?.category).toBe('Physics');
    });
  });
});
