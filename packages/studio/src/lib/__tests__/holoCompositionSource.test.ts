/**
 * isHoloCompositionSource decides which parser Studio uses for text that has no
 * file name. It must say "composition" for a composition that opens with comments
 * or blank lines (most .holo files do), keep saying it for text that starts with
 * `composition`, and never say it for .hsplus text, even text that mentions
 * composition further down.
 *
 * The "agreement" block holds it to the real .holo lexer: across every mix of the
 * leading whitespace and comments it claims to skip, it must agree with the
 * lexer's first token, and it may never answer "composition" where the lexer
 * does not.
 *
 * parseSceneSource is the choice built on it. .hsplus has composition blocks too,
 * so a composition the composition parser rejects but the .hsplus parser accepts
 * keeps its .hsplus reading.
 */
import { describe, it, expect } from 'vitest';
import { tokenizeHoloSource } from '../../../../core/src/parser/HoloCompositionParser';
import { isHoloCompositionSource, parseSceneSource } from '../holoCompositionSource';

const COMPOSITION = `composition "Room" {
  object "Lamp" { geometry: "sphere" position: [0, 2, 0] }
}`;

const HSPLUS = `orb lamp {
  position: [0, 2, 0]
  @glowing
}`;

describe('isHoloCompositionSource', () => {
  describe('the cases Studio got wrong or must keep', () => {
    it('sees a composition after a leading // comment', () => {
      expect(isHoloCompositionSource(`// A small room\n${COMPOSITION}`)).toBe(true);
    });

    it('sees a composition after a leading block comment', () => {
      expect(
        isHoloCompositionSource(`/* A small room,\n   written by hand. */\n${COMPOSITION}`)
      ).toBe(true);
    });

    it('sees a composition after blank lines', () => {
      expect(isHoloCompositionSource(`\n\n   \n\t${COMPOSITION}`)).toBe(true);
    });

    it('sees a composition that starts with the keyword', () => {
      expect(isHoloCompositionSource(COMPOSITION)).toBe(true);
    });

    it('does not see a composition in .hsplus', () => {
      expect(isHoloCompositionSource(HSPLUS)).toBe(false);
    });

    it('does not see a composition in .hsplus that mentions composition later', () => {
      expect(
        isHoloCompositionSource(
          `// composition notes live elsewhere\n${HSPLUS}\ncomposition "Later" {}\n`
        )
      ).toBe(false);
    });
  });

  describe('comments, exactly as the lexer reads them', () => {
    it('skips several comments and blank lines in a row, with Windows line endings', () => {
      expect(
        isHoloCompositionSource(
          `// one\r\n\r\n/* two */ /* three\r\n */\r\n// four\r\n${COMPOSITION}`
        )
      ).toBe(true);
    });

    it('does not end a line comment at a lone carriage return (the lexer does not)', () => {
      expect(isHoloCompositionSource(`// old Mac line ending\r${COMPOSITION}`)).toBe(false);
    });

    it('treats a line comment with no line ending as running to the end', () => {
      expect(isHoloCompositionSource('// composition "Room" {}')).toBe(false);
    });

    it('treats an unclosed block comment as running to the end', () => {
      expect(isHoloCompositionSource(`/* never closed\n${COMPOSITION}`)).toBe(false);
    });

    it('does not let the opening star also close a block comment', () => {
      expect(isHoloCompositionSource(`/*/ still inside */ ${COMPOSITION}`)).toBe(true);
      expect(isHoloCompositionSource(`/*/ ${COMPOSITION}`)).toBe(false);
    });

    it('skips a byte-order mark and non-breaking spaces, as the old trimStart did', () => {
      expect(isHoloCompositionSource(`﻿ ${COMPOSITION}`)).toBe(true);
    });
  });

  describe('the keyword, exactly as the lexer reads it', () => {
    it('accepts it in any letter case, like the lexer keyword lookup', () => {
      expect(isHoloCompositionSource('Composition "Room" {}')).toBe(true);
      expect(isHoloCompositionSource('COMPOSITION "Room" {}')).toBe(true);
    });

    it('accepts it with nothing or punctuation right after it', () => {
      expect(isHoloCompositionSource('composition')).toBe(true);
      expect(isHoloCompositionSource('composition{}')).toBe(true);
      expect(isHoloCompositionSource('composition"Room"{}')).toBe(true);
    });

    it('rejects a longer word that only starts with it', () => {
      expect(isHoloCompositionSource('compositions "Room" {}')).toBe(false);
      expect(isHoloCompositionSource('composition_2 {}')).toBe(false);
      expect(isHoloCompositionSource('compositionRoot {}')).toBe(false);
    });
  });

  describe('text the lexer does not treat as a comment', () => {
    it('does not skip a # line or a #! shebang', () => {
      expect(isHoloCompositionSource(`# Example\n${COMPOSITION}`)).toBe(false);
      expect(isHoloCompositionSource(`#!/usr/bin/env holo\n${COMPOSITION}`)).toBe(false);
    });

    it('does not skip an import statement', () => {
      expect(isHoloCompositionSource(`import "./shared.holo"\n${COMPOSITION}`)).toBe(false);
    });

    it('returns false for empty or blank text', () => {
      expect(isHoloCompositionSource('')).toBe(false);
      expect(isHoloCompositionSource(' \n\t ')).toBe(false);
    });
  });

  describe('agreement with the real .holo lexer', () => {
    /** What HoloCompositionParser.parse checks: is the first non-newline token `composition`? */
    function lexerSeesComposition(source: string): boolean {
      const first = tokenizeHoloSource(source).find((token) => token.type !== 'NEWLINE');
      return first?.type === 'COMPOSITION';
    }

    // Pieces the helper claims to skip. Some only close or open a comment, so that
    // mixing them also checks where comments begin and end.
    const SKIPPABLE = [
      ' ',
      '\t',
      '\n',
      '\r\n',
      '\r',
      '\v',
      '\f',
      ' ',
      '﻿',
      ' ',
      '// note\n',
      '// note\r',
      '// note',
      '//\n',
      '/* note */',
      '/* two\nlines */',
      '/**/',
      '/*/ inside */',
      '/* // inside */',
      '// /* inside\n',
      '/* open',
      ' */',
    ];

    // Pieces the lexer turns into tokens (or silently drops) that the helper stops at.
    const NOT_SKIPPED = [
      '#',
      '#!/usr/bin/env holo\n',
      'import "a.holo"\n',
      '$',
      '%',
      '\\',
      '~',
      'é',
    ];

    const HEADS = [
      'composition "S" {}',
      'composition',
      'composition{}',
      'Composition "S" {}',
      'COMPOSITION "S" {}',
      'compositions "S" {}',
      'composition_2 {}',
      'composition2 {}',
      'composition-x',
      'composition.x',
      'object "a" {}',
      'orb a {}',
      '@world {}',
      '"composition"',
      '/ composition',
      '',
    ];

    function* mixes(pieces: string[], maxPieces: number): Generator<string> {
      yield '';
      let layer = [''];
      for (let n = 1; n <= maxPieces; n += 1) {
        const next: string[] = [];
        for (const prefix of layer) for (const piece of pieces) next.push(prefix + piece);
        yield* next;
        layer = next;
      }
    }

    it('agrees with the lexer on every mix of skippable text before every head', () => {
      const disagreements: string[] = [];
      let checked = 0;
      for (const prefix of mixes(SKIPPABLE, 2)) {
        for (const head of HEADS) {
          const source = prefix + head;
          checked += 1;
          if (isHoloCompositionSource(source) !== lexerSeesComposition(source)) {
            disagreements.push(JSON.stringify(source));
          }
        }
      }
      expect(checked).toBeGreaterThan(8000);
      expect(disagreements).toEqual([]);
    });

    it('never says composition where the lexer does not, even around text it stops at', () => {
      const overclaims: string[] = [];
      for (const prefix of mixes([...SKIPPABLE, ...NOT_SKIPPED], 2)) {
        for (const head of HEADS) {
          const source = prefix + head;
          if (isHoloCompositionSource(source) && !lexerSeesComposition(source)) {
            overclaims.push(JSON.stringify(source));
          }
        }
      }
      expect(overclaims).toEqual([]);
    });
  });
});

