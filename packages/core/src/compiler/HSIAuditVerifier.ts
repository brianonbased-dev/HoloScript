/**
 * HSIAuditVerifier — the distinct audit plane of the Stage-A vertical slice.
 *
 * Case generation and verification are deliberately separate identities from
 * the lowering compiler: cases declare expectations; this module re-runs the
 * pipeline (parse output -> lower -> trace) on transformed inputs and asserts
 * the declared expectations structurally. It never trusts a digest it did not
 * recompute.
 *
 * Metamorphic transforms operate on the *parsed composition* (typed walks and
 * clones), so there is exactly one lowering path — intervened worlds go
 * through the same admission gates as the original.
 */

import type {
  HoloComposition,
  HoloExpression,
  HoloStatement,
} from '../parser/HoloCompositionTypes';
import {
  HSI_AUDIT_SCHEMA_VERSION,
  HSIAdmissionError,
  hsiSha256,
  hsiStableStringify,
  type HSIAuditCase,
  type HSIAuditCheckResult,
  type HSIAuditManifest,
  type HSIIRDocument,
  type HSIScenarioStep,
  type HSITrace,
} from './HSIIRTypes';
import { lowerCompositionToHSIIR } from './HSIIRCompiler';
import { runExactTrace } from './HSIExactTrace';

// =============================================================================
// RENAME (alpha-conversion) SUPPORT
// =============================================================================

/** Consistent renaming of declared names. Values (string literals) are never renamed. */
export interface HSIRenameMap {
  [oldName: string]: string;
}

function renamed(name: string, map: HSIRenameMap): string {
  return map[name] ?? name;
}

function renameExpression(expr: HoloExpression, map: HSIRenameMap): void {
  switch (expr.type) {
    case 'Identifier':
      expr.name = renamed(expr.name, map);
      return;
    case 'BinaryExpression':
      renameExpression(expr.left, map);
      renameExpression(expr.right, map);
      return;
    case 'UnaryExpression':
      renameExpression(expr.argument, map);
      return;
    case 'MemberExpression':
      renameExpression(expr.object, map);
      return;
    case 'CallExpression':
      renameExpression(expr.callee, map);
      for (const arg of expr.arguments) renameExpression(arg, map);
      return;
    default:
      return;
  }
}

function renameStatements(statements: HoloStatement[], map: HSIRenameMap): void {
  for (const stmt of statements) {
    switch (stmt.type) {
      case 'Assignment': {
        const target = stmt.target.startsWith('state.')
          ? stmt.target.slice('state.'.length)
          : stmt.target;
        const prefix = stmt.target.startsWith('state.') ? 'state.' : '';
        stmt.target = `${prefix}${renamed(target, map)}`;
        renameExpression(stmt.value, map);
        break;
      }
      case 'IfStatement':
        renameExpression(stmt.condition, map);
        renameStatements(stmt.consequent, map);
        renameStatements(stmt.alternate ?? [], map);
        break;
      default:
        break;
    }
  }
}

/** Token-boundary rename inside a raw contract-clause expression string. */
function renameRawExpr(expr: string, map: HSIRenameMap): string {
  return expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (token) => renamed(token, map));
}

/**
 * Apply a consistent alpha-renaming to a parsed composition, in place.
 * Covers the HS-Core v0 surface: templates, objects, connections, state keys,
 * handler bodies, state machines, contract clauses, achievements.
 */
