/**
 * HSIExactTrace — deterministic exact state/effect traces over an HSI-IR world.
 *
 * The exact plane of the Stage-A vertical slice: a scripted scenario (typed
 * steps, no wall clock, no randomness) is reduced against the IR's state
 * machines, event handlers, and world state. Every guard and every effect
 * value is evaluated through the fail-closed expression-ir interpreter — the
 * only sanctioned evaluator — so an out-of-slot read or unknown builtin throws
 * instead of silently resolving.
 *
 * Determinism contract: same IR + same scenario => byte-identical trace
 * (canonical serialization, digests included). Regenerating the IR from the
 * same source and re-running yields the same digest.
 */

import { evaluateExpressionIR, type ExpressionIR } from '../runtime/expression-ir';
import {
  HSI_TRACE_SCHEMA_VERSION,
  HSIAdmissionError,
  hsiSha256,
  type HSIEffect,
  type HSIIRDocument,
  type HSIScalar,
  type HSIScenarioStep,
  type HSITrace,
  type HSITraceEffectRecord,
  type HSITraceStep,
  type HSITraceTransitionRecord,
} from './HSIIRTypes';

interface MachineRuntime {
  name: string;
  current: string;
  inputs: Record<string, HSIScalar>;
  triggers: Set<string>;
}

interface WorldRuntime {
  state: Record<string, HSIScalar>;
  machines: Map<string, MachineRuntime>;
}

function inputAcceptsValue(
  inputType: 'bool' | 'float' | 'int' | 'trigger',
  value: HSIScalar
): boolean {
  if (inputType === 'bool' || inputType === 'trigger') return typeof value === 'boolean';
  if (inputType === 'int') return typeof value === 'number' && Number.isInteger(value);
  return typeof value === 'number' && Number.isFinite(value);
}

function snapshot(world: WorldRuntime): {
  state: Record<string, HSIScalar>;
  machineStates: Record<string, string>;
  stateDigest: string;
} {
  const state: Record<string, HSIScalar> = {};
  for (const key of Object.keys(world.state).sort()) state[key] = world.state[key]!;
  const machineStates: Record<string, string> = {};
  for (const name of [...world.machines.keys()].sort()) {
    machineStates[name] = world.machines.get(name)!.current;
  }
  return { state, machineStates, stateDigest: hsiSha256({ state, machineStates }) };
}

function evaluateGuard(guard: ExpressionIR, context: Record<string, HSIScalar>): boolean {
  return evaluateExpressionIR(guard, context) === true;
}

function applyOperator(
  operator: '=' | '+=' | '-=' | '*=' | '/=',
  before: HSIScalar,
  operand: unknown,
  where: string,
): HSIScalar {
  if (operator === '=') {
    if (operand === null || typeof operand === 'string' || typeof operand === 'number' || typeof operand === 'boolean') {
      return operand;
    }
    throw new HSIAdmissionError('unsupported-value', `${where}: assignment produced a non-scalar value`);
  }
  if (typeof before !== 'number' || typeof operand !== 'number' || !Number.isFinite(operand)) {
    throw new HSIAdmissionError(
      'unsupported-value',
      `${where}: compound assignment requires numeric operands (got ${typeof before} ${operator} ${typeof operand})`,
    );
  }
  switch (operator) {
    case '+=':
      return before + operand;
    case '-=':
      return before - operand;
    case '*=':
      return before * operand;
    case '/=': {
      if (operand === 0) {
        throw new HSIAdmissionError('unsupported-value', `${where}: division by zero`);
      }
      return before / operand;
    }
  }
}

function runEffects(
  effects: HSIEffect[],
  world: WorldRuntime,
  records: HSITraceEffectRecord[],
  emitted: string[],
): void {
  for (const effect of effects) {
    switch (effect.kind) {
      case 'assign': {
        const before = world.state[effect.target]!;
        const operand = evaluateExpressionIR(effect.value, world.state);
        const after = applyOperator(effect.operator, before, operand, effect.id);
        world.state[effect.target] = after;
        records.push({ sourceId: effect.id, target: effect.target, before, after });
        break;
      }
      case 'emit': {
        emitted.push(effect.event);
        break;
      }
      case 'branch': {
        const taken = evaluateGuard(effect.condition, world.state);
        runEffects(taken ? effect.then : effect.else, world, records, emitted);
        break;
      }
    }
  }
}

