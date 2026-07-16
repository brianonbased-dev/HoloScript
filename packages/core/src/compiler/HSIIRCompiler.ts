/**
 * HSIIRCompiler — lower an HS-Core HoloComposition into versioned HSI-IR.
 *
 * Stage A of the native-intelligence program
 * (research/2026-07-14_holoscript-native-intelligence-opportunity-EVOLVED.md):
 * consume the canonical parseHolo AST (never raw text, never a new parser),
 * admit only the HS-Core typed subset, and emit a deterministic versioned IR.
 *
 * Fail-closed admission: empty worlds, skewed references, raw/unsupported
 * constructs, and out-of-slot expressions throw HSIAdmissionError — the
 * compiler never emits a partial or silently-coerced IR.
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import type {
  HoloComposition,
  HoloTemplate,
  HoloValue,
  HoloExpression,
  HoloStatement,
  HoloStateMachine,
  HoloStateTransition,
  HoloEventHandler,
  HoloNode,
} from '../parser/HoloCompositionTypes';
import {
  parseExpressionToIR,
  ExpressionParseError,
  type ExpressionIR,
  type BinaryOperator,
} from '../runtime/expression-ir';
import {
  HSI_IR_SCHEMA_VERSION,
  HSIAdmissionError,
  hsiSha256,
  hsiSourceTextDigest,
  type HSIEffect,
  type HSIEntity,
  type HSIEventHandler,
  type HSIIRDocument,
  type HSIMachineInput,
  type HSIObservationRule,
  type HSIOpacity,
  type HSIPredicate,
  type HSIRelation,
  type HSIScalar,
  type HSISourceSpan,
  type HSIStateField,
  type HSIStateMachine,
  type HSITransition,
} from './HSIIRTypes';

/** Relation edge type that mediates observation in HS-Core v0. */
export const HSI_OBSERVATION_MEDIATOR_EDGE = 'shields';

const ASSIGN_OPERATORS = new Set(['=', '+=', '-=', '*=', '/=']);
const BINARY_OPERATORS = new Set<string>([
  '+', '-', '*', '/', '%', '===', '!==', '==', '!=', '<', '>', '<=', '>=', '&&', '||',
]);

export interface HSIIRLoweringOptions {
  /** Raw source text; when provided the world digest binds to it (CRLF-normalized). */
  sourceText?: string;
}

// =============================================================================
// SMALL HELPERS
// =============================================================================

function spanOf(node: HoloNode | undefined): HSISourceSpan | undefined {
  const loc = node?.loc;
  if (!loc) return undefined;
  return {
    line: loc.start.line,
    column: loc.start.column,
    endLine: loc.end.line,
    endColumn: loc.end.column,
  };
}

function scalarType(value: HSIScalar): 'string' | 'number' | 'boolean' | 'null' {
  if (value === null) return 'null';
  return typeof value as 'string' | 'number' | 'boolean';
}

function asScalar(value: HoloValue, where: string): HSIScalar {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  throw new HSIAdmissionError(
    'unsupported-value',
    `${where}: HS-Core v0 admits scalar values only, got ${Array.isArray(value) ? 'array' : typeof value}`,
  );
}

function asTriple(value: unknown, where: string): [number, number, number] {
  let arr: unknown[] | undefined;
  if (Array.isArray(value)) {
    arr = value;
  } else if (typeof value === 'object' && value !== null && 'x' in value) {
    const vec = value as Record<string, unknown>;
    arr = [vec['x'], vec['y'], vec['z']];
  }
  if (!arr || arr.length !== 3 || !arr.every((n): n is number => typeof n === 'number' && Number.isFinite(n))) {
    throw new HSIAdmissionError('invalid-spatial', `${where}: position/scale must be a finite numeric triple`);
  }
  return [arr[0] as number, arr[1] as number, arr[2] as number];
}

