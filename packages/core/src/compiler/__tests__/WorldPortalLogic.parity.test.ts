/**
 * WorldPortal `.hs` → Kotlin behavioral-parity test.
 *
 * The WorldPortal recognition/naming logic (isWorldLink / worldId / worldName) is authored in
 * quest-mr-logic/WorldPortal.logic.hs and compiled to Kotlin by the canonical Rust/WASM grammar
 * (compile_to_kotlin), injected into WorldPortal.kt.tmpl's {{WORLDPORTAL_LOGIC}} marker. There is no
 * JVM in CI, so we cannot run the emitted Kotlin directly. Instead this test:
 *
 *  1. Asserts the emitted WorldPortal.kt actually contains the .hs-compiled function signatures and
 *     the irreducible stdlib helpers (so the wiring can't silently regress to hand-Kotlin or empty).
 *  2. Runs a JS transliteration of BOTH the ORIGINAL hand-Kotlin logic and the NEW .hs-compiled
 *     logic over a golden input table, asserting they agree on every input — i.e. the .hs compile
 *     preserved behavior. The shims use exact Kotlin stdlib semantics (trim = whitespace,
 *     substringBefore, startsWith(ignoreCase), trim(Char), isBlank, replaceFirstChar uppercase).
 *
 * If the .hs logic changes, update the NEW transliteration here to match and re-confirm parity with
 * the ORIGINAL (or, if behavior is intentionally changing, update BOTH the original baseline and the
 * expectation together — never silently).
 */
import { describe, it, expect } from 'vitest';
import { QuestCompiler } from '../QuestCompiler';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, '..', '..', '..', '..', '..');
const specPath = join(repoRoot, 'apps', 'quest-universal-qr-scanner', 'scanner.holo');

function emittedWorldPortalKt(): string {
  const spec = readFileSync(specPath, 'utf8');
  const result = new HoloCompositionParser().parse(spec);
  // HoloCompositionParser returns a { success, ast } wrapper — unwrap to the composition AST.
  const ast = (result as { success?: boolean; ast?: unknown }).ast ?? result;
  const emitted = new QuestCompiler().compile(ast as never, '');
  const key = Object.keys(emitted).find((k) => k.endsWith('WorldPortal.kt'));
  if (!key) throw new Error('WorldPortal.kt not in emitted Quest MR files');
  return emitted[key];
}

// ── Kotlin stdlib shims (exact semantics) ────────────────────────────────────────────────────
const linkPatterns = [
  'holoscript://world/',
  'https://holoscript.studio/w/',
  'https://hololand.holoscript.studio/',
];
const trim = (s: string) => s.trim();
const substringBefore = (s: string, d: string) => {
  const i = s.indexOf(d);
  return i < 0 ? s : s.slice(0, i);
};
const startsWithCI = (s: string, p: string) => s.toLowerCase().startsWith(p.toLowerCase());
const trimChar = (s: string, c: string) => {
  let a = 0;
  let b = s.length;
  while (a < b && s[a] === c) a++;
  while (b > a && s[b - 1] === c) b--;
  return s.slice(a, b);
};
const isBlank = (s: string) => s.trim().length === 0;
const capFirst = (w: string) => (w.length ? w[0].toUpperCase() + w.slice(1) : w);

// ── ORIGINAL hand-Kotlin WorldPortal (lambda style) ──────────────────────────────────────────
function origWorldId(text: string): string {
  const t = trim(text);
  const pat = linkPatterns.find((p) => startsWithCI(t, p)) ?? null;
  let rest = pat != null ? t.slice(pat.length) : t;
  rest = substringBefore(substringBefore(rest, '?'), '#');
  rest = substringBefore(trimChar(rest, '/'), '/');
  return isBlank(rest) ? 'world' : rest;
}
function origWorldName(text: string): string {
  const id = origWorldId(text);
  const name = id
    .split(/[-_.]/)
    .filter((w) => !isBlank(w))
    .map(capFirst)
    .join(' ');
  return isBlank(name) ? 'World' : name;
}
function origIsWorldLink(text: string): boolean {
  const t = trim(text);
  return linkPatterns.some((p) => startsWithCI(t, p));
}

// ── NEW .hs-compiled WorldPortal (single-assignment + named helpers) ──────────────────────────
const matchedPattern = (text: string) => linkPatterns.find((p) => startsWithCI(text, p)) ?? '';
const stripPrefixCI = (text: string, prefix: string) =>
  prefix.length ? text.slice(prefix.length) : text;
const trimSlashes = (text: string) => trimChar(text, '/');
const titleCaseWords = (id: string) =>
  id
    .split(/[-_.]/)
    .filter((w) => !isBlank(w))
    .map(capFirst)
    .join(' ');
function newIsWorldLink(text: string): boolean {
  const t = trim(text);
  const pat = matchedPattern(t);
  return pat !== '';
}
function newWorldId(text: string): string {
  const t = trim(text);
  const pat = matchedPattern(t);
  const afterPat = stripPrefixCI(t, pat);
  const noQuery = substringBefore(afterPat, '?');
  const noFrag = substringBefore(noQuery, '#');
  const unslashed = trimSlashes(noFrag);
  const seg = substringBefore(unslashed, '/');
  return seg === '' ? 'world' : seg;
}
function newWorldName(text: string): string {
  const id = newWorldId(text);
  const name = titleCaseWords(id);
  return name === '' ? 'World' : name;
}

const GOLDEN_INPUTS = [
  'holoscript://world/holo-land_2?foo=bar#baz',
  'https://hololand.holoscript.studio/aurora/extra',
  'https://holoscript.studio/w/',
  'holoscript://world/shangri-la',
  'HOLOSCRIPT://WORLD/HoloLand',
  '  holoscript://world/spaced   ',
  'holoscript://world/',
  'https://example.com/not-a-world',
  'holoscript://world/a.b.c-d_e',
  'https://holoscript.studio/w/My_Cool.World-2#frag',
  'random text no scheme',
];

describe('WorldPortal .hs → Kotlin emission', () => {
  const kt = emittedWorldPortalKt();

  it('injects the .hs-compiled functions (not hand-Kotlin, not empty)', () => {
    expect(kt).toContain('@generated from logic/WorldPortal.logic.hs (compile_to_kotlin)');
    expect(kt).toContain('fun isWorldLink(text: String): Boolean {');
    expect(kt).toContain('fun worldId(text: String): String {');
    expect(kt).toContain('fun worldName(text: String): String {');
  });

  it('keeps the irreducible stdlib helpers the .hs logic calls', () => {
    expect(kt).toContain('private fun matchedPattern(text: String): String');
    expect(kt).toContain('private fun stripPrefixCI(text: String, prefix: String): String');
    expect(kt).toContain('private fun trimSlashes(text: String): String');
    expect(kt).toContain('private fun titleCaseWords(id: String): String');
  });

  it('preserves the scanner.holo data members', () => {
    expect(kt).toContain('val linkPatterns: List<String> = listOf(');
    expect(kt).toContain('const val autoImmerse = true');
  });
});

describe('WorldPortal .hs logic ≡ original hand-Kotlin (behavioral parity)', () => {
  it.each(GOLDEN_INPUTS)('isWorldLink(%j) matches', (input) => {
    expect(newIsWorldLink(input)).toBe(origIsWorldLink(input));
  });
  it.each(GOLDEN_INPUTS)('worldId(%j) matches', (input) => {
    expect(newWorldId(input)).toBe(origWorldId(input));
  });
  it.each(GOLDEN_INPUTS)('worldName(%j) matches', (input) => {
    expect(newWorldName(input)).toBe(origWorldName(input));
  });
});
