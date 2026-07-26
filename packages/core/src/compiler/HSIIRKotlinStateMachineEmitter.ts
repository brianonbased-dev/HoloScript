/**
 * HSIIRKotlinStateMachineEmitter
 *
 * Thin bridge from one sovereign HSI-IR state machine to a typed Kotlin class.
 * The source surface and transition semantics remain owned by HSI-IR; this
 * adapter only materializes those semantics for a Kotlin host.
 *
 * Deliberate boundary:
 *  - state, inputs, transition priority, and guards are emitted;
 *  - lifecycle hooks, event handlers, and host side effects are not invented;
 *  - unsupported expressions and malformed/tampered IR fail closed.
 */

import type { ExpressionIR } from '../runtime/expression-ir';
import { lowerHSPlusProgramToHSIIR } from './HSPlusHSIIRCompiler';
import {
  HSI_IR_SCHEMA_VERSION,
  hsiSha256,
  type HSIIRDocument,
  type HSIMachineInput,
  type HSIStateMachine,
  type HSITransition,
} from './HSIIRTypes';

export interface HSIIRKotlinStateMachineEmissionOptions {
  /** Select one machine when the document contains more than one. */
  machineName?: string;
  /** Kotlin class name. Defaults to `<MachineName>StateMachine`. */
  className?: string;
  /** Optional Kotlin package declaration. */
  packageName?: string;
  /** Kotlin top-level visibility. Defaults to `internal`. */
  visibility?: 'internal' | 'public';
}

export interface HSPlusKotlinStateMachineEmissionOptions extends HSIIRKotlinStateMachineEmissionOptions {
  /** Stable HSI-IR world name passed to the sovereign lowering stage. */
  worldName?: string;
}

export interface HSIIRKotlinStateMachineArtifact {
  readonly code: string;
  readonly className: string;
  readonly machineName: string;
  readonly sourceDigest: string;
  readonly irDigest: string;
  readonly sourceSurface: HSIIRDocument['provenance']['sourceSurface'];
}

export class HSIKotlinEmissionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'HSIKotlinEmissionError';
    this.code = code;
  }
}

type KotlinValueType = 'boolean' | 'int' | 'float' | 'string' | 'null';

interface KotlinInput {
  ir: HSIMachineInput;
  fieldName: string;
  methodSuffix: string;
  valueType: KotlinValueType;
}

interface KotlinExpression {
  code: string;
  type: KotlinValueType;
}

const KOTLIN_PACKAGE_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const KOTLIN_CLASS_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function fail(code: string, message: string): never {
  throw new HSIKotlinEmissionError(code, message);
}

function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

function pascalIdentifier(value: string, where: string): string {
  const parts = words(value);
  if (parts.length === 0) {
    fail('invalid-identifier', `${where} cannot be represented as a Kotlin identifier`);
  }
  const identifier = parts
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('');
  if (!KOTLIN_CLASS_RE.test(identifier)) {
    fail('invalid-identifier', `${where} cannot be represented as a Kotlin identifier`);
  }
  return identifier;
}

function enumIdentifier(value: string, where: string): string {
  const parts = words(value);
  if (parts.length === 0) {
    fail('invalid-identifier', `${where} cannot be represented as a Kotlin enum entry`);
  }
  const identifier = parts.map((part) => part.toUpperCase()).join('_');
  if (!KOTLIN_CLASS_RE.test(identifier)) {
    fail('invalid-identifier', `${where} cannot be represented as a Kotlin enum entry`);
  }
  return identifier;
}

function kotlinString(value: string): string {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}"`;
}

function inputValueType(input: HSIMachineInput): KotlinValueType {
  switch (input.inputType) {
    case 'bool':
    case 'trigger':
      if (typeof input.baseline !== 'boolean') {
        fail('input-baseline-type', `machine input "${input.name}" expects a boolean baseline`);
      }
      return 'boolean';
    case 'int':
      if (typeof input.baseline !== 'number' || !Number.isSafeInteger(input.baseline)) {
        fail(
          'input-baseline-type',
          `machine input "${input.name}" expects a safe integer baseline`
        );
      }
      return 'int';
    case 'float':
      if (typeof input.baseline !== 'number' || !Number.isFinite(input.baseline)) {
        fail(
          'input-baseline-type',
          `machine input "${input.name}" expects a finite numeric baseline`
        );
      }
      return 'float';
    default: {
      const exhaustive: never = input.inputType;
      return fail(
        'unsupported-input-type',
        `machine input "${input.name}" has unsupported type "${String(exhaustive)}"`
      );
    }
  }
}

