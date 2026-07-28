/**
 * HSI-IR — the compiler's world-IR dialect of HoloMeaning (stratum ②).
 *
 * STRATUM MEMBERSHIP (docs/spec/language-architecture.md §2, 2026-07-17): "HSI-IR" is not a
 * rival meaning IR — it is the compiler-owned LOWERING TARGET inside the HoloMeaning stratum,
 * and it imports the canonical resolution contract from @holoscript/meaning rather than
 * mirroring it. These types stay in core (not packages/meaning) for one documented reason:
 * the ExpressionIR dependency below is core-internal; moving the types would invert the
 * core→meaning direction. If ExpressionIR is ever extracted, these types can follow.
 *
 * Versioned, compiler-owned typed representation lowered from the canonical
 * HoloComposition AST (parseHolo/parseHoloStrict). No new parser, no new file
 * format: internal types + versioned JSON schemas, per
 * research/2026-07-14_holoscript-native-intelligence-opportunity-EVOLVED.md.
 *
 * Custody rules encoded here:
 *  - Every node carries a stable, name-derived `id` (never an array index) and,
 *    when the parser provides one, a source span.
 *  - Opacity is three-state: `'transparent' | 'opaque' | 'unknown'` where
 *    UNKNOWN means the attribute was ABSENT in source — the same gap-aware
 *    vocabulary as the HoloMeaning containment/access resolvers, so the Stage-B
 *    causal loop (task 6mg9) consumes this world without translation.
 *  - Artifacts are deterministic: canonical collection order, stable key order,
 *    and a sha256 digest computed over the digest-free document.
 */

import { createHash } from 'crypto';
import type { ExpressionIR } from '../runtime/expression-ir';

// =============================================================================
// SCHEMA VERSIONS
// =============================================================================

export const HSI_IR_SCHEMA_VERSION = 'holoscript.hsi-ir.v0.1.0' as const;
export const HSI_TRACE_SCHEMA_VERSION = 'holoscript.hsi-trace.v0.1.0' as const;
export const HSI_LEARNING_GRAPH_SCHEMA_VERSION = 'holoscript.learning-graph.v0.1.0' as const;
export const HSI_AUDIT_SCHEMA_VERSION = 'holoscript.hsi-audit.v0.1.0' as const;

export type HSIIRSchemaVersion = typeof HSI_IR_SCHEMA_VERSION;
export type HSITraceSchemaVersion = typeof HSI_TRACE_SCHEMA_VERSION;
export type HSILearningGraphSchemaVersion = typeof HSI_LEARNING_GRAPH_SCHEMA_VERSION;
export type HSIAuditSchemaVersion = typeof HSI_AUDIT_SCHEMA_VERSION;

// =============================================================================
// COMMON
// =============================================================================

/** Scalar value domain of HS-Core v0. Structured HoloValues are rejected at admission. */
export type HSIScalar = string | number | boolean | null;

