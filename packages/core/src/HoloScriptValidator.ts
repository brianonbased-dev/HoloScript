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

    // Note: Directive whitelist validation (@trait, @state, etc.) was intentionally
    // removed from this legacy validator. HoloScript has 2,000+ valid VR trait names,
    // making a static whitelist impractical and error-prone. Directive validation is
    // deferred to the HoloScriptPlusParser which has access to the full trait registry.

    return errors;
  }
}
