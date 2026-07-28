/**
 * HSI-IR Stage B — the causal snapshot -> resolver -> action -> mutation -> receipt loop
 * (board task 6mg9, research/2026-07-14_holoscript-native-intelligence-opportunity-EVOLVED.md).
 *
 * Closes ONE end-to-end causal loop over the HS-Core barrier world with NO LLM/provider call:
 *
 *   scene snapshot            capture the observable perception query (agent -> target through a barrier)
 *   -> strict versioned IR    IMPORT Stage A (lowerCompositionToHSIIR) — explicit unknowns + provenance digest
 *   -> containment resolver   resolveContainment over the barrier's imported opacity
 *   -> safe/block/inspect     selectPolicy — never acts confidently over unresolved evidence
 *   -> capability-gated action gateAction via the real HoloScriptCapabilitySemantics (missing capability fails closed)
 *   -> HoloVM mutation        runExactTrace — Stage A's deterministic exact-semantic VM applies the action
 *   -> next-state + receipt   evaluate the goal on the mutated state, emit a digested receipt
 *
 * Design custody (inherited from Stage A, must NOT be re-litigated — see wisdom_hsi-ir-stage-a-shipped):
 *   - Opacity is transparent|opaque|unknown; absent-in-source stays 'unknown', never coerced. The loop
 *     acts on that three-state value directly and abstains (inspect) on 'unknown' rather than confabulating.
 *   - The IR is IMPORTED, never re-authored. Entity opacity, provenance digest, and the exact-trace VM all
 *     come from Stage A. This module only wires resolver -> policy -> gate -> mutation -> receipt.
 *   - HSIContainmentResolution carries the canonical stratum-② resolution contract IMPORTED from
 *     @holoscript/meaning (HoloMeaning; docs/spec/language-architecture.md §3), so the gradeByResolver /
 *     GRPO reward join (task e1x6) stays a no-translation step. The former structural mirror was retired
 *     2026-07-17: meaning lives upstream of both core and the VMs, so no core -> uaal edge is needed.
 *
 * The exact-semantic VM (runExactTrace) is the deterministic mutation plane used here; the ECS/bytecode
 * HoloVM (packages/engine) is the spatial/runtime plane, out of scope for a deterministic no-LLM proof
 * (W.830b: it is barely-wired; the exact-trace reducer is the solid, invariant-checked substrate).
 */

import {
  honestyGate,
  type HonestyDecision,
  type MeaningResolutionStatus,
  type Uncertain,
} from '@holoscript/meaning';
import type { HoloComposition } from '../parser/HoloCompositionTypes';
import { parseHoloStrict } from '../parser/HoloCompositionParser';
import type { Capability } from './identity/CapabilityToken';
import { HoloScriptCapabilitySemantics } from './identity/CapabilityTokenIssuer';
import { runExactTrace } from './HSIExactTrace';
import { HSI_OBSERVATION_MEDIATOR_EDGE, lowerCompositionToHSIIR } from './HSIIRCompiler';
import {
  HSIAdmissionError,
  hsiSha256,
  type HSIIRDocument,
  type HSIOpacity,
  type HSIScalar,
  type HSIScenarioStep,
} from './HSIIRTypes';

export const HSI_CAUSAL_LOOP_SCHEMA_VERSION = 'holoscript.hsi-causal-loop.v0.2.0' as const;
export type HSICausalLoopSchemaVersion = typeof HSI_CAUSAL_LOOP_SCHEMA_VERSION;

/** Resource scheme the capability gate authorizes actions against. */
const HSI_WORLD_RESOURCE_PREFIX = 'holoscript://world/';
const ACTION_CAPABILITY = 'world/traverse';
const INSPECT_CAPABILITY = 'world/inspect';
const HSI_QUERY_INTENT_EDGE = 'seeks';

export type HSIPolicy = 'safe' | 'block' | 'inspect';
export type HSIActionName = 'traverse' | 'hold' | 'inspect';
export type HSICausalOutcome = 'goal-reached' | 'held' | 'inspected' | 'blocked-fail-closed';

