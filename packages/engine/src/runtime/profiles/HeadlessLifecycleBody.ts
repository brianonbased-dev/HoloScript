/**
 * Lifecycle bodies for the headless runtime: parsed into typed statements and
 * interpreted, never evaluated as text.
 *
 * A lifecycle directive (`@on_mount { ... }`, `@on_update(dt) { ... }`) reaches
 * the runtime as the raw source of its body. The runtime used to hand any body
 * holding `;` or `{` to `new Function`, which runs it as JavaScript with every
 * host global in reach, and every other body to the core ExpressionEvaluator.
 * This module does what DeterministicHsplusActionRuntime does instead: it wraps
 * the body as a `.holo` action, parses it with parseHolo, checks every statement
 * and name before anything runs, and interprets what it admitted.
 *
 * A body may use its parameters and its own locals, read and write `state`
 * (through the runtime's state, as `state.<name>`), read the object whose hook
 * runs as `node`, `self` or `this`, and
 * call the functions the runtime provides, by name (`log`, `emit`, `setState`,
 * `Math.floor`, ...). Anything else is refused before the body runs, with an
 * error that names it. A call is admitted only when the function it names is
 * one the runtime provides, so nothing is refused halfway through a body. Values
 * are read only through own data properties: nothing reaches a prototype, and a
 * getter is refused, never run. The body's own loops stop after 100,000
 * interpreter steps; work done inside a provided function (range, api_call, ...)
 * is that function's own and is not counted.
 */
import { parseHolo } from '@holoscript/core';
import type { HoloExpression, HoloStatement } from '@holoscript/core/parser/HoloCompositionTypes';

/** What a lifecycle body can reach in the runtime that runs it. */
export interface LifecycleBodyHost {
  /** Functions a body may call by name; an object entry (such as Math) offers its own functions. */
  readonly functions: Readonly<Record<string, unknown>>;
  readState(key: string): unknown;
  writeState(key: string, value: unknown): void;
  emit(event: string, payload?: unknown): void;
}

/** A body the runtime cannot run as written. The message names what it refused. */
export class LifecycleBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LifecycleBodyError';
  }
}

const ACTION_NAME = 'lifecycle_body';
const NAME = /^[A-Za-z_$][\w$]*$/;
const NAME_PATH = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
/** Names for the object whose hook runs. `this` was the host's global object under `new Function`. */
const NODE_NAMES = new Set(['node', 'self', 'this']);
/** Statements and loop turns one run may take; a body that needs more is stopped. */
const MAX_STEPS = 100_000;

function refuse(message: string): never {
  throw new LifecycleBodyError(message);
}

/**
 * Parse and check a lifecycle body. Throws a LifecycleBodyError, naming the
 * problem, for a body that does not parse or that uses anything a body may not.
 */
export function parseLifecycleBody(
  hook: string,
  params: readonly string[],
  body: string,
  functions: Readonly<Record<string, unknown>>
): readonly HoloStatement[] {
  for (const param of params) {
    if (!NAME.test(param)) refuse(`parameter "${param}" of ${hook} is not a plain name`);
  }
  const indented = body
    .split(/\r?\n/)
    .map((line) => `      ${line}`)
    .join('\n');
  const source = `composition "lifecycle" {\n  logic {\n    action ${ACTION_NAME}(${params.join(', ')}) {\n${indented}\n    }\n  }\n}\n`;
  const result = parseHolo(source);
  if (result.errors.length > 0 || !result.ast) {
    const first = result.errors[0]?.message ?? 'no result';
    refuse(`the ${hook} body does not parse: ${first}`);
  }
  // The body is spliced into a composition, so a stray `}` could close the action
  // and declare something else. Only the one action, and nothing beside it, is run.
  const ast = result.ast as unknown as Record<string, unknown>;
  const actions = (ast.logic as { actions?: Array<{ name?: string; body?: HoloStatement[] }> })
    ?.actions;
  const extra = Object.entries(ast).find(([, value]) => Array.isArray(value) && value.length > 0);
  if (!actions || actions.length !== 1 || actions[0].name !== ACTION_NAME || extra) {
    refuse(`the ${hook} body is not one block of statements`);
  }
  const statements = actions[0].body ?? [];
  const locals = new Set<string>(params);
  collectLocals(statements, locals);
  const known: KnownNames = {
    locals,
    functions: new Set(Object.keys(functions)),
    provided: functions,
  };
  checkStatements(statements, known, hook);
  return statements;
}

