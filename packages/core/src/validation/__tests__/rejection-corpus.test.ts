/**
 * The strict layer's corpus, run through the canonical validator.
 *
 * `validateCanonicalSource` is the one verdict behind `holoscript validate`,
 * the MCP `validate_holoscript` tool and the LSP. The strict layer
 * (packages/core/strict, from claude-cowork's work, landed in #528) holds a
 * corpus of .holo files it must accept or refuse. This test holds the
 * canonical validator to the same verdicts, so "it says yes to everything"
 * cannot come back unnoticed and the two layers cannot drift apart.
 *
 * The strict layer's exact diagnostic lists are its own contract
 * (strict/test/corpus.test.mjs). Here only the verdict is compared, plus the
 * codes the canonical path emits itself: HS1001 (empty source) and HS1005
 * (an "@" with no trait name, reported by the parser).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { validateCanonicalSource, type CanonicalDiagnostic } from '../CanonicalSourceValidator';
import { buildKnownTraitSet } from '../../traits/knownTraitSet';

type Diagnostic = [code: string, line: number, column: number];

interface StrictCorpusManifest {
  valid: Array<{ file: string; objects: number }>;
  real: Array<{ file: string; from: string }>;
  warns: Array<{ file: string; objects: number; warnings: Diagnostic[] }>;
  invalid: Array<{ file: string; errors: Diagnostic[] }>;
}

const CORPUS_DIR = path.resolve(__dirname, '../../../strict/corpus');
const manifest = JSON.parse(
  readFileSync(path.join(CORPUS_DIR, 'manifest.json'), 'utf8')
) as StrictCorpusManifest;

const readCorpus = (file: string): string => readFileSync(path.join(CORPUS_DIR, file), 'utf8');

const EMPTY_SOURCE_ERROR: CanonicalDiagnostic = {
  severity: 'error',
  code: 'HS1001',
  message: 'Source is empty. A HoloScript file needs at least one item.',
  line: 1,
  column: 1,
};

/**
 * Known gap, measured 2026-10-07 (board task w4sl): the `.holo` lexer reports
 * punctuation tokens one column early. `HoloLexer.addToken`
 * (parser/composition/lexer.ts) computes `column - value.length` but
 * `trySymbol` calls it BEFORE `advance()`, so a one-character symbol gets a
 * 0-based column. The strict layer maps positions itself; the canonical path
 * passes the parser's through, so an error on a `{`, `}` or `@` at the start
 * of a line says column 0. These files hit that; every other error must carry
 * column >= 1. When the lexer is fixed, the "gap is still real" test below
 * fails: delete the file from this list then.
 */
const KNOWN_ZERO_COLUMN_FILES = new Set([
  'invalid/after-multiline-string.holo',
  'invalid/at-without-name.holo',
  'invalid/braces-and-ats.holo',
  'invalid/json-not-holo.holo',
  'invalid/stray-close-brace.holo',
]);

describe('strict corpus: manifest integrity', () => {
  it('lists every corpus file exactly once, and every listed file exists', () => {
    const dirs = ['valid', 'real', 'warns', 'invalid'];
    const onDisk = dirs
      .flatMap((dir) =>
        readdirSync(path.join(CORPUS_DIR, dir))
          .filter((name) => name.endsWith('.holo'))
          .map((name) => `${dir}/${name}`)
      )
      .sort();
    const listed = [
      ...manifest.valid,
      ...manifest.real,
      ...manifest.warns,
      ...manifest.invalid,
    ]
      .map((entry) => entry.file)
      .sort();

    // A file on disk but missing here would never be checked by either layer.
    expect(listed).toEqual(onDisk);
    expect(new Set(listed).size).toBe(listed.length);
  });
});

describe('strict corpus: files the canonical validator must accept', () => {
  it.each(manifest.valid)('$file is valid with $objects object(s)', ({ file, objects }) => {
    const result = validateCanonicalSource({ source: readCorpus(file), surface: 'holo' });

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.validator).toBe('holo-parser');
    const ast = result.ast as { objects?: unknown[] } | undefined;
    expect(ast).toBeDefined();
    expect((ast?.objects ?? []).length).toBe(objects);
  });

  it.each(manifest.real)('real file $from is valid', ({ file }) => {
    const result = validateCanonicalSource({ source: readCorpus(file), surface: 'holo' });

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it.each(manifest.warns)(
    '$file is valid (an unknown trait is a warning, not a refusal)',
    ({ file, warnings }) => {
      const source = readCorpus(file);
      const result = validateCanonicalSource({ source, surface: 'holo' });

      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);

      // Where the strict layer warns about an unknown trait, validate_holoscript
      // must have one to warn about too: it flags any `@name` missing from
      // buildKnownTraitSet().
      if (warnings.some(([code]) => code === 'HS1006')) {
        const known = buildKnownTraitSet();
        const unknown = [...source.matchAll(/@(\w+)/g)]
          .map((match) => match[1])
          .filter((name) => !known.has(name));
        expect(unknown.length, `${file} has no unknown trait, so nothing warns`).toBeGreaterThan(0);
      }
    }
  );
});

