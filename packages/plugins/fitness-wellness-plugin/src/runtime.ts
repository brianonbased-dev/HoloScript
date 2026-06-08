/**
 * Runtime integration for @holoscript/plugin-fitness-wellness.
 *
 * Bridges the previously dead-wired `one_rep_max` trait into a behavioral
 * TraitHandler that the HoloScript runtime actually dispatches
 * (HoloScriptRuntime.registerTrait -> applyDirectives / updateTraits).
 *
 * Before this module the plugin declared trait NAMES only (pluginMeta.traits)
 * and exported the fitness solvers (oneRepMax, heartRateZones, calorieBurn, …),
 * but nothing invoked a solver THROUGH the runtime — the whole domain-plugin
 * tier was built-but-dead-wired. This mirrors government-civic-plugin's
 * reference integration (civic_decision): it wires the deterministic
 * 1-rep-max prediction solver (`oneRepMax`) behind the `one_rep_max` trait so
 * the runtime's directive dispatch can run it. The remaining fitness traits
 * follow the same registrar shape.
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import { oneRepMax, type OneRepMaxResult } from './fitnesssolver';

/** Stable id for this plugin's trait ownership tagging. */
export const FITNESS_WELLNESS_PLUGIN_ID = 'fitness-wellness' as const;

/** Config carried by an orb's `@one_rep_max` trait directive. */
export interface OneRepMaxTraitConfig {
  /** Measured weight lifted (kg). Required; absence/invalid emits `one_rep_max_error`. */
  weightKg?: number;
  /** Reps performed at that weight. Required positive integer; absence/invalid emits error. */
  reps?: number;
}

/** Summary payload emitted on `one_rep_max_solved`. */
export interface OneRepMaxSolvedEvent {
  nodeId: string;
  /** Measured weight echoed back. */
  weightKg: number;
  /** Reps echoed back. */
  reps: number;
  /** Epley-formula predicted 1RM (kg). */
  epley: number;
  /** Brzycki-formula predicted 1RM (kg). */
  brzycki: number;
  /** Lander-formula predicted 1RM (kg). */
  lander: number;
  /** Lombardi-formula predicted 1RM (kg). */
  lombardi: number;
  /** Average of all four formula predictions (kg). */
  average: number;
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
  onAttach?: (node: unknown, config: OneRepMaxTraitConfig, context: TraitDispatchContext) => void;
  onUpdate?: (
    node: unknown,
    config: OneRepMaxTraitConfig,
    context: TraitDispatchContext,
    delta: number,
  ) => void;
}

interface OneRepMaxNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __oneRepMaxResult?: OneRepMaxResult;
}

/** Run the 1RM solver on the directive config, write the result onto the node, and emit. */
function solveOntoNode(
  node: unknown,
  config: OneRepMaxTraitConfig | undefined,
  context: TraitDispatchContext,
): void {
  const carrier = node as OneRepMaxNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';
  const weightKg = config?.weightKg;
  const reps = config?.reps;

  if (typeof weightKg !== 'number' || typeof reps !== 'number') {
    context.emit('one_rep_max_error', {
      nodeId,
      error:
        'one_rep_max trait requires config.weightKg (number) and config.reps (number)',
    });
    return;
  }

  try {
    const result = oneRepMax(weightKg, reps);
    carrier.__oneRepMaxResult = result;
    carrier.properties = {
      ...(carrier.properties ?? {}),
      oneRepMaxEpley: result.epley,
      oneRepMaxAverage: result.average,
    };
    const summary: OneRepMaxSolvedEvent = {
      nodeId,
      weightKg: result.weightKg,
      reps: result.reps,
      epley: result.epley,
      brzycki: result.brzycki,
      lander: result.lander,
      lombardi: result.lombardi,
      average: result.average,
    };
    context.setState?.({ [`one_rep_max:${nodeId}`]: summary });
    context.emit('one_rep_max_solved', summary);
  } catch (error) {
    context.emit('one_rep_max_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Behavioral handler for the fitness-wellness `one_rep_max` trait. Runs the
 * deterministic 1-rep-max prediction solver whenever an orb carrying the trait
 * is attached (and on each per-frame update), writing the result onto the node
 * and emitting `one_rep_max_solved` / `one_rep_max_error`.
 */
export const oneRepMaxHandler: RuntimeTraitHandler = {
  name: 'one_rep_max',
  onAttach: (node, config, context) => solveOntoNode(node, config, context),
  onUpdate: (node, config, context) => solveOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register fitness-wellness behavioral trait handlers into a runtime that
 * exposes `registerTrait(name, handler)` — e.g. `@holoscript/core`
 * HoloScriptRuntime. This is the consumption path the dead-wired tier was
 * missing: after this call the runtime's directive dispatch (applyDirectives /
 * updateTraits) will invoke the 1RM solver for `@one_rep_max` orbs.
 */
export function registerFitnessWellnessTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, FITNESS_WELLNESS_PLUGIN_ID, [oneRepMaxHandler]);
}
