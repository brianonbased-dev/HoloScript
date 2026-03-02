import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticProvider } from '../DiagnosticProvider';
import type { DiagnosticContext } from '../DiagnosticProvider';

function makeCtx(nodes: any[], knownTraits: string[] = []): DiagnosticContext {
  return { nodes, knownTraits: new Set(knownTraits) };
}

describe('DiagnosticProvider', () => {
  let provider: DiagnosticProvider;

  beforeEach(() => {
    provider = new DiagnosticProvider();
  });

  it('no diagnostics for valid scene', () => {
    const ctx = makeCtx([{ type: 'mesh', name: 'box', directives: [{ name: 'version' }] }]);
    expect(provider.diagnose(ctx).length).toBe(0);
  });

  it('HS001: unknown directive', () => {
    const ctx = makeCtx([{
      type: 'mesh', name: 'box',
      directives: [{ name: 'nonexistent' }],
      loc: { start: { line: 5, column: 3 }, end: { line: 5, column: 15 } },
    }]);
    const diags = provider.diagnose(ctx);
    expect(diags.length).toBe(1);
    expect(diags[0].code).toBe('HS001');
    expect(diags[0].severity).toBe('warning');
    expect(diags[0].line).toBe(5);
  });

  it('HS001: known trait not flagged', () => {
    const ctx = makeCtx(
      [{ type: 'mesh', directives: [{ name: 'grabbable' }] }],
      ['grabbable']
    );
    expect(provider.diagnose(ctx).length).toBe(0);
  });

  it('HS002: empty group warning', () => {
    const ctx = makeCtx([{ type: 'group', name: 'emptyGroup', children: [] }]);
    const diags = provider.diagnose(ctx);
    expect(diags.length).toBe(1);
    expect(diags[0].code).toBe('HS002');
    expect(diags[0].severity).toBe('warning');
  });

  it('HS002: group with children no warning', () => {
    const ctx = makeCtx([{ type: 'group', name: 'full', children: [{ type: 'mesh' }] }]);
    expect(provider.diagnose(ctx).length).toBe(0);
  });

  it('HS003: deprecated directive hint', () => {
    const ctx = makeCtx([{ type: 'mesh', name: 'old', directives: [{ name: 'deprecated' }] }]);
    const diags = provider.diagnose(ctx);
    expect(diags.length).toBe(1);
    expect(diags[0].code).toBe('HS003');
    expect(diags[0].severity).toBe('hint');
  });

  it('sorts diagnostics by line then column', () => {
    const ctx = makeCtx([
      { type: 'group', name: 'g1', children: [], loc: { start: { line: 10, column: 1 }, end: { line: 10, column: 5 } } },
      { type: 'mesh', directives: [{ name: 'bad' }], loc: { start: { line: 3, column: 5 }, end: { line: 3, column: 10 } } },
    ]);
    const diags = provider.diagnose(ctx);
    expect(diags.length).toBe(2);
    expect(diags[0].line).toBe(3);
    expect(diags[1].line).toBe(10);
  });

  it('addRule registers custom rules', () => {
    const before = provider.ruleCount;
    provider.addRule({
      id: 'CUSTOM01',
      check: () => [{ severity: 'info', message: 'test', line: 0, column: 0, source: 'test' }],
    });
    expect(provider.ruleCount).toBe(before + 1);
    const diags = provider.diagnose(makeCtx([]));
    expect(diags.some(d => d.message === 'test')).toBe(true);
  });

  it('handles nodes without directives', () => {
    const ctx = makeCtx([{ type: 'mesh', name: 'simple' }]);
    expect(provider.diagnose(ctx).length).toBe(0);
  });

  it('handles nodes without loc gracefully', () => {
    const ctx = makeCtx([{ type: 'mesh', directives: [{ name: 'unknown' }] }]);
    const diags = provider.diagnose(ctx);
    expect(diags[0].line).toBe(0);
  });
});
