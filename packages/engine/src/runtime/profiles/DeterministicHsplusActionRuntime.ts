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

export const ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V2 =
  'holoscript-engine-hsplus-deterministic-action-subset-v2-numeric-builtins' as const;

export const ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V3 =
  'holoscript-engine-hsplus-deterministic-action-subset-v3-local-bindings' as const;

export const ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V4 =
  'holoscript-engine-hsplus-deterministic-action-subset-v4-host-bindings' as const;

export const ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V6 =
  'holoscript-engine-hsplus-deterministic-action-subset-v6-null-coalescing' as const;

export const ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V7 =
  'holoscript-engine-hsplus-deterministic-action-subset-v7-packaged-traits' as const;

export type DeterministicHostBindings = Readonly<
  Record<string, Readonly<Record<string, (...args: HeadlessJsonValue[]) => unknown>>>
>;

export interface DeterministicHsplusActionRuntimeOptions {
  /**
   * Admit the v2 whitelisted deterministic numeric builtin table
   * (sqrt/sin/cos/acos/abs/floor/min/max over finite f64, fail-closed on
   * non-finite or negative-zero results). Off by default: the v1 subset is a
   * pinned receipt contract and must not change behavior.
   */
  numericBuiltins?: boolean;
  /**
   * Admit bounded local bindings: plain `name = expr` assignments to bare
   * identifiers that are not parameters, `state`, or builtin names.
   * Reassignment is allowed, use-before-assign fails closed at validation,
   * locals never outlive the invocation, and only the plain `=` operator is
   * admitted for locals. Implies the v3 subset id, raises the composition
   * AST-node budget from 512 to 4096 (v1/v2 budgets stay pinned), and,
   * together with numericBuiltins, matches the wasm evaluator's admitted
   * grammar.
   */
  localBindings?: boolean;
  /**
   * Inject the std host-ABI binding surface (v4 subset id): namespace objects
   * of pure host functions, e.g. the object returned by
   * createStdHostBindings() in packages/std/conformance/host-abi. Guest code
   * may then call `ns.fn(args…)` for declared namespace/function pairs only.
   * Namespaces exist solely in callee position — they are not values, cannot
   * be read, stored, or shadowed. Arguments cross as strict JSON; results are
   * re-validated on re-entry (strict JSON, finite numbers, no negative zero)
   * and a host throw fails the invocation closed.
   */
  hostBindings?: DeterministicHostBindings;
  /**
   * Admit strict, short-circuiting null coalescing (`left ?? right`) under the
   * cumulative v6 subset id. Only `null` selects the right operand; false, zero,
   * and the empty string stay present. Requires the cumulative v4 engine
   * features (numericBuiltins, localBindings, and hostBindings).
   */
  nullCoalescing?: boolean;
}

export interface DeterministicHsplusTraitRuntimeOptions {
  /**
   * Canonical pure host bindings used by statically lifted packaged factories.
   * The runtime never calls a factory or executes `@on_spawn`; it constructs
   * escape-proof namespace views from this injected table.
   */
  hostBindings: DeterministicHostBindings;
}

const NUMERIC_BUILTINS: ReadonlyMap<string, { arity: number; apply: (args: number[]) => number }> =
  new Map([
    ['sqrt', { arity: 1, apply: ([x]: number[]) => Math.sqrt(x) }],
    ['sin', { arity: 1, apply: ([x]: number[]) => Math.sin(x) }],
    ['cos', { arity: 1, apply: ([x]: number[]) => Math.cos(x) }],
    ['acos', { arity: 1, apply: ([x]: number[]) => Math.acos(x) }],
    ['abs', { arity: 1, apply: ([x]: number[]) => Math.abs(x) }],
    ['floor', { arity: 1, apply: ([x]: number[]) => Math.floor(x) }],
    ['min', { arity: 2, apply: ([a, b]: number[]) => Math.min(a, b) }],
    ['max', { arity: 2, apply: ([a, b]: number[]) => Math.max(a, b) }],
  ]);

