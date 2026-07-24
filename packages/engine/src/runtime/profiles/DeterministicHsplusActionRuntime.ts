/**
 * Deterministic HoloScript+ action runtime.
 *
 * This runtime is deliberately smaller than the full HoloScript+ language. It
 * dual-parses authored source, admits a bounded structured-AST intersection,
 * and evaluates that AST without `eval`, `Function`, Node's VM, host globals,
 * providers, timers, network, or filesystem capabilities.
 *
 * State changes and emitted events are transactional: an invocation commits
 * only after its result and expected action decision validate.
 */
import { HoloScriptPlusParser, parseHolo } from '@holoscript/core';
import type {
  HoloAction,
  HoloAssignment,
  HoloExpression,
  HoloStatement,
} from '@holoscript/core/parser/HoloCompositionTypes';
import {
  canonicalizeHeadlessValue,
  type HeadlessExperimentInvocationResult,
  type HeadlessExperimentScheduleEntry,
  type HeadlessJsonObject,
  type HeadlessJsonValue,
} from './HeadlessExecutionLedger';

export const ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET =
  'holoscript-engine-hsplus-deterministic-action-subset-v1' as const;

const MAX_SOURCE_BYTES = 256 * 1024;
const MAX_CANONICAL_VALUE_BYTES = 1024 * 1024;
const MAX_AST_NODES = 512;
const MAX_AST_DEPTH = 32;
const MAX_EVENT_NAME_LENGTH = 128;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const RESERVED_PARAMETER_NAMES = new Set(['state']);

interface HsplusNodeLike {
  type?: unknown;
  properties?: unknown;
  directives?: unknown;
  children?: unknown;
  body?: unknown;
}

interface RawHsplusAction {
  name: string;
  params: string[];
  body: string;
}

interface EvaluationEnvironment {
  state: HeadlessJsonObject;
  args: HeadlessJsonObject;
}

interface AstBudget {
  nodes: number;
}

interface StatementFlow {
  returned: boolean;
  value: HeadlessJsonValue;
}

function fail(message: string): never {
  throw new Error(`Deterministic HoloScript+ action runtime: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertSafeKey(key: string, label: string): void {
  if (!IDENTIFIER.test(key) || DANGEROUS_KEYS.has(key)) {
    fail(`${label} contains unsafe key "${key}"`);
  }
}

function assertSafeJsonKeys(value: HeadlessJsonValue, label: string): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertSafeJsonKeys(child, `${label}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      fail(`${label} contains forbidden prototype key "${key}"`);
    }
    assertSafeJsonKeys(child as HeadlessJsonValue, `${label}.${key}`);
  }
}

