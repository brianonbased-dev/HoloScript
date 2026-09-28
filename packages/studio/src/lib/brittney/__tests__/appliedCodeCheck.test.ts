/**
 * The self-check must accept exactly what the viewport draws: a false refusal
 * would make Brittney "repair" code that was fine, and a false pass would hand
 * the person a scene that shows nothing. Both formats the viewport reads are
 * covered: .holo compositions and .hsplus.
 */
import { describe, expect, it } from 'vitest';
import { checkAppliedCode, repairRequest } from '../appliedCodeCheck';
import { runScenePipeline } from '@/lib/scenePipeline';

const COMPOSITION =
  'composition "Garden" {\n  object "Rose" {\n    geometry: "sphere"\n    color: "#ff3366"\n  }\n}\n';
const HSPLUS = 'object "Ball" {\n  geometry: "sphere"\n  position: [0, 1, 0]\n}\n';

describe('checkAppliedCode', () => {
  it('passes a .holo composition and an .hsplus object, both of which the viewport draws', () => {
    for (const code of [COMPOSITION, HSPLUS]) {
      expect(runScenePipeline(code).errors, code).toEqual([]);
      expect(checkAppliedCode({ code }), code).toEqual({ ok: true });
    }
  });

  it('refuses code the viewport cannot draw, with the parser errors', () => {
    const code = 'composition "Garden" {\n  object "Rose" {\n';
    const viewport = runScenePipeline(code);
    expect(viewport.errors.length).toBeGreaterThan(0);

    const result = checkAppliedCode({ code });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The parser's own words, not a stand-in: she repairs from these.
      expect(result.errors[0]).toContain(viewport.errors[0].message);
      expect(repairRequest(result.errors)).toContain(viewport.errors[0].message);
      expect(repairRequest(result.errors)).toMatch(/NOT applied[\s\S]*call apply_code again/);
    }
  });

  it('refuses code that parses but gives the viewport nothing to draw', () => {
    const nothing = () => ({ r3fTree: null, errors: [] });

    expect(checkAppliedCode({ code: 'object "Ghost" {}' }, nothing)).toEqual({
      ok: false,
      errors: ['The code parsed, but produced nothing the Studio can draw'],
    });
  });

  it('refuses a call with no code, or with code that is not a string', () => {
    for (const input of [{}, { code: '' }, { code: '   ' }, { code: 42 }]) {
      expect(checkAppliedCode(input as Record<string, unknown>).ok).toBe(false);
    }
  });

  it('agrees with the viewport on every sample: same pipeline, no second opinion', () => {
    const samples = [
      COMPOSITION,
      HSPLUS,
      'composition "X" {',
      'object "Y" { geometry: ',
      'composition "Z" {}',
    ];
    for (const code of samples) {
      const viewportDraws =
        runScenePipeline(code).errors.length === 0 && runScenePipeline(code).r3fTree !== null;
      expect(checkAppliedCode({ code }).ok, code).toBe(viewportDraws);
    }
  });
});