describe('strict corpus: files the canonical validator must refuse', () => {
  it.each(manifest.invalid)('$file is refused with a positioned error', ({ file }) => {
    const result = validateCanonicalSource({ source: readCorpus(file), surface: 'holo' });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    const minColumn = KNOWN_ZERO_COLUMN_FILES.has(file) ? 0 : 1;
    for (const error of result.errors) {
      expect(error.severity).toBe('error');
      expect(typeof error.line, `${file}: "${error.message}" has no line`).toBe('number');
      expect(typeof error.column, `${file}: "${error.message}" has no column`).toBe('number');
      expect(error.line!, `${file}: "${error.message}"`).toBeGreaterThanOrEqual(1);
      expect(error.column!, `${file}: "${error.message}"`).toBeGreaterThanOrEqual(minColumn);
    }
  });

  it('the zero-column gap is still real for every file listed as known', () => {
    for (const file of KNOWN_ZERO_COLUMN_FILES) {
      const result = validateCanonicalSource({ source: readCorpus(file), surface: 'holo' });
      const zeroColumn = result.errors.filter((error) => error.column === 0);
      expect(
        zeroColumn.length,
        `${file} no longer reports column 0; remove it from KNOWN_ZERO_COLUMN_FILES`
      ).toBeGreaterThan(0);
    }
  });

  it('empty.holo is refused with HS1001', () => {
    const result = validateCanonicalSource({
      source: readCorpus('invalid/empty.holo'),
      surface: 'holo',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([EMPTY_SOURCE_ERROR]);
  });

  it('empty.holo is accepted when the caller allows empty source (editor case)', () => {
    const result = validateCanonicalSource({
      source: readCorpus('invalid/empty.holo'),
      surface: 'holo',
      allowEmpty: true,
    });

    expect(result.valid).toBe(true);
    expect(result.validator).toBe('holo-parser');
    expect(result.errors).toEqual([]);
  });

  it('at-without-name.holo is refused with HS1005 (a bare "@" with no trait name)', () => {
    const result = validateCanonicalSource({
      source: readCorpus('invalid/at-without-name.holo'),
      surface: 'holo',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'HS1005', line: 1 })])
    );
  });
});

describe('empty source is refused on every surface (HS1001)', () => {
  const blanks: Array<[string, string]> = [
    ['empty string', ''],
    ['spaces', '   '],
    ['newlines', '\n\n\n'],
    ['mixed whitespace and CRLF', ' \t\r\n  \r\n'],
    ['byte-order mark only', '﻿'],
  ];
  const surfaces = ['holo', 'hsplus', 'hs'] as const;

  for (const surface of surfaces) {
    it.each(blanks)(`${surface}: %s -> HS1001`, (_label, source) => {
      const result = validateCanonicalSource({ source, surface });

      expect(result).toEqual({
        valid: false,
        surface,
        validator: 'empty-source-check',
        errors: [EMPTY_SOURCE_ERROR],
        warnings: [],
      });
    });
  }

  it('resolves the surface from the filename before refusing', () => {
    expect(validateCanonicalSource({ fileName: 'agent.hsplus', source: '  ' })).toMatchObject({
      surface: 'hsplus',
      valid: false,
      errors: [EMPTY_SOURCE_ERROR],
    });
  });

  it('.hs without the Rust/WASM dependency says HS1001, not HS-VALIDATOR-UNAVAILABLE', () => {
    const result = validateCanonicalSource({ fileName: 'logic.hs', source: '\n' });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(['HS1001']);
  });

  it('.hs never asks the Rust/WASM authority about empty source', () => {
    const validateHsDetailed = vi.fn(() => JSON.stringify({ valid: true, errors: [] }));
    const result = validateCanonicalSource({ surface: 'hs', source: '' }, { validateHsDetailed });

    expect(validateHsDetailed).not.toHaveBeenCalled();
    expect(result.errors).toEqual([EMPTY_SOURCE_ERROR]);
  });

  it('allowEmpty: true routes empty source exactly as before', () => {
    expect(
      validateCanonicalSource({ surface: 'holo', source: '', allowEmpty: true })
    ).toMatchObject({ valid: true, validator: 'holo-parser', errors: [] });
    expect(
      validateCanonicalSource({ surface: 'hsplus', source: '  \n', allowEmpty: true })
    ).toMatchObject({ valid: true, validator: 'typescript-hsplus', errors: [] });

    const unavailable = validateCanonicalSource({ surface: 'hs', source: '', allowEmpty: true });
    expect(unavailable.errors.map((error) => error.code)).toEqual(['HS-VALIDATOR-UNAVAILABLE']);

    const validateHsDetailed = vi.fn(() => JSON.stringify({ valid: true, errors: [] }));
    const routed = validateCanonicalSource(
      { surface: 'hs', source: '', allowEmpty: true },
      { validateHsDetailed }
    );
    expect(validateHsDetailed).toHaveBeenCalledWith('');
    expect(routed).toMatchObject({ valid: true, validator: 'rust-wasm' });
  });

  it('allowEmpty: true does not soften the verdict on non-empty source', () => {
    const refused = validateCanonicalSource({
      surface: 'holo',
      source: readCorpus('invalid/unclosed-object.holo'),
      allowEmpty: true,
    });
    expect(refused.valid).toBe(false);
    expect(refused.errors.length).toBeGreaterThan(0);
  });

  it('known gap: comment-only source is not refused by HS1001 (it still routes to the parser)', () => {
    // Out of scope for HS1001 by decision; tracked as an open issue. When the
    // canonical path learns to refuse comment-only source, flip this test.
    const result = validateCanonicalSource({ surface: 'holo', source: '// a note\n' });
    expect(result.validator).toBe('holo-parser');
    expect(result.valid).toBe(true);
  });
});