interface KnownNames {
  locals: ReadonlySet<string>;
  functions: ReadonlySet<string>;
  /** The provided functions themselves, so a call is checked exactly as it will run. */
  provided: Readonly<Record<string, unknown>>;
}

/** Every name a body declares, or assigns bare, anywhere in it. */
function collectLocals(statements: readonly HoloStatement[], into: Set<string>): void {
  for (const statement of statements) {
    switch (statement.type) {
      case 'VariableDeclaration':
        into.add(statement.name);
        break;
      case 'Assignment':
        if (NAME.test(statement.target) && statement.target !== 'state') into.add(statement.target);
        break;
      case 'IfStatement':
        collectLocals(statement.consequent, into);
        collectLocals(statement.alternate ?? [], into);
        break;
      case 'WhileStatement':
        collectLocals(statement.body, into);
        break;
      case 'ClassicForStatement':
        if (statement.init) collectLocals([statement.init], into);
        collectLocals(statement.body, into);
        break;
      default:
        break;
    }
  }
}

function checkStatements(statements: readonly HoloStatement[], known: KnownNames, hook: string) {
  for (const statement of statements) checkStatement(statement, known, hook);
}

function checkStatement(statement: HoloStatement, known: KnownNames, hook: string): void {
  switch (statement.type) {
    case 'Assignment': {
      const target = statement.target;
      if (!NAME_PATH.test(target)) refuse(`${hook} cannot assign to "${target}"`);
      const [head, ...rest] = target.split('.');
      if (head === 'state') {
        if (rest.length === 0) refuse(`${hook} assigns to state itself; assign state.<name>`);
      } else if (rest.length > 0) {
        refuse(`${hook} can only assign to its own names and to state.<name>, not "${target}"`);
      }
      for (const key of rest) checkKey(key, hook);
      checkExpression(statement.value, known, hook);
      return;
    }
    case 'VariableDeclaration':
      if (statement.value) checkExpression(statement.value, known, hook);
      return;
    case 'ExpressionStatement':
      checkExpression(statement.expression, known, hook);
      return;
    case 'MethodCall':
      checkCallee(statement.object, statement.method, known, hook);
      for (const arg of statement.arguments) checkExpression(arg, known, hook);
      return;
    case 'EmitStatement':
      if (statement.data) checkExpression(statement.data, known, hook);
      return;
    case 'ReturnStatement':
      if (statement.value) checkExpression(statement.value, known, hook);
      return;
    case 'IfStatement':
      checkExpression(statement.condition, known, hook);
      checkStatements(statement.consequent, known, hook);
      checkStatements(statement.alternate ?? [], known, hook);
      return;
    case 'WhileStatement':
      checkExpression(statement.condition, known, hook);
      checkStatements(statement.body, known, hook);
      return;
    case 'ClassicForStatement':
      if (statement.init) checkStatement(statement.init, known, hook);
      if (statement.test) checkExpression(statement.test, known, hook);
      if (statement.update) checkStatement(statement.update, known, hook);
      checkStatements(statement.body, known, hook);
      return;
    default:
      refuse(
        `${hook} uses a ${String((statement as { type?: unknown }).type)}, which a lifecycle body cannot`
      );
  }
}

function checkKey(key: string, hook: string): void {
  if (FORBIDDEN_KEYS.has(key))
    refuse(`${hook} reads or writes "${key}", which a lifecycle body cannot`);
}

function checkName(name: string, known: KnownNames, hook: string): void {
  if (known.locals.has(name) || known.functions.has(name)) return;
  if (NODE_NAMES.has(name)) return;
  if (name === 'state') refuse(`${hook} uses state as a value; read state.<name>`);
  refuse(
    `${hook} uses "${name}", which is not one of its parameters or locals, state, node, or a function this runtime provides`
  );
}

function checkCallee(object: string | undefined, method: string, known: KnownNames, hook: string) {
  checkKey(method, hook);
  // The same lookup callProvided makes, so a call admitted here is never refused
  // when it is reached (which would leave the statements before it applied).
  if (known.locals.has(object ?? method) || !providedFunction(known.provided, object, method)) {
    refuse(
      `${hook} calls "${object ? `${object}.${method}` : method}", which this runtime does not provide`
    );
  }
}