function toStrictJson(value: unknown, label: string): HeadlessJsonValue {
  try {
    const canonical = canonicalizeHeadlessValue(value);
    if (new TextEncoder().encode(canonical).byteLength > MAX_CANONICAL_VALUE_BYTES) {
      fail(`${label} exceeds ${MAX_CANONICAL_VALUE_BYTES} canonical bytes`);
    }
    const parsed = JSON.parse(canonical) as HeadlessJsonValue;
    assertSafeJsonKeys(parsed, label);
    return parsed;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('Deterministic HoloScript+ action runtime:')
    ) {
      throw error;
    }
    fail(`${label} is not strict JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function toStrictObject(value: unknown, label: string): HeadlessJsonObject {
  const parsed = toStrictJson(value, label);
  if (!isRecord(parsed)) fail(`${label} must be an object`);
  return parsed as HeadlessJsonObject;
}

function cloneObject(value: HeadlessJsonObject, label: string): HeadlessJsonObject {
  return toStrictObject(value, label);
}

function walkHsplus(node: unknown): HsplusNodeLike[] {
  if (!isRecord(node)) return [];
  const current = node as HsplusNodeLike;
  const children = Array.isArray(current.children) ? current.children : [];
  return [current, ...children.flatMap((child) => walkHsplus(child))];
}

function mergeState(target: HeadlessJsonObject, candidate: unknown, sourceLabel: string): void {
  if (!isRecord(candidate)) return;
  for (const [key, value] of Object.entries(candidate)) {
    assertSafeKey(key, sourceLabel);
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      fail(`duplicate state key "${key}" in ${sourceLabel}`);
    }
    target[key] = toStrictJson(value, `${sourceLabel}.${key}`);
  }
}

function extractHsplusState(nodes: HsplusNodeLike[]): HeadlessJsonObject {
  const state: HeadlessJsonObject = {};
  for (const node of nodes) {
    const directives = Array.isArray(node.directives) ? node.directives : [];
    for (const directive of directives) {
      if (isRecord(directive) && directive.type === 'state') {
        mergeState(state, directive.body, '@state');
      }
    }
    if (node.type === 'state') {
      mergeState(state, node.properties, 'state block');
      if (isRecord(node.body) && !Array.isArray(node.body.actions)) {
        mergeState(state, node.body, 'state block body');
      }
    }
  }
  if (Object.keys(state).length === 0) {
    fail('source must declare deterministic composition state');
  }
  return state;
}

function maskStringsAndComments(source: string): string {
  let result = '';
  let index = 0;
  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    if (current === '/' && next === '/') {
      result += '  ';
      index += 2;
      while (index < source.length && source[index] !== '\n') {
        result += ' ';
        index++;
      }
      continue;
    }
    if (current === '/' && next === '*') {
      result += '  ';
      index += 2;
      while (index < source.length) {
        if (source[index] === '*' && source[index + 1] === '/') {
          result += '  ';
          index += 2;
          break;
        }
        result += source[index] === '\n' ? '\n' : ' ';
        index++;
      }
      continue;
    }
    if (current === '"' || current === "'" || current === '`') {
      const quote = current;
      result += ' ';
      index++;
      while (index < source.length) {
        const candidate = source[index];
        if (candidate === '\\') {
          result += ' ';
          index++;
          if (index < source.length) {
            result += source[index] === '\n' ? '\n' : ' ';
            index++;
          }
          continue;
        }
        result += candidate === '\n' ? '\n' : ' ';
        index++;
        if (candidate === quote) break;
      }
      continue;
    }
    result += current;
    index++;
  }
  return result;
}