function kotlinType(type: KotlinValueType): string {
  switch (type) {
    case 'boolean':
      return 'Boolean';
    case 'int':
      return 'Long';
    case 'float':
      return 'Double';
    case 'string':
      return 'String';
    case 'null':
      return 'Nothing?';
  }
}

function kotlinLiteral(value: unknown, where: string): KotlinExpression {
  if (typeof value === 'boolean') {
    return { code: String(value), type: 'boolean' };
  }
  if (typeof value === 'string') {
    return { code: kotlinString(value), type: 'string' };
  }
  if (value === null) {
    return { code: 'null', type: 'null' };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      fail('unsupported-literal', `${where} contains a non-finite numeric literal`);
    }
    if (Number.isSafeInteger(value)) {
      return { code: `${value}L`, type: 'int' };
    }
    return { code: String(value), type: 'float' };
  }
  return fail('unsupported-literal', `${where} contains a non-scalar literal`);
}

function isNumeric(type: KotlinValueType): type is 'int' | 'float' {
  return type === 'int' || type === 'float';
}

function asFloat(expression: KotlinExpression): string {
  return expression.type === 'int' ? `(${expression.code}).toDouble()` : expression.code;
}

function requireBoolean(expression: KotlinExpression, where: string): void {
  if (expression.type !== 'boolean') {
    fail('guard-type', `${where} must evaluate to Boolean, got ${expression.type}`);
  }
}

function emitExpression(
  expression: ExpressionIR,
  inputs: ReadonlyMap<string, KotlinInput>,
  where: string
): KotlinExpression {
  switch (expression.kind) {
    case 'Literal':
      return kotlinLiteral(expression.value, where);

    case 'Identifier': {
      const input = inputs.get(expression.name);
      if (!input) {
        return fail(
          'unknown-input',
          `${where} reads undeclared machine input "${expression.name}"`
        );
      }
      return { code: input.fieldName, type: input.valueType };
    }

    case 'UnaryExpression': {
      const argument = emitExpression(expression.argument, inputs, where);
      if (expression.operator === '!') {
        requireBoolean(argument, where);
        return { code: `(!${argument.code})`, type: 'boolean' };
      }
      if (expression.operator === '-') {
        if (!isNumeric(argument.type)) {
          return fail('guard-type', `${where} applies numeric negation to ${argument.type}`);
        }
        return { code: `(-${argument.code})`, type: argument.type };
      }
      const exhaustive: never = expression.operator;
      return fail(
        'unsupported-expression',
        `${where} uses unsupported unary operator "${String(exhaustive)}"`
      );
    }

    case 'BinaryExpression': {
      const left = emitExpression(expression.left, inputs, where);
      const right = emitExpression(expression.right, inputs, where);
      const operator = expression.operator;

      if (operator === '&&' || operator === '||') {
        requireBoolean(left, where);
        requireBoolean(right, where);
        return {
          code: `(${left.code} ${operator} ${right.code})`,
          type: 'boolean',
        };
      }

      if (operator === '==' || operator === '!=' || operator === '===' || operator === '!==') {
        let leftCode = left.code;
        let rightCode = right.code;
        if (isNumeric(left.type) && isNumeric(right.type)) {
          if (left.type === 'float' || right.type === 'float') {
            leftCode = asFloat(left);
            rightCode = asFloat(right);
          }
        } else if (left.type !== right.type && left.type !== 'null' && right.type !== 'null') {
          return fail(
            'guard-type',
            `${where} compares incompatible ${left.type} and ${right.type} values`
          );
        }
        const kotlinOperator = operator === '!=' || operator === '!==' ? '!=' : '==';
        return {
          code: `(${leftCode} ${kotlinOperator} ${rightCode})`,
          type: 'boolean',
        };
      }

      if (operator === '<' || operator === '>' || operator === '<=' || operator === '>=') {
        if (!isNumeric(left.type) || !isNumeric(right.type)) {
          return fail('guard-type', `${where} applies "${operator}" to non-numeric values`);
        }
        const useFloat = left.type === 'float' || right.type === 'float';
        return {
          code: `(${useFloat ? asFloat(left) : left.code} ${operator} ${
            useFloat ? asFloat(right) : right.code
          })`,
          type: 'boolean',
        };
      }

      if (
        operator === '+' ||
        operator === '-' ||
        operator === '*' ||
        operator === '/' ||
        operator === '%'
      ) {
        if (!isNumeric(left.type) || !isNumeric(right.type)) {
          return fail('guard-type', `${where} applies "${operator}" to non-numeric values`);
        }
        const useFloat = operator === '/' || left.type === 'float' || right.type === 'float';
        return {
          code: `(${useFloat ? asFloat(left) : left.code} ${operator} ${
            useFloat ? asFloat(right) : right.code
          })`,
          type: useFloat ? 'float' : 'int',
        };
      }

      const exhaustive: never = operator;
      return fail(
        'unsupported-expression',
        `${where} uses unsupported binary operator "${String(exhaustive)}"`
      );
    }

    case 'MemberExpression':
    case 'CallExpression':
      return fail(
        'unsupported-expression',
        `${where} uses ${expression.kind}, outside the scalar machine-input Kotlin subset`
      );

    default: {
      const exhaustive: never = expression;
      return fail(
        'unsupported-expression',
        `${where} uses unknown expression kind "${String((exhaustive as ExpressionIR).kind)}"`
      );
    }
  }
}