function checkExpression(expression: HoloExpression, known: KnownNames, hook: string): void {
  switch (expression.type) {
    case 'Literal':
      return;
    case 'Identifier':
      checkName(expression.name, known, hook);
      return;
    case 'MemberExpression':
      if (expression.computed)
        refuse(`${hook} reads a computed member ([...]), which a lifecycle body cannot`);
      checkKey(expression.property, hook);
      if (expression.object.type === 'Identifier' && expression.object.name === 'state') return;
      checkExpression(expression.object, known, hook);
      return;
    case 'CallExpression': {
      const callee = expression.callee;
      if (callee.type === 'Identifier') {
        checkCallee(undefined, callee.name, known, hook);
      } else if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier'
      ) {
        checkCallee(callee.object.name, callee.property, known, hook);
      } else {
        refuse(`${hook} calls something other than a function this runtime provides`);
      }
      for (const arg of expression.arguments) checkExpression(arg, known, hook);
      return;
    }
    case 'BinaryExpression':
      checkExpression(expression.left, known, hook);
      checkExpression(expression.right, known, hook);
      return;
    case 'UnaryExpression':
      checkExpression(expression.argument, known, hook);
      return;
    case 'UpdateExpression':
      checkUpdateTarget(expression.argument, known, hook);
      return;
    case 'ArrayExpression':
      for (const element of expression.elements) checkExpression(element, known, hook);
      return;
    case 'ObjectExpression':
      for (const property of expression.properties) {
        checkKey(property.key, hook);
        checkExpression(property.value, known, hook);
      }
      return;
    case 'ConditionalExpression':
      checkExpression(expression.test, known, hook);
      checkExpression(expression.consequent, known, hook);
      checkExpression(expression.alternate, known, hook);
      return;
    default:
      refuse(
        `${hook} uses a ${String((expression as { type?: unknown }).type)}, which a lifecycle body cannot`
      );
  }
}

function checkUpdateTarget(target: HoloExpression, known: KnownNames, hook: string): void {
  if (target.type === 'Identifier' && known.locals.has(target.name)) return;
  if (
    target.type === 'MemberExpression' &&
    !target.computed &&
    target.object.type === 'Identifier' &&
    target.object.name === 'state'
  ) {
    checkKey(target.property, hook);
    return;
  }
  refuse(`${hook} can only use ++ and -- on its own names and on state.<name>`);
}

// ─── Running ─────────────────────────────────────────────────────────────────

interface Run {
  host: LifecycleBodyHost;
  locals: Map<string, unknown>;
  node: unknown;
  steps: number;
}

/** Run a body that parseLifecycleBody admitted. */
export function runLifecycleBody(
  statements: readonly HoloStatement[],
  host: LifecycleBodyHost,
  params: Readonly<Record<string, unknown>>,
  node: unknown
): void {
  const run: Run = { host, locals: new Map(Object.entries(params)), node, steps: 0 };
  runStatements(statements, run);
}

function step(run: Run): void {
  if (++run.steps > MAX_STEPS) refuse(`the body took more than ${MAX_STEPS} steps and was stopped`);
}

/** Runs statements; returns true when a `return` ends the body. */
function runStatements(statements: readonly HoloStatement[], run: Run): boolean {
  for (const statement of statements) {
    if (runStatement(statement, run)) return true;
  }
  return false;
}

