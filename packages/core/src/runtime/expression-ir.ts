/**
 * Expression IR — safe replacement for `new Function()` / `eval()` trait expressions
 *
 * Phase 0 + Phase 1 (first 2 sites) of the hsplus-eval-uaal-dispatch migration
 * (research/2026-07-03_hsplus-eval-uaal-dispatch-scope.md). Provides a typed,
 * allowlist-only expression IR plus a narrow parser and a pure synchronous
 * interpreter — no `new Function`, no `eval`, no dynamic property indirection.
 *
 * This is intentionally NOT `condition-evaluator.ts` (regex/blocklist-based
 * boolean-condition splitter, delegates arithmetic to an injected callback —
 * exactly the blocklist pattern this migration moves away from) and NOT
 * `holo-expression.ts` (async, callback-driven AST walker with no allowlist).
 * Both predate this migration and are unwired to SensorTrait/TransformTrait.
 *
 * Fail-closed properties:
 *  - Unknown identifiers throw ExpressionIRError (never silently resolve).
 *  - MemberExpression uses hasOwnProperty (never `in`), so prototype-chain
 *    lookups (`constructor`, `__proto__`, inherited `toString`) never resolve.
 *  - CallExpression callee is typed as AllowedBuiltin — an out-of-allowlist
 *    name is a compile-time error for hand-built IR and a runtime
 *    ExpressionIRError for parser-built IR.
 *  - No Function, eval, globalThis, process, or dynamic property indirection
 *    anywhere in the interpreter body.
 *
 * @see research/2026-07-03_hsplus-eval-uaal-dispatch-scope.md
 */

// =============================================================================
// TYPES
// =============================================================================

/** Builtins explicitly allowlisted for CallExpression. Nothing else may be named. */
export const ALLOWED_BUILTINS = [
  'abs',
  'min',
  'max',
  'round',
  'floor',
  'ceil',
  'sqrt',
  'pow',
  'toString',
  'toFixed',
] as const;

export type AllowedBuiltin = (typeof ALLOWED_BUILTINS)[number];

export type BinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '==='
  | '!=='
  | '=='
  | '!='
  | '<'
  | '>'
  | '<='
  | '>='
  | '&&'
  | '||';

export type UnaryOperator = '-' | '!';

/** Discriminated union — the full expression IR. */
export type ExpressionIR =
  | LiteralIR
  | IdentifierIR
  | BinaryExpressionIR
  | UnaryExpressionIR
  | MemberExpressionIR
  | CallExpressionIR;

export interface LiteralIR {
  kind: 'Literal';
  value: number | string | boolean | null;
}

/** A reference to a named slot in the evaluation context (e.g. `value`, or a declared `$field`). */
export interface IdentifierIR {
  kind: 'Identifier';
  /** Slot name as it will be looked up in `context` at eval time. Must be in the parser's `allowedSlots`. */
  name: string;
}

export interface BinaryExpressionIR {
  kind: 'BinaryExpression';
  operator: BinaryOperator;
  left: ExpressionIR;
  right: ExpressionIR;
}

export interface UnaryExpressionIR {
  kind: 'UnaryExpression';
  operator: UnaryOperator;
  argument: ExpressionIR;
}

/** Property access, e.g. `value.x` or `state.foo`. Only dotted static property names — no computed `[...]` access. */
export interface MemberExpressionIR {
  kind: 'MemberExpression';
  object: ExpressionIR;
  property: string;
}

/** Call to an explicitly allowlisted builtin only — `callee` is a name, never an arbitrary expression. */
export interface CallExpressionIR {
  kind: 'CallExpression';
  callee: AllowedBuiltin;
  arguments: ExpressionIR[];
}

// =============================================================================
// INTERPRETER
// =============================================================================

/** Thrown for any node/operator/identifier/builtin outside the allowlisted shape. Fail-closed, named, catchable. */
export class ExpressionIRError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionIRError';
  }
}

/**
 * Pure, synchronous, allowlist-only evaluator. Never calls new Function()/eval().
 * Throws ExpressionIRError (not a bare Error) for anything outside the allowed
 * node kinds, operators, identifiers, or builtins — callers catch by name.
 */