export function renameComposition(composition: HoloComposition, map: HSIRenameMap): void {
  for (const template of composition.templates ?? []) {
    template.name = renamed(template.name, map);
  }
  for (const obj of composition.objects ?? []) {
    obj.name = renamed(obj.name, map);
    if (obj.template !== undefined) obj.template = renamed(obj.template, map);
  }
  const connections = (
    composition as HoloComposition & {
      connections?: { from: string; to: string }[];
    }
  ).connections;
  for (const conn of connections ?? []) {
    conn.from = renamed(conn.from, map);
    conn.to = renamed(conn.to, map);
  }
  for (const prop of composition.state?.properties ?? []) {
    prop.key = renamed(prop.key, map);
  }
  const logic = (
    composition as HoloComposition & {
      logic?: { handlers?: { event: string; body: HoloStatement[] }[] };
    }
  ).logic;
  for (const handler of logic?.handlers ?? []) {
    renameStatements(handler.body, map);
  }
  for (const machine of composition.stateMachines ?? []) {
    machine.name = renamed(machine.name, map);
    machine.initialState = renamed(machine.initialState, map);
    const renamedStates: typeof machine.states = {};
    for (const [stateName, stateNode] of Object.entries(machine.states ?? {})) {
      stateNode.name = renamed(stateName, map);
      renamedStates[renamed(stateName, map)] = stateNode;
      for (const t of stateNode.transitions ?? []) {
        if (t.from && t.from !== 'any') t.from = renamed(t.from, map);
        t.target = renamed(t.target, map);
        if (t.condition) renameExpression(t.condition, map);
        for (const cond of t.conditions ?? []) cond.parameter = renamed(cond.parameter, map);
      }
    }
    machine.states = renamedStates;
    for (const input of machine.inputs ?? []) {
      input.name = renamed(input.name, map);
    }
    for (const t of machine.transitions ?? []) {
      if (t.from && t.from !== 'any') t.from = renamed(t.from, map);
      t.target = renamed(t.target, map);
      if (t.condition) renameExpression(t.condition, map);
      for (const cond of t.conditions ?? []) cond.parameter = renamed(cond.parameter, map);
    }
  }
  if (composition.contract) {
    for (const clause of [
      ...composition.contract.preconditions,
      ...composition.contract.invariants,
    ]) {
      clause.expr = renameRawExpr(clause.expr, map);
    }
  }
  for (const achievement of composition.achievements ?? []) {
    renameExpression(achievement.condition, map);
  }
}

const ID_TOKEN_PATTERN = /[A-Za-z_][A-Za-z0-9_]*/g;

function renameIdString(id: string, map: HSIRenameMap): string {
  return id.replace(ID_TOKEN_PATTERN, (token) => renamed(token, map));
}

/** Rename all name-bearing fields of a trace so it can be byte-compared to a renamed world's trace. */
export function renameTrace(trace: HSITrace, map: HSIRenameMap): HSITrace {
  const renameSnapshot = (snap: HSITrace['initial']): HSITrace['initial'] => {
    const state: typeof snap.state = {};
    for (const [key, value] of Object.entries(snap.state)) state[renamed(key, map)] = value;
    const machineStates: typeof snap.machineStates = {};
    for (const [machine, current] of Object.entries(snap.machineStates)) {
      machineStates[renamed(machine, map)] = renamed(current, map);
    }
    return {
      state,
      machineStates,
      stateDigest: hsiSha256({
        state: sortRecord(state),
        machineStates: sortRecord(machineStates),
      }),
    };
  };
  const sortRecord = <V>(record: Record<string, V>): Record<string, V> => {
    const out: Record<string, V> = {};
    for (const key of Object.keys(record).sort()) out[key] = record[key]!;
    return out;
  };

  const stepsRenamed = trace.steps.map((step) => {
    const scenario: HSIScenarioStep =
      step.step.kind === 'fire-event'
        ? step.step
        : step.step.kind === 'set-input'
          ? {
              kind: 'set-input',
              machine: renamed(step.step.machine, map),
              input: renamed(step.step.input, map),
              value: step.step.value,
            }
          : {
              kind: 'fire-trigger',
              machine: renamed(step.step.machine, map),
              input: renamed(step.step.input, map),
            };
    return {
      ...step,
      step: scenario,
      transitions: step.transitions.map((t) => ({
        machine: renamed(t.machine, map),
        transitionId: renameIdString(t.transitionId, map),
        from: renamed(t.from, map),
        to: renamed(t.to, map),
      })),
      effects: step.effects.map((e) => ({
        ...e,
        target: renamed(e.target, map),
        sourceId: renameIdString(e.sourceId, map),
      })),
      invariantViolations: step.invariantViolations.map((id) => renameIdString(id, map)),
      stateDigest: '',
    };
  });

  const initial = renameSnapshot(trace.initial);
  const final = renameSnapshot(trace.final);
  const traceWithoutDigest = {
    schemaVersion: trace.schemaVersion,
    kind: trace.kind,
    worldDigest: '',
    preconditionResults: trace.preconditionResults.map((r) => ({
      id: renameIdString(r.id, map),
      holds: r.holds,
    })),
    initial,
    steps: stepsRenamed,
    final,
    valid: trace.valid,
  };
  return { ...traceWithoutDigest, deterministicDigest: '' } as HSITrace;
}