/**
 * The observable perception query, bound to the imported IR world. This is the "HoloVM SceneSnapshot"
 * of the loop: a deterministic projection of what the agent perceives about the target through one barrier.
 */
export interface HSISceneSnapshot {
  readonly schemaVersion: HSICausalLoopSchemaVersion;
  readonly kind: 'HSISceneSnapshot';
  readonly worldDigest: string;
  readonly agent: string;
  readonly target: string;
  readonly barrier: string;
  readonly barrierOpacity: HSIOpacity;
  readonly stateBaseline: Record<string, HSIScalar>;
  readonly digest: string;
}

/**
 * Containment/occlusion resolution, carrying the canonical resolution contract from @holoscript/meaning:
 * status is exactly the imported MeaningResolutionStatus; a gap is status:'unresolvable' + reason, never a
 * third enum. 'unknown' opacity resolves to unresolvable/underdetermined (the abstention that drives inspect).
 */
export interface HSIContainmentResolution {
  readonly status: MeaningResolutionStatus;
  readonly occluded: boolean | null;
  readonly occluder: string | null;
  readonly reason: string | null;
}

/** A capability-gated action. The gate is the real HoloScriptCapabilitySemantics.canAccess predicate. */
export interface HSIGatedAction {
  readonly name: HSIActionName;
  readonly event: string | null;
  readonly requiredCapability: Capability | null;
  readonly granted: boolean;
  readonly denial: string | null;
}

export interface HSICausalReceipt {
  readonly schemaVersion: HSICausalLoopSchemaVersion;
  readonly kind: 'HSICausalReceipt';
  readonly worldDigest: string | null;
  readonly snapshotDigest: string | null;
  readonly query: { readonly agent: string; readonly target: string; readonly barrier: string };
  readonly admission: { readonly admitted: boolean; readonly error: string | null };
  readonly resolution: HSIContainmentResolution | null;
  /**
   * The runtime honesty gate's decision over the caller-supplied epistemic prerequisites.
   * `null` = no prerequisites were modeled (a different claim than a `proceed` over `{}`).
   * On `abstain`, `blocking` lists EVERY unknown prerequisite with its typed reason.
   */
  readonly epistemicGate: HonestyDecision | null;
  readonly policy: HSIPolicy;
  readonly action: HSIGatedAction;
  readonly mutation: {
    readonly applied: boolean;
    readonly step: HSIScenarioStep | null;
    readonly traceValid: boolean | null;
  };
  readonly nextState: {
    readonly goalReached: boolean;
    readonly traversals: number;
    readonly inspections: number;
  } | null;
  readonly predicates: ReadonlyArray<{ readonly id: string; readonly holds: boolean }>;
  readonly outcome: HSICausalOutcome;
  readonly failClosed: boolean;
  readonly deterministicDigest: string;
}

export interface HSICausalLoopInput {
  /** Provide either a parsed composition or the source text (parsed fail-closed via parseHoloStrict). */
  readonly composition?: HoloComposition;
  readonly sourceText?: string;
  readonly agent: string;
  readonly target: string;
  readonly barrier: string;
  /** Capabilities the acting principal holds. Missing the action capability fails the loop closed. */
  readonly grantedCapabilities: readonly Capability[];
  /**
   * Named epistemic prerequisites of the action (runtime honesty gate, Wave 5.1 / first-class
   * ignorance stage 3). Each is an `Uncertain` — typically a lowered `@unknown` field
   * (`lowerUnknownField`) or a resolver verdict via `fromResolution`. When ANY is unknown the
   * loop abstains (a confident 'safe' traverse downgrades to 'inspect'); the full decision is
   * recorded in the receipt. Omitting this field means "no prerequisites MODELED" (receipt
   * `epistemicGate: null`) — deliberately distinct from `{}`, "modeled and none blocking".
   */
  readonly epistemicPrerequisites?: Readonly<Record<string, Uncertain<unknown>>>;
}

const SHARED_SEMANTICS = new HoloScriptCapabilitySemantics();

