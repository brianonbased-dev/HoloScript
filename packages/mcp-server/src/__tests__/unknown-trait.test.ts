/**
 * MCP: unknown traits come from core's one known-trait set (isKnownTrait) via the canonical
 * validator's HS1006, on PARSED trait uses. validate_holoscript no longer scans raw text, and
 * hs_diagnostics keeps its curated list only for "did you mean" suggestions.
 */
import { describe, expect, it } from 'vitest';
import { handleTool } from '../handlers';

const UNKNOWN = 'composition "T" {\n  object "A" {\n    @nope_xyz\n    @grabbable\n  }\n}\n';
type W = { code?: string; message: string; line?: number; column?: number };
type V = { valid: boolean; errors: W[]; warnings?: W[] };

describe('validate_holoscript: HS1006', () => {
  it.each(['holo', 'hsplus'])('%s: one HS1006 warning at the @, still valid', async (format) => {
    const r = (await handleTool('validate_holoscript', { code: UNKNOWN, format })) as V;
    expect(r.valid).toBe(true);
    const w = (r.warnings ?? []).filter((x) => x.code === 'HS1006');
    expect(w.map((x) => [x.line, x.column])).toEqual([[3, 5]]);
    expect((r.warnings ?? []).some((x) => x.code === 'unknown-trait' || /Unknown directive/.test(x.message))).toBe(false);
  });

  it('a doc tag in a comment is not a trait use; a registry-only trait is known', async () => {
    const r = (await handleTool('validate_holoscript', {
      code: '// @version 2 @author me\nobject "A" {\n  @grabbable\n  @a_i_driver\n}\n',
      format: 'holo',
    })) as V;
    expect(r.valid).toBe(true);
    expect(r.warnings ?? []).toEqual([]);
  });
});

describe('hs_diagnostics: unknown-ness from the shared set, suggestions from the curated list', () => {
  type D = { count: number; diagnostics: Array<{ code: string; message: string; line: number; quickFixes?: unknown[] }> };
  it('flags only the parsed unknown trait, with a did-you-mean fix', async () => {
    const r = (await handleTool('hs_diagnostics', {
      code: '// @version 2\nobject "A" {\n  @grabable\n  @skeleton\n  @a_i_driver\n}\n',
      filePath: 'a.holo',
    })) as D;
    const unknown = r.diagnostics.filter((d) => d.code === 'unknown-trait');
    expect(unknown.map((d) => [d.line, d.message])).toEqual([[3, 'Unknown trait: @grabable']]);
    expect(unknown[0].quickFixes).toEqual([
      expect.objectContaining({ edit: expect.objectContaining({ newText: '@grabbable' }) }),
    ]);
  });
});