describe('parseSceneSource', () => {
  const COMMENTED_COMPOSITION = `// A small room\n${COMPOSITION}`;
  const accepted = { errors: [] as string[] };
  const rejected = { errors: ['rejected'] };

  /** Stand-in parsers that record which ones ran, in order. */
  function parsers(composition: { errors: string[] }, hsplus: { errors: string[] }) {
    const calls: string[] = [];
    return {
      calls,
      parse: {
        composition: () => {
          calls.push('composition');
          return composition;
        },
        hsplus: () => {
          calls.push('hsplus');
          return hsplus;
        },
      },
    };
  }

  it('reads a commented composition with the composition parser alone when it accepts it', () => {
    const { calls, parse } = parsers(accepted, accepted);
    const reading = parseSceneSource(COMMENTED_COMPOSITION, 'auto', parse);
    expect(reading).toEqual({ form: 'composition', result: accepted });
    expect(calls).toEqual(['composition']);
  });

  it('keeps the .hsplus reading when only the .hsplus parser accepts the text', () => {
    const { calls, parse } = parsers(rejected, accepted);
    const reading = parseSceneSource(COMMENTED_COMPOSITION, 'auto', parse);
    expect(reading).toEqual({ form: 'hsplus', result: accepted });
    expect(calls).toEqual(['composition', 'hsplus']);
  });

  it("reports the composition parser's errors when neither parser accepts the text", () => {
    const { parse } = parsers(rejected, { errors: ['hsplus says no'] });
    expect(parseSceneSource(COMMENTED_COMPOSITION, 'auto', parse)).toEqual({
      form: 'composition',
      result: rejected,
    });
  });

  it('sends text that does not open as a composition to the .hsplus parser alone', () => {
    const { calls, parse } = parsers(accepted, rejected);
    const reading = parseSceneSource(`// composition, later\n${HSPLUS}`, 'auto', parse);
    expect(reading).toEqual({ form: 'hsplus', result: rejected });
    expect(calls).toEqual(['hsplus']);
  });

  it('forces one parser for the holo and hsplus hints, with no fallback', () => {
    const holo = parsers(rejected, accepted);
    expect(parseSceneSource(HSPLUS, 'holo', holo.parse)).toEqual({
      form: 'composition',
      result: rejected,
    });
    expect(holo.calls).toEqual(['composition']);

    const hsplus = parsers(accepted, rejected);
    expect(parseSceneSource(COMPOSITION, 'hsplus', hsplus.parse)).toEqual({
      form: 'hsplus',
      result: rejected,
    });
    expect(hsplus.calls).toEqual(['hsplus']);
  });
});
