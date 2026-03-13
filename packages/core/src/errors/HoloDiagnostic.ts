/**
 * HoloDiagnostic.ts — Unified Error Schema for HoloScript
 *
 * Provides a single, standard error format used by parser, compiler,
 * and runtime. Every error surfaced in Studio, MCP, LSP, or CLI
 * uses this shape.
 *
 * Shape: { code, message, severity, line, column, endLine?, endColumn?,
 *          source?, context?, suggestion?, quickFixes? }
 *
 * The schema is intentionally compatible with:
 *  - VS Code Diagnostic API
 *  - LSP DiagnosticSeverity
 *  - RichParseError (parser layer)
 *  - ParserErrorCollector.CollectedError
 */

// ── Core Types ─────────────────────────────────────────────────────────────

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export type DiagnosticOrigin = 'parser' | 'compiler' | 'runtime' | 'lint' | 'trait' | 'mcp';

export interface HoloDiagnostic {
  /** Error code for documentation reference (e.g., HSP001, HSC001, HSR001) */
  code: string;
  /** Human-readable description of the problem */
  message: string;
  /** Severity level */
  severity: DiagnosticSeverity;
  /** Start line (1-indexed) */
  line: number;
  /** Start column (0-indexed) */
  column: number;
  /** Optional end line */
  endLine?: number;
  /** Optional end column */
  endColumn?: number;
  /** Which subsystem produced this diagnostic */
  origin: DiagnosticOrigin;
  /** Surrounding source lines for context display */
  context?: string;
  /** "Did you mean?" or actionable suggestion */
  suggestion?: string;
  /** Machine-applicable quick fixes */
  quickFixes?: QuickFix[];
  /** File path or format identifier (.hs, .hsplus, .holo) */
  file?: string;
}

export interface QuickFix {
  /** Label shown in UI */
  title: string;
  /** Line range to replace */
  range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
  /** Replacement text */
  newText: string;
}

// ── Error Code Prefixes ────────────────────────────────────────────────────

/**
 * Error codes follow the pattern: HS[P|C|R|L]NNN
 *  - HSP = Parser errors (HSP001–HSP999)
 *  - HSC = Compiler errors (HSC001–HSC999)
 *  - HSR = Runtime errors (HSR001–HSR999)
 *  - HSL = Lint warnings (HSL001–HSL999)
 */
export const ERROR_CODE_RANGES = {
  parser:   { prefix: 'HSP', range: [1, 999] },
  compiler: { prefix: 'HSC', range: [1, 999] },
  runtime:  { prefix: 'HSR', range: [1, 999] },
  lint:     { prefix: 'HSL', range: [1, 999] },
} as const;

// Common compiler error codes
export const COMPILER_ERRORS = {
  HSC001: 'Unknown compile target',
  HSC002: 'Unsupported trait for target',
  HSC003: 'Invalid physics configuration',
  HSC004: 'Missing required property',
  HSC005: 'Type mismatch in property value',
  HSC006: 'Circular template reference',
  HSC007: 'Unknown geometry type',
  HSC008: 'Invalid collider configuration',
  HSC009: 'Scope resolution failure',
  HSC010: 'Code generation error',
} as const;

// Common runtime error codes
export const RUNTIME_ERRORS = {
  HSR001: 'Object not found in scene',
  HSR002: 'Trait initialization failed',
  HSR003: 'Physics engine error',
  HSR004: 'Network sync failure',
  HSR005: 'Asset load failure',
  HSR006: 'Script execution timeout',
  HSR007: 'Memory limit exceeded',
  HSR008: 'Invalid state transition',
  HSR009: 'Event handler error',
  HSR010: 'Permission denied',
} as const;

// ── Factory Functions ──────────────────────────────────────────────────────

/**
 * Create a parser diagnostic from a RichParseError
 */
export function fromParserError(error: {
  code: string;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  context?: string;
  suggestion?: string;
  severity?: string;
}): HoloDiagnostic {
  return {
    code: error.code,
    message: error.message,
    severity: (error.severity as DiagnosticSeverity) ?? 'error',
    line: error.line,
    column: error.column,
    endLine: error.endLine,
    endColumn: error.endColumn,
    origin: 'parser',
    context: error.context,
    suggestion: error.suggestion,
  };
}

/**
 * Create a compiler diagnostic
 */
export function compilerDiagnostic(
  code: keyof typeof COMPILER_ERRORS,
  message: string,
  line: number,
  column: number,
  options: Partial<Pick<HoloDiagnostic, 'severity' | 'suggestion' | 'context' | 'file' | 'quickFixes'>> = {}
): HoloDiagnostic {
  return {
    code,
    message: message || COMPILER_ERRORS[code],
    severity: options.severity ?? 'error',
    line,
    column,
    origin: 'compiler',
    ...options,
  };
}

/**
 * Create a runtime diagnostic
 */
