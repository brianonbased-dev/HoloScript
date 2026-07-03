import { HoloScriptPlusParser } from './HoloScriptPlusParser';
import type {
  HSPlusCompileResult,
  HSPlusParserOptions,
} from './HoloScriptPlusParser';

export type HsplusGrammarSource =
  | 'rust-wasm-node'
  | 'rust-wasm-browser'
  | 'typescript-fallback'
  | 'custom';

export interface HsplusGrammarError {
  message: string;
  line: number;
  column: number;
}

export interface HsplusGrammarParseResult {
  success: boolean;
  ast?: unknown;
  errors: HsplusGrammarError[];
  raw?: unknown;
}

export interface HsplusGrammarValidationResult {
  valid: boolean;
  errors: HsplusGrammarError[];
  raw?: unknown;
}

export interface HsplusGrammar {
  readonly source: HsplusGrammarSource;
  parse(source: string): Promise<HsplusGrammarParseResult> | HsplusGrammarParseResult;
  validate(source: string): Promise<boolean> | boolean;
  validateDetailed(
    source: string
  ): Promise<HsplusGrammarValidationResult> | HsplusGrammarValidationResult;
  version(): Promise<string> | string;
}

export function normalizeHsplusGrammarErrors(errors: unknown): HsplusGrammarError[] {
  if (!Array.isArray(errors)) return [];

  return errors.map((error) => {
    const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
    return {
      message: typeof record.message === 'string' ? record.message : String(error),
      line: typeof record.line === 'number' ? record.line : 0,
      column: typeof record.column === 'number' ? record.column : 0,
    };
  });
}

export class TypeScriptHsplusGrammar implements HsplusGrammar {
  readonly source = 'typescript-fallback' as const;

  constructor(private readonly options: HSPlusParserOptions = {}) {}

  parse(source: string): HsplusGrammarParseResult {
    const result = this.parseWithTypeScript(source);
    return {
      success: result.success,
      ast: result.ast,
      errors: normalizeHsplusGrammarErrors(result.errors),
      raw: result,
    };
  }

  validate(source: string): boolean {
    return this.validateDetailed(source).valid;
  }

  validateDetailed(source: string): HsplusGrammarValidationResult {
    const parsed = this.parse(source);
    return {
      valid: parsed.success,
      errors: parsed.errors,
      raw: parsed.raw,
    };
  }

  version(): string {
    return 'typescript-hsplus';
  }

  private parseWithTypeScript(source: string): HSPlusCompileResult {
    const parser = new HoloScriptPlusParser(this.options);
    return parser.parse(source);
  }
}