function expectedIRDigest(ir: HSIIRDocument): string {
  const { deterministicDigest: _digest, ...provenance } = ir.provenance;
  return hsiSha256({ ...ir, provenance });
}

function selectMachine(ir: HSIIRDocument, requestedName: string | undefined): HSIStateMachine {
  if (ir.schemaVersion !== HSI_IR_SCHEMA_VERSION || ir.kind !== 'HSIIR') {
    return fail('unsupported-ir-version', `expected ${HSI_IR_SCHEMA_VERSION} HSI-IR document`);
  }
  if (ir.provenance.compiler !== 'HSIIRCompiler') {
    return fail('unsupported-provenance', 'document was not emitted by HSIIRCompiler');
  }
  const expectedDigest = expectedIRDigest(ir);
  if (expectedDigest !== ir.provenance.deterministicDigest) {
    return fail('ir-digest-mismatch', `document digest does not match HSI-IR contents`);
  }
  if (ir.machines.length === 0) {
    return fail('missing-machine', 'HSI-IR document declares no state machines');
  }
  if (!requestedName && ir.machines.length !== 1) {
    return fail(
      'ambiguous-machine',
      'HSI-IR document declares multiple state machines; machineName is required'
    );
  }
  const machine = requestedName
    ? ir.machines.find((candidate) => candidate.name === requestedName)
    : ir.machines[0];
  return (
    machine ??
    fail('missing-machine', `HSI-IR document does not declare state machine "${requestedName}"`)
  );
}

