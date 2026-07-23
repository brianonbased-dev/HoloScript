/**
 * HSPlusHSIIRCompiler
 *
 * A deliberately bounded sovereign lowering path for ordinary `.hsplus`
 * systems components:
 *
 *   canonical HoloScriptPlusParser
 *     -> normalized typed state-machine AST
 *     -> shared HSI-IR state-machine lowering
 *     -> HSIExactTrace
 *
 * The adapter does not parse a second language and does not execute raw
 * JavaScript. Every unsupported construct fails admission instead of being
 * dropped. This is a whole-document subset, not a claim of complete `.hsplus`
 * lowering.
 */

import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import type {
  HoloAnimationInput,
  HoloAnimationInputType,
  HoloBinaryExpression,
  HoloExpression,
  HoloIdentifier,
  HoloMemberExpression,
  HoloStateMachine,
  HoloStateTransition,
  HoloState_Machine,
  HoloUnaryExpression,
  SourceRange,
} from '../parser/HoloCompositionTypes';
import { lowerStateMachineToHSIIR } from './HSIIRCompiler';
import {
  HSIAdmissionError,
  HSI_IR_SCHEMA_VERSION,
  hsiSha256,
  hsiSourceTextDigest,
  type HSIIRDocument,
} from './HSIIRTypes';

export interface HSPlusHSIIRLoweringOptions {
  /** Stable world/component name. Defaults to the sorted machine names. */
  worldName?: string;
}

interface HSPlusProgramLike {
  type: 'Program';
  body: unknown[];
  imports?: unknown[];
  directives?: unknown[];
}

interface HSPlusStateMachineLike {
  type: 'state-machine';
  name: string;
  initialState: string;
  inputs?: unknown[];
  listeners?: unknown[];
  states?: unknown[];
  transitions?: unknown[];
  directives?: unknown[];
  loc?: SourceRange;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asProgram(value: unknown): HSPlusProgramLike {
  if (!isRecord(value) || value.type !== 'Program' || !Array.isArray(value.body)) {
    throw new HSIAdmissionError('parse-failed', 'canonical .hsplus parser returned no Program');
  }
  return value as unknown as HSPlusProgramLike;
}

function asStateMachine(value: unknown, ordinal: number): HSPlusStateMachineLike {
  if (
    !isRecord(value) ||
    value.type !== 'state-machine' ||
    typeof value.name !== 'string' ||
    typeof value.initialState !== 'string'
  ) {
    const type = isRecord(value) && typeof value.type === 'string' ? value.type : typeof value;
    throw new HSIAdmissionError(
      'unsupported-top-level',
      `top-level declaration ${ordinal} is "${type}", not a state_machine`
    );
  }
  return value as unknown as HSPlusStateMachineLike;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  where: string
): void {
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    throw new HSIAdmissionError(
      'unsupported-value',
      `${where}: unsupported field(s) ${unsupported.sort().join(', ')}`
    );
  }
}

function referenceExpression(reference: string): HoloIdentifier | HoloMemberExpression {
  const parts = reference.split('.');
  let expression: HoloIdentifier | HoloMemberExpression = {
    type: 'Identifier',
    name: parts.shift() ?? reference,
  };
  for (const property of parts) {
    expression = {
      type: 'MemberExpression',
      object: expression,
      property,
      computed: false,
    };
  }
  return expression;
}

function lowerParsedExpression(value: unknown, where: string): HoloExpression {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return { type: 'Literal', value };
  }

  if (!isRecord(value)) {
    throw new HSIAdmissionError(
      'unsupported-expression',
      `${where}: expression is not a supported scalar or syntax node`
    );
  }

  if (typeof value.__ref === 'string') {
    assertOnlyKeys(value, new Set(['__ref']), where);
    return referenceExpression(value.__ref);
  }

  if (value.type === 'binary') {
    if (typeof value.operator !== 'string' || !('left' in value) || !('right' in value)) {
      throw new HSIAdmissionError('unsupported-expression', `${where}: malformed binary guard`);
    }
    assertOnlyKeys(value, new Set(['type', 'operator', 'left', 'right']), where);
    return {
      type: 'BinaryExpression',
      operator: value.operator,
      left: lowerParsedExpression(value.left, where),
      right: lowerParsedExpression(value.right, where),
    } satisfies HoloBinaryExpression;
  }

  if (value.type === 'unary') {
    if ((value.operator !== '!' && value.operator !== '-') || !('argument' in value)) {
      throw new HSIAdmissionError('unsupported-expression', `${where}: unsupported unary guard`);
    }
    assertOnlyKeys(value, new Set(['type', 'operator', 'argument']), where);
    return {
      type: 'UnaryExpression',
      operator: value.operator,
      argument: lowerParsedExpression(value.argument, where),
    } satisfies HoloUnaryExpression;
  }

  throw new HSIAdmissionError(
    'unsupported-expression',
    `${where}: parser node "${String(value.type ?? 'unknown')}" is outside the HSPlus HSI subset`
  );
}

