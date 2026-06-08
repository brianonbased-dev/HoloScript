/**
 * Runtime integration for @holoscript/energy-grid-plugin.
 *
 * Bridges the previously dead-wired `power_flow` trait into a behavioral
 * TraitHandler that the HoloScript runtime actually dispatches
 * (HoloScriptRuntime.registerTrait -> applyDirectives / updateTraits).
 *
 * Before this module the plugin declared trait NAMES only
 * (ENERGY_GRID_TRAITS) and exported `solveDCPowerFlow`, but nothing invoked
 * the solver THROUGH the runtime — the whole domain-plugin tier was
 * built-but-dead-wired (deep-ratchet 2026-06-07, task_1780878631657_j63f).
 * This is PATH step 2: the reference integration proving the tier can be
 * consumed. The remaining ENERGY_GRID_TRAITS and the rest of the tier follow
 * the same registrar shape once the architecture clears /premortem (PATH 3).
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import {
  ENERGY_GRID_PLUGIN_ID,
  solveDCPowerFlow,
  type DCPowerFlowResult,
  type EnergyGridModel,
} from './index';

/** Config carried by an orb's `@power_flow` trait directive. */
export interface PowerFlowTraitConfig {
  /** The grid to solve. Required; absence emits `power_flow_error`. */
  model?: EnergyGridModel;
  /** Optional overload tolerance forwarded to `solveDCPowerFlow`. */
  overloadToleranceRatio?: number;
}

/** Summary payload emitted on `power_flow_solved`. */
export interface PowerFlowSolvedEvent {
  nodeId: string;
  converged: boolean;
  slackBusId: string;
  lineFlowsMw: Record<string, number>;
  lineLoadingRatio: Record<string, number>;
  overloadedLineIds: string[];
  estimatedLossMw: number;
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
  onAttach?: (node: unknown, config: PowerFlowTraitConfig, context: TraitDispatchContext) => void;
  onUpdate?: (
    node: unknown,
    config: PowerFlowTraitConfig,
    context: TraitDispatchContext,
    delta: number,
  ) => void;
}

interface PowerFlowNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __powerFlowResult?: DCPowerFlowResult;
}

/** Solve the grid in `config.model`, write the result onto the node, and emit. */
function solveOntoNode(
  node: unknown,
  config: PowerFlowTraitConfig | undefined,
  context: TraitDispatchContext,
): void {
  const carrier = node as PowerFlowNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';
  const model = config?.model;

  if (!model) {
    context.emit('power_flow_error', {
      nodeId,
      error: 'power_flow trait requires config.model (EnergyGridModel)',
    });
    return;
  }

  try {
    const result = solveDCPowerFlow(model, {
      overloadToleranceRatio: config?.overloadToleranceRatio,
    });
    carrier.__powerFlowResult = result;
    carrier.properties = {
      ...(carrier.properties ?? {}),
      powerFlowConverged: result.converged,
      slackBusId: result.slackBusId,
      overloadCount: result.overloadedLineIds.length,
    };
    const summary: PowerFlowSolvedEvent = {
      nodeId,
      converged: result.converged,
      slackBusId: result.slackBusId,
      lineFlowsMw: result.lineFlowsMw,
      lineLoadingRatio: result.lineLoadingRatio,
      overloadedLineIds: result.overloadedLineIds,
      estimatedLossMw: result.estimatedLossMw,
    };
    context.setState?.({ [`power_flow:${nodeId}`]: summary });
    context.emit('power_flow_solved', summary);
  } catch (error) {
    context.emit('power_flow_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Behavioral handler for the energy-grid `power_flow` trait. Runs the
 * deterministic DC power-flow solver whenever an orb carrying the trait is
 * attached (and on each per-frame update), writing the result onto the node
 * and emitting `power_flow_solved` / `power_flow_error`.
 */
export const powerFlowHandler: RuntimeTraitHandler = {
  name: 'power_flow',
  onAttach: (node, config, context) => solveOntoNode(node, config, context),
  onUpdate: (node, config, context) => solveOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register energy-grid behavioral trait handlers into a runtime that exposes
 * `registerTrait(name, handler)` — e.g. `@holoscript/core` HoloScriptRuntime.
 * This is the consumption path the dead-wired tier was missing: after this
 * call the runtime's directive dispatch (applyDirectives / updateTraits) will
 * invoke the energy-grid solver for `@power_flow` orbs.
 */
export function registerEnergyGridTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, ENERGY_GRID_PLUGIN_ID, [powerFlowHandler]);
}