export function evaluateExpressionIR(ir: ExpressionIR, context: Record<string, unknown>): unknown {
  switch (ir.kind) {
    case 'Literal':
      return ir.value;

    case 'Identifier': {
      if (!(ir.name in context)) {
        throw new ExpressionIRError(`ExpressionIR: unknown identifier "${ir.name}"`);
      }
      return context[ir.name];
    }

    case 'UnaryExpression': {
      const arg = evaluateExpressionIR(ir.argument, context);
      const unaryOp: UnaryOperator = ir.operator;
      switch (unaryOp) {
        case '-':
          return -toNumber(arg);
        case '!':
          return !arg;
        default: {
          const exhaustive: never = unaryOp;
          throw new ExpressionIRError(
            `ExpressionIR: unsupported unary operator "${String(exhaustive)}"`
          );
        }
      }
    }

    case 'BinaryExpression': {
      const left = evaluateExpressionIR(ir.left, context);
      const right = evaluateExpressionIR(ir.right, context);
      const binaryOp: BinaryOperator = ir.operator;
      switch (binaryOp) {
        case '+':
          return toNumber(left) + toNumber(right);
        case '-':
          return toNumber(left) - toNumber(right);
        case '*':
          return toNumber(left) * toNumber(right);
        case '/':
          return toNumber(left) / toNumber(right);
        case '%':
          return toNumber(left) % toNumber(right);
        case '===':
          return left === right;
        case '!==':
          return left !== right;
        case '==':
          return left === right; // normalize loose -> strict; no `==` coercion surface
        case '!=':
          return left !== right;
        case '<':
          return toNumber(left) < toNumber(right);
        case '>':
          return toNumber(left) > toNumber(right);
        case '<=':
          return toNumber(left) <= toNumber(right);
        case '>=':
          return toNumber(left) >= toNumber(right);
        case '&&':
          return Boolean(left) && Boolean(right);
        case '||':
          return Boolean(left) || Boolean(right);
        default: {
          const exhaustive: never = binaryOp;
          throw new ExpressionIRError(
            `ExpressionIR: unsupported binary operator "${String(exhaustive)}"`
          );
        }
      }
    }

    case 'MemberExpression': {
      const obj = evaluateExpressionIR(ir.object, context);
      if (obj === null || obj === undefined || typeof obj !== 'object') {
        throw new ExpressionIRError(
          `ExpressionIR: cannot read property "${ir.property}" of non-object`
        );
      }
      if (!Object.prototype.hasOwnProperty.call(obj, ir.property)) {
        throw new ExpressionIRError(`ExpressionIR: unknown property "${ir.property}"`);
      }
      return (obj as Record<string, unknown>)[ir.property];
    }

    case 'CallExpression': {
      if (!(ALLOWED_BUILTINS as readonly string[]).includes(ir.callee)) {
        throw new ExpressionIRError(`ExpressionIR: builtin "${ir.callee}" is not allowlisted`);
      }
      const args = ir.arguments.map((a) => evaluateExpressionIR(a, context));
      return callBuiltin(ir.callee, args);
    }

    default: {
      const exhaustive: never = ir;
      throw new ExpressionIRError(
        `ExpressionIR: unknown node kind "${(exhaustive as ExpressionIR).kind}"`
      );
    }
  }
}

function toNumber(v: unknown): number {
  const n = Number(v);
  if (Number.isNaN(n)) {
    throw new ExpressionIRError(`ExpressionIR: value "${String(v)}" is not numeric`);
  }
  return n;
}

/** Direct JS implementations — no indirection through a name->Function map that could reopen dynamic dispatch. */
function callBuiltin(name: AllowedBuiltin, args: unknown[]): unknown {
  switch (name) {
    case 'abs':
      return Math.abs(toNumber(args[0]));
    case 'min':
      return Math.min(...args.map(toNumber));
    case 'max':
      return Math.max(...args.map(toNumber));
    case 'round':
      return Math.round(toNumber(args[0]));
    case 'floor':
      return Math.floor(toNumber(args[0]));
    case 'ceil':
      return Math.ceil(toNumber(args[0]));
    case 'sqrt':
      return Math.sqrt(toNumber(args[0]));
    case 'pow':
      return Math.pow(toNumber(args[0]), toNumber(args[1]));
    case 'toString':
      return String(args[0]);
    case 'toFixed':
      return toNumber(args[0]).toFixed(toNumber(args[1] ?? 0));
    default: {
      const exhaustive: never = name;
      throw new ExpressionIRError(`ExpressionIR: builtin "${exhaustive}" has no implementation`);
    }
  }
}