function runStatement(statement: HoloStatement, run: Run): boolean {
  step(run);
  switch (statement.type) {
    case 'Assignment':
      assign(statement.target, statement.operator, evaluate(statement.value, run), run);
      return false;
    case 'VariableDeclaration':
      run.locals.set(statement.name, statement.value ? evaluate(statement.value, run) : undefined);
      return false;
    case 'ExpressionStatement':
      evaluate(statement.expression, run);
      return false;
    case 'MethodCall':
      callProvided(
        statement.object,
        statement.method,
        statement.arguments.map((arg) => evaluate(arg, run)),
        run
      );
      return false;
    case 'EmitStatement':
      run.host.emit(statement.event, statement.data ? evaluate(statement.data, run) : undefined);
      return false;
    case 'ReturnStatement':
      if (statement.value) evaluate(statement.value, run);
      return true;
    case 'IfStatement':
      return runStatements(
        evaluate(statement.condition, run) ? statement.consequent : (statement.alternate ?? []),
        run
      );
    case 'WhileStatement':
      while (evaluate(statement.condition, run)) {
        step(run);
        if (runStatements(statement.body, run)) return true;
      }
      return false;
    case 'ClassicForStatement':
      if (statement.init) runStatement(statement.init, run);
      while (statement.test ? evaluate(statement.test, run) : true) {
        step(run);
        if (runStatements(statement.body, run)) return true;
        if (statement.update) runStatement(statement.update, run);
      }
      return false;
    default:
      return refuse(`a ${String((statement as { type?: unknown }).type)} cannot run here`);
  }
}

function combine(operator: string, current: unknown, value: unknown): unknown {
  const a = current as number;
  const b = value as number;
  switch (operator) {
    case '=':
      return value;
    case '+=':
      return (a as unknown as string) + (b as unknown as string);
    case '-=':
      return a - b;
    case '*=':
      return a * b;
    case '/=':
      return a / b;
    default:
      return refuse(`assignment operator "${operator}" is not supported`);
  }
}

function assign(target: string, operator: string, value: unknown, run: Run): void {
  const [head, ...rest] = target.split('.');
  if (head !== 'state') {
    run.locals.set(head, combine(operator, run.locals.get(head), value));
    return;
  }
  const [key, ...path] = rest;
  const current = run.host.readState(key);
  run.host.writeState(key, withPath(current, path, operator, value));
}

/** `current` with the value at `path` combined with `value`, copying each object on the way. */
function withPath(
  current: unknown,
  path: readonly string[],
  operator: string,
  value: unknown
): unknown {
  if (path.length === 0) return combine(operator, current, value);
  if (current === null || typeof current !== 'object') {
    refuse(`cannot set "${path[0]}" on a value that is not an object`);
  }
  const [key, ...restPath] = path;
  // Copied through readOwn, like every other read, so a getter is refused, never run.
  const copy = (Array.isArray(current) ? [] : {}) as Record<string, unknown>;
  for (const own of Object.keys(current)) copy[own] = readOwn(current, own);
  copy[key] = withPath(readOwn(current, key), restPath, operator, value);
  return copy;
}

/** The own property descriptor of `key`, or undefined; it never runs a getter. */
function ownDescriptor(object: unknown, key: string): PropertyDescriptor | undefined {
  if (object === null || object === undefined) return undefined;
  return Object.getOwnPropertyDescriptor(Object(object), key);
}

/** The own data value of `key`, or undefined when there is none. A getter is refused, never run. */
function readOwn(object: unknown, key: string): unknown {
  if (FORBIDDEN_KEYS.has(key)) refuse(`"${key}" cannot be read here`);
  if (object === null || object === undefined) refuse(`cannot read "${key}" of ${String(object)}`);
  const descriptor = ownDescriptor(object, key);
  if (descriptor === undefined) return undefined;
  if (!('value' in descriptor))
    refuse(`"${key}" is read through a getter, which a lifecycle body cannot run`);
  return descriptor.value;
}

/**
 * The provided function a call names: `method` among the provided functions, or
 * `object.method` where `object` is a provided object (such as Math). Own data
 * properties only, so `log.call` or `Math.valueOf` is no provided function.
 */
function providedFunction(
  provided: Readonly<Record<string, unknown>>,
  object: string | undefined,
  method: string
): ((...args: unknown[]) => unknown) | undefined {
  if (FORBIDDEN_KEYS.has(method) || (object !== undefined && FORBIDDEN_KEYS.has(object))) {
    return undefined;
  }
  const owner = object === undefined ? provided : ownDescriptor(provided, object)?.value;
  const fn = ownDescriptor(owner, method)?.value;
  return typeof fn === 'function' ? (fn as (...args: unknown[]) => unknown) : undefined;
}

function lookup(name: string, run: Run): unknown {
  if (run.locals.has(name)) return run.locals.get(name);
  if (NODE_NAMES.has(name)) return run.node;
  const descriptor = ownDescriptor(run.host.functions, name);
  if (descriptor && 'value' in descriptor) return descriptor.value;
  return refuse(`"${name}" is not defined here`);
}