function findEntity(
  ir: HSIIRDocument,
  name: string
): HSIIRDocument['entities'][number] | undefined {
  return ir.entities.find((entity) => entity.name === name);
}

function hasRelation(ir: HSIIRDocument, from: string, to: string, edgeType: string): boolean {
  return ir.relations.some(
    (relation) => relation.from === from && relation.to === to && relation.edgeType === edgeType
  );
}

function projectStateBaseline(ir: HSIIRDocument): Record<string, HSIScalar> {
  const baseline: Record<string, HSIScalar> = {};
  for (const field of ir.state) {
    baseline[field.key] = field.baseline;
  }
  return baseline;
}

/** Capture the deterministic perception snapshot bound to the imported IR world. */
export function captureSnapshot(
  ir: HSIIRDocument,
  agent: string,
  target: string,
  barrier: string
): HSISceneSnapshot {
  const barrierEntity = findEntity(ir, barrier);
  const opacity: HSIOpacity = barrierEntity ? barrierEntity.opacity : 'unknown';
  const withoutDigest = {
    schemaVersion: HSI_CAUSAL_LOOP_SCHEMA_VERSION,
    kind: 'HSISceneSnapshot' as const,
    worldDigest: ir.provenance.deterministicDigest,
    agent,
    target,
    barrier,
    barrierOpacity: opacity,
    stateBaseline: projectStateBaseline(ir),
  };
  return { ...withoutDigest, digest: hsiSha256(withoutDigest) };
}

/**
 * Containment resolver over the imported opacity. Transparent perception is clear (resolved, not occluded);
 * opaque is a definite block (resolved, occluded); unknown is underdetermined (unresolvable — abstain).
 */
export function resolveContainment(snapshot: HSISceneSnapshot): HSIContainmentResolution {
  switch (snapshot.barrierOpacity) {
    case 'transparent':
      return { status: 'resolved', occluded: false, occluder: null, reason: null };
    case 'opaque':
      return { status: 'resolved', occluded: true, occluder: snapshot.barrier, reason: null };
    case 'unknown':
    default:
      return { status: 'unresolvable', occluded: null, occluder: null, reason: 'underdetermined' };
  }
}

/** Map a resolution to a safe/block/inspect policy. Unresolved evidence => inspect, never a confident act. */
export function selectPolicy(resolution: HSIContainmentResolution): HSIPolicy {
  if (resolution.status === 'unresolvable') return 'inspect';
  return resolution.occluded ? 'block' : 'safe';
}

function requiredCapabilityFor(policy: HSIPolicy, worldName: string): Capability | null {
  const resource = `${HSI_WORLD_RESOURCE_PREFIX}${worldName}`;
  if (policy === 'safe') return { with: resource, can: ACTION_CAPABILITY };
  if (policy === 'inspect') return { with: resource, can: INSPECT_CAPABILITY };
  return null; // 'block' -> hold; holding requires no capability.
}

/**
 * Gate the policy's action behind the real capability semantics. A required capability with no matching
 * grant fails closed: granted=false, denial set, and the caller must NOT mutate.
 */
export function gateAction(
  policy: HSIPolicy,
  worldName: string,
  grantedCapabilities: readonly Capability[],
  semantics: HoloScriptCapabilitySemantics = SHARED_SEMANTICS
): HSIGatedAction {
  const name: HSIActionName =
    policy === 'safe' ? 'traverse' : policy === 'inspect' ? 'inspect' : 'hold';
  const event = name === 'traverse' ? 'on_traverse' : name === 'inspect' ? 'on_inspect' : null;
  const requiredCapability = requiredCapabilityFor(policy, worldName);

  if (requiredCapability === null) {
    return { name, event: null, requiredCapability: null, granted: true, denial: null };
  }

  const resource = requiredCapability.with;
  const action = requiredCapability.can;
  const granted = grantedCapabilities.some((cap) => semantics.canAccess(cap, resource, action));
  return {
    name,
    event: granted ? event : null,
    requiredCapability,
    granted,
    denial: granted ? null : `no granted capability authorizes ${action} on ${resource}`,
  };
}