/** Strip fields that legitimately differ across worlds (digests) before behavioral comparison. */
export function behavioralProjection(trace: HSITrace): unknown {
  return {
    preconditionResults: trace.preconditionResults,
    initial: { state: trace.initial.state, machineStates: trace.initial.machineStates },
    steps: trace.steps.map((s) => ({
      ordinal: s.ordinal,
      step: s.step,
      transitions: s.transitions,
      effects: s.effects,
      emitted: s.emitted,
      invariantViolations: s.invariantViolations,
    })),
    final: { state: trace.final.state, machineStates: trace.final.machineStates },
    valid: trace.valid,
  };
}

// =============================================================================
// REORDER SUPPORT
// =============================================================================

/** Deterministically permute independent declaration collections (reverse copies). */
export function reorderComposition(composition: HoloComposition): void {
  composition.templates = [...(composition.templates ?? [])].reverse();
  composition.objects = [...(composition.objects ?? [])].reverse();
  const holder = composition as HoloComposition & { connections?: unknown[] };
  if (holder.connections) holder.connections = [...holder.connections].reverse();
  if (composition.state?.properties) {
    composition.state.properties = [...composition.state.properties].reverse();
  }
  if (composition.contract) {
    composition.contract.invariants = [...composition.contract.invariants].reverse();
  }
}

// =============================================================================
// INTERVENTIONS (composition-level, single lowering path)
// =============================================================================

export type HSICompositionIntervention =
  | { id: string; kind: 'set-opacity'; entity: string; opaque: boolean | undefined }
  | {
      id: string;
      kind: 'set-guard-literal';
      machine: string;
      fromState: string;
      toState: string;
      value: number;
    };

export function applyIntervention(
  composition: HoloComposition,
  intervention: HSICompositionIntervention
): void {
  if (intervention.kind === 'set-opacity') {
    const obj = (composition.objects ?? []).find((o) => o.name === intervention.entity);
    if (!obj) {
      throw new HSIAdmissionError(
        'admission-skewed',
        `intervention targets unknown entity "${intervention.entity}"`
      );
    }
    const existing = obj.properties.findIndex((p) => p.key === 'opaque');
    if (existing >= 0) obj.properties.splice(existing, 1);
    // Template-level opacity must also be overridden at the object level.
    if (intervention.opaque !== undefined) {
      obj.properties.push({
        type: 'ObjectProperty',
        key: 'opaque',
        value: intervention.opaque,
      } as never);
    } else {
      const template = (composition.templates ?? []).find((t) => t.name === obj.template);
      if (template) {
        template.properties = (template.properties ?? []).filter((p) => p.key !== 'opaque');
      }
    }
    return;
  }

  const machine = (composition.stateMachines ?? []).find((m) => m.name === intervention.machine);
  if (!machine) {
    throw new HSIAdmissionError(
      'admission-skewed',
      `intervention targets unknown machine "${intervention.machine}"`
    );
  }
  const transitions = [
    ...(machine.transitions ?? []),
    ...Object.values(machine.states ?? {}).flatMap((s) => s.transitions ?? []),
  ];
  const transition = transitions.find(
    (t) => (t.from ?? '') === intervention.fromState && t.target === intervention.toState
  );
  if (!transition) {
    throw new HSIAdmissionError(
      'admission-skewed',
      `intervention targets unknown transition ${intervention.fromState} -> ${intervention.toState}`
    );
  }
  if (
    transition.condition?.type === 'BinaryExpression' &&
    transition.condition.right.type === 'Literal'
  ) {
    transition.condition.right.value = intervention.value;
  }
  for (const cond of transition.conditions ?? []) {
    if (typeof cond.value === 'number') cond.value = intervention.value;
  }
}

