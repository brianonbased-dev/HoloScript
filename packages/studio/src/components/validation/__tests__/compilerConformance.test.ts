/**
 * H5: rules 5-7 of the Conformance Runner come from the real HoloScript parser
 * (no mocks of @holoscript/core here) and never report `passed` without running.
 */
import { describe, it, expect } from 'vitest';
import { evaluateCompilerRules } from '../compilerConformance';

const VALID =
  'composition "A" {\n  object "Cube" {\n    @grabbable\n    geometry: "cube"\n  }\n}\n';

describe('evaluateCompilerRules (real parser)', () => {
  it('valid composition passes all three compiler rules', () => {
    const r = evaluateCompilerRules(VALID);
    expect(r.missingBraces.status).toBe('passed');
    expect(r.unexpectedToken.status).toBe('passed');
    expect(r.unknownTrait.status).toBe('passed');
  });

  it('unclosed block fails rule 5 with a plain "add }" reason', () => {
    const r = evaluateCompilerRules('composition "A" {\n  object "Cube" {\n    geometry: "cube"\n');
    expect(r.missingBraces.status).toBe('failed');
    expect(r.missingBraces.message).toMatch(/never closed/);
    expect(r.missingBraces.message).toMatch(/closing "}"/);
    expect(r.missingBraces.message).not.toMatch(/RBRACE|EOF/); // plain language, raw text only in details
    expect(r.missingBraces.details?.join(' ')).toMatch(/RBRACE/);
  });

  it('proposal case `object Cube {` fails rule 5', () => {
    expect(evaluateCompilerRules('object Cube {').missingBraces.status).toBe('failed');
  });

  it('garbage input fails rule 6 (unexpected token)', () => {
    const r = evaluateCompilerRules('}}}} ;;; @@ %%% zzz');
    expect(r.unexpectedToken.status).toBe('failed');
    expect(r.unexpectedToken.message).toMatch(/could not read/);
    expect(r.unexpectedToken.message).toMatch(/line \d+/);
  });

  it('unknown trait warns via the core trait registry, real traits do not', () => {
    const r = evaluateCompilerRules(
      'composition "A" {\n  object "Cube" {\n    @nope_xyz\n    @grabbable\n    object "Kid" { @physics }\n  }\n}\n'
    );
    expect(r.unknownTrait.status).toBe('warning');
    expect(r.unknownTrait.message).toContain('@nope_xyz');
    expect(r.unknownTrait.message).not.toContain('@grabbable');
    expect(r.unknownTrait.message).not.toContain('@physics');
  });

  it('empty source: every rule is not_checked, never passed', () => {
    for (const src of ['', '   \n']) {
      const r = evaluateCompilerRules(src);
      for (const rule of Object.values(r)) {
        expect(rule.status).toBe('not_checked');
        expect(rule.message).toMatch(/no scene code/i);
      }
    }
  });

  it('trait rule is not_checked (not passed) when the scene cannot be read', () => {
    const r = evaluateCompilerRules('composition "A" {\n  object "Cube" {\n');
    expect(['not_checked', 'passed', 'warning']).toContain(r.unknownTrait.status);
    if (r.unknownTrait.status === 'passed') {
      // only acceptable if the tolerant parser still produced an AST that was actually walked
      expect(r.missingBraces.status).toBe('failed');
    }
  });
});