function readNumber(value: HSIScalar | undefined): number {
  return typeof value === 'number' ? value : 0;
}

function failClosedReceipt(
  input: HSICausalLoopInput,
  admissionError: string | null,
  snapshotDigest: string | null,
  worldDigest: string | null,
  resolution: HSIContainmentResolution | null,
  policy: HSIPolicy,
  action: HSIGatedAction,
  epistemicGate: HonestyDecision | null = null
): HSICausalReceipt {
  const withoutDigest = {
    schemaVersion: HSI_CAUSAL_LOOP_SCHEMA_VERSION,
    kind: 'HSICausalReceipt' as const,
    worldDigest,
    snapshotDigest,
    query: { agent: input.agent, target: input.target, barrier: input.barrier },
    admission: { admitted: admissionError === null, error: admissionError },
    resolution,
    epistemicGate,
    policy,
    action,
    mutation: { applied: false, step: null, traceValid: null },
    nextState: null,
    predicates: [] as ReadonlyArray<{ id: string; holds: boolean }>,
    outcome: 'blocked-fail-closed' as const,
    failClosed: true,
  };
  return { ...withoutDigest, deterministicDigest: hsiSha256(withoutDigest) };
}

/**
 * Run one full causal loop over the imported barrier world. Deterministic and fail-closed:
 *   - empty world / admission-skewed => admission throws => fail-closed receipt.
 *   - family-skewed query (roles wrong for agent/target/barrier) => fail-closed receipt.
 *   - relation-skewed query (missing authored seeks/shields edge) => fail-closed receipt.
 *   - missing capability (the action's "handler") => gate denies => fail-closed receipt.
 *   - unresolved evidence (unknown opacity) => inspect, never a confident traverse.
 */
export function runCausalLoop(input: HSICausalLoopInput): HSICausalReceipt {
  // Stage: compose -> IR (import Stage A). Admission failures fail closed.
  let ir: HSIIRDocument;
  try {
    const composition = input.composition ?? parseHoloStrict(input.sourceText ?? '');
    ir = lowerCompositionToHSIIR(
      composition,
      input.sourceText ? { sourceText: input.sourceText } : {}
    );
  } catch (error) {
    const message =
      error instanceof HSIAdmissionError || error instanceof Error ? error.message : String(error);
    const emptyAction: HSIGatedAction = {
      name: 'hold',
      event: null,
      requiredCapability: null,
      granted: false,
      denial: message,
    };
    return failClosedReceipt(input, message, null, null, null, 'block', emptyAction);
  }

  return runCausalLoopFromIR(ir, input);
}

/**
 * Run the loop from an already-imported IR. Separated so an IR-edge counterfactual
 * (withOpacityCounterfactual) can be run against a modified copy of the same admitted world.
 */
