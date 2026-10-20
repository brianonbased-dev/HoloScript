/**
 * Graded verdict on published @holoscript/core 8.9.0 (2026-10-14): every exact failing
 * input, run against src. Blocked-is-red: no skip, no todo, no conditional expectation.
 * The same inputs run against the built dist in src/__dist_tests__/Verdict890Dist.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { parseHolo, parseHoloStrict } from '../HoloCompositionParser';
import { HoloScriptValidator } from '../../HoloScriptValidator';
import { compileToWASM } from '../../compiler/WASMCompiler';

const VALID = 'object Cube { position: [0, 1, 0] }';
const errs = (r: { errors: { severity?: string }[] }) =>
  r.errors.filter((e) => e.severity !== 'warning');

describe('8.9.0 verdict — exact inputs (src)', () => {
  it('pass: valid input is accepted', () => {
    const r = parseHolo(VALID);
    expect(r.success).toBe(true);
    expect(r.errors).toEqual([]);
  });
  it('1: parseHolo("{{{@@@") fails with an error', () => {
    const r = parseHolo('{{{@@@');
    expect(r.success).toBe(false);
    expect(errs(r).length).toBeGreaterThan(0);
  });
  it('2: parseHolo("") fails with HS1001', () => {
    const r = parseHolo('');
    expect(r.success).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain('HS1001');
  });
  it('3: parseHolo(123) fails with HS1009', () => {
    const r = parseHolo(123 as unknown as string);
    expect(r.success).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain('HS1009');
  });
  it('4: parseHolo(null) returns HS1009 and does not throw', () => {
    let r: ReturnType<typeof parseHolo> | undefined;
    expect(() => {
      r = parseHolo(null as unknown as string);
    }).not.toThrow();
    expect(r!.success).toBe(false);
    expect(r!.errors.map((e) => e.code)).toContain('HS1009');
  });
  it('5: new HoloScriptValidator().validate("{{{@@@") reports an error', () => {
    const out = new HoloScriptValidator().validate('{{{@@@');
    expect(out.filter((e) => e.severity === 'error').length).toBeGreaterThan(0);
  });
  it('6: parseHoloStrict("{{{@@@") throws and fabricates no "@"/"" trait nodes', () => {
    expect(() => parseHoloStrict('{{{@@@')).toThrow();
  });
  it('7: unknown @nope_xyz is not silent in parseHolo (HS1006 warning)', () => {
    const r = parseHolo('object Cube { @nope_xyz }');
    expect(r.success).toBe(true); // HS1006 is a warning, never a refusal
    const codes = [...r.errors, ...r.warnings].map((d) => (d as { code?: string }).code);
    expect(codes).toContain('HS1006');
  });
  it('7: unknown @nope_xyz is not silent in HoloScriptValidator', () => {
    const out = new HoloScriptValidator().validate('object Cube { @nope_xyz }');
    expect(out.some((e) => e.severity === 'warning' && /HS1006/.test(e.message))).toBe(true);
  });
  it('8: compileToWASM("{{{@@@") is refused; valid source compiles', () => {
    expect(() => compileToWASM('{{{@@@' as never)).toThrow();
    const valid = compileToWASM(VALID as never);
    expect(valid.wat).toContain('Cube');
    expect(JSON.stringify(valid)).not.toBe(JSON.stringify(compileToWASM(parseHolo('').ast!)));
  });
});