// =============================================================================
// PARSER
// =============================================================================

export class ExpressionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionParseError';
  }
}

/**
 * Parses a narrow arithmetic expression into ExpressionIR:
 *   number | slot | slot.member | fn(args) | ( expr ) | unary- | * / % + - | comparisons
 * Slots referenced in `source` MUST be present in `allowedSlots` (fail-closed on
 * anything else — undeclared identifiers are a parse-time error, not silently
 * dropped). Builtin calls MUST use a name from ALLOWED_BUILTINS.
 *
 * `$`-prefixed slots (TransformTrait's `$field` convention) are declared in
 * `allowedSlots` WITH the `$` included (e.g. "$temp"), and the parser emits an
 * IdentifierIR whose `name` is the same "$temp" string — the caller's `context`
 * object passed to evaluateExpressionIR must then key its record the same way.
 */
export function parseExpressionToIR(source: string, allowedSlots: string[]): ExpressionIR {
  const tokens = tokenize(source);
  const parser = new Parser(tokens, allowedSlots);
  const ir = parser.parseExpression();
  parser.expectEnd();
  return ir;
}

// ---- tokenizer ----

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; value: string } // includes leading '$' if present in source
  | { kind: 'op'; value: string }; // + - * / % ( ) , . === !== == != < > <= >= && ||

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
  const isIdentPart = (c: string) => /[A-Za-z0-9_]/.test(c);

  while (i < source.length) {
    const c = source[i];
    if (c === ' ' || c === '\t' || c === '\n') {
      i++;
      continue;
    }

    if (isDigit(c) || (c === '.' && isDigit(source[i + 1]))) {
      let j = i;
      while (j < source.length && /[\d.]/.test(source[j])) j++;
      const raw = source.slice(i, j);
      const value = Number(raw);
      if (Number.isNaN(value)) throw new ExpressionParseError(`Invalid numeric literal "${raw}"`);
      tokens.push({ kind: 'num', value });
      i = j;
      continue;
    }

    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < source.length && isIdentPart(source[j])) j++;
      tokens.push({ kind: 'ident', value: source.slice(i, j) });
      i = j;
      continue;
    }

    // multi-char operators first
    const two = source.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
      const three = source.slice(i, i + 3);
      if (three === '===' || three === '!==') {
        tokens.push({ kind: 'op', value: three });
        i += 3;
        continue;
      }
      tokens.push({ kind: 'op', value: two });
      i += 2;
      continue;
    }

    if ('+-*/%(),.<>'.includes(c)) {
      tokens.push({ kind: 'op', value: c });
      i++;
      continue;
    }

    throw new ExpressionParseError(`Unexpected character "${c}" at position ${i}`);
  }
  return tokens;
}

// ---- recursive-descent parser (precedence: || > && > equality > relational > additive > multiplicative > unary > primary) ----

