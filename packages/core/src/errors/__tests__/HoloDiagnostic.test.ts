/**
 * HoloDiagnostic.test.ts — Tests for the unified error schema
 */

import { describe, it, expect } from 'vitest';
import {
  fromParserError,
  compilerDiagnostic,
  runtimeDiagnostic,
  lintDiagnostic,
  formatDiagnostic,
  formatDiagnostics,
  toLSPDiagnostic,
  DiagnosticCollector,
  type HoloDiagnostic,
} from '../HoloDiagnostic';

// ── Factory functions ────────────────────────────────────────────────────────

describe('fromParserError', () => {
  it('converts a RichParseError to HoloDiagnostic', () => {
    const diag = fromParserError({
      code: 'HSP004',
      message: 'Unclosed brace',
      line: 15,
      column: 3,
      severity: 'error',
      suggestion: 'Add a closing }',
    });
    expect(diag.code).toBe('HSP004');
    expect(diag.origin).toBe('parser');
    expect(diag.severity).toBe('error');
    expect(diag.suggestion).toBe('Add a closing }');
  });

  it('defaults severity to error', () => {
    const diag = fromParserError({ code: 'HSP001', message: 'Bad', line: 1, column: 0 });
    expect(diag.severity).toBe('error');
  });
});

describe('compilerDiagnostic', () => {
  it('creates a compiler diagnostic', () => {
    const diag = compilerDiagnostic('HSC002', 'Trait @cloth not supported for URDF target', 10, 5);
    expect(diag.code).toBe('HSC002');
    expect(diag.origin).toBe('compiler');
    expect(diag.severity).toBe('error');
    expect(diag.line).toBe(10);
  });

  it('accepts optional suggestion', () => {
    const diag = compilerDiagnostic('HSC007', 'Unknown geometry', 3, 0, {
      suggestion: 'Use "cube", "sphere", or "capsule"',
    });
    expect(diag.suggestion).toBe('Use "cube", "sphere", or "capsule"');
  });
});

describe('runtimeDiagnostic', () => {
  it('creates a runtime diagnostic', () => {
    const diag = runtimeDiagnostic('HSR001', 'Object "NPC_01" not found');
    expect(diag.code).toBe('HSR001');
    expect(diag.origin).toBe('runtime');
    expect(diag.line).toBe(0);
  });
});

describe('lintDiagnostic', () => {
  it('defaults to warning severity', () => {
    const diag = lintDiagnostic('HSL001', 'Unused trait @ambient', 20, 4);
    expect(diag.severity).toBe('warning');
    expect(diag.origin).toBe('lint');
  });
});

// ── Formatting ───────────────────────────────────────────────────────────────

describe('formatDiagnostic', () => {
  it('renders Rust-style error output', () => {
    const diag: HoloDiagnostic = {
      code: 'HSP004',
      message: 'Unclosed brace - missing }',
      severity: 'error',
      line: 15,
      column: 3,
      origin: 'parser',
      file: 'scene.holo',
      suggestion: 'Add a closing } brace',
    };
    const output = formatDiagnostic(diag);
    expect(output).toContain('error[HSP004]');
    expect(output).toContain('scene.holo:15:3');
    expect(output).toContain('suggestion: Add a closing }');
  });

  it('includes context lines when provided', () => {
    const diag: HoloDiagnostic = {
      code: 'HSC003',
      message: 'Invalid physics',
      severity: 'error',
      line: 5,
      column: 0,
      origin: 'compiler',
      context: '  physics {\n    rigidbody { mass: -1 }',
    };
    const output = formatDiagnostic(diag);
    expect(output).toContain('rigidbody { mass: -1 }');
  });

  it('includes quick fix labels', () => {
    const diag: HoloDiagnostic = {
      code: 'HSL001',
      message: 'Unused trait',
      severity: 'warning',
      line: 1,
      column: 0,
      origin: 'lint',
      quickFixes: [{ title: 'Remove @ambient', range: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 8 }, newText: '' }],
    };
    const output = formatDiagnostic(diag);
    expect(output).toContain('fix: Remove @ambient');
  });
});