function collectSlots(ir: ExpressionIR, into: Set<string>): void {
  switch (ir.kind) {
    case 'Identifier':
      into.add(ir.name);
      return;
    case 'BinaryExpression':
      collectSlots(ir.left, into);
      collectSlots(ir.right, into);
      return;
    case 'UnaryExpression':
      collectSlots(ir.argument, into);
      return;
    case 'MemberExpression':
      collectSlots(ir.object, into);
      return;
    case 'CallExpression':
      for (const arg of ir.arguments) collectSlots(arg, into);
      return;
    case 'Literal':
      return;
  }
}

function assertSlots(ir: ExpressionIR, allowed: ReadonlySet<string>, where: string): string[] {
  const used = new Set<string>();
  collectSlots(ir, used);
  for (const name of used) {
    if (!allowed.has(name)) {
      throw new HSIAdmissionError('unknown-slot', `${where}: expression reads undeclared slot "${name}"`);
    }
  }
  return [...used].sort();
}

/** Lower a typed HoloExpression into the fail-closed ExpressionIR subset of HS-Core v0. */
export function lowerHoloExpression(expr: HoloExpression, where: string): ExpressionIR {
  switch (expr.type) {
    case 'Literal':
      return { kind: 'Literal', value: expr.value };
    case 'Identifier':
      return { kind: 'Identifier', name: expr.name };
    case 'BinaryExpression': {
      if (!BINARY_OPERATORS.has(expr.operator)) {
        throw new HSIAdmissionError('unsupported-operator', `${where}: operator "${expr.operator}"`);
      }
      return {
        kind: 'BinaryExpression',
        operator: expr.operator as BinaryOperator,
        left: lowerHoloExpression(expr.left, where),
        right: lowerHoloExpression(expr.right, where),
      };
    }
    case 'UnaryExpression':
      return {
        kind: 'UnaryExpression',
        operator: expr.operator,
        argument: lowerHoloExpression(expr.argument, where),
      };
    case 'MemberExpression': {
      if (expr.computed) {
        throw new HSIAdmissionError('unsupported-expression', `${where}: computed member access`);
      }
      return {
        kind: 'MemberExpression',
        object: lowerHoloExpression(expr.object, where),
        property: expr.property,
      };
    }
    default:
      throw new HSIAdmissionError('unsupported-expression', `${where}: ${expr.type} is outside HS-Core v0`);
  }
}

// =============================================================================
// LOWERING
// =============================================================================

interface EntityIngredients {
  templates: Map<string, HoloTemplate>;
  entities: Map<string, HSIEntity>;
}

