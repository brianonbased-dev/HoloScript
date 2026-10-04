/**
 * Runtime expressions — what the ReactiveState ExpressionEvaluators evaluate,
 * parsed into a typed IR and interpreted, never run as text.
 *
 * Both evaluators used to hand the expression text to `new Function`, behind a
 * blocklist of dangerous words. A blocklist cannot be made sound: the root
 * evaluator's `\bglobalThis?\b` never matched `global`, so `global.x` ran. This
 * module replaces that with the pattern expression-ir.ts uses: parse, check,
 * interpret.
 *
 * Why not ExpressionIR itself: ExpressionIR is HS-Core v0's expression subset. Its
 * `+` is numeric and its `&&`/`||` return booleans, which is right for compiled
 * guards and wrong for runtime values (`"Score: " + score`, `name || "guest"`, both
 * common in the examples), and the HS-Core tools (HSIIRCompiler, the Kotlin emitter,
 * HSIAuditVerifier, HSILearningGraph) switch over its kinds. So this is a sibling IR
 * with the same fail-closed rules and JavaScript's value semantics, and HS-Core v0
 * stays exactly as it is.
 *
 * Fail-closed rules:
 *  - The text is parsed by the HoloScript parser (parseHolo); nothing is evaluated
 *    as JavaScript.
 *  - Values are read only through own data properties: nothing reaches a prototype,
 *    `__proto__` / `prototype` / `constructor` are refused, and a getter is refused,
 *    never run.
 *  - A call names a function the caller provides (or one the context holds), and is
 *    resolved the same way; no method is looked up on a value's prototype.
 *  - Operators apply to primitives only. An object operand (other than for `===` /
 *    `!==`) is refused, so no valueOf or toString on a value ever runs.
 */
import { parseHolo } from '../parser/HoloCompositionParser';
import type { HoloExpression } from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

type BinaryOperator =
  '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '===' | '!==' | '<' | '>' | '<=' | '>=';