function validateMachine(machine: HSIStateMachine): {
  states: Map<string, string>;
  inputs: Map<string, KotlinInput>;
  transitions: HSITransition[];
} {
  if (machine.states.length === 0) {
    fail('missing-state', `state machine "${machine.name}" declares no states`);
  }
  const states = new Map<string, string>();
  const enumNames = new Set<string>();
  for (const state of machine.states) {
    if (states.has(state)) {
      fail('duplicate-state', `state machine "${machine.name}" declares state "${state}" twice`);
    }
    const enumName = enumIdentifier(state, `state machine "${machine.name}" state "${state}"`);
    if (enumNames.has(enumName)) {
      fail(
        'identifier-collision',
        `state machine "${machine.name}" has Kotlin enum collision "${enumName}"`
      );
    }
    states.set(state, enumName);
    enumNames.add(enumName);
  }
  if (!states.has(machine.initialState)) {
    fail(
      'unknown-initial-state',
      `state machine "${machine.name}" initial state "${machine.initialState}" is undeclared`
    );
  }

  const inputs = new Map<string, KotlinInput>();
  const methodSuffixes = new Set<string>();
  for (const input of machine.inputs) {
    if (inputs.has(input.name)) {
      fail(
        'duplicate-input',
        `state machine "${machine.name}" declares input "${input.name}" twice`
      );
    }
    const methodSuffix = pascalIdentifier(
      input.name,
      `state machine "${machine.name}" input "${input.name}"`
    );
    if (methodSuffixes.has(methodSuffix)) {
      fail(
        'identifier-collision',
        `state machine "${machine.name}" has Kotlin input collision "${methodSuffix}"`
      );
    }
    methodSuffixes.add(methodSuffix);
    inputs.set(input.name, {
      ir: input,
      fieldName: `_input${methodSuffix}`,
      methodSuffix,
      valueType: inputValueType(input),
    });
  }

  const transitionIds = new Set<string>();
  const priorities = new Set<number>();
  const transitions = [...machine.transitions].sort(
    (left, right) => left.priority - right.priority
  );
  for (const transition of transitions) {
    if (transitionIds.has(transition.id)) {
      fail(
        'duplicate-transition',
        `state machine "${machine.name}" declares transition "${transition.id}" twice`
      );
    }
    transitionIds.add(transition.id);
    if (!Number.isSafeInteger(transition.priority) || transition.priority < 0) {
      fail(
        'invalid-priority',
        `transition "${transition.id}" has invalid priority ${transition.priority}`
      );
    }
    if (priorities.has(transition.priority)) {
      fail(
        'duplicate-priority',
        `state machine "${machine.name}" has duplicate transition priority ${transition.priority}`
      );
    }
    priorities.add(transition.priority);
    if (transition.from !== 'any' && !states.has(transition.from)) {
      fail(
        'unknown-transition-endpoint',
        `transition "${transition.id}" starts at undeclared state "${transition.from}"`
      );
    }
    if (!states.has(transition.target)) {
      fail(
        'unknown-transition-endpoint',
        `transition "${transition.id}" targets undeclared state "${transition.target}"`
      );
    }
    if (transition.event !== undefined || !transition.guard) {
      fail(
        'unsupported-transition',
        `transition "${transition.id}" must carry one typed guard and no event`
      );
    }
    const guard = emitExpression(transition.guard, inputs, transition.id);
    requireBoolean(guard, transition.id);
  }

  return { states, inputs, transitions };
}

function baselineLiteral(input: KotlinInput): string {
  switch (input.valueType) {
    case 'boolean':
      return String(input.ir.baseline);
    case 'int':
      return `${input.ir.baseline}L`;
    case 'float': {
      const value = input.ir.baseline as number;
      return Number.isInteger(value) ? `${value}.0` : String(value);
    }
    default:
      return fail(
        'input-baseline-type',
        `machine input "${input.ir.name}" has unsupported baseline`
      );
  }
}

function renderTransition(
  transition: HSITransition,
  inputs: ReadonlyMap<string, KotlinInput>,
  states: ReadonlyMap<string, string>
): string {
  const guard = emitExpression(transition.guard!, inputs, transition.id);
  requireBoolean(guard, transition.id);
  return `${guard.code} -> Transition(${kotlinString(
    transition.id
  )}, from, State.${states.get(transition.target)!})`;
}

/**
 * Emit one HSI-IR state machine as a standalone Kotlin class.
 *
 * The returned class evaluates exactly one transition per typed input step,
 * in HSI priority order. Trigger inputs are cleared after every trigger step,
 * matching HSIExactTrace one-shot semantics.
 */
