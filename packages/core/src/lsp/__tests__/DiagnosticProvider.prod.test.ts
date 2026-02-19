/**
 * DiagnosticProvider — Production Test Suite
 *
 * Covers: built-in rules (HS001 unknown directive, HS002 empty group,
 * HS003 deprecated), addRule, diagnose sorting, ruleCount, custom rules.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticProvider } from '../DiagnosticProvider';
import type { DiagnosticContext } from '../DiagnosticProvider';

function ctx(overrides: Partial<DiagnosticContext> = {}): DiagnosticContext {
  return {
    nodes: [],
    knownTraits: new Set(),
    ...overrides,
  };
}

describe('DiagnosticProvider — Production', () => {
  let provider: DiagnosticProvider;

  beforeEach(() => {
    provider = new DiagnosticProvider();
  });

  // ─── ruleCount ────────────────────────────────────────────────────
  it('starts with 3 built-in rules', () => {
    expect(provider.ruleCount).toBe(3);
  });

  it('addRule increases ruleCount', () => {
    provider.addRule({ id: 'CUSTOM', check: () => [] });
    expect(provider.ruleCount).toBe(4);
  });

  // ─── Empty Context ────────────────────────────────────────────────
  it('diagnose on empty nodes returns no diagnostics', () => {
    expect(provider.diagnose(ctx()).length).toBe(0);
  });

  // ─── HS001 Unknown Directive ──────────────────────────────────────
  it('HS001: unknown directive produces error', () => {
    const context = ctx({
      nodes: [{ type: 'orb', name: 'Player', directives: [{ name: 'unknownDir' }] }],
    });
    const diags = provider.diagnose(context);
    expect(diags.some(d => d.code === 'HS001')).toBe(true);
    expect(diags.find(d => d.code === 'HS001')!.severity).toBe('error');
  });

  it('HS001: known directive (version) produces no error', () => {
    const context = ctx({
      nodes: [{ type: 'orb', name: 'T', directives: [{ name: 'version' }] }],
    });
    const diags = provider.diagnose(context);
    expect(diags.some(d => d.code === 'HS001')).toBe(false);
  });

  it('HS001: trait names do not trigger unknown directive error', () => {
    const context = ctx({
      nodes: [{ type: 'orb', name: 'P', directives: [{ name: 'health' }] }],
      knownTraits: new Set(['health']),
    });
    const diags = provider.diagnose(context);
    expect(diags.some(d => d.code === 'HS001')).toBe(false);
  });

  it('HS001: node without directives has no error', () => {
    const context = ctx({
      nodes: [{ type: 'orb', name: 'X' }],
    });
    expect(provider.diagnose(context).some(d => d.code === 'HS001')).toBe(false);
  });

  // ─── HS002 Empty Group ────────────────────────────────────────────
  it('HS002: empty group produces warning', () => {
    const context = ctx({
      nodes: [{ type: 'group', name: 'myGroup', children: [] }],
    });
    const diags = provider.diagnose(context);
    expect(diags.some(d => d.code === 'HS002')).toBe(true);
    expect(diags.find(d => d.code === 'HS002')!.severity).toBe('warning');
  });

  it('HS002: group with children has no warning', () => {
    const context = ctx({
      nodes: [{ type: 'group', name: 'g', children: [{ type: 'orb' }] }],
    });
    expect(provider.diagnose(context).some(d => d.code === 'HS002')).toBe(false);
  });

  it('HS002: non-group empty node has no warning', () => {
    const context = ctx({
      nodes: [{ type: 'orb', name: 'X', children: [] }],
    });
    expect(provider.diagnose(context).some(d => d.code === 'HS002')).toBe(false);
  });

  // ─── HS003 Deprecated ────────────────────────────────────────────
  it('HS003: deprecated directive produces hint', () => {
    const context = ctx({
      nodes: [{ type: 'orb', name: 'Old', directives: [{ name: 'deprecated' }] }],
    });
    const diags = provider.diagnose(context);
    expect(diags.some(d => d.code === 'HS003')).toBe(true);
    expect(diags.find(d => d.code === 'HS003')!.severity).toBe('hint');
  });

  // ─── Sorting ──────────────────────────────────────────────────────
  it('diagnose returns diagnostics sorted by line then column', () => {
    const context = ctx({
      nodes: [
        { type: 'group', name: 'b', children: [], loc: { start: { line: 5, column: 0 }, end: { line: 5, column: 10 } } },
        { type: 'group', name: 'a', children: [], loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } } },
      ],
    });
    const diags = provider.diagnose(context);
    for (let i = 1; i < diags.length; i++) {
      expect(diags[i].line).toBeGreaterThanOrEqual(diags[i - 1].line);
    }
  });

  // ─── Custom Rules ─────────────────────────────────────────────────
  it('custom rule is applied', () => {
    provider.addRule({
      id: 'CUSTOM01',
      check: (ctx) => [{
        severity: 'info',
        message: 'custom',
        line: 0,
        column: 0,
        source: 'test',
        code: 'CUSTOM01',
      }],
    });
    const diags = provider.diagnose(ctx({ nodes: [{ type: 'orb' }] }));
    expect(diags.some(d => d.code === 'CUSTOM01')).toBe(true);
  });

  it('multiple custom rules all run', () => {
    provider.addRule({ id: 'R1', check: () => [{ severity: 'info', message: 'r1', line: 0, column: 0, source: 'test', code: 'R1' }] });
    provider.addRule({ id: 'R2', check: () => [{ severity: 'info', message: 'r2', line: 0, column: 0, source: 'test', code: 'R2' }] });
    const diags = provider.diagnose(ctx());
    expect(diags.some(d => d.code === 'R1')).toBe(true);
    expect(diags.some(d => d.code === 'R2')).toBe(true);
  });
});