class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private allowedSlots: string[]
  ) {}

  parseExpression(): ExpressionIR {
    return this.parseOr();
  }

  expectEnd(): void {
    if (this.pos < this.tokens.length) {
      throw new ExpressionParseError(`Unexpected trailing input at token ${this.pos}`);
    }
  }

  private parseOr(): ExpressionIR {
    let left = this.parseAnd();
    while (this.peekOp('||')) {
      this.pos++;
      left = { kind: 'BinaryExpression', operator: '||', left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): ExpressionIR {
    let left = this.parseEquality();
    while (this.peekOp('&&')) {
      this.pos++;
      left = { kind: 'BinaryExpression', operator: '&&', left, right: this.parseEquality() };
    }
    return left;
  }

  private parseEquality(): ExpressionIR {
    let left = this.parseRelational();
    while (this.peekOp('===') || this.peekOp('!==') || this.peekOp('==') || this.peekOp('!=')) {
      const op = (this.tokens[this.pos] as { kind: 'op'; value: BinaryOperator }).value;
      this.pos++;
      left = { kind: 'BinaryExpression', operator: op, left, right: this.parseRelational() };
    }
    return left;
  }

  private parseRelational(): ExpressionIR {
    let left = this.parseAdditive();
    while (this.peekOp('<') || this.peekOp('>') || this.peekOp('<=') || this.peekOp('>=')) {
      const op = (this.tokens[this.pos] as { kind: 'op'; value: BinaryOperator }).value;
      this.pos++;
      left = { kind: 'BinaryExpression', operator: op, left, right: this.parseAdditive() };
    }
    return left;
  }

  private parseAdditive(): ExpressionIR {
    let left = this.parseMultiplicative();
    while (this.peekOp('+') || this.peekOp('-')) {
      const op = (this.tokens[this.pos] as { kind: 'op'; value: '+' | '-' }).value;
      this.pos++;
      left = { kind: 'BinaryExpression', operator: op, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): ExpressionIR {
    let left = this.parseUnary();
    while (this.peekOp('*') || this.peekOp('/') || this.peekOp('%')) {
      const op = (this.tokens[this.pos] as { kind: 'op'; value: '*' | '/' | '%' }).value;
      this.pos++;
      left = { kind: 'BinaryExpression', operator: op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): ExpressionIR {
    if (this.peekOp('-') || this.peekOp('!')) {
      const op = (this.tokens[this.pos] as { kind: 'op'; value: '-' | '!' }).value;
      this.pos++;
      return { kind: 'UnaryExpression', operator: op, argument: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  /** primary, then any trailing .member chains */
  private parsePostfix(): ExpressionIR {
    let expr = this.parsePrimary();
    for (;;) {
      if (this.peekOp('.')) {
        this.pos++;
        const propTok = this.tokens[this.pos];
        if (!propTok || propTok.kind !== 'ident') {
          throw new ExpressionParseError('Expected property name after "."');
        }
        this.pos++;
        expr = { kind: 'MemberExpression', object: expr, property: propTok.value };
        continue;
      }
      break;
    }
    return expr;
  }

  private parsePrimary(): ExpressionIR {
    const tok = this.tokens[this.pos];
    if (!tok) throw new ExpressionParseError('Unexpected end of expression');

    if (tok.kind === 'num') {
      this.pos++;
      return { kind: 'Literal', value: tok.value };
    }

    if (tok.kind === 'op' && tok.value === '(') {
      this.pos++;
      const inner = this.parseExpression();
      if (!this.peekOp(')')) throw new ExpressionParseError('Expected closing ")"');
      this.pos++;
      return inner;
    }

    if (tok.kind === 'ident') {
      this.pos++;
      // function call: name(
      if (this.peekOp('(')) {
        if (!(ALLOWED_BUILTINS as readonly string[]).includes(tok.value)) {
          throw new ExpressionParseError(`Builtin "${tok.value}" is not allowlisted`);
        }
        this.pos++; // consume '('
        const args: ExpressionIR[] = [];
        if (!this.peekOp(')')) {
          args.push(this.parseExpression());
          while (this.peekOp(',')) {
            this.pos++;
            args.push(this.parseExpression());
          }
        }
        if (!this.peekOp(')')) throw new ExpressionParseError('Expected closing ")" in call');
        this.pos++;
        return { kind: 'CallExpression', callee: tok.value as AllowedBuiltin, arguments: args };
      }
      // bare identifier: must be a declared slot
      if (!this.allowedSlots.includes(tok.value)) {
        throw new ExpressionParseError(`Identifier "${tok.value}" is not in the allowed slot list`);
      }
      return { kind: 'Identifier', name: tok.value };
    }

    throw new ExpressionParseError(`Unexpected token at position ${this.pos}`);
  }

  private peekOp(value: string): boolean {
    const t = this.tokens[this.pos];
    return !!t && t.kind === 'op' && t.value === value;
  }
}