export function runCausalLoopFromIR(
  ir: HSIIRDocument,
  input: HSICausalLoopInput
): HSICausalReceipt {
  const snapshot = captureSnapshot(ir, input.agent, input.target, input.barrier);

  // Family-skew guard: the perception query must reference the right role families.
  const agentEntity = findEntity(ir, input.agent);
  const targetEntity = findEntity(ir, input.target);
  const barrierEntity = findEntity(ir, input.barrier);
  const roleSkewed =
    !agentEntity ||
    agentEntity.role !== 'agent' ||
    !targetEntity ||
    !barrierEntity ||
    barrierEntity.role !== 'barrier';
  if (roleSkewed) {
    const emptyAction: HSIGatedAction = {
      name: 'hold',
      event: null,
      requiredCapability: null,
      granted: false,
      denial: 'family-skewed query: agent/target/barrier roles do not resolve',
    };
    return failClosedReceipt(
      input,
      'family-skewed-query',
      snapshot.digest,
      ir.provenance.deterministicDigest,
      null,
      'block',
      emptyAction
    );
  }

  const requiredRelations = [
    {
      from: input.agent,
      to: input.target,
      edgeType: HSI_QUERY_INTENT_EDGE,
    },
    {
      from: input.barrier,
      to: input.target,
      edgeType: HSI_OBSERVATION_MEDIATOR_EDGE,
    },
  ] as const;
  const missingRelation = requiredRelations.find(
    (relation) => !hasRelation(ir, relation.from, relation.to, relation.edgeType)
  );
  if (missingRelation) {
    const denial =
      `unbound query relation: missing ${missingRelation.from} ` +
      `-[${missingRelation.edgeType}]-> ${missingRelation.to}`;
    const emptyAction: HSIGatedAction = {
      name: 'hold',
      event: null,
      requiredCapability: null,
      granted: false,
      denial,
    };
    return failClosedReceipt(
      input,
      'unbound-query-relation',
      snapshot.digest,
      ir.provenance.deterministicDigest,
      null,
      'block',
      emptyAction
    );
  }

  const resolution = resolveContainment(snapshot);
  const basePolicy = selectPolicy(resolution);

  // Stage: runtime honesty gate (Wave 5.1) — the N-field generalization of selectPolicy's
  // unresolvable=>inspect rule. Caller-supplied epistemic prerequisites (lowered @unknown fields,
  // resolver verdicts via fromResolution) must ALL be known before a confident act; any unknown
  // downgrades a 'safe' traverse to 'inspect'. The gate only ever makes the loop MORE cautious:
  // 'block' and 'inspect' stay as they are (already non-committal), and abstention is honest
  // caution, not a fail-closed fault — mirroring the existing unknown-opacity semantics.
  const epistemicGate: HonestyDecision | null =
    input.epistemicPrerequisites !== undefined ? honestyGate(input.epistemicPrerequisites) : null;
  const policy: HSIPolicy =
    epistemicGate?.decision === 'abstain' && basePolicy === 'safe' ? 'inspect' : basePolicy;

  const worldName = ir.world.name;
  const action = gateAction(policy, worldName, input.grantedCapabilities);

  // A denied action (missing capability "handler") fails closed: no mutation.
  if (!action.granted) {
    return failClosedReceipt(
      input,
      null,
      snapshot.digest,
      ir.provenance.deterministicDigest,
      resolution,
      policy,
      action,
      epistemicGate
    );
  }

  // Stage: capability-gated action -> HoloVM (exact-semantic) mutation -> next state.
  const step: HSIScenarioStep | null = action.event
    ? { kind: 'fire-event', event: action.event }
    : null;
  const trace = runExactTrace(ir, step ? [step] : []);
  const finalState = trace.final.state;
  const nextState = {
    goalReached: finalState.goalReached === true,
    traversals: readNumber(finalState.traversals),
    inspections: readNumber(finalState.inspections),
  };
  const predicates = trace.preconditionResults.map((p) => ({ id: p.id, holds: p.holds }));

  let outcome: HSICausalOutcome;
  if (action.name === 'traverse') outcome = nextState.goalReached ? 'goal-reached' : 'held';
  else if (action.name === 'inspect') outcome = 'inspected';
  else outcome = 'held';

  const withoutDigest = {
    schemaVersion: HSI_CAUSAL_LOOP_SCHEMA_VERSION,
    kind: 'HSICausalReceipt' as const,
    worldDigest: ir.provenance.deterministicDigest,
    snapshotDigest: snapshot.digest,
    query: { agent: input.agent, target: input.target, barrier: input.barrier },
    admission: { admitted: true, error: null },
    resolution,
    epistemicGate,
    policy,
    action,
    mutation: { applied: step !== null, step, traceValid: trace.valid },
    nextState,
    predicates,
    outcome,
    failClosed: false,
  };
  return { ...withoutDigest, deterministicDigest: hsiSha256(withoutDigest) };
}

/**
 * Apply a single IR-edge counterfactual: flip one entity's opacity in an imported IR and return the
 * modified copy (structuredClone — never mutate the caller's IR). Used to prove one edge predictably
 * flips action/outcome. This is a first-class Stage-A intervention ('intervention:flip-opacity').
 */
