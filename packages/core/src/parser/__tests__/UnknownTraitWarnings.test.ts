/**
 * parseHolo's HS1006 warnings: located in one pass (no per-trait rescans), capped, and reported
 * once by the strict layer (second-seat B1/B2 on the garbage-input series, 2026-10-15).
 */
import { describe, it, expect } from 'vitest';
import * as parser from '../index';
import { parseHolo, MAX_UNKNOWN_TRAIT_WARNINGS } from '../HoloCompositionParser';
import { HoloScriptValidator } from '../../HoloScriptValidator';
import { analyze, MAX_UNKNOWN_TRAIT_DIAGNOSTICS } from '../../../strict/holo_strict.mjs';

const hs1006 = (ws: { code?: string }[]) => ws.filter((w) => w.code === 'HS1006');

describe('parseHolo HS1006 warnings', () => {
  it('locates each unknown trait at its own @ (line/column)', () => {
    const r = parseHolo('object A { @nope_xyz }\r\nobject B {\n  @nope_xyz\n  @other_q\n}');
    const w = hs1006(r.warnings);
    expect(w.map((x) => [x.loc?.line, x.loc?.column])).toEqual([
      [1, 12],
      [3, 3],
      [4, 3],
    ]);
  });

  it(`caps at ${MAX_UNKNOWN_TRAIT_WARNINGS} plus one summary, all still HS1006`, () => {
    const src = Array.from({ length: 250 }, (_, i) => `object O${i} { @nope_${i} }`).join('\n');
    const w = hs1006(parseHolo(src).warnings);
    expect(w.length).toBe(MAX_UNKNOWN_TRAIT_WARNINGS + 1);
    expect(w[w.length - 1].message).toMatch(/150 more unknown traits.*250 in total/);
    // The legacy parser stops at 100 blocks, so the validator gets one object with 250 traits.
    const one = `object Many {\n${Array.from({ length: 250 }, (_, i) => `  @nope_${i}`).join('\n')}\n}`;
    const v = new HoloScriptValidator()
      .validate(one)
      .filter((e) => e.severity === 'warning' && /HS1006/.test(e.message));
    expect(v.length).toBe(MAX_UNKNOWN_TRAIT_WARNINGS + 1);
  });

  it('20,000 unknown traits parse well under 2 s (was 28.7 s: quadratic location lookup)', () => {
    const body = Array.from({ length: 20000 }, (_, i) => `  @nope_unknown_trait_${i}`).join('\n');
    const src = `object Big {\n${body}\n}\n`;
    expect(src.length).toBeGreaterThan(400_000);
    const t0 = performance.now();
    const r = parseHolo(src);
    const ms = performance.now() - t0;
    expect(r.success).toBe(true);
    expect(hs1006(r.warnings).length).toBe(MAX_UNKNOWN_TRAIT_WARNINGS + 1);
    expect(ms).toBeLessThan(2000);
  });
});

describe('strict reports an unknown trait exactly once', () => {
  const deps = {
    tokenizeHoloSource: parser.tokenizeHoloSource,
    parseHolo: parser.parseHolo,
    isKnownTrait: parser.isKnownTrait,
    declaredTraitNames: parser.declaredTraitNames,
  };
  it('@nope_xyz -> one HS1006, no HS1008 copy', () => {
    const d = analyze('object Cube { @nope_xyz }', deps).diagnostics as { code: string; message: string }[];
    const about = d.filter((x) => /nope_xyz/.test(x.message));
    expect(about.map((x) => x.code)).toEqual(['HS1006']);
  });
  it('without a trait vocabulary, the parser copy is kept once as HS1006', () => {
    const { isKnownTrait: _k, declaredTraitNames: _d, ...noVocab } = deps;
    const d = analyze('object Cube { @nope_xyz }', noVocab).diagnostics as { code: string; message: string }[];
    expect(d.filter((x) => /nope_xyz/.test(x.message)).map((x) => x.code)).toEqual(['HS1006']);
  });
  it('caps its own HS1006 at 100 plus one summary: 20k unknown traits -> 101 diagnostics, small JSON', () => {
    const body = Array.from({ length: 20000 }, (_, i) => `  @nope_unknown_trait_${i}`).join('\n');
    const d = analyze(`object Big {\n${body}\n}\n`, deps).diagnostics as { code: string; message: string }[];
    expect(MAX_UNKNOWN_TRAIT_DIAGNOSTICS).toBe(MAX_UNKNOWN_TRAIT_WARNINGS);
    expect(d.length).toBe(101);
    expect(d.every((x) => x.code === 'HS1006')).toBe(true);
    expect(d[100].message).toMatch(/19900 more unknown traits not listed .*20000 in total/);
    expect(JSON.stringify(d).length).toBeLessThan(50_000);
  });
});