function inputDefaultMatches(type: HoloAnimationInputType, value: unknown): boolean {
  if (value === undefined) return true;
  if (type === 'bool' || type === 'trigger') return typeof value === 'boolean';
  if (type === 'int') return typeof value === 'number' && Number.isInteger(value);
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeInput(
  machineName: string,
  value: unknown,
  seen: Set<string>
): HoloAnimationInput {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.inputType !== 'string') {
    throw new HSIAdmissionError(
      'invalid-input',
      `state machine "${machineName}" contains a malformed input declaration`
    );
  }
  assertOnlyKeys(
    value,
    new Set(['type', 'name', 'inputType', 'rawType', 'default']),
    `state machine "${machineName}" input "${value.name}"`
  );
  if (seen.has(value.name)) {
    throw new HSIAdmissionError(
      'duplicate-input',
      `state machine "${machineName}" declares input "${value.name}" twice`
    );
  }
  seen.add(value.name);

  const inputType = value.inputType;
  if (
    inputType !== 'bool' &&
    inputType !== 'float' &&
    inputType !== 'int' &&
    inputType !== 'trigger'
  ) {
    throw new HSIAdmissionError(
      'unsupported-input-type',
      `state machine "${machineName}" input "${value.name}" has unsupported type "${inputType}"`
    );
  }
  if (!inputDefaultMatches(inputType, value.default)) {
    throw new HSIAdmissionError(
      'input-default-type',
      `state machine "${machineName}" input "${value.name}" default does not match ${inputType}`
    );
  }

  const input: HoloAnimationInput = {
    type: 'AnimationInput',
    name: value.name,
    inputType,
  };
  if (typeof value.rawType === 'string') input.rawType = value.rawType;
  if (typeof value.default === 'number' || typeof value.default === 'boolean') {
    input.default = value.default;
  }
  return input;
}

function normalizeState(machineName: string, value: unknown, seen: Set<string>): HoloState_Machine {
  if (!isRecord(value) || typeof value.name !== 'string') {
    throw new HSIAdmissionError(
      'invalid-state',
      `state machine "${machineName}" contains a malformed state declaration`
    );
  }
  assertOnlyKeys(
    value,
    new Set(['name', 'onEntry', 'onExit']),
    `state machine "${machineName}" state "${value.name}"`
  );
  if (value.onEntry !== undefined || value.onExit !== undefined) {
    throw new HSIAdmissionError(
      'unsupported-value',
      `state machine "${machineName}" state "${value.name}" carries lifecycle code outside the sovereign subset`
    );
  }
  if (seen.has(value.name)) {
    throw new HSIAdmissionError(
      'duplicate-state',
      `state machine "${machineName}" declares state "${value.name}" twice`
    );
  }
  seen.add(value.name);
  return {
    type: 'State_Machine',
    name: value.name,
    actions: [],
    transitions: [],
  };
}

function normalizeTransition(
  machineName: string,
  value: unknown,
  ordinal: number
): HoloStateTransition {
  if (!isRecord(value) || typeof value.from !== 'string' || typeof value.to !== 'string') {
    throw new HSIAdmissionError(
      'invalid-transition',
      `state machine "${machineName}" transition ${ordinal} is malformed`
    );
  }
  assertOnlyKeys(
    value,
    new Set(['from', 'to', 'when']),
    `state machine "${machineName}" transition ${ordinal}`
  );
  if (!('when' in value)) {
    throw new HSIAdmissionError(
      'admission-skewed',
      `state machine "${machineName}" transition ${ordinal} has no typed guard`
    );
  }
  return {
    type: 'StateTransition',
    from: value.from,
    target: value.to,
    condition: lowerParsedExpression(
      value.when,
      `transition:${machineName}.${value.from}->${value.to}#${ordinal}`
    ),
  };
}

