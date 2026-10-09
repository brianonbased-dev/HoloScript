/**
 * HoloScript Validator
 * Performs static analysis on HoloScript code to detect syntax and semantic errors.
 */

import { HoloScriptCodeParser, type ParseResult } from './HoloScriptCodeParser';

export interface ValidationError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Positions in this API are 1-based. The parser reports line 0 / column 0 when
 * it has no token to point at (end of input, security rejections), so anything
 * below 1 — or not a finite number — becomes 1.
 */
function atLeastOne(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/**
 * Reports what the legacy `HoloScriptCodeParser` finds in its own `.hs` dialect.
 *
 * @deprecated For a verdict on `.holo`, `.hsplus` or `.hs` source use
 * `validateCanonicalSource`, the validator behind `holoscript validate`, the
 * `validate_holoscript` tool and the LSP. This parser rejects most valid `.holo`
 * compositions and accepts some text that is not HoloScript at all.
 */
export class HoloScriptValidator {
  private parser: HoloScriptCodeParser;

  constructor() {
    this.parser = new HoloScriptCodeParser();
  }

  /**
   * Validates source code and returns a list of errors.
   *
   * Every entry in the parser's `errors` is reported with severity 'error', and
   * every entry in its `warnings` with severity 'warning'. The parser sets
   * `success` from `errors.length === 0`, so mapping all of `errors` to 'error'
   * keeps the two verdicts identical: this returns an error-severity entry
   * exactly when the parse failed.
   */
  validate(code: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // 1. Basic Syntax Check (Lexer/Parser)
    let result: ParseResult;
    try {
      result = this.parser.parse(code);
    } catch (e: unknown) {
      // parse() catches its own failures and reports them in the result, so a
      // throw here means the call itself was unusable (e.g. a non-string input).
      const err = e as { line?: number; column?: number; message?: string };
      errors.push({
        line: atLeastOne(err.line),
        column: atLeastOne(err.column),
        message: err.message || 'Syntax Error',
        severity: 'error',
      });
      return errors; // syntax error usually stops further analysis
    }

    for (const parseError of result.errors) {
      errors.push({
        line: atLeastOne(parseError.line),
        column: atLeastOne(parseError.column),
        message: parseError.message,
        severity: 'error',
      });
    }

    // A failed parse must never read as valid, even if it named no error.
    if (!result.success && result.errors.length === 0) {
      errors.push({
        line: 1,
        column: 1,
        message: 'Parse failed without reporting an error',
        severity: 'error',
      });
    }

    // Parser warnings are plain strings with no position.
    for (const warning of result.warnings) {
      errors.push({ line: 1, column: 1, message: warning, severity: 'warning' });
    }

    // Note: Directive whitelist validation (@trait, @state, etc.) was intentionally
    // removed from this legacy validator. HoloScript has 2,000+ valid VR trait names,
    // making a static whitelist impractical and error-prone. Directive validation is
    // deferred to the HoloScriptPlusParser which has access to the full trait registry.

    return errors;
  }
}