function lowerEntities(composition: HoloComposition): EntityIngredients {
  const templates = new Map<string, HoloTemplate>();
  for (const template of composition.templates ?? []) {
    if (templates.has(template.name)) {
      throw new HSIAdmissionError('duplicate-template', `template "${template.name}" declared twice`);
    }
    templates.set(template.name, template);
  }

  const entities = new Map<string, HSIEntity>();
  for (const obj of composition.objects ?? []) {
    if (entities.has(obj.name)) {
      throw new HSIAdmissionError('duplicate-entity', `entity "${obj.name}" declared twice`);
    }
    if ((obj.children ?? []).length > 0) {
      throw new HSIAdmissionError('unsupported-value', `entity "${obj.name}": nested children are outside HS-Core v0`);
    }

    const components: Record<string, HSIScalar> = {};
    const traitNames = new Set<string>();
    let template: HoloTemplate | undefined;

    if (obj.template !== undefined) {
      template = templates.get(obj.template);
      if (!template) {
        throw new HSIAdmissionError('unknown-archetype', `entity "${obj.name}" uses missing template "${obj.template}"`);
      }
      for (const prop of template.properties ?? []) {
        if (prop.key === 'position' || prop.key === 'scale') continue; // spatial keys are lowered below
        components[prop.key] = asScalar(prop.value, `template "${template.name}".${prop.key}`);
      }
      for (const trait of template.traits ?? []) traitNames.add(trait.name);
    }
    let position: [number, number, number] | undefined;
    let scale: [number, number, number] | undefined;
    for (const prop of obj.properties ?? []) {
      if (prop.key === 'position') {
        position = asTriple(prop.value, `entity "${obj.name}".position`);
        continue;
      }
      if (prop.key === 'scale') {
        scale = asTriple(prop.value, `entity "${obj.name}".scale`);
        continue;
      }
      components[prop.key] = asScalar(prop.value, `entity "${obj.name}".${prop.key}`);
    }
    for (const trait of obj.traits ?? []) traitNames.add(trait.name);

    const opaqueValue = components['opaque'];
    const opacity: HSIOpacity =
      opaqueValue === undefined ? 'unknown' : opaqueValue === true ? 'opaque' : 'transparent';
    // `opaque` participates in opacity, not the generic component bag.
    delete components['opaque'];

    const role = typeof components['role'] === 'string' ? (components['role'] as string) : undefined;

    const entity: HSIEntity = {
      id: `entity:${obj.name}`,
      name: obj.name,
      opacity,
      components,
      traits: [...traitNames].sort(),
      sourceSpan: spanOf(obj),
    };
    if (obj.template !== undefined) entity.archetype = obj.template;
    if (role !== undefined) entity.role = role;
    if (position === undefined && obj.position !== undefined) {
      position = asTriple(obj.position, `entity "${obj.name}".position`);
    }
    if (scale === undefined && obj.scale !== undefined) {
      scale = asTriple(obj.scale, `entity "${obj.name}".scale`);
    }
    if (position !== undefined) entity.position = position;
    if (scale !== undefined) entity.scale = scale;

    entities.set(obj.name, entity);
  }

  return { templates, entities };
}

function lowerRelations(composition: HoloComposition, entities: Map<string, HSIEntity>): HSIRelation[] {
  const relations: HSIRelation[] = [];
  const connections =
    (composition as HoloComposition & { connections?: { from: string; to: string; edgeType?: string; loc?: HoloNode['loc'] }[] })
      .connections ?? [];
  for (const conn of connections) {
    for (const endpoint of [conn.from, conn.to]) {
      if (!entities.has(endpoint)) {
        throw new HSIAdmissionError(
          'unknown-relation-endpoint',
          `connection ${conn.from} -> ${conn.to} references undeclared entity "${endpoint}"`,
        );
      }
    }
    const edgeType = conn.edgeType ?? 'connects';
    relations.push({
      id: `relation:${conn.from}->${conn.to}:${edgeType}`,
      from: conn.from,
      to: conn.to,
      edgeType,
      sourceSpan: spanOf(conn as HoloNode),
    });
  }
  return relations;
}

function lowerState(composition: HoloComposition): HSIStateField[] {
  const fields: HSIStateField[] = [];
  const seen = new Set<string>();
  for (const prop of composition.state?.properties ?? []) {
    if (seen.has(prop.key)) {
      throw new HSIAdmissionError('duplicate-state-key', `state key "${prop.key}" declared twice`);
    }
    seen.add(prop.key);
    const baseline = asScalar(prop.value, `state.${prop.key}`);
    fields.push({
      id: `state:world.${prop.key}`,
      key: prop.key,
      baseline,
      valueType: scalarType(baseline),
      reactive: prop.reactive === true,
      sourceSpan: spanOf(prop),
    });
  }
  return fields;
}

