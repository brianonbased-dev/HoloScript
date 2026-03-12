/**
 * HoloScript Validator
 * Performs static analysis on HoloScript code to detect syntax and semantic errors.
 */

import { HoloScriptCodeParser } from './HoloScriptCodeParser';

export interface ValidationError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

export class HoloScriptValidator {
  private parser: HoloScriptCodeParser;

  /**
   * Known safe directives that do NOT produce unknown-directive warnings.
   * These are HoloScript lifecycle/system keywords, not VR trait names.
   */
  private static KNOWN_DIRECTIVES = new Set([
    'trait',
    'state',
    'on_enter',
    'on_exit',
    'on_mount',
    'on_tick',
    'on_create',
    'bot_config',
    'lifecycle',
  ]);

  private static VALID_KEYWORDS = [
    'world',
    'scene',
    'prefab',
    'object',
    'import',
    'export',
    'on_error',
    'assert',
  ];

  constructor() {
    this.parser = new HoloScriptCodeParser();
  }

  /**
   * Validates source code and returns a list of errors.
   */
  validate(code: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // 1. Basic Syntax Check (Lexer/Parser)
    try {
      this.parser.parse(code);
    } catch (e: unknown) {
      // If the parser throws, catch it and convert to a validation error
      // Assuming parser error messages contain some line info if possible,
      // otherwise default to line 1.
      // Note: Our current parser might just throw a string or simple error.
      // We'll try to extract line numbers if the parser supports it,
      // or standard Regex matching for common syntax errors.
      const err = e as { line?: number; column?: number; message?: string };
      errors.push({
        line: err.line || 1, // Fallback if parser doesn't provide line
        column: err.column || 1,
        message: err.message || 'Syntax Error',
        severity: 'error',
      });
      return errors; // syntax error usually stops further analysis
    }

    // 2. Semantic Analysis (Regex-based for now since AST isn't fully exposed via parse() return in v1)
    // In a robust implementation, parser.parse would return the AST.
    // For now we will scan strict patterns.

    const lines = code.split('\n');
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('//')) return;

      // Check for unknown @directive tokens
      // Scan for @word patterns on each line and warn if not in KNOWN_DIRECTIVES
      const directiveMatches = trimmed.matchAll(/@([a-zA-Z_][a-zA-Z0-9_]*)/g);
      for (const match of directiveMatches) {
        const directiveName = match[1];
        if (!HoloScriptValidator.KNOWN_DIRECTIVES.has(directiveName)) {
          const col = (line.indexOf('@' + directiveName) ?? 0) + 1;
          errors.push({
            line: lineNum,
            column: col,
            message: `Unknown directive '@${directiveName}'. If this is a VR trait, ensure it is registered in the trait registry.`,
            severity: 'warning',
          });
        }
      }

      // Check unknown top-level keywords (heuristic)
      // This is harder without AST, but we can check lines that end with '{'
      // and look like definitions.
      if (trimmed.endsWith('{')) {
        const firstWord = trimmed.split(' ')[0];
        // If it looks like a definition "type name {"
        if (line.match(/^[a-z]+\s+[\w#]+\s*\{$/)) {
          if (
            !HoloScriptValidator.VALID_KEYWORDS.includes(firstWord) &&
            !trimmed.startsWith('trait')
          ) {
            // 'trait' is valid inside object, need context.
            // We'll skip strict keyword check without full AST context for now to avoid false positives.
          }
        }
      }
    });

    return errors;
  }
}