export function emitHSIIRStateMachineToKotlin(
  ir: HSIIRDocument,
  options: HSIIRKotlinStateMachineEmissionOptions = {}
): HSIIRKotlinStateMachineArtifact {
  if (options.packageName && !KOTLIN_PACKAGE_RE.test(options.packageName)) {
    fail('invalid-package', `"${options.packageName}" is not a valid Kotlin package name`);
  }
  const machine = selectMachine(ir, options.machineName);
  const { states, inputs, transitions } = validateMachine(machine);
  const className =
    options.className ??
    `${pascalIdentifier(machine.name, `state machine "${machine.name}"`)}StateMachine`;
  if (!KOTLIN_CLASS_RE.test(className)) {
    fail('invalid-class-name', `"${className}" is not a valid Kotlin class name`);
  }

  const lines: string[] = [
    '// @generated by HoloScript HSIIRKotlinStateMachineEmitter — DO NOT EDIT',
    `// HSI-IR digest: ${ir.provenance.deterministicDigest}`,
  ];
  if (options.packageName) {
    lines.push('', `package ${options.packageName}`);
  }
  lines.push(
    '',
    `${options.visibility ?? 'internal'} class ${className} {`,
    '  enum class State(val sourceName: String) {'
  );
  const stateEntries = [...states.entries()];
  stateEntries.forEach(([sourceName, enumName], ordinal) => {
    lines.push(
      `    ${enumName}(${kotlinString(sourceName)})${
        ordinal === stateEntries.length - 1 ? '' : ','
      }`
    );
  });
  lines.push(
    '  }',
    '',
    '  data class Transition(val id: String, val from: State, val to: State)',
    '',
    `  var state: State = State.${states.get(machine.initialState)!}`,
    '    private set'
  );

  for (const input of inputs.values()) {
    lines.push(
      '',
      `  private var ${input.fieldName}: ${kotlinType(input.valueType)} = ${baselineLiteral(input)}`
    );
  }

  for (const input of inputs.values()) {
    lines.push('');
    if (input.ir.inputType === 'trigger') {
      lines.push(
        `  fun fire${input.methodSuffix}(): Transition? {`,
        `    ${input.fieldName} = true`,
        '    return try {',
        '      evaluateTransition()',
        '    } finally {',
        '      clearTriggers()',
        '    }',
        '  }'
      );
    } else {
      lines.push(
        `  fun set${input.methodSuffix}(value: ${kotlinType(input.valueType)}): Transition? {`,
        `    ${input.fieldName} = value`,
        '    return evaluateTransition()',
        '  }'
      );
    }
  }

  const triggerInputs = [...inputs.values()].filter((input) => input.ir.inputType === 'trigger');
  if (triggerInputs.length > 0) {
    lines.push('', '  private fun clearTriggers() {');
    for (const input of triggerInputs) {
      lines.push(`    ${input.fieldName} = false`);
    }
    lines.push('  }');
  }

  lines.push(
    '',
    '  private fun evaluateTransition(): Transition? {',
    '    val from = state',
    '    val transition = when (state) {'
  );
  for (const [sourceName, enumName] of stateEntries) {
    const candidates = transitions.filter(
      (transition) => transition.from === sourceName || transition.from === 'any'
    );
    if (candidates.length === 0) {
      lines.push(`      State.${enumName} -> null`);
      continue;
    }
    lines.push(`      State.${enumName} -> when {`);
    for (const transition of candidates) {
      lines.push(`        ${renderTransition(transition, inputs, states)}`);
    }
    lines.push('        else -> null', '      }');
  }
  lines.push(
    '    }',
    '    if (transition != null) state = transition.to',
    '    return transition',
    '  }',
    '}',
    ''
  );

  return {
    code: lines.join('\n'),
    className,
    machineName: machine.name,
    sourceDigest: ir.world.sourceDigest,
    irDigest: ir.provenance.deterministicDigest,
    sourceSurface: ir.provenance.sourceSurface,
  };
}

/**
 * Canonical `.hsplus -> HSI-IR -> Kotlin` convenience path.
 *
 * This function does not parse Kotlin-target syntax or bypass HSI admission.
 */
export function compileHSPlusStateMachineToKotlin(
  source: string,
  options: HSPlusKotlinStateMachineEmissionOptions = {}
): HSIIRKotlinStateMachineArtifact {
  const { worldName, ...emissionOptions } = options;
  const ir = lowerHSPlusProgramToHSIIR(source, worldName === undefined ? {} : { worldName });
  return emitHSIIRStateMachineToKotlin(ir, emissionOptions);
}
