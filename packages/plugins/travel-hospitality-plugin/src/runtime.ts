/**
 * Runtime integration for @holoscript/plugin-travel-hospitality.
 *
 * Bridges the previously dead-wired `revpar` trait into a behavioral
 * TraitHandler that the HoloScript runtime actually dispatches
 * (HoloScriptRuntime.registerTrait -> applyDirectives / updateTraits).
 *
 * Before this module the plugin declared trait NAMES only (pluginMeta.traits)
 * and exported the revenue-management solvers (revparAnalysis,
 * emsrYieldManagement, …), but nothing invoked a solver THROUGH the runtime —
 * the whole domain-plugin tier was built-but-dead-wired. This mirrors
 * government-civic-plugin's reference integration (civic_decision): it wires the
 * deterministic RevPAR analytic solver (`revparAnalysis`) behind the `revpar`
 * trait so the runtime's directive dispatch can run it. The remaining
 * travel-hospitality traits follow the same registrar shape.
 *
 * RevPAR (Revenue Per Available Room) = Room Revenue / Available Room-nights,
 * equivalently ADR × Occupancy (revparAnalysis computes both and they agree).
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import { revparAnalysis, type RevPARResult } from './revenuemanagement';

/** Stable id for this plugin's trait ownership tagging. */
export const TRAVEL_HOSPITALITY_PLUGIN_ID = 'travel-hospitality' as const;

/** Config carried by an orb's `@revpar` trait directive. */
export interface RevparTraitConfig {
  /** Rooms available for the period. Required; absence/invalid emits `revpar_error`. */
  availableRooms?: number;
  /** Rooms occupied for the period. Required. */
  occupiedRooms?: number;
  /** Total room revenue for the period ($). Required. */
  totalRevenue?: number;
}

/** Summary payload emitted on `revpar_solved`. */
export interface RevparSolvedEvent {
  nodeId: string;
  /** Revenue Per Available Room = ADR × occupancy ($). */
  revpar: number;
  /** Average Daily Rate ($). */
  adr: number;
  /** Occupancy rate [0,1]. */
  occupancyRate: number;
  /** Rooms available evaluated. */
  availableRooms: number;
  /** Rooms occupied evaluated. */
  occupiedRooms: number;
  /** Total room revenue evaluated ($). */
  totalRevenue: number;
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
  onAttach?: (node: unknown, config: RevparTraitConfig, context: TraitDispatchContext) => void;
  onUpdate?: (
    node: unknown,
    config: RevparTraitConfig,
    context: TraitDispatchContext,
    delta: number,
  ) => void;
}

interface RevparNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __revparResult?: RevPARResult;
}

/** Run the RevPAR solver on the directive config, write the result onto the node, and emit. */
function solveOntoNode(
  node: unknown,
  config: RevparTraitConfig | undefined,
  context: TraitDispatchContext,
): void {
  const carrier = node as RevparNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';
  const availableRooms = config?.availableRooms;
  const occupiedRooms = config?.occupiedRooms;
  const totalRevenue = config?.totalRevenue;

  if (
    typeof availableRooms !== 'number' ||
    typeof occupiedRooms !== 'number' ||
    typeof totalRevenue !== 'number'
  ) {
    context.emit('revpar_error', {
      nodeId,
      error:
        'revpar trait requires numeric config.availableRooms, config.occupiedRooms, and config.totalRevenue',
    });
    return;
  }

  try {
    const result = revparAnalysis(availableRooms, occupiedRooms, totalRevenue);
    carrier.__revparResult = result;
    carrier.properties = {
      ...(carrier.properties ?? {}),
      revpar: result.revpar,
      revparAdr: result.adr,
      revparOccupancyRate: result.occupancyRate,
    };
    const summary: RevparSolvedEvent = {
      nodeId,
      revpar: result.revpar,
      adr: result.adr,
      occupancyRate: result.occupancyRate,
      availableRooms: result.availableRooms,
      occupiedRooms: result.occupiedRooms,
      totalRevenue: result.totalRevenue,
    };
    context.setState?.({ [`revpar:${nodeId}`]: summary });
    context.emit('revpar_solved', summary);
  } catch (error) {
    context.emit('revpar_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Behavioral handler for the travel-hospitality `revpar` trait. Runs the
 * deterministic RevPAR analytic solver whenever an orb carrying the trait is
 * attached (and on each per-frame update), writing the result onto the node and
 * emitting `revpar_solved` / `revpar_error`.
 */
export const revparHandler: RuntimeTraitHandler = {
  name: 'revpar',
  onAttach: (node, config, context) => solveOntoNode(node, config, context),
  onUpdate: (node, config, context) => solveOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register travel-hospitality behavioral trait handlers into a runtime that
 * exposes `registerTrait(name, handler)` — e.g. `@holoscript/core`
 * HoloScriptRuntime. This is the consumption path the dead-wired tier was
 * missing: after this call the runtime's directive dispatch (applyDirectives /
 * updateTraits) will invoke the RevPAR solver for `@revpar` orbs.
 */
export function registerTravelHospitalityTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, TRAVEL_HOSPITALITY_PLUGIN_ID, [revparHandler]);
}