// =============================================================================
// CASE GENERATION
// =============================================================================

/** Declare the audit cases for a lowered world. Expectations are asserted by runHSIAudit. */
export function generateAuditCases(ir: HSIIRDocument): HSIAuditCase[] {
  const cases: HSIAuditCase[] = [
    {
      id: 'audit:admission-empty',
      kind: 'admission-empty',
      description: 'An empty composition (no entities, no state) must fail admission.',
      expectation: 'HSIAdmissionError(empty-world)',
    },
    {
      id: 'audit:admission-missing-archetype',
      kind: 'admission-skewed',
      description: 'An object using an undeclared template must fail admission.',
      expectation: 'HSIAdmissionError(unknown-archetype)',
    },
    {
      id: 'audit:admission-dangling-relation',
      kind: 'admission-skewed',
      description: 'A connection to an undeclared entity must fail admission.',
      expectation: 'HSIAdmissionError(unknown-relation-endpoint)',
    },
    {
      id: 'audit:alpha-rename',
      kind: 'alpha-rename',
      description: 'Consistent renaming of declared names preserves behavior (trace modulo names).',
      expectation:
        'behavioralProjection(renameTrace(base)) === behavioralProjection(trace(renamed))',
    },
    {
      id: 'audit:declaration-reorder',
      kind: 'declaration-reorder',
      description: 'Reordering independent declarations yields a byte-identical IR.',
      expectation: 'deterministicDigest(base) === deterministicDigest(reordered)',
    },
    {
      id: 'audit:regenerate-determinism',
      kind: 'regenerate-determinism',
      description: 'Re-lowering and re-tracing from the same source is byte-identical.',
      expectation: 'all artifact digests equal across two independent regenerations',
    },
  ];

  const opaqueMediator = ir.entities.find(
    (e) =>
      e.opacity === 'opaque' &&
      ir.observationPolicy.some((r) => r.mediators.includes(e.name) && r.access === 'blocked')
  );
  if (opaqueMediator) {
    cases.push({
      id: 'audit:counterfactual-opacity',
      kind: 'counterfactual-intervention',
      description: `Making "${opaqueMediator.name}" transparent must change at least one observation access verdict.`,
      intervention: {
        kind: 'set-opacity',
        id: 'intervention:flip-opacity',
        entity: opaqueMediator.name,
        opacity: 'transparent',
      },
      expectation: 'observationPolicy access verdicts differ from base IR',
    });
  }

  const guardedTransition = ir.machines
    .flatMap((m) => m.transitions.map((t) => ({ machine: m.name, t })))
    .find(
      ({ t }) =>
        t.guard?.kind === 'BinaryExpression' &&
        t.guard.right.kind === 'Literal' &&
        typeof t.guard.right.value === 'number'
    );
  if (guardedTransition) {
    cases.push({
      id: 'audit:counterfactual-guard',
      kind: 'counterfactual-intervention',
      description: `Raising the numeric guard of ${guardedTransition.t.id} beyond scenario inputs must change the exact trace.`,
      intervention: {
        kind: 'set-transition-guard-literal',
        id: 'intervention:raise-guard-threshold',
        machine: guardedTransition.machine,
        transitionId: guardedTransition.t.id,
        value: 1e6,
      },
      expectation:
        'trace deterministicDigest differs and at least one step fires different transitions',
    });
  }

  return cases;
}

