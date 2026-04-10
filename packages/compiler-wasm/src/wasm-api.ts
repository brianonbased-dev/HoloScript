/**
 * TypeScript API types and wrapper for the HoloScript WASM compiler.
 *
 * Mirrors the Rust wasm_bindgen exports from lib.rs:
 *   - parse(source) -> JSON AST string
 *   - parse_pretty(source) -> pretty-printed JSON AST string
 *   - validate(source) -> boolean
 *   - validate_detailed(source) -> JSON validation result string
 *   - version() -> semver string
 */

// ── AST Types (mirror ast.rs serde output) ──────────────────────────

export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface Location {
  start: Position;
  end: Position;
}

export interface PropertyNode {
  type: 'Property';
  key: string;
  value: AstNode;
  loc?: Location;
}

export interface TraitNode {
  type: 'Trait';
  name: string;
  config?: AstNode;
  loc?: Location;
}

export interface OrbNode {
  type: 'Orb';
  name: string;
  traits: TraitNode[];
  properties: PropertyNode[];
  children: AstNode[];
  loc?: Location;
}

export interface CompositionNode {
  type: 'Composition';
  name: string;
  traits: TraitNode[];
  properties: PropertyNode[];
  children: AstNode[];
  loc?: Location;
}

export interface GroupNode {
  type: 'Group';
  name: string;
  traits: TraitNode[];
  properties: PropertyNode[];
  children: AstNode[];
  loc?: Location;
}

export interface EnvironmentNode {
  type: 'Environment';
  properties: PropertyNode[];
  children: AstNode[];
  loc?: Location;
}

export interface StringLiteral {
  type: 'String';
  value: string;
  loc?: Location;
}

export interface NumberLiteral {
  type: 'Number';
  value: number;
  raw: string;
  loc?: Location;
}

export interface BooleanLiteral {
  type: 'Boolean';
  value: boolean;
  loc?: Location;
}

export interface ArrayNode {
  type: 'Array';
  elements: AstNode[];
  loc?: Location;
}

export interface IdentifierNode {
  type: 'Identifier';
  name: string;
  loc?: Location;
}

export type AstNode =
  | OrbNode
  | CompositionNode
  | GroupNode
  | EnvironmentNode
  | PropertyNode
  | TraitNode
  | StringLiteral
  | NumberLiteral
  | BooleanLiteral
  | ArrayNode
  | IdentifierNode
  | { type: string; [key: string]: unknown };

export interface Ast {
  type: 'Program';
  body: AstNode[];
  directives: unknown[];
}

// ── Error Types ─────────────────────────────────────────────────────

export interface ParseError {
  message: string;
  line: number;
  column: number;
}

export interface ParseErrorResult {
  errors: ParseError[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ParseError[];
}

// ── WASM Module Interface ───────────────────────────────────────────

/**
 * The public API exported by the WASM module via wasm_bindgen.
 * Each function corresponds to a #[wasm_bindgen] export in lib.rs.
 */
export interface HoloScriptWasmModule {
  /** Parse HoloScript source and return AST as JSON string */
  parse(source: string): string;
  /** Parse HoloScript source and return pretty-printed AST as JSON string */
  parse_pretty(source: string): string;
  /** Validate HoloScript source, returns true if valid */
  validate(source: string): boolean;
  /** Get detailed validation results as JSON string */
  validate_detailed(source: string): string;
  /** Get the WASM compiler version */
  version(): string;
}

// ── Wrapper ─────────────────────────────────────────────────────────

/**
 * High-level wrapper around the raw WASM module that provides
 * typed return values instead of raw JSON strings.
 */
export class HoloScriptWasm {
  constructor(private readonly wasm: HoloScriptWasmModule) {}

  /**
   * Parse HoloScript source code into a typed AST.
   * @throws Error if parsing fails with syntax errors
   */
  parse(source: string): Ast {
    const json = this.wasm.parse(source);
    const result: Ast | ParseErrorResult = JSON.parse(json);
    if ('errors' in result) {
      const errors = (result as ParseErrorResult).errors;
      throw new HoloScriptParseError(
        `Parse failed with ${errors.length} error(s): ${errors[0]?.message ?? 'unknown'}`,
        errors,
      );
    }
    return result as Ast;
  }

  /**
   * Parse and return pretty-printed JSON string.
   */
  parsePretty(source: string): string {
    return this.wasm.parse_pretty(source);
  }

  /**
   * Quick validation check.
   */
  validate(source: string): boolean {
    return this.wasm.validate(source);
  }

  /**
   * Detailed validation with error locations.
   */
  validateDetailed(source: string): ValidationResult {
    const json = this.wasm.validate_detailed(source);
    return JSON.parse(json) as ValidationResult;
  }

  /**
   * Get the WASM compiler version.
   */
  version(): string {
    return this.wasm.version();
  }
}

/**
 * Error class for parse failures with structured error info.
 */
export class HoloScriptParseError extends Error {
  constructor(
    message: string,
    public readonly errors: ParseError[],
  ) {
    super(message);
    this.name = 'HoloScriptParseError';
  }
}
