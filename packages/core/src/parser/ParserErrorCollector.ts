/**
 * Parser Error Collector and Recovery Integration
 *
 * Bridges the HoloScriptPlusParser with the ErrorRecovery module to provide:
 * - Multi-error collection (all errors per parse, not just first)
 * - Enhanced error messages with suggestions
 * - Error severity levels (error/warning/info)
 * - Quick fixes for common mistakes
 *
 * Usage in parser:
 * ```typescript
 * const collector = new ParserErrorCollector();
 * try {
 *   // parser operations
 * } catch (e) {
 *   collector.collectError(e, context);
 * }
 * const report = collector.getReport();
 * ```
 */

import type { ParseError, QuickFix, ErrorCode } from './ErrorRecovery';
import {
  enrichErrorWithSuggestions,
  generateQuickFixes,
  HOLOSCHEMA_TRAITS,
  HOLOSCHEMA_GEOMETRIES,
  HOLOSCHEMA_PROPERTIES,
} from './ErrorRecovery';

// =============================================================================
// ERROR COLLECTION TYPES
// =============================================================================

export interface CollectedError extends ParseError {
  severity?: 'error' | 'warning' | 'info' | 'hint';
  quickFixes?: QuickFix[];
  recoveryHint?: string;
}

export interface ErrorReport {
  /** Total number of errors collected */
  errorCount: number;
  /** Total number of warnings */
  warningCount: number;
  /** All collected errors and warnings */
  diagnostics: CollectedError[];
  /** Whether parsing should stop (critical errors prevent continuing) */
  shouldStop: boolean;
  /** Source code being parsed */
  source: string;
}

// =============================================================================
// PARSER ERROR COLLECTOR
// =============================================================================

export class ParserErrorCollector {
  private errors: CollectedError[] = [];
  private warnings: CollectedError[] = [];
  private source: string = '';
  private maxErrors = 100; // Prevent runaway error collection

  constructor(source: string = '', maxErrors: number = 100) {
    this.source = source;
    this.maxErrors = maxErrors;
  }

  /**
   * Collect an error from parser
   */
  collectError(
    error: Error | ParseError | string,
    context?: {
      line?: number;
      column?: number;
      token?: string;
      message?: string;
    }
  ): void {
    if (this.errors.length >= this.maxErrors) {
      return; // Stop collecting after limit reached
    }

    let parseError: ParseError;

    if (typeof error === 'string') {
      // Detect error type from message
      let errorCode: unknown = 'SYNTAX_ERROR';
      if (/missing.*brace/i.test(error)) {
        errorCode = 'MISSING_BRACE';
      } else if (/missing.*colon/i.test(error)) {
        errorCode = 'MISSING_COLON';
      } else if (/missing.*quote|unterminated string/i.test(error)) {
        errorCode = 'MISSING_QUOTE';
      }

      parseError = {
        // @ts-expect-error
        code: errorCode,
        message: error,
        line: context?.line ?? 1,
        column: context?.column ?? 0,
        source: context?.message,
      };
    } else if (error instanceof Error) {
      parseError = {
        code: 'SYNTAX_ERROR',
        message: error.message,
        line: context?.line ?? 1,
        column: context?.column ?? 0,
      };
    } else {
      parseError = {
        code: error.code || 'SYNTAX_ERROR',
        message: error.message,
        line: error.line ?? context?.line ?? 1,
        column: error.column ?? context?.column ?? 0,
        suggestions: error.suggestions, // Preserve existing suggestions
      };
    }

    // Enrich with suggestions from ErrorRecovery module
    const enriched = enrichErrorWithSuggestions(parseError, this.source);

    // Generate quick fixes if possible
    const quickFixes = generateQuickFixes(enriched, this.source);

    const collected: CollectedError = {
      ...enriched,
      severity: this.determineSeverity(enriched.code),
      quickFixes,
      recoveryHint: this.getRecoveryHint(enriched.code),
    };

    this.errors.push(collected);
  }

  /**
   * Collect a warning (non-fatal issue)
   */
  collectWarning(
    message: string,
    line: number = 1,
    column: number = 0,
    code: string = 'SYNTAX_ERROR'
  ): void {
    if (this.warnings.length >= this.maxErrors / 2) {
      return;
    }

    this.warnings.push({
      code: code as ErrorCode,
      message,
      line,
      column,
      severity: 'warning',
    });
  }

  /**
   * Check if there are any errors (non-warning)
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Check if collection hit max error limit
   */
  isLimited(): boolean {
    return this.errors.length >= this.maxErrors;
  }

  /**
   * Generate final error report
   */
  getReport(): ErrorReport {
    return {
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
      diagnostics: [...this.errors, ...this.warnings],
      shouldStop: this.errors.length > 0,
      source: this.source,
    };
  }