const BINARY_OPERATORS = new Set<string>([
  '+',
  '-',
  '*',
  '/',
  '%',
  '==',
  '!=',
  '===',
  '!==',
  '<',
  '>',
  '<=',
  '>=',
]);
const LOGICAL_OPERATORS = new Set<string>(['&&', '||', '??']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export type RuntimeExpression =
  | { kind: 'Literal'; value: string | number | boolean | null }
  | { kind: 'Identifier'; name: string }
  | { kind: 'Member'; object: RuntimeExpression; property: string }
  | { kind: 'Call'; object: string | null; name: string; arguments: RuntimeExpression[] }
  | { kind: 'Unary'; operator: '!' | '-'; argument: RuntimeExpression }
  | { kind: 'Binary'; operator: BinaryOperator; left: RuntimeExpression; right: RuntimeExpression }
  | {
      kind: 'Logical';
      operator: '&&' | '||' | '??';
      left: RuntimeExpression;
      right: RuntimeExpression;
    }
  | {
      kind: 'Conditional';
      test: RuntimeExpression;
      consequent: RuntimeExpression;
      alternate: RuntimeExpression;
    }
  | { kind: 'Array'; elements: RuntimeExpression[] }
  | { kind: 'Object'; properties: Array<{ key: string; value: RuntimeExpression }> };

/**
 * Why an expression was not evaluated:
 *  - `parse`: the text is not one expression (a phrase such as `30 days`);
 *  - `form`: it uses something this IR does not admit (a computed `[...]` read);
 *  - `unknown-name`: it names something the context does not hold (`name` says what);
 *  - `not-provided`: it calls a function nobody provided (`require(...)`);
 *  - `value`: an operator or read met a value it refuses (an object, a getter).
 */
export type RuntimeExpressionFailure = 'parse' | 'form' | 'unknown-name' | 'not-provided' | 'value';

export class RuntimeExpressionError extends Error {
  constructor(
    readonly reason: RuntimeExpressionFailure,
    message: string,
    readonly unknownName?: string
  ) {
    super(message);
    this.name = 'RuntimeExpressionError';
  }
}

function fail(reason: RuntimeExpressionFailure, message: string, unknownName?: string): never {
  throw new RuntimeExpressionError(reason, message, unknownName);
}

// =============================================================================
// PARSING
// =============================================================================

const ACTION = 'runtime_expression';
const CACHE_LIMIT = 2000;
const parsed = new Map<string, RuntimeExpression | RuntimeExpressionError>();

/**
 * Parse expression text into a RuntimeExpression. Throws a RuntimeExpressionError
 * (`parse` or `form`). Results are cached by text, so a hot expression is parsed once.
 */
export function parseRuntimeExpression(source: string): RuntimeExpression {
  const hit = parsed.get(source);
  if (hit instanceof RuntimeExpressionError) throw hit;
  if (hit) return hit;
  let result: RuntimeExpression | RuntimeExpressionError;
  try {
    result = lowerRuntimeExpression(parseOne(source));
  } catch (error) {
    if (!(error instanceof RuntimeExpressionError)) throw error;
    result = error;
  }
  if (parsed.size >= CACHE_LIMIT) parsed.delete(parsed.keys().next().value as string);
  parsed.set(source, result);
  if (result instanceof RuntimeExpressionError) throw result;
  return result;
}

function parseOne(source: string): HoloExpression {
  if (/[\r\n]/.test(source)) fail('parse', 'an expression is one line');
  const result = parseHolo(
    `composition "e" {\n  logic {\n    action ${ACTION}() {\n      return ${source}\n    }\n  }\n}\n`
  );
  if (result.errors.length > 0 || !result.ast) {
    fail('parse', `not an expression: ${result.errors[0]?.message ?? 'no result'}`);
  }
  // The text is spliced into a composition, so a stray `}` could close the action
  // and declare something else: only the one action, holding one return, counts.
  const ast = result.ast as unknown as Record<string, unknown>;
  const actions = (ast.logic as { actions?: Array<{ name?: string; body?: unknown[] }> })?.actions;
  const extra = Object.entries(ast).find(([, value]) => Array.isArray(value) && value.length > 0);
  const body = actions?.[0]?.body;
  const only = body?.length === 1 ? (body[0] as { type?: string; value?: HoloExpression }) : null;
  if (
    !actions ||
    actions.length !== 1 ||
    actions[0].name !== ACTION ||
    extra ||
    only?.type !== 'ReturnStatement' ||
    !only.value
  ) {
    fail('parse', 'not one expression');
  }
  return only.value;
}

function checkKey(key: string): void {
  if (FORBIDDEN_KEYS.has(key)) fail('form', `"${key}" cannot be read or written here`);
}

/** Lower a parsed HoloExpression into the runtime IR, refusing anything else. */
export function lowerRuntimeExpression(expr: HoloExpression): RuntimeExpression {
  switch (expr.type) {
    case 'Literal':
      return { kind: 'Literal', value: expr.value };
    case 'Identifier':
      return { kind: 'Identifier', name: expr.name };
    case 'MemberExpression':
      if (expr.computed) fail('form', 'a computed member read ([...]) is not supported');
      checkKey(expr.property);
      return {
        kind: 'Member',
        object: lowerRuntimeExpression(expr.object),
        property: expr.property,
      };
    case 'CallExpression': {
      const callee = expr.callee;
      const args = expr.arguments.map(lowerRuntimeExpression);
      if (callee.type === 'Identifier') {
        return { kind: 'Call', object: null, name: callee.name, arguments: args };
      }
      if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier'
      ) {
        checkKey(callee.property);
        return { kind: 'Call', object: callee.object.name, name: callee.property, arguments: args };
      }
      return fail('not-provided', 'only a provided function can be called');
    }
    case 'UnaryExpression':
      if (expr.operator !== '!' && expr.operator !== '-') {
        fail('form', `unary "${String(expr.operator)}" is not supported`);
      }
      return {
        kind: 'Unary',
        operator: expr.operator,
        argument: lowerRuntimeExpression(expr.argument),
      };
    case 'BinaryExpression': {
      const left = lowerRuntimeExpression(expr.left);
      const right = lowerRuntimeExpression(expr.right);
      if (LOGICAL_OPERATORS.has(expr.operator)) {
        return { kind: 'Logical', operator: expr.operator as '&&' | '||' | '??', left, right };
      }
      if (!BINARY_OPERATORS.has(expr.operator)) {
        fail('form', `operator "${expr.operator}" is not supported`);
      }
      return { kind: 'Binary', operator: expr.operator as BinaryOperator, left, right };
    }
    case 'ConditionalExpression':
      return {
        kind: 'Conditional',
        test: lowerRuntimeExpression(expr.test),
        consequent: lowerRuntimeExpression(expr.consequent),
        alternate: lowerRuntimeExpression(expr.alternate),
      };
    case 'ArrayExpression':
      return { kind: 'Array', elements: expr.elements.map(lowerRuntimeExpression) };
    case 'ObjectExpression':
      return {
        kind: 'Object',
        properties: expr.properties.map((property) => {
          checkKey(property.key);
          return { key: property.key, value: lowerRuntimeExpression(property.value) };
        }),
      };
    default:
      return fail('form', `${String((expr as { type?: unknown }).type)} is not supported`);
  }
}

// =============================================================================
// EVALUATION
// =============================================================================

/** The own data value of `key`, `found: false` when there is none. A getter is refused. */
function ownData(object: unknown, key: string): { found: boolean; value?: unknown } {
  if (FORBIDDEN_KEYS.has(key)) fail('form', `"${key}" cannot be read here`);
  if (object === null || object === undefined) return { found: false };
  const descriptor = Object.getOwnPropertyDescriptor(Object(object), key);
  if (!descriptor) return { found: false };
  if (!('value' in descriptor))
    fail('value', `"${key}" is read through a getter, which is refused`);
  return { found: true, value: descriptor.value };
}

const isPrimitive = (value: unknown): boolean =>
  value === null || (typeof value !== 'object' && typeof value !== 'function');

/**
 * Evaluate a RuntimeExpression. `context` holds the values (state, variables);
 * `provided` holds the functions and namespaces (Math, the runtime's builtins) a
 * call may name. Throws RuntimeExpressionError; never evaluates text.
 */