const MAX_SOURCE_BYTES = 256 * 1024;
const MAX_CANONICAL_VALUE_BYTES = 1024 * 1024;
const MAX_AST_NODES = 512;
const MAX_AST_NODES_V3 = 4096;
const MAX_AST_DEPTH = 32;
const MAX_EVENT_NAME_LENGTH = 128;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const RESERVED_PARAMETER_NAMES = new Set(['state']);
const PACKAGED_FACTORIES: ReadonlyMap<string, readonly string[]> = new Map([
  ['get_std_math_lib', ['math']],
  ['get_std_collections_lib', ['list_lib', 'map_lib', 'set_lib']],
]);

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

interface RawHsplusTrait {
  name: string;
  handlers: ReadonlyMap<string, RawHsplusAction>;
}

interface EvaluationEnvironment {
  state: HeadlessJsonObject;
  args: HeadlessJsonObject;
  numericBuiltins: boolean;
  localBindings: boolean;
  locals: HeadlessJsonObject;
  hostBindings: DeterministicHostBindings | null;
  nullCoalescing: boolean;
}

function assertFiniteNumbers(value: unknown, label: string): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail(`${label} contains a non-finite or negative-zero number`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertFiniteNumbers(child, `${label}[${index}]`));
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      assertFiniteNumbers(child, `${label}.${key}`);
    }
  }
}