function deriveObservationPolicy(
  entities: Map<string, HSIEntity>,
  relations: HSIRelation[],
): HSIObservationRule[] {
  const rules: HSIObservationRule[] = [];
  const observers = [...entities.values()].filter((e) => e.role === 'agent');
  const mediatorsByTarget = new Map<string, HSIEntity[]>();
  for (const rel of relations) {
    if (rel.edgeType !== HSI_OBSERVATION_MEDIATOR_EDGE) continue;
    const list = mediatorsByTarget.get(rel.to) ?? [];
    list.push(entities.get(rel.from)!);
    mediatorsByTarget.set(rel.to, list);
  }
  for (const observer of observers) {
    for (const observed of entities.values()) {
      if (observed.name === observer.name) continue;
      if (observed.role === 'barrier') continue;
      const mediators = (mediatorsByTarget.get(observed.name) ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
      const access = mediators.some((m) => m.opacity === 'opaque')
        ? 'blocked'
        : mediators.some((m) => m.opacity === 'unknown')
          ? 'unknown'
          : 'visible';
      rules.push({
        id: `obs:${observer.name}->${observed.name}`,
        observer: observer.name,
        observed: observed.name,
        access,
        mediators: mediators.map((m) => m.name),
      });
    }
  }
  return rules;
}

function lowerStatements(
  statements: HoloStatement[],
  handlerEvent: string,
  stateSlots: ReadonlySet<string>,
  counter: { n: number },
): HSIEffect[] {
  const effects: HSIEffect[] = [];
  for (const stmt of statements) {
    const ordinal = counter.n++;
    const id = `effect:${handlerEvent}#${ordinal}`;
    switch (stmt.type) {
      case 'Assignment': {
        if (!ASSIGN_OPERATORS.has(stmt.operator)) {
          throw new HSIAdmissionError('unsupported-operator', `${id}: assignment operator "${stmt.operator}"`);
        }
        const target = stmt.target.startsWith('state.') ? stmt.target.slice('state.'.length) : stmt.target;
        if (!stateSlots.has(target)) {
          throw new HSIAdmissionError('unknown-assignment-target', `${id}: "${stmt.target}" is not a declared state key`);
        }
        const value = lowerHoloExpression(stmt.value, id);
        assertSlots(value, stateSlots, id);
        effects.push({ kind: 'assign', id, target, operator: stmt.operator, value, sourceSpan: spanOf(stmt) });
        break;
      }
      case 'EmitStatement': {
        effects.push({ kind: 'emit', id, event: stmt.event, sourceSpan: spanOf(stmt) });
        break;
      }
      case 'IfStatement': {
        const condition = lowerHoloExpression(stmt.condition, id);
        assertSlots(condition, stateSlots, id);
        effects.push({
          kind: 'branch',
          id,
          condition,
          then: lowerStatements(stmt.consequent, handlerEvent, stateSlots, counter),
          else: lowerStatements(stmt.alternate ?? [], handlerEvent, stateSlots, counter),
          sourceSpan: spanOf(stmt),
        });
        break;
      }
      default:
        throw new HSIAdmissionError('unsupported-statement', `${id}: ${stmt.type} is outside HS-Core v0`);
    }
  }
  return effects;
}

function lowerEventHandlers(
  composition: HoloComposition,
  stateSlots: ReadonlySet<string>,
): HSIEventHandler[] {
  const logic = (composition as HoloComposition & { logic?: { handlers?: HoloEventHandler[] } }).logic;
  const handlers: HSIEventHandler[] = [];
  const seen = new Set<string>();
  for (const handler of logic?.handlers ?? []) {
    if (seen.has(handler.event)) {
      throw new HSIAdmissionError('duplicate-handler', `handler "${handler.event}" declared twice`);
    }
    seen.add(handler.event);
    handlers.push({
      id: `event:${handler.event}`,
      event: handler.event,
      effects: lowerStatements(handler.body, handler.event, stateSlots, { n: 0 }),
      sourceSpan: spanOf(handler),
    });
  }
  return handlers;
}

function lowerMachine(machine: HoloStateMachine): HSIStateMachine {
  const stateNames = Object.keys(machine.states ?? {});
  if (stateNames.length === 0) {
    throw new HSIAdmissionError('admission-skewed', `state machine "${machine.name}" declares no states`);
  }
  if (!stateNames.includes(machine.initialState)) {
    throw new HSIAdmissionError(
      'unknown-initial-state',
      `state machine "${machine.name}": initial state "${machine.initialState}" is not declared`,
    );
  }

  const inputs: HSIMachineInput[] = (machine.inputs ?? []).map((input) => ({
    id: `input:${machine.name}.${input.name}`,
    name: input.name,
    inputType: input.inputType,
    baseline:
      input.default !== undefined
        ? (input.default as HSIScalar)
        : input.inputType === 'bool' || input.inputType === 'trigger'
          ? false
          : 0,
  }));
  const inputSlots = new Set(inputs.map((i) => i.name));

  const allTransitions: { from: string; t: HoloStateTransition }[] = [];
  for (const t of machine.transitions ?? []) {
    allTransitions.push({ from: t.from && t.from !== 'any' ? t.from : (t.from ?? 'any'), t });
  }
  for (const stateName of stateNames) {
    for (const t of machine.states[stateName]?.transitions ?? []) {
      allTransitions.push({ from: t.from ?? stateName, t });
    }
  }

  const ordinals = new Map<string, number>();
  const transitions: HSITransition[] = allTransitions.map(({ from, t }, declarationOrdinal) => {
    if (from !== 'any' && !stateNames.includes(from)) {
      throw new HSIAdmissionError(
        'unknown-transition-endpoint',
        `state machine "${machine.name}": transition from undeclared state "${from}"`,
      );
    }
    if (!stateNames.includes(t.target)) {
      throw new HSIAdmissionError(
        'unknown-transition-endpoint',
        `state machine "${machine.name}": transition to undeclared state "${t.target}"`,
      );
    }
    const baseId = `transition:${machine.name}.${from}->${t.target}`;
    const ordinal = ordinals.get(baseId) ?? 0;
    ordinals.set(baseId, ordinal + 1);
    const id = `${baseId}#${ordinal}`;

    let guard: ExpressionIR | undefined;
    if (t.condition) {
      guard = lowerHoloExpression(t.condition, id);
    } else if ((t.conditions ?? []).length > 0) {
      for (const cond of t.conditions!) {
        const clause: ExpressionIR = {
          kind: 'BinaryExpression',
          operator: cond.operator,
          left: { kind: 'Identifier', name: cond.parameter },
          right: { kind: 'Literal', value: cond.value as HSIScalar },
        };
        guard = guard
          ? { kind: 'BinaryExpression', operator: cond.chain === 'or' ? '||' : '&&', left: guard, right: clause }
          : clause;
      }
    }
    if (!guard) {
      throw new HSIAdmissionError('admission-skewed', `${id}: transition has neither guard nor trigger condition`);
    }
    const reads = assertSlots(guard, inputSlots, id);

    const transition: HSITransition = {
      id,
      from,
      target: t.target,
      priority: declarationOrdinal,
      guard,
      reads,
      sourceSpan: spanOf(t),
    };
    if (t.event !== undefined) transition.event = t.event;
    return transition;
  });

  return {
    id: `machine:${machine.name}`,
    name: machine.name,
    initialState: machine.initialState,
    states: [...stateNames].sort(),
    inputs,
    transitions,
    sourceSpan: spanOf(machine),
  };
}

function lowerPredicates(composition: HoloComposition, stateSlots: ReadonlySet<string>): HSIPredicate[] {
  const predicates: HSIPredicate[] = [];
  const slotList = [...stateSlots];

  const lowerClause = (kind: 'precondition' | 'invariant', name: string, expr: string): HSIPredicate => {
    const id = `${kind}:${name}`;
    let ir: ExpressionIR;
    try {
      ir = parseExpressionToIR(expr, slotList);
    } catch (error) {
      if (error instanceof ExpressionParseError) {
        throw new HSIAdmissionError('unparseable-clause', `${id}: ${error.message}`);
      }
      throw error;
    }
    return { id, name, kind, expression: ir, reads: assertSlots(ir, stateSlots, id), sourceSpan: spanOf(composition.contract) };
  };

  for (const clause of composition.contract?.preconditions ?? []) {
    predicates.push(lowerClause('precondition', clause.name, clause.expr));
  }
  for (const clause of composition.contract?.invariants ?? []) {
    predicates.push(lowerClause('invariant', clause.name, clause.expr));
  }
  for (const achievement of composition.achievements ?? []) {
    const id = `goal:${achievement.name}`;
    const ir = lowerHoloExpression(achievement.condition, id);
    predicates.push({
      id,
      name: achievement.name,
      kind: 'goal',
      expression: ir,
      reads: assertSlots(ir, stateSlots, id),
      sourceSpan: spanOf(achievement),
    });
  }
  return predicates;
}

/**
 * Pure lowering entry point. Throws HSIAdmissionError on any input outside the
 * HS-Core v0 subset; never returns a partial document.
 */
export function lowerCompositionToHSIIR(
  composition: HoloComposition,
  options: HSIIRLoweringOptions = {},
): HSIIRDocument {
  if (!composition || composition.type !== 'Composition' || typeof composition.name !== 'string' || composition.name.length === 0) {
    throw new HSIAdmissionError('empty-world', 'input is not a named HoloComposition');
  }

  const { entities } = lowerEntities(composition);
  const stateFields = lowerState(composition);
  if (entities.size === 0 && stateFields.length === 0) {
    throw new HSIAdmissionError('empty-world', `composition "${composition.name}" declares no entities and no state`);
  }

  const relations = lowerRelations(composition, entities);
  const observationPolicy = deriveObservationPolicy(entities, relations);
  const stateSlots = new Set(stateFields.map((f) => f.key));
  const eventHandlers = lowerEventHandlers(composition, stateSlots);
  const machines = (composition.stateMachines ?? []).map(lowerMachine);
  const predicates = lowerPredicates(composition, stateSlots);

  const sourceDigest = options.sourceText !== undefined
    ? hsiSourceTextDigest(options.sourceText)
    : hsiSha256({ compositionName: composition.name, note: 'no-source-text-provided' });

  const byId = <T extends { id: string }>(items: T[]): T[] =>
    [...items].sort((a, b) => a.id.localeCompare(b.id));

  const docWithoutDigest = {
    schemaVersion: HSI_IR_SCHEMA_VERSION,
    kind: 'HSIIR' as const,
    world: { name: composition.name, sourceDigest },
    entities: byId([...entities.values()]),
    relations: byId(relations),
    state: byId(stateFields),
    observationPolicy: byId(observationPolicy),
    eventHandlers: byId(eventHandlers),
    machines: byId(machines),
    predicates: byId(predicates),
    declaredUnknowns: [
      'action-capabilities',
      'action-costs',
      'beliefs',
      'first-class-observations',
      'memory-events',
      'receipt-shape',
    ],
    provenance: { compiler: 'HSIIRCompiler' as const },
  };
  const deterministicDigest = hsiSha256(docWithoutDigest);

  return {
    ...docWithoutDigest,
    provenance: { compiler: 'HSIIRCompiler', deterministicDigest },
  };
}

// =============================================================================
// COMPILER WRAPPER
// =============================================================================

export class HSIIRCompiler extends CompilerBase {
  protected readonly compilerName = 'HSIIRCompiler';
  private readonly options: HSIIRLoweringOptions;

  constructor(options: HSIIRLoweringOptions = {}) {
    super();
    this.options = options;
  }

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.HSI_IR;
  }

  compile(composition: HoloComposition, agentToken?: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);
    return JSON.stringify(lowerCompositionToHSIIR(composition, this.options), null, 2);
  }

  override compileToFiles(composition: HoloComposition, agentToken = ''): Record<string, string> {
    return { [this.defaultOutputFileName()]: this.compile(composition, agentToken) };
  }

  protected override defaultOutputFileName(): string {
    return 'hsi-ir.json';
  }
}

export function createHSIIRCompiler(options?: HSIIRLoweringOptions): HSIIRCompiler {
  return new HSIIRCompiler(options);
}

export default HSIIRCompiler;
