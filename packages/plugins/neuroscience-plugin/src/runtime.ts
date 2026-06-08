/**
 * Runtime integration for @holoscript/plugin-neuroscience.
 *
 * Bridges the previously dead-wired `lif_neuron` trait into a behavioral
 * TraitHandler that the HoloScript runtime actually dispatches
 * (HoloScriptRuntime.registerTrait -> applyDirectives / updateTraits).
 *
 * Before this module the plugin declared trait NAMES only (pluginMeta.traits)
 * and exported the neuro solvers (hodgkinHuxley, wilsonCowan, lifNeuron, …),
 * but nothing invoked a solver THROUGH the runtime — the whole domain-plugin
 * tier was built-but-dead-wired. This mirrors government-civic-plugin's
 * reference integration (civic_decision): it wires the deterministic Leaky
 * Integrate-and-Fire neuron solver (`lifNeuron`) behind the `lif_neuron` trait
 * so the runtime's directive dispatch can run it. The remaining neuro traits
 * follow the same registrar shape.
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import { lifNeuron, type LIFParams, type LIFResult } from './neurosolver';

/** Stable id for this plugin's trait ownership tagging. */
export const NEUROSCIENCE_PLUGIN_ID = 'neuroscience' as const;

/**
 * Config carried by an orb's `@lif_neuron` trait directive. Mirrors the
 * solver's `LIFParams`; `Iapp` (the applied/driving current) is required —
 * its absence emits `lif_neuron_error` rather than silently running the
 * solver's default current.
 */
export interface LifNeuronTraitConfig {
  /** Applied current in units of mV/ms. Required; absence emits `lif_neuron_error`. */
  Iapp?: number;
  /** Membrane time constant ms (default 20). */
  tauM?: number;
  /** Resting potential mV (default -65). */
  Vrest?: number;
  /** Threshold mV (default -50). */
  Vthresh?: number;
  /** Reset potential mV (default -65). */
  Vreset?: number;
  /** Refractory period ms (default 2). */
  tauRef?: number;
  /** Simulation duration ms (default 200). */
  durationMs?: number;
  /** Time step ms (default 0.1). */
  dtMs?: number;
}

/** Summary payload emitted on `lif_neuron_solved`. */
export interface LifNeuronSolvedEvent {
  nodeId: string;
  /** Number of spikes fired over the simulation window. */
  spikeCount: number;
  /** Mean firing rate Hz. */
  firingRateHz: number;
  /** Final membrane voltage mV at the last sampled step. */
  finalVoltageMv: number;
  /** Theoretical integrate-to-threshold rate Hz (null when sub-threshold). */
  theoreticalRateHz: number | null;
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
  onAttach?: (node: unknown, config: LifNeuronTraitConfig, context: TraitDispatchContext) => void;
  onUpdate?: (
    node: unknown,
    config: LifNeuronTraitConfig,
    context: TraitDispatchContext,
    delta: number,
  ) => void;
}

interface LifNeuronNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __lifNeuronResult?: LIFResult;
}

/** Run the LIF solver on the directive config, write the result onto the node, and emit. */
function solveOntoNode(
  node: unknown,
  config: LifNeuronTraitConfig | undefined,
  context: TraitDispatchContext,
): void {
  const carrier = node as LifNeuronNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';
  const Iapp = config?.Iapp;

  if (typeof Iapp !== 'number' || !Number.isFinite(Iapp)) {
    context.emit('lif_neuron_error', {
      nodeId,
      error:
        'lif_neuron trait requires config.Iapp (applied current, mV/ms) as a finite number',
    });
    return;
  }

  try {
    const params: LIFParams = {
      Iapp,
      tauM: config?.tauM,
      Vrest: config?.Vrest,
      Vthresh: config?.Vthresh,
      Vreset: config?.Vreset,
      tauRef: config?.tauRef,
      durationMs: config?.durationMs,
      dtMs: config?.dtMs,
    };
    const result = lifNeuron(params);
    carrier.__lifNeuronResult = result;
    const finalVoltageMv = result.voltagesMv[result.voltagesMv.length - 1];
    carrier.properties = {
      ...(carrier.properties ?? {}),
      lifNeuronSpikeCount: result.spikeTimes.length,
      lifNeuronFiringRateHz: result.firingRateHz,
      lifNeuronFinalVoltageMv: finalVoltageMv,
    };
    const summary: LifNeuronSolvedEvent = {
      nodeId,
      spikeCount: result.spikeTimes.length,
      firingRateHz: result.firingRateHz,
      finalVoltageMv,
      theoreticalRateHz: result.theoreticalRateHz,
    };
    context.setState?.({ [`lif_neuron:${nodeId}`]: summary });
    context.emit('lif_neuron_solved', summary);
  } catch (error) {
    context.emit('lif_neuron_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Behavioral handler for the neuroscience `lif_neuron` trait. Runs the
 * deterministic Leaky Integrate-and-Fire neuron solver whenever an orb carrying
 * the trait is attached (and on each per-frame update), writing the result onto
 * the node and emitting `lif_neuron_solved` / `lif_neuron_error`.
 */
export const lifNeuronHandler: RuntimeTraitHandler = {
  name: 'lif_neuron',
  onAttach: (node, config, context) => solveOntoNode(node, config, context),
  onUpdate: (node, config, context) => solveOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register neuroscience behavioral trait handlers into a runtime that exposes
 * `registerTrait(name, handler)` — e.g. `@holoscript/core` HoloScriptRuntime.
 * This is the consumption path the dead-wired tier was missing: after this call
 * the runtime's directive dispatch (applyDirectives / updateTraits) will invoke
 * the LIF solver for `@lif_neuron` orbs.
 */
export function registerNeuroscienceTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, NEUROSCIENCE_PLUGIN_ID, [lifNeuronHandler]);
}