export function withOpacityCounterfactual(
  ir: HSIIRDocument,
  entityName: string,
  opacity: HSIOpacity
): HSIIRDocument {
  const clone = structuredClone(ir) as HSIIRDocument;
  const entity = clone.entities.find((e) => e.name === entityName);
  if (!entity) {
    throw new HSIAdmissionError(
      'unknown-entity',
      `counterfactual target "${entityName}" not in world`
    );
  }
  (entity as { opacity: HSIOpacity }).opacity = opacity;
  return clone;
}

// ---------------------------------------------------------------------------
// Baselines (acceptance clause 4): the gap-aware loop vs two ablations, so the
// abstention win is measurable. An action is INVALID when it traverses a barrier
// whose perception is NOT established (opaque or unknown opacity).
// ---------------------------------------------------------------------------

export type BaselineKind = 'gap-aware-loop' | 'direct-policy-text' | 'same-fields-json';

export interface BaselineDecision {
  readonly barrier: string;
  readonly opacity: HSIOpacity;
  readonly action: HSIActionName;
  readonly invalid: boolean;
}

export interface BaselineResult {
  readonly kind: BaselineKind;
  readonly decisions: readonly BaselineDecision[];
  readonly invalidActionRate: number;
  readonly latencyMsPerDecision: number;
}

function isInvalidAction(action: HSIActionName, opacity: HSIOpacity): boolean {
  return action === 'traverse' && opacity !== 'transparent';
}

/** Ablation A: decides purely on the barrier NAME string — no gap awareness (confabulates on Veil). */
function directPolicyTextAction(snapshot: HSISceneSnapshot): HSIActionName {
  const name = snapshot.barrier.toLowerCase();
  if (name.includes('glass')) return 'traverse';
  if (name.includes('stone')) return 'hold';
  return 'traverse';
}

/** Ablation B: reads the same structured opacity field but coerces unknown => transparent (confabulation). */
function sameFieldsJsonAction(snapshot: HSISceneSnapshot): HSIActionName {
  return snapshot.barrierOpacity === 'opaque' ? 'hold' : 'traverse';
}

/** Gap-aware reference policy: exactly the loop's resolver -> policy -> action, minus the capability gate. */
function gapAwareAction(snapshot: HSISceneSnapshot): HSIActionName {
  const policy = selectPolicy(resolveContainment(snapshot));
  return policy === 'safe' ? 'traverse' : policy === 'inspect' ? 'inspect' : 'hold';
}

/**
 * Record baselines across a barrier set with per-decision latency + invalid-action rate.
 * `nowMs` is injectable so callers can supply a monotonic clock (performance.now) without this module
 * importing a wall clock — determinism of the loop receipt never depends on it.
 */
export function benchmarkBaselines(
  ir: HSIIRDocument,
  agent: string,
  target: string,
  barriers: readonly string[],
  nowMs: () => number,
  iterations = 200
): BaselineResult[] {
  const snapshots = barriers.map((barrier) => captureSnapshot(ir, agent, target, barrier));
  const policies: Array<{ kind: BaselineKind; fn: (s: HSISceneSnapshot) => HSIActionName }> = [
    { kind: 'gap-aware-loop', fn: gapAwareAction },
    { kind: 'direct-policy-text', fn: directPolicyTextAction },
    { kind: 'same-fields-json', fn: sameFieldsJsonAction },
  ];

  return policies.map(({ kind, fn }) => {
    const start = nowMs();
    for (let i = 0; i < iterations; i += 1) {
      for (const snapshot of snapshots) fn(snapshot);
    }
    const elapsed = nowMs() - start;
    const decisions: BaselineDecision[] = snapshots.map((snapshot) => {
      const action = fn(snapshot);
      return {
        barrier: snapshot.barrier,
        opacity: snapshot.barrierOpacity,
        action,
        invalid: isInvalidAction(action, snapshot.barrierOpacity),
      };
    });
    const invalidCount = decisions.filter((d) => d.invalid).length;
    return {
      kind,
      decisions,
      invalidActionRate: decisions.length === 0 ? 0 : invalidCount / decisions.length,
      latencyMsPerDecision:
        iterations * snapshots.length === 0 ? 0 : elapsed / (iterations * snapshots.length),
    };
  });
}