function normalizeMachine(node: HSPlusStateMachineLike): HoloStateMachine {
  if ((node.directives?.length ?? 0) > 0) {
    throw new HSIAdmissionError(
      'unsupported-value',
      `state machine "${node.name}" carries directives outside the sovereign subset`
    );
  }
  if ((node.listeners?.length ?? 0) > 0) {
    throw new HSIAdmissionError(
      'unsupported-value',
      `state machine "${node.name}" carries listeners outside the sovereign subset`
    );
  }

  const inputNames = new Set<string>();
  const stateNames = new Set<string>();
  const inputs = (node.inputs ?? []).map((input) => normalizeInput(node.name, input, inputNames));
  const states = Object.fromEntries(
    (node.states ?? []).map((state) => {
      const normalized = normalizeState(node.name, state, stateNames);
      return [normalized.name, normalized];
    })
  );
  const transitions = (node.transitions ?? []).map((transition, ordinal) =>
    normalizeTransition(node.name, transition, ordinal)
  );

  return {
    type: 'StateMachine',
    name: node.name,
    initialState: node.initialState,
    inputs,
    listeners: [],
    states,
    transitions,
    loc: node.loc,
  };
}

/**
 * Lower a complete `.hsplus` source document containing only typed
 * `state_machine` declarations into HSI-IR.
 *
 * Throws HSIAdmissionError for parse errors, unsupported declarations, erased
 * semantics, invalid types, or graph skew. It never returns partial IR.
 */
export function lowerHSPlusProgramToHSIIR(
  source: string,
  options: HSPlusHSIIRLoweringOptions = {}
): HSIIRDocument {
  const parser = new HoloScriptPlusParser({ strict: true });
  const parsed = parser.parse(source);
  if (!parsed.success || !parsed.ast) {
    const details = parsed.errors
      .map((error) => `${error.line}:${error.column} ${error.message}`)
      .join('; ');
    throw new HSIAdmissionError('parse-failed', details || 'canonical .hsplus parse failed');
  }

  const program = asProgram(parsed.ast);
  if ((program.imports?.length ?? 0) > 0 || (program.directives?.length ?? 0) > 0) {
    throw new HSIAdmissionError(
      'unsupported-top-level',
      'imports and global directives are outside the HSPlus HSI subset'
    );
  }
  if (program.body.length === 0) {
    throw new HSIAdmissionError('empty-world', '.hsplus document declares no state machines');
  }

  const names = new Set<string>();
  const machines = program.body.map((node, ordinal) => {
    const normalized = normalizeMachine(asStateMachine(node, ordinal));
    if (names.has(normalized.name)) {
      throw new HSIAdmissionError(
        'duplicate-machine',
        `.hsplus document declares state machine "${normalized.name}" twice`
      );
    }
    names.add(normalized.name);
    return lowerStateMachineToHSIIR(normalized);
  });
  machines.sort((left, right) => left.id.localeCompare(right.id));

  const worldName =
    options.worldName ??
    machines
      .map((machine) => machine.name)
      .slice()
      .sort()
      .join('+');
  const docWithoutDigest = {
    schemaVersion: HSI_IR_SCHEMA_VERSION,
    kind: 'HSIIR' as const,
    world: {
      name: worldName,
      sourceDigest: hsiSourceTextDigest(source),
    },
    entities: [],
    relations: [],
    state: [],
    observationPolicy: [],
    eventHandlers: [],
    machines,
    predicates: [],
    declaredUnknowns: [
      'entities',
      'event-handlers',
      'lifecycle-hooks',
      'predicates',
      'relations',
      'world-state',
    ],
    provenance: {
      compiler: 'HSIIRCompiler' as const,
      sourceSurface: 'hsplus' as const,
    },
  };
  const deterministicDigest = hsiSha256(docWithoutDigest);

  return {
    ...docWithoutDigest,
    provenance: {
      ...docWithoutDigest.provenance,
      deterministicDigest,
    },
  };
}