  /**
   * Get formatted error list for display
   */
  format(): string {
    if (this.errors.length === 0 && this.warnings.length === 0) {
      return 'No errors found';
    }

    const lines: string[] = [];

    // Format errors
    for (const error of this.errors) {
      lines.push(`❌ [${error.code}] Line ${error.line}:${error.column}`);
      lines.push(`   ${error.message}`);

      if (error.suggestions && error.suggestions.length > 0) {
        for (const suggestion of error.suggestions.slice(0, 2)) {
          lines.push(`   💡 ${suggestion.description}`);
          if (suggestion.fix) {
            lines.push(`      ${suggestion.fix}`);
          }
        }
      }

      if (error.recoveryHint) {
        lines.push(`   🔧 ${error.recoveryHint}`);
      }

      lines.push('');
    }

    // Format warnings
    for (const warning of this.warnings) {
      lines.push(`⚠️  [${warning.code}] Line ${warning.line}:${warning.column}`);
      lines.push(`   ${warning.message}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get JSON representation for LSP/IDE integration
   */
  toJSON(): unknown {
    return {
      success: !this.hasErrors(),
      errors: this.errors.length,
      warnings: this.warnings.length,
      diagnostics: this.errors.map((e) => ({
        range: {
          start: { line: e.line - 1, character: e.column },
          end: { line: e.line - 1, character: e.column + 10 },
        },
        severity: e.severity === 'error' ? 1 : 2,
        code: e.code,
        message: e.message,
        suggestions: e.suggestions,
        fixes: e.quickFixes,
      })),
    };
  }

  /**
   * Clear collected errors
   */
  reset(): void {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Set source code being parsed
   */
  setSource(source: string): void {
    this.source = source;
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private determineSeverity(code: string): 'error' | 'warning' | 'info' | 'hint' {
    switch (code) {
      case 'SYNTAX_ERROR':
      case 'MISSING_BRACE':
      case 'MISSING_COLON':
      case 'MISSING_QUOTE':
      case 'UNEXPECTED_TOKEN':
        return 'error';

      case 'UNKNOWN_GEOMETRY':
      case 'UNKNOWN_TRAIT':
      case 'INVALID_PROPERTY':
        return 'warning';

      case 'INVALID_VALUE':
      case 'DUPLICATE_NAME':
        return 'info';

      default:
        return 'info';
    }
  }

  private getRecoveryHint(code: string): string {
    switch (code) {
      case 'MISSING_BRACE':
        return 'Add a closing } to match the opening {';

      case 'MISSING_COLON':
        return 'Property definitions need a colon between name and value';

      case 'MISSING_QUOTE':
        return 'Close string literals with matching quotes';

      case 'UNEXPECTED_TOKEN':
        return 'Check for typos or unexpected syntax';

      case 'UNKNOWN_KEYWORD':
        return "Verify keyword spelling and that you're in the correct context";

      case 'UNKNOWN_TRAIT':
        return `Valid traits include: ${HOLOSCHEMA_TRAITS.slice(0, 5).join(', ')}...`;

      case 'UNKNOWN_GEOMETRY':
        return `Valid geometries: ${HOLOSCHEMA_GEOMETRIES.join(', ')}`;

      case 'INVALID_PROPERTY':
        return `Valid properties: ${HOLOSCHEMA_PROPERTIES.slice(0, 5).join(', ')}...`;

      case 'TRAIT_CONFLICT':
        return 'Some traits are mutually exclusive - check documentation';

      case 'TRAIT_REQUIRES':
        return 'This trait requires other traits to be present';

      default:
        return '';
    }
  }
}

// =============================================================================
// PARSER INTEGRATION HELPERS
// =============================================================================

/**
 * Create error collector for a parse operation
 */
export function createErrorCollector(source: string): ParserErrorCollector {
  return new ParserErrorCollector(source);
}

/**
 * Wrap parser method to collect errors instead of throwing
 */
export function withErrorCollection<T>(
  fn: (collector: ParserErrorCollector) => T,
  source: string
): { result?: T; report: ErrorReport } {
  const collector = new ParserErrorCollector(source);

  try {
    const result = fn(collector);
    const report = collector.getReport();
    return { result, report };
  } catch (e) {
    const collector2 = new ParserErrorCollector(source);
    collector2.collectError(e as Error);
    return { report: collector2.getReport() };
  }
}

/**
 * Synchronization strategies for error recovery
 */
export class SynchronizationStrategies {
  /**
   * Skip to next statement boundary (semicolon or newline)
   */
  static skipToStatement(tokens: unknown[], current: number): number {
    while (current < tokens.length) {
      // @ts-expect-error
      if (tokens[current].type === 'SEMICOLON' || tokens[current].type === 'NEWLINE') {
        return current + 1;
      }
      current++;
    }
    return current;
  }

  /**
   * Skip to next block boundary (matching brace)
   */
  static skipToBlockEnd(tokens: unknown[], current: number): number {
    let braceCount = 1;
    current++;

    while (current < tokens.length && braceCount > 0) {
      // @ts-expect-error
      if (tokens[current].type === 'LBRACE') {
        braceCount++;
      // @ts-expect-error
      } else if (tokens[current].type === 'RBRACE') {
        braceCount--;
      }
      current++;
    }

    return current;
  }

  /**
   * Skip to next keyword
   */
  static skipToKeyword(tokens: unknown[], current: number, keywords: string[]): number {
    while (current < tokens.length) {
      // @ts-expect-error
      if (keywords.includes(tokens[current].value)) {
        return current;
      }
      current++;
    }
    return current;
  }

  /**
   * Find matching closing bracket
   */
  static findMatchingBracket(
    tokens: unknown[],
    current: number,
    openType: string,
    closeType: string
  ): number {
    let count = 1;
    current++;

    while (current < tokens.length && count > 0) {
      // @ts-expect-error
      if (tokens[current].type === openType) {
        count++;
      // @ts-expect-error
      } else if (tokens[current].type === closeType) {
        count--;
      }
      current++;
    }

    return count === 0 ? current - 1 : -1;
  }
}