// =============================================================================
// VERIFIER
// =============================================================================

export interface HSIAuditInput {
  composition: HoloComposition;
  sourceText: string;
  scenario: HSIScenarioStep[];
  renameMap: HSIRenameMap;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function expectAdmissionFailure(
  fn: () => void,
  expectedCode: string
): HSIAuditCheckResult['status'] {
  try {
    fn();
    return 'fail';
  } catch (error) {
    return error instanceof HSIAdmissionError && error.code === expectedCode ? 'pass' : 'fail';
  }
}

/**
 * Execute every audit case against the world and produce the audit manifest.
 * This is the independent verifier: it recomputes everything it asserts.
 */
export function runHSIAudit(input: HSIAuditInput): HSIAuditManifest {
  const { composition, sourceText, scenario, renameMap } = input;
  const baseIR = lowerCompositionToHSIIR(clone(composition), { sourceText });
  const baseTrace = runExactTrace(baseIR, scenario);
  const cases = generateAuditCases(baseIR);
  const checks: HSIAuditCheckResult[] = [];

  for (const auditCase of cases) {
    let status: HSIAuditCheckResult['status'] = 'fail';
    let detail = auditCase.expectation;
    try {
      switch (auditCase.id) {
        case 'audit:admission-empty': {
          const empty = {
            ...clone(composition),
            name: 'EmptyWorld',
            templates: [],
            objects: [],
            state: undefined,
            stateMachines: [],
            contract: undefined,
            achievements: [],
          } as unknown as HoloComposition;
          (empty as HoloComposition & { connections?: unknown[] }).connections = [];
          (empty as HoloComposition & { logic?: unknown }).logic = undefined;
          status = expectAdmissionFailure(() => lowerCompositionToHSIIR(empty), 'empty-world');
          break;
        }
        case 'audit:admission-missing-archetype': {
          const skewed = clone(composition);
          if (skewed.objects.length === 0) throw new Error('fixture has no objects');
          skewed.objects[0]!.template = 'GhostTemplate';
          status = expectAdmissionFailure(
            () => lowerCompositionToHSIIR(skewed),
            'unknown-archetype'
          );
          break;
        }
        case 'audit:admission-dangling-relation': {
          const skewed = clone(composition);
          const holder = skewed as unknown as { connections?: { from: string; to: string }[] };
          holder.connections = [
            ...(holder.connections ?? []),
            { from: 'NoSuchEntity', to: 'AlsoMissing' },
          ];
          status = expectAdmissionFailure(
            () => lowerCompositionToHSIIR(skewed),
            'unknown-relation-endpoint'
          );
          break;
        }
        case 'audit:alpha-rename': {
          const renamedComposition = clone(composition);
          renameComposition(renamedComposition, renameMap);
          const renamedIR = lowerCompositionToHSIIR(renamedComposition);
          const renamedScenario = scenario.map((step) =>
            step.kind === 'fire-event'
              ? step
              : step.kind === 'set-input'
                ? {
                    ...step,
                    machine: renameMap[step.machine] ?? step.machine,
                    input: renameMap[step.input] ?? step.input,
                  }
                : {
                    ...step,
                    machine: renameMap[step.machine] ?? step.machine,
                    input: renameMap[step.input] ?? step.input,
                  }
          );
          const renamedTrace = runExactTrace(renamedIR, renamedScenario);
          const expected = hsiStableStringify(
            behavioralProjection(renameTrace(baseTrace, renameMap))
          );
          const actual = hsiStableStringify(behavioralProjection(renamedTrace));
          status = expected === actual ? 'pass' : 'fail';
          if (status === 'fail') detail = 'renamed trace diverged from rename-projected base trace';
          break;
        }
        case 'audit:declaration-reorder': {
          const reordered = clone(composition);
          reorderComposition(reordered);
          const reorderedIR = lowerCompositionToHSIIR(reordered, { sourceText });
          status =
            reorderedIR.provenance.deterministicDigest === baseIR.provenance.deterministicDigest
              ? 'pass'
              : 'fail';
          if (status === 'fail') detail = 'reordered IR digest differs from base IR digest';
          break;
        }
        case 'audit:regenerate-determinism': {
          const secondIR = lowerCompositionToHSIIR(clone(composition), { sourceText });
          const secondTrace = runExactTrace(secondIR, scenario);
          status =
            secondIR.provenance.deterministicDigest === baseIR.provenance.deterministicDigest &&
            secondTrace.deterministicDigest === baseTrace.deterministicDigest
              ? 'pass'
              : 'fail';
          if (status === 'fail') detail = 'regeneration produced different digests';
          break;
        }
        case 'audit:counterfactual-opacity': {
          const intervention = auditCase.intervention!;
          if (intervention.kind !== 'set-opacity') throw new Error('case/intervention mismatch');
          const intervened = clone(composition);
          applyIntervention(intervened, {
            id: intervention.id,
            kind: 'set-opacity',
            entity: intervention.entity,
            opaque:
              intervention.opacity === 'opaque'
                ? true
                : intervention.opacity === 'transparent'
                  ? false
                  : undefined,
          });
          const intervenedIR = lowerCompositionToHSIIR(intervened);
          const baseAccess = hsiStableStringify(baseIR.observationPolicy);
          const newAccess = hsiStableStringify(intervenedIR.observationPolicy);
          status = baseAccess !== newAccess ? 'pass' : 'fail';
          if (status === 'fail')
            detail = 'opacity intervention did not change any observation verdict';
          break;
        }
        case 'audit:counterfactual-guard': {
          const intervention = auditCase.intervention!;
          if (intervention.kind !== 'set-transition-guard-literal')
            throw new Error('case/intervention mismatch');
          const parsed = /transition:([^.]+)\.([^-]+)->([^#]+)#/.exec(intervention.transitionId);
          if (!parsed) throw new Error(`unparseable transition id ${intervention.transitionId}`);
          const intervened = clone(composition);
          applyIntervention(intervened, {
            id: intervention.id,
            kind: 'set-guard-literal',
            machine: parsed[1]!,
            fromState: parsed[2]!,
            toState: parsed[3]!,
            value: intervention.value,
          });
          const intervenedIR = lowerCompositionToHSIIR(intervened);
          const intervenedTrace = runExactTrace(intervenedIR, scenario);
          const digestDiffers =
            intervenedTrace.deterministicDigest !== baseTrace.deterministicDigest;
          const stepDiffers = baseTrace.steps.some(
            (step, i) =>
              hsiStableStringify(step.transitions) !==
              hsiStableStringify(intervenedTrace.steps[i]?.transitions)
          );
          status = digestDiffers && stepDiffers ? 'pass' : 'fail';
          if (status === 'fail') detail = 'guard intervention did not change the exact trace';
          break;
        }
        default:
          detail = `unrecognized audit case ${auditCase.id}`;
      }
    } catch (error) {
      status = 'fail';
      detail = `${detail} — threw: ${(error as Error).message}`;
    }
    checks.push({ caseId: auditCase.id, status, detail });
  }

  const overall: 'pass' | 'fail' = checks.every((c) => c.status === 'pass') ? 'pass' : 'fail';
  const manifestWithoutDigest = {
    schemaVersion: HSI_AUDIT_SCHEMA_VERSION,
    kind: 'HSIAuditManifest' as const,
    worldDigest: baseIR.provenance.deterministicDigest,
    verifier: 'HSIAuditVerifier' as const,
    checks,
    overall,
  };
  return { ...manifestWithoutDigest, deterministicDigest: hsiSha256(manifestWithoutDigest) };
}
