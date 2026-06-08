/**
 * Runtime integration for @holoscript/plugin-therapy.
 *
 * Bridges the `phq9_screen` trait into a behavioral TraitHandler that the
 * HoloScript runtime actually dispatches (HoloScriptRuntime.registerTrait ->
 * applyDirectives / updateTraits).
 *
 * Before this module the plugin exported the PHQ-9 / GAD-7 / risk solvers
 * (`phq9Score`, …) but nothing invoked a solver THROUGH the runtime — the
 * domain-plugin tier was built-but-dead-wired. This mirrors
 * government-civic-plugin's reference integration (civic_decision): it wires
 * the deterministic PHQ-9 depression-screening solver (`phq9Score`) behind the
 * `phq9_screen` trait so the runtime's directive dispatch can run it. The
 * remaining therapy solvers (gad7Score, riskStratification, …) follow the same
 * registrar shape.
 *
 * CLINICAL DISCLAIMER: PHQ-9 output is DECISION SUPPORT only. All clinical
 * decisions require a qualified mental health professional.
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import {
  phq9Score,
  type LikertResponse,
  type PHQ9Result,
} from './therapysolver';

/** Stable id for this plugin's trait ownership tagging. */
export const THERAPY_PLUGIN_ID = 'therapy' as const;

/** Config carried by an orb's `@phq9_screen` trait directive. */
export interface Phq9ScreenTraitConfig {
  /**
   * The nine PHQ-9 item responses (each 0-3). Required; absence or an invalid
   * count/value emits `phq9_screen_error`.
   */
  responses?: LikertResponse[];
}

/** Summary payload emitted on `phq9_screen_solved`. */
export interface Phq9ScreenSolvedEvent {
  nodeId: string;
  /** PHQ-9 sum of the nine items (0-27). */
  totalScore: number;
  /** Severity band for the total score (none/mild/moderate/moderately-severe/severe). */
  severity: PHQ9Result['severity'];
  /** Item 9 (suicidal-ideation) sub-score (0-3). */
  item9Score: number;
  /** True when the total meets the positive-screen threshold (>=10). */
  positiveScreening: boolean;
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
  onAttach?: (node: unknown, config: Phq9ScreenTraitConfig, context: TraitDispatchContext) => void;
  onUpdate?: (
    node: unknown,
    config: Phq9ScreenTraitConfig,
    context: TraitDispatchContext,
    delta: number,
  ) => void;
}

interface Phq9ScreenNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __phq9Result?: PHQ9Result;
}

/** Run the PHQ-9 solver on the directive config, write the result onto the node, and emit. */
function solveOntoNode(
  node: unknown,
  config: Phq9ScreenTraitConfig | undefined,
  context: TraitDispatchContext,
): void {
  const carrier = node as Phq9ScreenNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';
  const responses = config?.responses;

  if (!responses) {
    context.emit('phq9_screen_error', {
      nodeId,
      error: 'phq9_screen trait requires config.responses (LikertResponse[] of length 9)',
    });
    return;
  }

  try {
    const result = phq9Score(responses);
    carrier.__phq9Result = result;
    carrier.properties = {
      ...(carrier.properties ?? {}),
      phq9TotalScore: result.totalScore,
      phq9Severity: result.severity,
      phq9PositiveScreening: result.positiveScreening,
    };
    const summary: Phq9ScreenSolvedEvent = {
      nodeId,
      totalScore: result.totalScore,
      severity: result.severity,
      item9Score: result.item9Score,
      positiveScreening: result.positiveScreening,
    };
    context.setState?.({ [`phq9_screen:${nodeId}`]: summary });
    context.emit('phq9_screen_solved', summary);
  } catch (error) {
    context.emit('phq9_screen_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Behavioral handler for the therapy `phq9_screen` trait. Runs the
 * deterministic PHQ-9 depression-screening solver whenever an orb carrying the
 * trait is attached (and on each per-frame update), writing the result onto the
 * node and emitting `phq9_screen_solved` / `phq9_screen_error`.
 */
export const phq9ScreenHandler: RuntimeTraitHandler = {
  name: 'phq9_screen',
  onAttach: (node, config, context) => solveOntoNode(node, config, context),
  onUpdate: (node, config, context) => solveOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register therapy behavioral trait handlers into a runtime that exposes
 * `registerTrait(name, handler)` — e.g. `@holoscript/core` HoloScriptRuntime.
 * This is the consumption path the dead-wired tier was missing: after this call
 * the runtime's directive dispatch (applyDirectives / updateTraits) will invoke
 * the PHQ-9 solver for `@phq9_screen` orbs.
 */
export function registerTherapyTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, THERAPY_PLUGIN_ID, [phq9ScreenHandler]);
}