function callProvided(
  object: string | undefined,
  method: string,
  args: unknown[],
  run: Run
): unknown {
  const fn = run.locals.has(object ?? method)
    ? undefined
    : providedFunction(run.host.functions, object, method);
  if (!fn) {
    refuse(`"${object ? `${object}.${method}` : method}" is not a function this runtime provides`);
  }
  // A provided object's function is called on that object, as `object.method(...)` would be.
  const owner = object === undefined ? undefined : ownDescriptor(run.host.functions, object)?.value;
  return Reflect.apply(fn, owner, args);
}

function evaluate(expression: HoloExpression, run: Run): unknown {
  step(run);
  switch (expression.type) {
    case 'Literal':
      return expression.value;
    case 'Identifier':
      return lookup(expression.name, run);
    case 'MemberExpression':
      if (expression.object.type === 'Identifier' && expression.object.name === 'state') {
        checkKeyAtRun(expression.property);
        return run.host.readState(expression.property);
      }
      return readOwn(evaluate(expression.object, run), expression.property);
    case 'CallExpression': {
      const callee = expression.callee;
      const args = expression.arguments.map((arg) => evaluate(arg, run));
      if (callee.type === 'Identifier') return callProvided(undefined, callee.name, args, run);
      if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier') {
        return callProvided(callee.object.name, callee.property, args, run);
      }
      return refuse('only functions this runtime provides can be called');
    }
    case 'BinaryExpression':
      return binary(expression.operator, expression.left, expression.right, run);
    case 'UnaryExpression': {
      const value = evaluate(expression.argument, run);
      switch (expression.operator as string) {
        case '!':
          return !value;
        case '-':
          return -(value as number);
        case '+':
          return +(value as number);
        default:
          return refuse(`unary "${expression.operator}" is not supported`);
      }
    }
    case 'UpdateExpression': {
      const target = expression.argument;
      const delta = expression.operator === '++' ? 1 : -1;
      let before: number;
      if (target.type === 'Identifier') {
        before = Number(run.locals.get(target.name));
        run.locals.set(target.name, before + delta);
      } else if (target.type === 'MemberExpression') {
        before = Number(run.host.readState(target.property));
        run.host.writeState(target.property, before + delta);
      } else {
        return refuse('++ and -- need a name');
      }
      return expression.prefix ? before + delta : before;
    }
    case 'ArrayExpression':
      return expression.elements.map((element) => evaluate(element, run));
    case 'ObjectExpression': {
      const object: Record<string, unknown> = {};
      for (const property of expression.properties) {
        checkKeyAtRun(property.key);
        object[property.key] = evaluate(property.value, run);
      }
      return object;
    }
    case 'ConditionalExpression':
      return evaluate(expression.test, run)
        ? evaluate(expression.consequent, run)
        : evaluate(expression.alternate, run);
    default:
      return refuse(`a ${String((expression as { type?: unknown }).type)} cannot run here`);
  }
}

function checkKeyAtRun(key: string): void {
  if (FORBIDDEN_KEYS.has(key)) refuse(`"${key}" cannot be used here`);
}

function binary(operator: string, leftNode: HoloExpression, rightNode: HoloExpression, run: Run) {
  if (operator === '&&') return evaluate(leftNode, run) && evaluate(rightNode, run);
  if (operator === '||') return evaluate(leftNode, run) || evaluate(rightNode, run);
  if (operator === '??') return evaluate(leftNode, run) ?? evaluate(rightNode, run);
  const left = evaluate(leftNode, run) as number;
  const right = evaluate(rightNode, run) as number;
  switch (operator) {
    case '+':
      return (left as unknown as string) + (right as unknown as string);
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return left / right;
    case '%':
      return left % right;
    case '==':
      // eslint-disable-next-line eqeqeq
      return left == right;
    case '!=':
      // eslint-disable-next-line eqeqeq
      return left != right;
    case '===':
      return left === right;
    case '!==':
      return left !== right;
    case '<':
      return left < right;
    case '>':
      return left > right;
    case '<=':
      return left <= right;
    case '>=':
      return left >= right;
    default:
      return refuse(`operator "${operator}" is not supported`);
  }
}