describe('formatDiagnostics', () => {
  it('formats multiple diagnostics with summary', () => {
    const diags: HoloDiagnostic[] = [
      compilerDiagnostic('HSC001', 'Unknown target', 1, 0),
      lintDiagnostic('HSL001', 'Unused', 5, 0),
    ];
    const output = formatDiagnostics(diags);
    expect(output).toContain('1 error(s)');
    expect(output).toContain('1 warning(s)');
  });
});

// ── LSP Conversion ───────────────────────────────────────────────────────────

describe('toLSPDiagnostic', () => {
  it('converts to VS Code / LSP format', () => {
    const diag: HoloDiagnostic = {
      code: 'HSP001',
      message: 'Unexpected token',
      severity: 'error',
      line: 10,
      column: 5,
      origin: 'parser',
    };
    const lsp = toLSPDiagnostic(diag);
    expect(lsp.range.start.line).toBe(9); // 0-indexed
    expect(lsp.range.start.character).toBe(5);
    expect(lsp.severity).toBe(1); // Error
    expect(lsp.source).toBe('holoscript-parser');
  });

  it('maps warning severity to 2', () => {
    const lsp = toLSPDiagnostic(lintDiagnostic('HSL001', 'test', 1, 0));
    expect(lsp.severity).toBe(2);
  });

  it('includes suggestion in message', () => {
    const diag = compilerDiagnostic('HSC007', 'Unknown geo', 1, 0, { suggestion: 'Use "cube"' });
    const lsp = toLSPDiagnostic(diag);
    expect(lsp.message).toContain('💡 Use "cube"');
  });
});

// ── DiagnosticCollector ──────────────────────────────────────────────────────

describe('DiagnosticCollector', () => {
  it('collects diagnostics', () => {
    const collector = new DiagnosticCollector();
    collector.add(compilerDiagnostic('HSC001', 'err', 1, 0));
    collector.add(lintDiagnostic('HSL001', 'warn', 2, 0));
    expect(collector.getAll()).toHaveLength(2);
  });

  it('hasErrors returns true only for error severity', () => {
    const collector = new DiagnosticCollector();
    collector.add(lintDiagnostic('HSL001', 'warn', 1, 0));
    expect(collector.hasErrors()).toBe(false);

    collector.add(compilerDiagnostic('HSC001', 'err', 1, 0));
    expect(collector.hasErrors()).toBe(true);
  });

  it('counts by severity', () => {
    const collector = new DiagnosticCollector();
    collector.add(compilerDiagnostic('HSC001', 'e1', 1, 0));
    collector.add(compilerDiagnostic('HSC002', 'e2', 2, 0));
    collector.add(lintDiagnostic('HSL001', 'w1', 3, 0));

    const counts = collector.count();
    expect(counts.total).toBe(3);
    expect(counts.errors).toBe(2);
    expect(counts.warnings).toBe(1);
  });

  it('getErrors filters to errors only', () => {
    const collector = new DiagnosticCollector();
    collector.add(compilerDiagnostic('HSC001', 'err', 1, 0));
    collector.add(lintDiagnostic('HSL001', 'warn', 2, 0));
    expect(collector.getErrors()).toHaveLength(1);
  });

  it('format produces terminal output', () => {
    const collector = new DiagnosticCollector();
    collector.add(compilerDiagnostic('HSC001', 'Unknown target', 1, 0));
    const output = collector.format();
    expect(output).toContain('error[HSC001]');
    expect(output).toContain('1 error(s)');
  });

  it('clear empties the collection', () => {
    const collector = new DiagnosticCollector();
    collector.add(compilerDiagnostic('HSC001', 'err', 1, 0));
    collector.clear();
    expect(collector.getAll()).toHaveLength(0);
  });

  it('addAll adds multiple at once', () => {
    const collector = new DiagnosticCollector();
    collector.addAll([
      compilerDiagnostic('HSC001', 'a', 1, 0),
      compilerDiagnostic('HSC002', 'b', 2, 0),
    ]);
    expect(collector.getAll()).toHaveLength(2);
  });
});