export function evaluateRuntimeExpression(
  ir: RuntimeExpression,
  context: Readonly<Record<string, unknown>>,
  provided: Readonly<Record<string, unknown>> = {}
): unknown {
  const evaluate = (node: RuntimeExpression): unknown => {
    switch (node.kind) {
      case 'Literal':
        return node.value;
      case 'Identifier': {
        const own = ownData(context, node.name);
        if (own.found) return own.value;
        const given = ownData(provided, node.name);
        if (given.found) return given.value;
        if (node.name === 'undefined') return undefined;
        return fail('unknown-name', `"${node.name}" is not defined here`, node.name);
      }
      case 'Member': {
        const object = evaluate(node.object);
        if (object === null || object === undefined) {
          fail('value', `cannot read "${node.property}" of ${String(object)}`);
        }
        return ownData(object, node.property).value;
      }
      case 'Call': {
        const args = node.arguments.map(evaluate);
        let owner: unknown;
        let fn: unknown;
        if (node.object === null) {
          const own = ownData(context, node.name);
          fn = own.found ? own.value : ownData(provided, node.name).value;
        } else {
          const own = ownData(context, node.object);
          owner = own.found ? own.value : ownData(provided, node.object).value;
          fn = ownData(owner, node.name).value;
        }
        if (typeof fn !== 'function') {
          const label = node.object === null ? node.name : `${node.object}.${node.name}`;
          fail('not-provided', `"${label}" is not a function provided here`);
        }
        return Reflect.apply(fn as (...a: unknown[]) => unknown, owner, args);
      }
      case 'Unary': {
        const value = evaluate(node.argument);
        if (node.operator === '!') return !value;
        if (!isPrimitive(value)) fail('value', 'unary "-" needs a primitive value');
        return -(value as number);
      }
      case 'Logical': {
        const left = evaluate(node.left);
        if (node.operator === '&&') return left ? evaluate(node.right) : left;
        if (node.operator === '||') return left ? left : evaluate(node.right);
        return left ?? evaluate(node.right);
      }
      case 'Binary': {
        const left = evaluate(node.left);
        const right = evaluate(node.right);
        if (node.operator === '===') return left === right;
        if (node.operator === '!==') return left !== right;
        if (!isPrimitive(left) || !isPrimitive(right)) {
          fail('value', `operator "${node.operator}" needs primitive values`);
        }
        // Primitives only, so no valueOf or toString of a value runs here.
        const a = left as number;
        const b = right as number;
        switch (node.operator) {
          case '+':
            return (a as unknown as string) + (b as unknown as string);
          case '-':
            return a - b;
          case '*':
            return a * b;
          case '/':
            return a / b;
          case '%':
            return a % b;
          case '==':
            // eslint-disable-next-line eqeqeq
            return a == b;
          case '!=':
            // eslint-disable-next-line eqeqeq
            return a != b;
          case '<':
            return a < b;
          case '>':
            return a > b;
          case '<=':
            return a <= b;
          case '>=':
            return a >= b;
          default:
            return fail('form', `operator "${String(node.operator)}" is not supported`);
        }
      }
      case 'Conditional':
        return evaluate(node.test) ? evaluate(node.consequent) : evaluate(node.alternate);
      case 'Array':
        return node.elements.map(evaluate);
      case 'Object': {
        const out: Record<string, unknown> = {};
        for (const { key, value } of node.properties) {
          Object.defineProperty(out, key, {
            value: evaluate(value),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
        return out;
      }
      default:
        return fail('form', `${String((node as { kind?: unknown }).kind)} is not supported`);
    }
  };
  return evaluate(ir);
}

/** Names that read the host, which an expression yields `undefined` for rather than its own text. */
function isHostName(name: string | undefined): boolean {
  if (!name) return false;
  return (
    name.startsWith('__') ||
    ['global', 'globalThis', 'window', 'self', 'process', 'require', 'module', 'exports'].includes(
      name
    )
  );
}

/**
 * Evaluate expression text the way the ReactiveState evaluators answer:
 *  - text that is not one expression, or that names something the context does not
 *    hold, is plain text: `'text'` returns it unchanged (the root evaluator, which
 *    `.hs` config values such as `storage: "postgresql+pgvector"` pass through), and
 *    `'undefined'` returns undefined;
 *  - a host name (`global`, `process`, `__dirname`, ...) or anything else that is
 *    refused yields undefined.
 * Nothing is executed as text in any case.
 */
export function evaluateExpressionText(
  source: string,
  context: Readonly<Record<string, unknown>>,
  provided: Readonly<Record<string, unknown>>,
  plainText: 'text' | 'undefined'
): unknown {
  try {
    return evaluateRuntimeExpression(parseRuntimeExpression(source), context, provided);
  } catch (error) {
    if (!(error instanceof RuntimeExpressionError)) throw error;
    const isPlainText =
      error.reason === 'parse' ||
      (error.reason === 'unknown-name' && !isHostName(error.unknownName));
    return isPlainText && plainText === 'text' ? source : undefined;
  }
}