function evaluateTransitions(world: WorldRuntime, ir: HSIIRDocument): HSITraceTransitionRecord[] {
  const fired: HSITraceTransitionRecord[] = [];
  for (const machineIR of ir.machines) {
    const runtime = world.machines.get(machineIR.name)!;
    const context: Record<string, HSIScalar> = { ...runtime.inputs };
    for (const trigger of runtime.triggers) context[trigger] = true;
    // Firing priority is the declaration ordinal carried in the IR (NOT canonical
    // id order, which alpha-renaming may permute) — first satisfied wins.
    const candidates = [...machineIR.transitions].sort((a, b) => a.priority - b.priority);
    for (const transition of candidates) {
      if (transition.from !== 'any' && transition.from !== runtime.current) continue;
      if (!transition.guard) continue;
      if (evaluateGuard(transition.guard, context)) {
        fired.push({
          machine: machineIR.name,
          transitionId: transition.id,
          from: runtime.current,
          to: transition.target,
        });
        runtime.current = transition.target;
        break;
      }
    }
    runtime.triggers.clear();
  }
  return fired;
}

function checkInvariants(world: WorldRuntime, ir: HSIIRDocument): string[] {
  const violations: string[] = [];
  for (const predicate of ir.predicates) {
    if (predicate.kind !== 'invariant') continue;
    if (!evaluateGuard(predicate.expression, world.state)) violations.push(predicate.id);
  }
  return violations;
}

/**
 * Run a scripted scenario against an HSI-IR document and produce the exact trace.
 * Fail-closed: steps addressing unknown machines/inputs/events throw.
 */
export function runExactTrace(ir: HSIIRDocument, scenario: HSIScenarioStep[]): HSITrace {
  const world: WorldRuntime = { state: {}, machines: new Map() };
  for (const field of ir.state) world.state[field.key] = field.baseline;
  for (const machine of ir.machines) {
    const inputs: Record<string, HSIScalar> = {};
    for (const input of machine.inputs) {
      inputs[input.name] = input.inputType === 'trigger' ? false : input.baseline;
    }
    world.machines.set(machine.name, {
      name: machine.name,
      current: machine.initialState,
      inputs,
      triggers: new Set(),
    });
  }

  const preconditionResults = ir.predicates
    .filter((p) => p.kind === 'precondition')
    .map((p) => ({ id: p.id, holds: evaluateGuard(p.expression, world.state) }));

  const initial = snapshot(world);
  const steps: HSITraceStep[] = [];
  let valid = preconditionResults.every((r) => r.holds);

  scenario.forEach((step, ordinal) => {
    const effects: HSITraceEffectRecord[] = [];
    const emitted: string[] = [];
    let transitions: HSITraceTransitionRecord[] = [];

    switch (step.kind) {
      case 'set-input': {
        const machine = world.machines.get(step.machine);
        const declared = ir.machines
          .find((candidate) => candidate.name === step.machine)
          ?.inputs.find((input) => input.name === step.input);
        if (!machine || !declared) {
          throw new HSIAdmissionError(
            'unknown-slot',
            `scenario step ${ordinal}: unknown machine input ${step.machine}.${step.input}`,
          );
        }
        if (declared.inputType === 'trigger') {
          throw new HSIAdmissionError(
            'trigger-step-kind',
            `scenario step ${ordinal}: trigger ${step.machine}.${step.input} must use fire-trigger`,
          );
        }
        if (!inputAcceptsValue(declared.inputType, step.value)) {
          throw new HSIAdmissionError(
            'input-type',
            `scenario step ${ordinal}: ${step.machine}.${step.input} expects ${declared.inputType}`,
          );
        }
        machine.inputs[step.input] = step.value;
        transitions = evaluateTransitions(world, ir);
        break;
      }
      case 'fire-trigger': {
        const machine = world.machines.get(step.machine);
        const declared = ir.machines
          .find((m) => m.name === step.machine)
          ?.inputs.find((i) => i.name === step.input && i.inputType === 'trigger');
        if (!machine || !declared) {
          throw new HSIAdmissionError(
            'unknown-slot',
            `scenario step ${ordinal}: unknown trigger ${step.machine}.${step.input}`,
          );
        }
        machine.triggers.add(step.input);
        transitions = evaluateTransitions(world, ir);
        break;
      }
      case 'fire-event': {
        const handler = ir.eventHandlers.find((h) => h.event === step.event);
        if (!handler) {
          throw new HSIAdmissionError(
            'unknown-slot',
            `scenario step ${ordinal}: no handler for event "${step.event}"`,
          );
        }
        runEffects(handler.effects, world, effects, emitted);
        break;
      }
    }

    const invariantViolations = checkInvariants(world, ir);
    if (invariantViolations.length > 0) valid = false;

    steps.push({
      ordinal,
      step,
      transitions,
      effects,
      emitted,
      invariantViolations,
      stateDigest: snapshot(world).stateDigest,
    });
  });

  const final = snapshot(world);
  const traceWithoutDigest = {
    schemaVersion: HSI_TRACE_SCHEMA_VERSION,
    kind: 'HSITrace' as const,
    worldDigest: ir.provenance.deterministicDigest,
    preconditionResults,
    initial,
    steps,
    final,
    valid,
  };

  return { ...traceWithoutDigest, deterministicDigest: hsiSha256(traceWithoutDigest) };
}