function assertNoComputedStateAccess(body: string, actionName: string): void {
  const executableSurface = maskStringsAndComments(body).replace(/[\s()]/g, '');
  if (/\bstate(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*\[/.test(executableSurface)) {
    fail(`action "${actionName}" uses computed state access, which is not admitted`);
  }
}

function extractRawActions(nodes: HsplusNodeLike[]): Map<string, RawHsplusAction> {
  const actions = new Map<string, RawHsplusAction>();
  for (const node of nodes) {
    if (node.type !== 'logic' || !isRecord(node.body) || !Array.isArray(node.body.actions)) {
      continue;
    }
    for (const [index, candidate] of node.body.actions.entries()) {
      if (!isRecord(candidate)) fail(`logic action ${index} is malformed`);
      const { name, params, body } = candidate;
      if (
        typeof name !== 'string' ||
        !IDENTIFIER.test(name) ||
        DANGEROUS_KEYS.has(name) ||
        !Array.isArray(params) ||
        !params.every(
          (param) =>
            typeof param === 'string' &&
            IDENTIFIER.test(param) &&
            !DANGEROUS_KEYS.has(param) &&
            !RESERVED_PARAMETER_NAMES.has(param)
        ) ||
        typeof body !== 'string' ||
        body.trim().length === 0
      ) {
        fail(`logic action ${index} has an unsupported signature`);
      }
      if (new Set(params).size !== params.length) {
        fail(`action "${name}" contains duplicate parameters`);
      }
      if (actions.has(name)) fail(`duplicate action "${name}"`);
      assertNoComputedStateAccess(body, name);
      actions.set(name, { name, params: [...params], body });
    }
  }
  if (actions.size === 0) fail('source must declare at least one logic action');
  return actions;
}

function extractStructuredState(
  properties: ReadonlyArray<{ key: string; value: unknown }> | undefined
): HeadlessJsonObject {
  const state: HeadlessJsonObject = {};
  for (const property of properties ?? []) {
    assertSafeKey(property.key, 'structured state');
    if (Object.prototype.hasOwnProperty.call(state, property.key)) {
      fail(`duplicate structured state key "${property.key}"`);
    }
    state[property.key] = toStrictJson(property.value, `structured state.${property.key}`);
  }
  if (Object.keys(state).length === 0) {
    fail('structured parser did not preserve composition state');
  }
  return state;
}

function consumeBudget(budget: AstBudget, depth: number, label: string): void {
  budget.nodes++;
  if (budget.nodes > MAX_AST_NODES) fail(`${label} exceeds ${MAX_AST_NODES} AST nodes`);
  if (depth > MAX_AST_DEPTH) fail(`${label} exceeds AST depth ${MAX_AST_DEPTH}`);
}

function memberPath(expression: HoloExpression): string[] | null {
  const properties: string[] = [];
  let current = expression;
  while (current.type === 'MemberExpression') {
    if (current.computed) return null;
    properties.push(current.property);
    if (properties.length > MAX_AST_DEPTH) {
      fail(`member access exceeds AST depth ${MAX_AST_DEPTH}`);
    }
    current = current.object;
  }
  if (current.type !== 'Identifier') return null;
  return [current.name, ...properties.reverse()];
}

function validateExpression(
  expression: HoloExpression,
  params: ReadonlySet<string>,
  budget: AstBudget,
  depth: number
): void {
  consumeBudget(budget, depth, 'action expression');
  switch (expression.type) {
    case 'Literal':
      toStrictJson(expression.value, 'literal');
      return;
    case 'Identifier':
      if (!params.has(expression.name)) {
        fail(`expression references undeclared parameter "${expression.name}"`);
      }
      return;
    case 'MemberExpression': {
      const path = memberPath(expression);
      if (!path || path.length < 2) fail('computed or malformed member access is unsupported');
      for (let extraDepth = 1; extraDepth < path.length - 1; extraDepth++) {
        consumeBudget(budget, depth + extraDepth, 'member access');
      }
      path.forEach((part) => assertSafeKey(part, 'member access'));
      if (path[0] !== 'state' && !params.has(path[0])) {
        fail(`member access root "${path[0]}" is not declared state or a parameter`);
      }
      return;
    }
    case 'BinaryExpression': {
      const allowed = new Set([
        '+',
        '-',
        '*',
        '/',
        '==',
        '===',
        '!=',
        '!==',
        '<',
        '>',
        '<=',
        '>=',
        '&&',
        '||',
      ]);
      if (!allowed.has(expression.operator)) {
        fail(`binary operator "${expression.operator}" is unsupported`);
      }
      validateExpression(expression.left, params, budget, depth + 1);
      validateExpression(expression.right, params, budget, depth + 1);
      return;
    }
    case 'UnaryExpression':
      if (expression.operator !== '!' && expression.operator !== '-') {
        fail(`unary operator "${String(expression.operator)}" is unsupported`);
      }
      validateExpression(expression.argument, params, budget, depth + 1);
      return;
    case 'ArrayExpression':
      expression.elements.forEach((child) => validateExpression(child, params, budget, depth + 1));
      return;
    case 'ObjectExpression': {
      const keys = new Set<string>();
      expression.properties.forEach((property) => {
        assertSafeKey(property.key, 'object expression');
        if (keys.has(property.key)) {
          fail(`object expression contains duplicate key "${property.key}"`);
        }
        keys.add(property.key);
        validateExpression(property.value, params, budget, depth + 1);
      });
      return;
    }
    case 'ConditionalExpression':
      validateExpression(expression.test, params, budget, depth + 1);
      validateExpression(expression.consequent, params, budget, depth + 1);
      validateExpression(expression.alternate, params, budget, depth + 1);
      return;
    default:
      fail(`expression type "${String((expression as { type?: unknown }).type)}" is not admitted`);
  }
}

function validateStatements(
  statements: readonly HoloStatement[],
  params: ReadonlySet<string>,
  budget: AstBudget,
  depth: number
): void {
  for (const statement of statements) {
    consumeBudget(budget, depth, 'action body');
    switch (statement.type) {
      case 'Assignment': {
        const path = statement.target.split('.');
        if (path.length < 2 || path[0] !== 'state') {
          fail(`assignment target "${statement.target}" must be declared state`);
        }
        path.forEach((part) => assertSafeKey(part, 'assignment target'));
        validateExpression(statement.value, params, budget, depth + 1);
        break;
      }
      case 'EmitStatement':
        if (
          statement.event.length === 0 ||
          statement.event.length > MAX_EVENT_NAME_LENGTH ||
          /[\u0000-\u001f\u007f]/.test(statement.event)
        ) {
          fail('event name is empty, too long, or contains control characters');
        }
        if (statement.data) validateExpression(statement.data, params, budget, depth + 1);
        break;
      case 'ReturnStatement':
        if (statement.value) validateExpression(statement.value, params, budget, depth + 1);
        break;
      case 'IfStatement':
        validateExpression(statement.condition, params, budget, depth + 1);
        validateStatements(statement.consequent, params, budget, depth + 1);
        validateStatements(statement.alternate ?? [], params, budget, depth + 1);
        break;
      default:
        fail(`statement type "${String((statement as { type?: unknown }).type)}" is not admitted`);
    }
  }
}

function validateActions(
  rawActions: ReadonlyMap<string, RawHsplusAction>,
  structuredActions: readonly HoloAction[]
): Map<string, HoloAction> {
  const actions = new Map<string, HoloAction>();
  const budget: AstBudget = { nodes: 0 };
  for (const action of structuredActions) {
    assertSafeKey(action.name, 'structured action');
    if (action.async) fail(`async action "${action.name}" is not admitted`);
    for (const parameter of action.parameters) {
      if (parameter.paramType !== undefined && parameter.paramType.trim().length > 0) {
        fail(`typed parameter "${parameter.name}" in action "${action.name}" is not admitted`);
      }
      if (parameter.defaultValue !== undefined) {
        fail(`default parameter "${parameter.name}" in action "${action.name}" is not admitted`);
      }
    }
    const params = action.parameters.map((parameter) => parameter.name);
    params.forEach((param) => assertSafeKey(param, `action "${action.name}" parameters`));
    if (params.some((param) => RESERVED_PARAMETER_NAMES.has(param))) {
      fail(`action "${action.name}" uses reserved parameter "state"`);
    }
    if (new Set(params).size !== params.length) {
      fail(`action "${action.name}" contains duplicate structured parameters`);
    }
    if (actions.has(action.name)) fail(`duplicate structured action "${action.name}"`);
    if (action.body.length === 0) fail(`action "${action.name}" has an empty structured body`);
    validateStatements(action.body, new Set(params), budget, 0);
    actions.set(action.name, action);
  }

  const signature = (entries: Array<{ name: string; params: string[] }>) =>
    entries.sort((left, right) => left.name.localeCompare(right.name));
  const rawSignature = signature(
    [...rawActions.values()].map((action) => ({ name: action.name, params: action.params }))
  );
  const structuredSignature = signature(
    [...actions.values()].map((action) => ({
      name: action.name,
      params: action.parameters.map((parameter) => parameter.name),
    }))
  );
  if (canonicalizeHeadlessValue(rawSignature) !== canonicalizeHeadlessValue(structuredSignature)) {
    fail('HoloScript+ and structured parser action signatures disagree');
  }
  return actions;
}

function numeric(value: HeadlessJsonValue, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) {
    fail(`${label} requires a finite non-negative-zero number`);
  }
  return value;
}

function finiteResult(value: number, label: string): number {
  if (!Number.isFinite(value) || Object.is(value, -0)) {
    fail(`${label} produced an unsupported number`);
  }
  return value;
}

function booleanValue(value: HeadlessJsonValue, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} requires a boolean`);
  return value;
}

function primitiveEqual(left: HeadlessJsonValue, right: HeadlessJsonValue): boolean {
  const leftObject = typeof left === 'object' && left !== null;
  const rightObject = typeof right === 'object' && right !== null;
  if (leftObject || rightObject) fail('equality over arrays or objects is not admitted');
  return left === right;
}

function readMember(
  path: readonly string[],
  environment: EvaluationEnvironment
): HeadlessJsonValue {
  const [root, ...parts] = path;
  let value: HeadlessJsonValue | undefined =
    root === 'state' ? environment.state : environment.args[root];
  for (const part of parts) {
    if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, part)) {
      fail(`member path "${path.join('.')}" is missing`);
    }
    value = value[part] as HeadlessJsonValue;
  }
  if (value === undefined) fail(`member path "${path.join('.')}" resolved to undefined`);
  return value;
}

function evaluateExpression(
  expression: HoloExpression,
  environment: EvaluationEnvironment
): HeadlessJsonValue {
  switch (expression.type) {
    case 'Literal':
      return toStrictJson(expression.value, 'literal result');
    case 'Identifier': {
      if (!Object.prototype.hasOwnProperty.call(environment.args, expression.name)) {
        fail(`parameter "${expression.name}" is unavailable`);
      }
      return environment.args[expression.name];
    }
    case 'MemberExpression': {
      const path = memberPath(expression);
      if (!path || path.length < 2) fail('computed or malformed member access is unsupported');
      return readMember(path, environment);
    }
    case 'BinaryExpression': {
      const left = evaluateExpression(expression.left, environment);
      if (expression.operator === '&&') {
        return booleanValue(left, 'logical and')
          ? booleanValue(evaluateExpression(expression.right, environment), 'logical and')
          : false;
      }
      if (expression.operator === '||') {
        return booleanValue(left, 'logical or')
          ? true
          : booleanValue(evaluateExpression(expression.right, environment), 'logical or');
      }
      const right = evaluateExpression(expression.right, environment);
      switch (expression.operator) {
        case '+':
          if (typeof left === 'number' && typeof right === 'number') {
            return finiteResult(left + right, 'addition');
          }
          if (typeof left === 'string' && typeof right === 'string') return left + right;
          fail('addition requires two numbers or two strings');
        case '-':
          return finiteResult(
            numeric(left, 'subtraction') - numeric(right, 'subtraction'),
            'subtraction'
          );
        case '*':
          return finiteResult(
            numeric(left, 'multiplication') * numeric(right, 'multiplication'),
            'multiplication'
          );
        case '/': {
          const divisor = numeric(right, 'division');
          if (divisor === 0) fail('division by zero is not admitted');
          return finiteResult(numeric(left, 'division') / divisor, 'division');
        }
        case '==':
        case '===':
          return primitiveEqual(left, right);
        case '!=':
        case '!==':
          return !primitiveEqual(left, right);
        case '<':
          return numeric(left, 'comparison') < numeric(right, 'comparison');
        case '>':
          return numeric(left, 'comparison') > numeric(right, 'comparison');
        case '<=':
          return numeric(left, 'comparison') <= numeric(right, 'comparison');
        case '>=':
          return numeric(left, 'comparison') >= numeric(right, 'comparison');
        default:
          fail(`binary operator "${expression.operator}" is unsupported`);
      }
    }
    case 'UnaryExpression': {
      const argument = evaluateExpression(expression.argument, environment);
      if (expression.operator === '!') return !booleanValue(argument, 'logical not');
      if (expression.operator === '-') {
        return finiteResult(-numeric(argument, 'negation'), 'negation');
      }
      fail(`unary operator "${String(expression.operator)}" is unsupported`);
    }
    case 'ArrayExpression':
      return expression.elements.map((child) => evaluateExpression(child, environment));
    case 'ObjectExpression': {
      const result: HeadlessJsonObject = {};
      for (const property of expression.properties) {
        assertSafeKey(property.key, 'object expression');
        result[property.key] = evaluateExpression(property.value, environment);
      }
      return result;
    }
    case 'ConditionalExpression':
      return booleanValue(
        evaluateExpression(expression.test, environment),
        'conditional expression'
      )
        ? evaluateExpression(expression.consequent, environment)
        : evaluateExpression(expression.alternate, environment);
    default:
      fail(`expression type "${String((expression as { type?: unknown }).type)}" is not admitted`);
  }
}

function applyAssignment(statement: HoloAssignment, environment: EvaluationEnvironment): void {
  const path = statement.target.split('.').slice(1);
  let target: HeadlessJsonObject = environment.state;
  for (const part of path.slice(0, -1)) {
    if (!Object.prototype.hasOwnProperty.call(target, part) || !isRecord(target[part])) {
      fail(`assignment target "${statement.target}" is not declared object state`);
    }
    target = target[part] as HeadlessJsonObject;
  }
  const leaf = path[path.length - 1];
  if (!Object.prototype.hasOwnProperty.call(target, leaf)) {
    fail(`assignment target "${statement.target}" is not declared state`);
  }
  const incoming = evaluateExpression(statement.value, environment);
  const current = target[leaf];
  let next: HeadlessJsonValue;
  switch (statement.operator) {
    case '=':
      next = incoming;
      break;
    case '+=':
      if (typeof current === 'number' && typeof incoming === 'number') {
        next = finiteResult(current + incoming, 'addition assignment');
      } else if (typeof current === 'string' && typeof incoming === 'string') {
        next = current + incoming;
      } else {
        fail('addition assignment requires two numbers or two strings');
      }
      break;
    case '-=':
      next = finiteResult(
        numeric(current, 'subtraction assignment') - numeric(incoming, 'subtraction assignment'),
        'subtraction assignment'
      );
      break;
    case '*=':
      next = finiteResult(
        numeric(current, 'multiplication assignment') *
          numeric(incoming, 'multiplication assignment'),
        'multiplication assignment'
      );
      break;
    case '/=': {
      const divisor = numeric(incoming, 'division assignment');
      if (divisor === 0) fail('division assignment by zero is not admitted');
      next = finiteResult(numeric(current, 'division assignment') / divisor, 'division assignment');
      break;
    }
    default:
      fail(`assignment operator "${String(statement.operator)}" is unsupported`);
  }
  target[leaf] = toStrictJson(next, `assignment ${statement.target}`);
}

function executeStatements(
  statements: readonly HoloStatement[],
  environment: EvaluationEnvironment,
  emittedEvents: HeadlessJsonValue[]
): StatementFlow {
  for (const statement of statements) {
    switch (statement.type) {
      case 'Assignment':
        applyAssignment(statement, environment);
        break;
      case 'EmitStatement': {
        const payload = statement.data ? evaluateExpression(statement.data, environment) : null;
        emittedEvents.push(
          toStrictJson({ event: statement.event, payload }, `event "${statement.event}"`)
        );
        break;
      }
      case 'ReturnStatement':
        return {
          returned: true,
          value: statement.value ? evaluateExpression(statement.value, environment) : null,
        };
      case 'IfStatement': {
        const condition = booleanValue(
          evaluateExpression(statement.condition, environment),
          'if condition'
        );
        const flow = executeStatements(
          condition ? statement.consequent : (statement.alternate ?? []),
          environment,
          emittedEvents
        );
        if (flow.returned) return flow;
        break;
      }
      default:
        fail(`statement type "${String((statement as { type?: unknown }).type)}" is not admitted`);
    }
  }
  return { returned: false, value: null };
}

function stateChanged(before: HeadlessJsonObject, after: HeadlessJsonObject): boolean {
  return canonicalizeHeadlessValue(before) !== canonicalizeHeadlessValue(after);
}

function validateActionDecision(
  entry: HeadlessExperimentScheduleEntry,
  value: HeadlessJsonValue,
  changed: boolean,
  emittedEvents: readonly HeadlessJsonValue[]
): boolean {
  if (entry.kind === 'observation') {
    if (changed) fail(`observation "${entry.scheduleEntryId}" attempted to mutate state`);
    if (emittedEvents.length > 0) {
      fail(`observation "${entry.scheduleEntryId}" attempted to emit an event`);
    }
    return false;
  }
  if (!isRecord(value)) fail(`action "${entry.entrypoint}" must return an object`);
  if (typeof value.allowed !== 'boolean') {
    fail(`action "${entry.entrypoint}" result.allowed must be boolean`);
  }
  if (typeof value.outcome !== 'string' || value.outcome.length === 0) {
    fail(`action "${entry.entrypoint}" result.outcome must be a non-empty string`);
  }
  if (!value.allowed && (changed || emittedEvents.length > 0)) {
    fail(`denied action "${entry.entrypoint}" attempted a state change or event`);
  }
  if (entry.expect?.allowed !== undefined && entry.expect.allowed !== value.allowed) {
    fail(`action "${entry.entrypoint}" allowed result does not match the schedule`);
  }
  if (entry.expect?.outcome !== undefined && entry.expect.outcome !== value.outcome) {
    fail(`action "${entry.entrypoint}" outcome does not match the schedule`);
  }
  return value.allowed;
}

export class DeterministicHsplusActionRuntime {
  private readonly actions: ReadonlyMap<string, HoloAction>;
  private readonly initial: HeadlessJsonObject;
  private state: HeadlessJsonObject;

  constructor(source: string) {
    if (typeof source !== 'string' || source.trim().length === 0) {
      fail('source must be a non-empty string');
    }
    if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
      fail(`source exceeds ${MAX_SOURCE_BYTES} bytes`);
    }

    const hsplus = new HoloScriptPlusParser().parse(source);
    if (hsplus.errors.length > 0 || !hsplus.ast?.root) {
      fail(`HoloScript+ parse failed: ${hsplus.errors.map((error) => error.message).join('; ')}`);
    }
    const nodes = walkHsplus(hsplus.ast.root);
    const hsplusState = extractHsplusState(nodes);
    const rawActions = extractRawActions(nodes);

    const structured = parseHolo(source);
    if (!structured.success || !structured.ast) {
      fail(
        `structured parse failed: ${structured.errors.map((error) => error.message).join('; ')}`
      );
    }
    const structuredState = extractStructuredState(structured.ast.state?.properties);
    if (canonicalizeHeadlessValue(hsplusState) !== canonicalizeHeadlessValue(structuredState)) {
      fail('HoloScript+ and structured parser state disagree');
    }

    this.actions = validateActions(rawActions, structured.ast.logic?.actions ?? []);
    this.initial = cloneObject(structuredState, 'initial state');
    this.state = cloneObject(this.initial, 'runtime state');
  }

  get initialState(): HeadlessJsonObject {
    return cloneObject(this.initial, 'initial state snapshot');
  }

  getState(): HeadlessJsonObject {
    return cloneObject(this.state, 'runtime state snapshot');
  }

  invoke(entry: HeadlessExperimentScheduleEntry): HeadlessExperimentInvocationResult {
    if (entry.kind !== 'observation' && entry.kind !== 'action') {
      fail(`unsupported schedule entry kind "${String(entry.kind)}"`);
    }
    const action = this.actions.get(entry.entrypoint);
    if (!action) fail(`unknown action entrypoint "${entry.entrypoint}"`);

    const args = toStrictObject(entry.args ?? {}, `${entry.scheduleEntryId} args`);
    const expectedArgs = action.parameters.map((parameter) => parameter.name).sort();
    const actualArgs = Object.keys(args).sort();
    if (canonicalizeHeadlessValue(expectedArgs) !== canonicalizeHeadlessValue(actualArgs)) {
      fail(`action "${action.name}" requires exactly: ${expectedArgs.join(', ')}`);
    }

    const before = cloneObject(this.state, `${action.name} pre-state`);
    const workingState = cloneObject(before, `${action.name} transaction state`);
    const emittedEvents: HeadlessJsonValue[] = [];
    const flow = executeStatements(action.body, { state: workingState, args }, emittedEvents);
    if (!flow.returned) fail(`action "${action.name}" completed without an explicit return`);
    const value = toStrictJson(flow.value, `${action.name} result`);
    const after = cloneObject(workingState, `${action.name} post-state`);
    const changed = stateChanged(before, after);
    const shouldCommit = validateActionDecision(entry, value, changed, emittedEvents);
    if (shouldCommit) this.state = after;

    return {
      value,
      state: this.getState(),
      emittedEvents: emittedEvents.map((event, index) =>
        toStrictJson(event, `${action.name} emitted event ${index}`)
      ),
    };
  }
}

export function createDeterministicHsplusActionRuntime(
  source: string
): DeterministicHsplusActionRuntime {
  return new DeterministicHsplusActionRuntime(source);
}