interface AstBudget {
  nodes: number;
  limit: number;
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

function topLevelHsplusNodes(root: unknown): HsplusNodeLike[] {
  if (!isRecord(root)) return [];
  const node = root as HsplusNodeLike;
  if (node.type === 'fragment') {
    return Array.isArray(node.children)
      ? node.children.filter((child): child is HsplusNodeLike => isRecord(child))
      : [];
  }
  return [node];
}

function extractTraitHandler(
  directive: Record<string, unknown>,
  traitName: string,
  index: number
): RawHsplusAction | null {
  let name: unknown;
  let params: unknown;
  let body: unknown;

  if (directive.type === 'lifecycle') {
    name = directive.hook;
    params = directive.params;
    body = directive.body;
  } else if (
    directive.type === 'trait' &&
    typeof directive.name === 'string' &&
    directive.name.startsWith('on_')
  ) {
    name = directive.name;
    const config = directive.config;
    if (!isRecord(config)) {
      fail(`@trait "${traitName}" handler ${index} has malformed config`);
    }
    body = config.body;
    params = Object.entries(config)
      .filter(([key]) => key !== 'body')
      .map(([key, value]) => {
        if (value !== true) {
          fail(
            `@trait "${traitName}" handler "${String(name)}" parameter "${key}" has an unsupported declaration`
          );
        }
        return key;
      });
  } else {
    return null;
  }

  if (
    typeof name !== 'string' ||
    !name.startsWith('on_') ||
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
    fail(`@trait "${traitName}" handler ${index} has an unsupported signature`);
  }
  if (new Set(params).size !== params.length) {
    fail(`@trait "${traitName}" handler "${name}" contains duplicate parameters`);
  }
  assertNoComputedStateAccess(body, name);
  return { name, params: [...params], body };
}

function extractRawTraits(root: unknown): Map<string, RawHsplusTrait> {
  const traits = new Map<string, RawHsplusTrait>();
  for (const node of topLevelHsplusNodes(root)) {
    const directives = Array.isArray(node.directives) ? node.directives : [];
    const traitMarkers = directives.filter(
      (directive) => isRecord(directive) && directive.type === 'trait' && directive.name === 'trait'
    );
    if (traitMarkers.length === 0) continue;
    if (traitMarkers.length !== 1) {
      fail('packaged source contains an ambiguous top-level @trait marker');
    }
    if (
      typeof node.type !== 'string' ||
      !IDENTIFIER.test(node.type) ||
      DANGEROUS_KEYS.has(node.type)
    ) {
      fail('packaged source contains an unsafe top-level @trait name');
    }
    if (traits.has(node.type)) {
      fail(`packaged source declares duplicate @trait "${node.type}"`);
    }
    const handlers = new Map<string, RawHsplusAction>();
    for (const [index, directive] of directives.entries()) {
      if (!isRecord(directive)) continue;
      const handler = extractTraitHandler(directive, node.type, index);
      if (!handler) continue;
      if (handlers.has(handler.name)) {
        fail(`@trait "${node.type}" declares duplicate handler "${handler.name}"`);
      }
      handlers.set(handler.name, handler);
    }
    if (handlers.size === 0) {
      fail(`@trait "${node.type}" declares no handlers`);
    }
    traits.set(node.type, { name: node.type, handlers });
  }
  if (traits.size === 0) fail('source must declare at least one top-level @trait');
  return traits;
}

function syntheticActionSource(
  traitName: string,
  action: RawHsplusAction,
  purpose: 'handler' | 'spawn'
): string {
  const indentedBody = action.body
    .split(/\r?\n/)
    .map((line) => `      ${line}`)
    .join('\n');
  return `composition "Deterministic ${purpose} ${traitName}.${action.name}" {
  state {
    __deterministic_trait_state: null
  }
  logic {
    action ${action.name}(${action.params.join(', ')}) {
${indentedBody}
    }
  }
}
`;
}

function parseSpawnFactoryAliases(
  trait: RawHsplusTrait,
  handlerParams: readonly string[]
): Map<string, readonly string[]> {
  const aliases = new Map<string, readonly string[]>();
  const spawn = trait.handlers.get('on_spawn');
  if (!spawn) return aliases;

  const structured = parseHolo(syntheticActionSource(trait.name, spawn, 'spawn'));
  if (!structured.success || !structured.ast) {
    fail(
      `@trait "${trait.name}" on_spawn structured parse failed: ${structured.errors
        .map((error: { message: string }) => error.message)
        .join('; ')}`
    );
  }
  const action = structured.ast.logic?.actions?.[0];
  if (!action || action.name !== 'on_spawn') {
    fail(`@trait "${trait.name}" on_spawn did not preserve its structured action`);
  }

  for (const statement of action.body) {
    if (
      statement.type !== 'Assignment' ||
      statement.operator !== '=' ||
      !IDENTIFIER.test(statement.target) ||
      DANGEROUS_KEYS.has(statement.target) ||
      statement.value.type !== 'CallExpression' ||
      statement.value.callee.type !== 'Identifier' ||
      statement.value.arguments.length !== 0
    ) {
      continue;
    }
    const namespaces = PACKAGED_FACTORIES.get(statement.value.callee.name);
    if (!namespaces || handlerParams.includes(statement.target)) continue;
    aliases.set(statement.target, namespaces);
  }
  return aliases;
}

function bindPackagedFactoryAliases(
  trait: RawHsplusTrait,
  handler: RawHsplusAction,
  hostBindings: DeterministicHostBindings
): DeterministicHostBindings {
  const aliases = parseSpawnFactoryAliases(trait, handler.params);
  const bound: Record<
    string,
    Readonly<Record<string, (...args: HeadlessJsonValue[]) => unknown>>
  > = { ...hostBindings };

  for (const [alias, namespaces] of aliases) {
    const merged: Record<string, (...args: HeadlessJsonValue[]) => unknown> = {};
    const owners = new Map<string, string>();
    for (const namespace of namespaces) {
      const functions = hostBindings[namespace];
      if (!functions) {
        fail(`factory alias "${alias}" requires missing host-binding namespace "${namespace}"`);
      }
      for (const [name, fn] of Object.entries(functions)) {
        assertSafeKey(name, `factory alias "${alias}"`);
        const owner = owners.get(name);
        if (owner) {
          fail(
            `factory alias "${alias}" has function collision "${name}" between "${owner}" and "${namespace}"`
          );
        }
        owners.set(name, namespace);
        merged[name] = fn;
      }
    }
    bound[alias] = Object.freeze(merged);
  }
  return Object.freeze(bound);
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
  if (budget.nodes > budget.limit) fail(`${label} exceeds ${budget.limit} AST nodes`);
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
  depth: number,
  admitBuiltins: boolean,
  admitLocals: boolean,
  locals: Set<string>,
  hostNamespaces: ReadonlyMap<string, ReadonlySet<string>> | null,
  admitNullCoalescing: boolean
): void {
  consumeBudget(budget, depth, 'action expression');
  switch (expression.type) {
    case 'CallExpression': {
      if (expression.callee.type === 'MemberExpression') {
        if (!hostNamespaces) {
          fail('host-binding calls are not admitted without injected host bindings');
        }
        if (expression.callee.computed || expression.callee.object.type !== 'Identifier') {
          fail('host-binding calls must use a bare namespace.function callee');
        }
        const functionName = expression.callee.property;
        assertSafeKey(functionName, 'host-binding callee');
        const namespace = expression.callee.object.name;
        if (params.has(namespace) || (admitLocals && locals.has(namespace))) {
          fail(`host-binding namespace "${namespace}" is shadowed by a parameter or local`);
        }
        const fns = hostNamespaces.get(namespace);
        if (!fns) {
          fail(`"${namespace}" is not an injected host-binding namespace`);
        }
        if (!fns.has(functionName)) {
          fail(`"${namespace}.${functionName}" is not a declared host-binding function`);
        }
        expression.arguments.forEach((argument) =>
          validateExpression(
            argument,
            params,
            budget,
            depth + 1,
            admitBuiltins,
            admitLocals,
            locals,
            hostNamespaces,
            admitNullCoalescing
          )
        );
        return;
      }
      if (!admitBuiltins) {
        fail('function calls are not admitted in the v1 deterministic subset');
      }
      if (expression.callee.type !== 'Identifier') {
        fail('builtin calls must use a bare identifier callee');
      }
      const builtin = NUMERIC_BUILTINS.get(expression.callee.name);
      if (!builtin) {
        fail(
          `call target "${expression.callee.name}" is not in the v2 numeric builtin table (sqrt, sin, cos, acos, abs, floor, min, max)`
        );
      }
      if (expression.arguments.length !== builtin.arity) {
        fail(
          `builtin "${expression.callee.name}" requires exactly ${builtin.arity} argument(s), got ${expression.arguments.length}`
        );
      }
      expression.arguments.forEach((argument) =>
        validateExpression(
          argument,
          params,
          budget,
          depth + 1,
          admitBuiltins,
          admitLocals,
          locals,
          hostNamespaces,
          admitNullCoalescing
        )
      );
      return;
    }
    case 'Literal':
      toStrictJson(expression.value, 'literal');
      return;
    case 'Identifier':
      if (!params.has(expression.name) && !(admitLocals && locals.has(expression.name))) {
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
      if (path[0] !== 'state' && !params.has(path[0]) && !(admitLocals && locals.has(path[0]))) {
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
      if (admitNullCoalescing) allowed.add('??');
      if (!allowed.has(expression.operator)) {
        fail(`binary operator "${expression.operator}" is unsupported`);
      }
      validateExpression(
        expression.left,
        params,
        budget,
        depth + 1,
        admitBuiltins,
        admitLocals,
        locals,
        hostNamespaces,
        admitNullCoalescing
      );
      validateExpression(
        expression.right,
        params,
        budget,
        depth + 1,
        admitBuiltins,
        admitLocals,
        locals,
        hostNamespaces,
        admitNullCoalescing
      );
      return;
    }
    case 'UnaryExpression':
      if (expression.operator !== '!' && expression.operator !== '-') {
        fail(`unary operator "${String(expression.operator)}" is unsupported`);
      }
      validateExpression(
        expression.argument,
        params,
        budget,
        depth + 1,
        admitBuiltins,
        admitLocals,
        locals,
        hostNamespaces,
        admitNullCoalescing
      );
      return;
    case 'ArrayExpression':
      expression.elements.forEach((child) =>
        validateExpression(
          child,
          params,
          budget,
          depth + 1,
          admitBuiltins,
          admitLocals,
          locals,
          hostNamespaces,
          admitNullCoalescing
        )
      );
      return;
    case 'ObjectExpression': {
      const keys = new Set<string>();
      expression.properties.forEach((property) => {
        assertSafeKey(property.key, 'object expression');
        if (keys.has(property.key)) {
          fail(`object expression contains duplicate key "${property.key}"`);
        }
        keys.add(property.key);
        validateExpression(
          property.value,
          params,
          budget,
          depth + 1,
          admitBuiltins,
          admitLocals,
          locals,
          hostNamespaces,
          admitNullCoalescing
        );
      });
      return;
    }
    case 'ConditionalExpression':
      validateExpression(
        expression.test,
        params,
        budget,
        depth + 1,
        admitBuiltins,
        admitLocals,
        locals,
        hostNamespaces,
        admitNullCoalescing
      );
      validateExpression(
        expression.consequent,
        params,
        budget,
        depth + 1,
        admitBuiltins,
        admitLocals,
        locals,
        hostNamespaces,
        admitNullCoalescing
      );
      validateExpression(
        expression.alternate,
        params,
        budget,
        depth + 1,
        admitBuiltins,
        admitLocals,
        locals,
        hostNamespaces,
        admitNullCoalescing
      );
      return;
    default:
      fail(`expression type "${String((expression as { type?: unknown }).type)}" is not admitted`);
  }
}

function validateStatements(
  statements: readonly HoloStatement[],
  params: ReadonlySet<string>,
  budget: AstBudget,
  depth: number,
  admitBuiltins: boolean,
  admitLocals: boolean,
  locals: Set<string>,
  hostNamespaces: ReadonlyMap<string, ReadonlySet<string>> | null,
  admitNullCoalescing: boolean
): void {
  for (const statement of statements) {
    consumeBudget(budget, depth, 'action body');
    switch (statement.type) {
      case 'Assignment': {
        const path = statement.target.split('.');
        if (path.length === 1) {
          if (!admitLocals) {
            fail(`assignment target "${statement.target}" must be declared state`);
          }
          const name = statement.target;
          assertSafeKey(name, 'local binding');
          if (params.has(name)) {
            fail(`local binding "${name}" cannot reassign a parameter`);
          }
          if (RESERVED_PARAMETER_NAMES.has(name) || NUMERIC_BUILTINS.has(name)) {
            fail(`local binding "${name}" collides with a reserved or builtin name`);
          }
          if (statement.operator !== '=') {
            fail(`local binding "${name}" admits only the plain = operator`);
          }
          validateExpression(
            statement.value,
            params,
            budget,
            depth + 1,
            admitBuiltins,
            admitLocals,
            locals,
            hostNamespaces,
            admitNullCoalescing
          );
          locals.add(name);
          break;
        }
        if (path.length < 2 || path[0] !== 'state') {
          fail(`assignment target "${statement.target}" must be declared state`);
        }
        path.forEach((part) => assertSafeKey(part, 'assignment target'));
        validateExpression(
          statement.value,
          params,
          budget,
          depth + 1,
          admitBuiltins,
          admitLocals,
          locals,
          hostNamespaces,
          admitNullCoalescing
        );
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
        if (statement.data)
          validateExpression(
            statement.data,
            params,
            budget,
            depth + 1,
            admitBuiltins,
            admitLocals,
            locals,
            hostNamespaces,
            admitNullCoalescing
          );
        break;
      case 'ReturnStatement':
        if (statement.value)
          validateExpression(
            statement.value,
            params,
            budget,
            depth + 1,
            admitBuiltins,
            admitLocals,
            locals,
            hostNamespaces,
            admitNullCoalescing
          );
        break;
      case 'IfStatement':
        validateExpression(
          statement.condition,
          params,
          budget,
          depth + 1,
          admitBuiltins,
          admitLocals,
          locals,
          hostNamespaces,
          admitNullCoalescing
        );
        validateStatements(
          statement.consequent,
          params,
          budget,
          depth + 1,
          admitBuiltins,
          admitLocals,
          locals,
          hostNamespaces,
          admitNullCoalescing
        );
        validateStatements(
          statement.alternate ?? [],
          params,
          budget,
          depth + 1,
          admitBuiltins,
          admitLocals,
          locals,
          hostNamespaces,
          admitNullCoalescing
        );
        break;
      default:
        fail(`statement type "${String((statement as { type?: unknown }).type)}" is not admitted`);
    }
  }
}

function validateActions(
  rawActions: ReadonlyMap<string, RawHsplusAction>,
  structuredActions: readonly HoloAction[],
  admitBuiltins: boolean,
  admitLocals: boolean,
  hostNamespaces: ReadonlyMap<string, ReadonlySet<string>> | null,
  admitNullCoalescing: boolean
): Map<string, HoloAction> {
  const actions = new Map<string, HoloAction>();
  const budget: AstBudget = {
    nodes: 0,
    limit: admitLocals ? MAX_AST_NODES_V3 : MAX_AST_NODES,
  };
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
    const locals = new Set<string>();
    validateStatements(
      action.body,
      new Set(params),
      budget,
      0,
      admitBuiltins,
      admitLocals,
      locals,
      hostNamespaces,
      admitNullCoalescing
    );
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
  let value: HeadlessJsonValue | undefined;
  if (root === 'state') {
    value = environment.state;
  } else if (Object.prototype.hasOwnProperty.call(environment.args, root)) {
    value = environment.args[root];
  } else {
    value = environment.locals[root];
  }
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
    case 'CallExpression': {
      if (expression.callee.type === 'MemberExpression') {
        const callee = expression.callee;
        if (!environment.hostBindings || callee.computed || callee.object.type !== 'Identifier') {
          fail('host-binding calls must use a declared namespace.function callee');
        }
        const namespaceName = callee.object.name;
        const functionName = callee.property;
        const namespace = environment.hostBindings[namespaceName];
        const hostFunction = namespace?.[functionName];
        if (typeof hostFunction !== 'function') {
          fail(`"${namespaceName}.${functionName}" is not a declared host-binding function`);
        }
        const callArgs = expression.arguments.map((argument) =>
          evaluateExpression(argument, environment)
        );
        let hostResult: unknown;
        try {
          hostResult = hostFunction(...callArgs);
        } catch (error) {
          fail(
            `host binding "${namespaceName}.${functionName}" failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        if (hostResult === undefined) {
          fail(`host binding "${namespaceName}.${functionName}" returned undefined`);
        }
        assertFiniteNumbers(hostResult, `host binding "${namespaceName}.${functionName}" result`);
        return toStrictJson(hostResult, `host binding "${namespaceName}.${functionName}" result`);
      }
      if (!environment.numericBuiltins) {
        fail('function calls are not admitted in the v1 deterministic subset');
      }
      if (expression.callee.type !== 'Identifier') {
        fail('builtin calls must use a bare identifier callee');
      }
      const builtin = NUMERIC_BUILTINS.get(expression.callee.name);
      if (!builtin) {
        fail(
          `call target "${expression.callee.name}" is not in the v2 numeric builtin table (sqrt, sin, cos, acos, abs, floor, min, max)`
        );
      }
      const args = expression.arguments.map((argument) =>
        numeric(
          evaluateExpression(argument, environment),
          `builtin "${(expression.callee as { name: string }).name}" argument`
        )
      );
      if (args.length !== builtin.arity) {
        fail(`builtin "${expression.callee.name}" requires exactly ${builtin.arity} argument(s)`);
      }
      return finiteResult(builtin.apply(args), `builtin "${expression.callee.name}"`);
    }
    case 'Literal':
      return toStrictJson(expression.value, 'literal result');
    case 'Identifier': {
      if (Object.prototype.hasOwnProperty.call(environment.args, expression.name)) {
        return environment.args[expression.name];
      }
      if (
        environment.localBindings &&
        Object.prototype.hasOwnProperty.call(environment.locals, expression.name)
      ) {
        return environment.locals[expression.name];
      }
      fail(`parameter "${expression.name}" is unavailable`);
    }
    case 'MemberExpression': {
      const path = memberPath(expression);
      if (!path || path.length < 2) fail('computed or malformed member access is unsupported');
      return readMember(path, environment);
    }
    case 'BinaryExpression': {
      const left = evaluateExpression(expression.left, environment);
      if (expression.operator === '??') {
        if (!environment.nullCoalescing) {
          fail('binary operator "??" is unsupported');
        }
        return left === null ? evaluateExpression(expression.right, environment) : left;
      }
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
  if (!statement.target.includes('.')) {
    if (!environment.localBindings) {
      fail(`assignment target "${statement.target}" must be declared state`);
    }
    if (statement.operator !== '=') {
      fail(`local binding "${statement.target}" admits only the plain = operator`);
    }
    environment.locals[statement.target] = toStrictJson(
      evaluateExpression(statement.value, environment),
      `local binding ${statement.target}`
    );
    return;
  }
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
  private readonly numericBuiltins: boolean;
  private readonly localBindings: boolean;
  private readonly hostBindings: DeterministicHostBindings | null;
  private readonly nullCoalescing: boolean;
  private state: HeadlessJsonObject;

  constructor(source: string, options?: DeterministicHsplusActionRuntimeOptions) {
    this.numericBuiltins = options?.numericBuiltins === true;
    this.localBindings = options?.localBindings === true;
    this.hostBindings = options?.hostBindings ?? null;
    this.nullCoalescing = options?.nullCoalescing === true;
    if (
      this.nullCoalescing &&
      (!this.numericBuiltins || !this.localBindings || this.hostBindings === null)
    ) {
      fail('nullCoalescing requires numericBuiltins, localBindings, and hostBindings');
    }
    if (this.hostBindings) {
      for (const [namespace, fns] of Object.entries(this.hostBindings)) {
        assertSafeKey(namespace, 'host-binding namespace');
        if (RESERVED_PARAMETER_NAMES.has(namespace) || NUMERIC_BUILTINS.has(namespace)) {
          fail(`host-binding namespace "${namespace}" collides with a reserved or builtin name`);
        }
        for (const name of Object.keys(fns)) assertSafeKey(name, `host binding ${namespace}`);
      }
    }
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
        `structured parse failed: ${structured.errors
          .map((error: { message: string }) => error.message)
          .join('; ')}`
      );
    }
    const structuredState = extractStructuredState(structured.ast.state?.properties);
    if (canonicalizeHeadlessValue(hsplusState) !== canonicalizeHeadlessValue(structuredState)) {
      fail('HoloScript+ and structured parser state disagree');
    }

    const hostNamespaces = this.hostBindings
      ? new Map(
          Object.entries(this.hostBindings).map(([namespace, fns]) => [
            namespace,
            new Set(Object.keys(fns)),
          ])
        )
      : null;
    this.actions = validateActions(
      rawActions,
      structured.ast.logic?.actions ?? [],
      this.numericBuiltins,
      this.localBindings,
      hostNamespaces,
      this.nullCoalescing
    );
    this.initial = cloneObject(structuredState, 'initial state');
    this.state = cloneObject(this.initial, 'runtime state');
  }

  get subsetId(): string {
    if (this.nullCoalescing) return ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V6;
    if (this.hostBindings) return ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V4;
    if (this.localBindings) return ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V3;
    return this.numericBuiltins
      ? ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V2
      : ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET;
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
    const flow = executeStatements(
      action.body,
      {
        state: workingState,
        args,
        numericBuiltins: this.numericBuiltins,
        localBindings: this.localBindings,
        locals: {},
        hostBindings: this.hostBindings,
        nullCoalescing: this.nullCoalescing,
      },
      emittedEvents
    );
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

/**
 * Engine-native adapter for shipped top-level `@trait` source.
 *
 * The canonical HoloScriptPlusParser consumes the original source bytes and
 * preserves each authored handler body. Each invoked body is then parsed by
 * the same structured action parser/evaluator used above. Approved zero-arg
 * std factories are statically lifted from `@on_spawn`; no lifecycle side
 * effect is executed.
 */
export class DeterministicHsplusTraitRuntime {
  private readonly trait: RawHsplusTrait;
  private readonly hostBindings: DeterministicHostBindings;
  private readonly handlerRuntimes = new Map<string, DeterministicHsplusActionRuntime>();

  constructor(source: string, traitName: string, options: DeterministicHsplusTraitRuntimeOptions) {
    if (typeof source !== 'string' || source.trim().length === 0) {
      fail('trait source must be a non-empty string');
    }
    if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
      fail(`trait source exceeds ${MAX_SOURCE_BYTES} bytes`);
    }
    assertSafeKey(traitName, 'trait name');
    if (!options?.hostBindings) {
      fail('packaged trait runtime requires hostBindings');
    }

    const hsplus = new HoloScriptPlusParser().parse(source);
    if (hsplus.errors.length > 0 || !hsplus.ast?.root) {
      fail(`HoloScript+ parse failed: ${hsplus.errors.map((error) => error.message).join('; ')}`);
    }
    const traits = extractRawTraits(hsplus.ast.root);
    const trait = traits.get(traitName);
    if (!trait) fail(`no top-level @trait named "${traitName}"`);
    this.trait = trait;
    this.hostBindings = options.hostBindings;
  }

  get subsetId(): string {
    return ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V7;
  }

  get traitName(): string {
    return this.trait.name;
  }

  get initialState(): HeadlessJsonObject {
    return {};
  }

  getState(): HeadlessJsonObject {
    return {};
  }

  invoke(entry: HeadlessExperimentScheduleEntry): HeadlessExperimentInvocationResult {
    if (entry.kind !== 'observation') {
      fail('packaged trait handlers are admitted as deterministic observations only');
    }
    const handler = this.trait.handlers.get(entry.entrypoint);
    if (!handler) {
      fail(`@trait "${this.trait.name}" has no handler "${entry.entrypoint}"`);
    }
    let runtime = this.handlerRuntimes.get(handler.name);
    if (!runtime) {
      const aliasedHostBindings = bindPackagedFactoryAliases(
        this.trait,
        handler,
        this.hostBindings
      );
      runtime = new DeterministicHsplusActionRuntime(
        syntheticActionSource(this.trait.name, handler, 'handler'),
        {
          numericBuiltins: true,
          localBindings: true,
          hostBindings: aliasedHostBindings,
          nullCoalescing: true,
        }
      );
      this.handlerRuntimes.set(handler.name, runtime);
    }
    const result = runtime.invoke(entry);
    return { ...result, state: {} };
  }
}

export function createDeterministicHsplusActionRuntime(
  source: string,
  options?: DeterministicHsplusActionRuntimeOptions
): DeterministicHsplusActionRuntime {
  return new DeterministicHsplusActionRuntime(source, options);
}

export function createDeterministicHsplusTraitRuntime(
  source: string,
  traitName: string,
  options: DeterministicHsplusTraitRuntimeOptions
): DeterministicHsplusTraitRuntime {
  return new DeterministicHsplusTraitRuntime(source, traitName, options);
}
