/**
 * HoloScript Linter Types
 *
 * Core type definitions for the linter.
 * This file is standalone to avoid circular dependencies.
 */

// Minimal AST node interface for rules (compatible with HSPlusNode)
export interface LintASTNode {
  type: string;
  id?: string;
  name?: string;
  children?: LintASTNode[];
  properties?: Record<string, unknown>;
  directives?: Array<{
    type: string;
    name: string;
    params?: Record<string, unknown>;
    loc?: { start: { line: number; column: number }; end?: { line: number; column: number } };
  }>;
  loc?: { start: { line: number; column: number }; end?: { line: number; column: number } };
  [key: string]: unknown;
}

export type Severity = 'error' | 'warning' | 'info' | 'hint';

export type RuleCategory =
  | 'syntax'
  | 'naming'
  | 'best-practice'
  | 'performance'
  | 'style'
  | 'type-safety';

export interface LintDiagnostic {
  ruleId: string;
  message: string;
  severity: Severity;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  fix?: LintFix;
}

export interface LintFix {
  range: { start: number; end: number };
  replacement: string;
}

export interface LintResult {
  filePath: string;
  diagnostics: LintDiagnostic[];
  errorCount: number;
  warningCount: number;
  fixableCount: number;
}

export interface LinterConfig {
  // Rule configurations
  rules: Record<string, RuleConfig>;

  // File patterns to ignore
  ignorePatterns: string[];

  // Maximum errors before stopping
  maxErrors: number;

  // Enable type checking (HSPlus only)
  typeChecking: boolean;
}

export type RuleConfig =
  | 'off'
  | 'warn'
  | 'error'
  | 'info'
  | ['warn' | 'error' | 'info', Record<string, unknown>];

export interface Rule {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  defaultSeverity: Severity;
  check(context: RuleContext): LintDiagnostic[];
}

export interface RuleContext {
  source: string;
  lines: string[];
  fileType: 'holo' | 'hsplus';
  config: Record<string, unknown>;
  ast?: LintASTNode;
}