export interface HSISourceSpan {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

/** Three-state opacity: absent-in-source is UNKNOWN, never coerced to a default. */
export type HSIOpacity = 'transparent' | 'opaque' | 'unknown';

/** Three-state derived observation access. */
export type HSIAccess = 'visible' | 'blocked' | 'unknown';

// =============================================================================
// HSI-IR DOCUMENT
// =============================================================================

export interface HSIEntity {
  /** Stable id: `entity:<name>` */
  id: string;
  name: string;
  /** Template the entity instantiates (archetype), when declared with `using`. */
  archetype?: string;
  /** Declared role marker (e.g. "agent" | "target" | "barrier") from typed properties. */
  role?: string;
  /** Three-state opacity derived from the typed `opaque` property (absent = unknown). */
  opacity: HSIOpacity;
  /** Scalar components merged template-then-object, later wins. */
  components: Record<string, HSIScalar>;
  /** Spatial placement when declared. */
  position?: [number, number, number];
  scale?: [number, number, number];
  /** Trait names attached to the entity (template + object, deduplicated, sorted). */
  traits: string[];
  sourceSpan?: HSISourceSpan;
}

export interface HSIRelation {
  /** Stable id: `relation:<from>-><to>:<edgeType>` */
  id: string;
  from: string;
  to: string;
  edgeType: string;
  sourceSpan?: HSISourceSpan;
}

export interface HSIStateField {
  /** Stable id: `state:world.<key>` */
  id: string;
  key: string;
  /** Exact declared baseline value. */
  baseline: HSIScalar;
  valueType: 'string' | 'number' | 'boolean' | 'null';
  reactive: boolean;
  sourceSpan?: HSISourceSpan;
}

export interface HSIObservationRule {
  /** Stable id: `obs:<observer>-><observed>` */
  id: string;
  observer: string;
  observed: string;
  /** Derived three-state access verdict. */
  access: HSIAccess;
  /** Entities whose opacity produced the verdict (blockers / unknown panels). */
  mediators: string[];
}

export type HSIEffect = HSIAssignEffect | HSIEmitEffect | HSIBranchEffect;

export interface HSIAssignEffect {
  kind: 'assign';
  /** Stable id: `effect:<handler>#<ordinal>` (ordinal within handler body — declaration order is semantic). */
  id: string;
  target: string;
  operator: '=' | '+=' | '-=' | '*=' | '/=';
  /** Fail-closed lowered expression (expression-ir), never a raw string. */
  value: ExpressionIR;
  sourceSpan?: HSISourceSpan;
}

export interface HSIEmitEffect {
  kind: 'emit';
  id: string;
  event: string;
  sourceSpan?: HSISourceSpan;
}

export interface HSIBranchEffect {
  kind: 'branch';
  id: string;
  condition: ExpressionIR;
  then: HSIEffect[];
  else: HSIEffect[];
  sourceSpan?: HSISourceSpan;
}

export interface HSIEventHandler {
  /** Stable id: `event:<name>` */
  id: string;
  event: string;
  effects: HSIEffect[];
  sourceSpan?: HSISourceSpan;
}

export interface HSIMachineInput {
  /** Stable id: `input:<machine>.<name>` */
  id: string;
  name: string;
  inputType: 'bool' | 'float' | 'int' | 'trigger';
  /** Exact declared default (triggers default to false). */
  baseline: HSIScalar;
}

export interface HSITransition {
  /** Stable id: `transition:<machine>.<from>-><target>#<ordinal>` (ordinal disambiguates parallel edges only). */
  id: string;
  from: string;
  target: string;
  /**
   * Firing priority = declaration ordinal within the machine. Semantic data, NOT
   * derived from canonical id order — so alpha-renaming (which changes id sort
   * order) can never change which of two simultaneously-satisfied guards fires.
   */
  priority: number;
  /** Guard lowered fail-closed to expression-ir over the machine's input slots. */
  guard?: ExpressionIR;
  /** Trigger event that fires this transition (mutually exclusive with guard in v0). */
  event?: string;
  /** Input slots the guard reads — the `requires` edges of the LearningGraph. */
  reads: string[];
  sourceSpan?: HSISourceSpan;
}

export interface HSIStateMachine {
  /** Stable id: `machine:<name>` */
  id: string;
  name: string;
  initialState: string;
  states: string[];
  inputs: HSIMachineInput[];
  transitions: HSITransition[];
  sourceSpan?: HSISourceSpan;
}

export interface HSIPredicate {
  /** Stable id: `invariant:<name>` | `precondition:<name>` | `goal:<name>` */
  id: string;
  name: string;
  kind: 'precondition' | 'invariant' | 'goal';
  /** Fail-closed lowered expression over world state slots. */
  expression: ExpressionIR;
  /** State keys the predicate reads. */
  reads: string[];
  sourceSpan?: HSISourceSpan;
}

export interface HSIIRDocument {
  schemaVersion: HSIIRSchemaVersion;
  kind: 'HSIIR';
  world: {
    name: string;
    /** sha256 of the source text this IR was lowered from. */
    sourceDigest: string;
  };
  entities: HSIEntity[];
  relations: HSIRelation[];
  state: HSIStateField[];
  observationPolicy: HSIObservationRule[];
  eventHandlers: HSIEventHandler[];
  machines: HSIStateMachine[];
  predicates: HSIPredicate[];
  /** Fields HS-Core v0 deliberately does not model — declared, not silently absent. */
  declaredUnknowns: string[];
  provenance: {
    compiler: 'HSIIRCompiler';
    /** Source surface admitted into HSI-IR. Omitted on legacy `.holo` receipts. */
    sourceSurface?: 'holo' | 'hsplus';
    deterministicDigest: string;
  };
}

// =============================================================================
// EXACT TRACE
// =============================================================================

export type HSIScenarioStep =
  | { kind: 'set-input'; machine: string; input: string; value: HSIScalar }
  | { kind: 'fire-trigger'; machine: string; input: string }
  | { kind: 'fire-event'; event: string };

export interface HSITraceEffectRecord {
  sourceId: string;
  target: string;
  before: HSIScalar;
  after: HSIScalar;
}

export interface HSITraceTransitionRecord {
  machine: string;
  transitionId: string;
  from: string;
  to: string;
}

export interface HSITraceStep {
  ordinal: number;
  step: HSIScenarioStep;
  transitions: HSITraceTransitionRecord[];
  effects: HSITraceEffectRecord[];
  emitted: string[];
  invariantViolations: string[];
  /** sha256 over the canonical {state, machineStates} snapshot after the step. */
  stateDigest: string;
}

export interface HSITrace {
  schemaVersion: HSITraceSchemaVersion;
  kind: 'HSITrace';
  worldDigest: string;
  preconditionResults: { id: string; holds: boolean }[];
  initial: {
    state: Record<string, HSIScalar>;
    machineStates: Record<string, string>;
    stateDigest: string;
  };
  steps: HSITraceStep[];
  final: {
    state: Record<string, HSIScalar>;
    machineStates: Record<string, string>;
    stateDigest: string;
  };
  valid: boolean;
  deterministicDigest: string;
}

// =============================================================================
// LEARNING GRAPH
// =============================================================================

export type HSILearningNodeType =
  | 'entity'
  | 'state'
  | 'event'
  | 'observation'
  | 'belief'
  | 'objective'
  | 'action'
  | 'memory';

export type HSILearningEdgeType =
  | 'contains'
  | 'observes'
  | 'affects'
  | 'requires'
  | 'causes'
  | 'permits'
  | 'contradicts'
  | 'precedes'
  | 'refers-to';

export interface HSILearningNode {
  id: string;
  nodeType: HSILearningNodeType;
  /** Exact baseline value where one exists (state fields), else null. */
  baseline: HSIScalar;
  /** Declared unknown/residual markers (e.g. 'opacity' for an unknown barrier). */
  unknowns: string[];
  split: 'train' | 'eval';
  sourceSpan?: HSISourceSpan;
}

export interface HSILearningEdge {
  /** Stable id: `edge:<edgeType>:<from>-><to>` */
  id: string;
  edgeType: HSILearningEdgeType;
  from: string;
  to: string;
  /** Optional typed payload (e.g. access verdict on observes edges). */
  label?: string;
}

export interface HSILearningGraph {
  schemaVersion: HSILearningGraphSchemaVersion;
  kind: 'HSILearningGraph';
  worldDigest: string;
  emittedFrom: string;
  nodes: HSILearningNode[];
  edges: HSILearningEdge[];
  /** Named interventions the audit plane exercises — identity, not results. */
  interventions: string[];
  deterministicDigest: string;
}

// =============================================================================
// AUDIT
// =============================================================================

export type HSIIntervention =
  | { kind: 'set-opacity'; id: string; entity: string; opacity: HSIOpacity }
  | {
      kind: 'set-transition-guard-literal';
      id: string;
      machine: string;
      transitionId: string;
      /** Replacement numeric literal for the guard's right-hand side. */
      value: number;
    };

export interface HSIAuditCase {
  id: string;
  kind:
    | 'admission-empty'
    | 'admission-skewed'
    | 'alpha-rename'
    | 'declaration-reorder'
    | 'counterfactual-intervention'
    | 'regenerate-determinism';
  description: string;
  /** For counterfactual cases: the typed intervention to apply. */
  intervention?: HSIIntervention;
  /** Declared expectation the independent verifier asserts. */
  expectation: string;
}

export interface HSIAuditCheckResult {
  caseId: string;
  status: 'pass' | 'fail';
  detail: string;
}

export interface HSIAuditManifest {
  schemaVersion: HSIAuditSchemaVersion;
  kind: 'HSIAuditManifest';
  worldDigest: string;
  verifier: 'HSIAuditVerifier';
  checks: HSIAuditCheckResult[];
  overall: 'pass' | 'fail';
  deterministicDigest: string;
}

// =============================================================================
// ADMISSION ERRORS
// =============================================================================

/** Fail-closed admission failure: empty, skewed, or out-of-subset input. Named and catchable. */
export class HSIAdmissionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'HSIAdmissionError';
    this.code = code;
  }
}

// =============================================================================
// CANONICAL SERIALIZATION + DIGEST
// =============================================================================

/** Deterministic JSON: sorted object keys, arrays in given (canonical) order. */
export function hsiStableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => hsiStableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${hsiStableStringify(record[key])}`).join(',')}}`;
}

export function hsiSha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(hsiStableStringify(value)).digest('hex')}`;
}

export function hsiSourceTextDigest(source: string): string {
  return `sha256:${createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex')}`;
}