export function runtimeDiagnostic(
  code: keyof typeof RUNTIME_ERRORS,
  message: string,
  line: number = 0,
  column: number = 0,
  options: Partial<Pick<HoloDiagnostic, 'severity' | 'suggestion' | 'context' | 'file'>> = {}
): HoloDiagnostic {
  return {
    code,
    message: message || RUNTIME_ERRORS[code],
    severity: options.severity ?? 'error',
    line,
    column,
    origin: 'runtime',
    ...options,
  };
}

/**
 * Create a lint diagnostic (warning severity by default)
 */
export function lintDiagnostic(
  code: string,
  message: string,
  line: number,
  column: number,
  options: Partial<Pick<HoloDiagnostic, 'severity' | 'suggestion' | 'quickFixes'>> = {}
): HoloDiagnostic {
  return {
    code,
    message,
    severity: options.severity ?? 'warning',
    line,
    column,
    origin: 'lint',
    ...options,
  };
}

// ── Formatting ─────────────────────────────────────────────────────────────

/**
 * Format a diagnostic for terminal/log display.
 *
 * Example output:
 *   error[HSP004]: Unclosed brace - missing }
 *     --> scene.holo:15:3
 *     |
 *  15 |   object "Player" {
 *     |                    ^ Expected matching }
 *     = suggestion: Add a closing } brace
 */
export function formatDiagnostic(diag: HoloDiagnostic): string {
  const lines: string[] = [];
  const file = diag.file ?? '<source>';

  // Header: severity[CODE]: message
  lines.push(`${diag.severity}[${diag.code}]: ${diag.message}`);

  // Location
  lines.push(`  --> ${file}:${diag.line}:${diag.column}`);

  // Context
  if (diag.context) {
    lines.push('  |');
    for (const ctxLine of diag.context.split('\n')) {
      lines.push(`  | ${ctxLine}`);
    }
  }

  // Suggestion
  if (diag.suggestion) {
    lines.push(`  = suggestion: ${diag.suggestion}`);
  }

  // Quick fixes
  if (diag.quickFixes?.length) {
    for (const fix of diag.quickFixes) {
      lines.push(`  = fix: ${fix.title}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format multiple diagnostics, grouped by severity
 */
export function formatDiagnostics(diagnostics: HoloDiagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');
  const infos = diagnostics.filter((d) => d.severity === 'info' || d.severity === 'hint');

  const sections: string[] = [];

  for (const diag of [...errors, ...warnings, ...infos]) {
    sections.push(formatDiagnostic(diag));
  }

  const summary = [
    errors.length > 0 ? `${errors.length} error(s)` : null,
    warnings.length > 0 ? `${warnings.length} warning(s)` : null,
    infos.length > 0 ? `${infos.length} info(s)` : null,
  ].filter(Boolean).join(', ');

  sections.push(`\n${summary}`);

  return sections.join('\n\n');
}

// ── LSP Conversion ─────────────────────────────────────────────────────────

/**
 * Convert to VS Code / LSP Diagnostic shape
 */
export function toLSPDiagnostic(diag: HoloDiagnostic): {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  message: string;
  severity: number;
  code: string;
  source: string;
} {
  const severityMap: Record<DiagnosticSeverity, number> = {
    error: 1,
    warning: 2,
    info: 3,
    hint: 4,
  };

  return {
    range: {
      start: { line: diag.line - 1, character: diag.column },
      end: { line: (diag.endLine ?? diag.line) - 1, character: diag.endColumn ?? diag.column + 1 },
    },
    message: diag.suggestion ? `${diag.message}\n💡 ${diag.suggestion}` : diag.message,
    severity: severityMap[diag.severity],
    code: diag.code,
    source: `holoscript-${diag.origin}`,
  };
}

// ── Collection ─────────────────────────────────────────────────────────────

/**
 * Lightweight diagnostic collector for accumulating errors across phases.
 */
export class DiagnosticCollector {
  private readonly diagnostics: HoloDiagnostic[] = [];

  add(diag: HoloDiagnostic): void {
    this.diagnostics.push(diag);
  }

  addAll(diags: HoloDiagnostic[]): void {
    this.diagnostics.push(...diags);
  }

  hasErrors(): boolean {
    return this.diagnostics.some((d) => d.severity === 'error');
  }

  getAll(): readonly HoloDiagnostic[] {
    return this.diagnostics;
  }

  getErrors(): HoloDiagnostic[] {
    return this.diagnostics.filter((d) => d.severity === 'error');
  }

  getWarnings(): HoloDiagnostic[] {
    return this.diagnostics.filter((d) => d.severity === 'warning');
  }

  count(): { total: number; errors: number; warnings: number; infos: number } {
    return {
      total: this.diagnostics.length,
      errors: this.diagnostics.filter((d) => d.severity === 'error').length,
      warnings: this.diagnostics.filter((d) => d.severity === 'warning').length,
      infos: this.diagnostics.filter((d) => d.severity === 'info' || d.severity === 'hint').length,
    };
  }

  format(): string {
    return formatDiagnostics(this.diagnostics);
  }

  clear(): void {
    this.diagnostics.length = 0;
  }
}
