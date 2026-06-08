/**
 * Runtime integration for @holoscript/plugin-government-civic.
 *
 * Bridges the previously dead-wired `civic_decision` trait into a behavioral
 * TraitHandler that the HoloScript runtime actually dispatches
 * (HoloScriptRuntime.registerTrait -> applyDirectives / updateTraits).
 *
 * Before this module the plugin declared trait NAMES only (pluginMeta.traits)
 * and exported the civic solvers (mcdaAnalysis, quorumCalculator, …), but
 * nothing invoked a solver THROUGH the runtime — the whole domain-plugin tier
 * was built-but-dead-wired. This mirrors energy-grid-plugin's reference
 * integration (power_flow): it wires the deterministic TOPSIS multi-criteria
 * decision solver (`mcdaAnalysis`) behind the `civic_decision` trait so the
 * runtime's directive dispatch can run it. The remaining civic traits follow
 * the same registrar shape.
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import {
  mcdaAnalysis,
  type MCDACandidate,
  type MCDACriterion,
  type MCDAResult,
} from './civicsolver';

/** Stable id for this plugin's trait ownership tagging. */
export const GOVERNMENT_CIVIC_PLUGIN_ID = 'government-civic' as const;

/** Config carried by an orb's `@civic_decision` trait directive. */
export interface CivicDecisionTraitConfig {
  /** Decision alternatives to rank. Required; absence emits `civic_decision_error`. */
  candidates?: MCDACandidate[];
  /** Weighted criteria (benefit/cost) the candidates are scored against. Required. */
  criteria?: MCDACriterion[];
}

/** Summary payload emitted on `civic_decision_solved`. */
export interface CivicDecisionSolvedEvent {
  nodeId: string;
  /** Winning candidate id by TOPSIS closeness coefficient. */
  winner: string;
  /** Full ranked decision matrix. */
  ranking: MCDAResult['ranking'];
  /** Candidate count evaluated. */
  candidateCount: number;
  /** Criteria count applied. */
  criterionCount: number;
}

/**
 * Structural view of the runtime trait-handler contract. Matches
 * `@holoscript/core` TraitTypes.TraitHandler at the call sites the runtime
 * actually uses (onAttach / onUpdate receive the node, the directive config,
 * and a context exposing `emit`). Declared locally so the plugin stays
 * decoupled from core's full trait surface.
 */
export interface TraitDispatchContext {
  emit: (event: string, payload?: unknown) => void;
  setState?: (updates: Record<string, unknown>) => void;
}

export interface RuntimeTraitHandler {
  name: string;
  onAttach?: (
    node: unknown,
    config: CivicDecisionTraitConfig,
    context: TraitDispatchContext
  ) => void;
  onUpdate?: (
    node: unknown,
    config: CivicDecisionTraitConfig,
    context: TraitDispatchContext,
    delta: number
  ) => void;
}

interface CivicDecisionNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __civicDecisionResult?: MCDAResult;
}

/** Run the MCDA solver on the directive config, write the result onto the node, and emit. */
function solveOntoNode(
  node: unknown,
  config: CivicDecisionTraitConfig | undefined,
  context: TraitDispatchContext
): void {
  const carrier = node as CivicDecisionNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';
  const candidates = config?.candidates;
  const criteria = config?.criteria;

  if (!candidates || !criteria) {
    context.emit('civic_decision_error', {
      nodeId,
      error:
        'civic_decision trait requires config.candidates (MCDACandidate[]) and config.criteria (MCDACriterion[])',
    });
    return;
  }

  try {
    const result = mcdaAnalysis(candidates, criteria);
    carrier.__civicDecisionResult = result;
    carrier.properties = {
      ...(carrier.properties ?? {}),
      civicDecisionWinner: result.winner,
      civicDecisionCandidateCount: result.ranking.length,
    };
    const summary: CivicDecisionSolvedEvent = {
      nodeId,
      winner: result.winner,
      ranking: result.ranking,
      candidateCount: candidates.length,
      criterionCount: criteria.length,
    };
    context.setState?.({ [`civic_decision:${nodeId}`]: summary });
    context.emit('civic_decision_solved', summary);
  } catch (error) {
    context.emit('civic_decision_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Behavioral handler for the government-civic `civic_decision` trait. Runs the
 * deterministic TOPSIS multi-criteria decision solver whenever an orb carrying
 * the trait is attached (and on each per-frame update), writing the result onto
 * the node and emitting `civic_decision_solved` / `civic_decision_error`.
 */
export const civicDecisionHandler: RuntimeTraitHandler = {
  name: 'civic_decision',
  onAttach: (node, config, context) => solveOntoNode(node, config, context),
  onUpdate: (node, config, context) => solveOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register government-civic behavioral trait handlers into a runtime that
 * exposes `registerTrait(name, handler)` — e.g. `@holoscript/core`
 * HoloScriptRuntime. This is the consumption path the dead-wired tier was
 * missing: after this call the runtime's directive dispatch (applyDirectives /
 * updateTraits) will invoke the civic MCDA solver for `@civic_decision` orbs.
 */
export function registerGovernmentCivicTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, GOVERNMENT_CIVIC_PLUGIN_ID, [civicDecisionHandler]);
}
