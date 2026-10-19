import { describe, expect, it } from 'vitest';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { canonicalSourceDiagnostics } from '../canonicalDiagnostics';

const UNKNOWN = 'composition "T" {\n  object "A" {\n    @nope_xyz\n    @grabbable\n  }\n}\n';
const unknown = (text: string, surface: 'holo' | 'hsplus') =>
  canonicalSourceDiagnostics(text, surface).diagnostics.filter((d) => d.code === 'HS1006');

describe('LSP: HS1006 unknown trait shows as a warning (core isKnownTrait)', () => {
  it.each(['holo', 'hsplus'] as const)('%s: one warning at the @, nothing else for it', (surface) => {
    const shown = unknown(UNKNOWN, surface);
    expect(shown).toHaveLength(1);
    expect(shown[0].severity).toBe(DiagnosticSeverity.Warning);
    expect(shown[0].range.start).toEqual({ line: 2, character: 4 });
    const all = canonicalSourceDiagnostics(UNKNOWN, surface).diagnostics;
    expect(all.some((d) => /Unknown directive/.test(d.message))).toBe(false);
    expect(all.some((d) => d.severity === DiagnosticSeverity.Error)).toBe(false);
  });

  it('a doc tag in a comment and a registry trait are not unknown', () => {
    expect(unknown('// @version 2\nobject "A" {\n  @grabbable\n}\n', 'holo')).toHaveLength(0);
  });
});
