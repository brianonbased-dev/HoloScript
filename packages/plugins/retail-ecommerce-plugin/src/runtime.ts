/**
 * Runtime integration for @holoscript/plugin-retail-ecommerce.
 *
 * Bridges the previously dead-wired `eoq` trait into a behavioral
 * TraitHandler that the HoloScript runtime actually dispatches
 * (HoloScriptRuntime.registerTrait -> applyDirectives / updateTraits).
 *
 * Before this module the plugin declared trait NAMES only
 * (pluginMeta.traits) and exported `economicOrderQuantity` plus the other
 * retail solvers, but nothing invoked a solver THROUGH the runtime — the whole
 * domain-plugin tier was built-but-dead-wired. This mirrors the energy-grid
 * reference integration (`power_flow` -> `solveDCPowerFlow`): the `eoq` trait
 * now runs the real Harris-Wilson Economic Order Quantity solver via the
 * shared `registerPluginTraits` registrar. The remaining declared trait names
 * follow the same registrar shape.
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import { economicOrderQuantity, type EOQResult } from './retailsolver';

/** Stable id for this plugin, used by the runtime collision guard. */
export const RETAIL_ECOMMERCE_PLUGIN_ID = 'retail-ecommerce' as const;

/** Config carried by an orb's `@eoq` trait directive. */
export interface EoqTraitConfig {
  /** Annual demand units. Required; absence emits `eoq_error`. */
  annualDemand?: number;
  /** Ordering cost per order ($). Required; absence emits `eoq_error`. */
  orderingCost?: number;
  /** Holding cost per unit per year ($). Required; absence emits `eoq_error`. */
  holdingCostPerUnit?: number;
  /** Optional lead time (days) used to compute the reorder point. */
  leadTimeDays?: number;
  /** Optional working days per year forwarded to `economicOrderQuantity`. */
  workingDaysPerYear?: number;
}

/** Summary payload emitted on `eoq_solved`. */
export interface EoqSolvedEvent {
  nodeId: string;
  eoq: number;
  ordersPerYear: number;
  totalAnnualCost: number;
  reorderPoint: number;
  annualDemand: number;
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
  onAttach?: (node: unknown, config: EoqTraitConfig, context: TraitDispatchContext) => void;
  onUpdate?: (
    node: unknown,
    config: EoqTraitConfig,
    context: TraitDispatchContext,
    delta: number
  ) => void;
}

interface EoqNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __eoqResult?: EOQResult;
}

/** Solve EOQ from `config`, write the result onto the node, and emit. */
function solveOntoNode(
  node: unknown,
  config: EoqTraitConfig | undefined,
  context: TraitDispatchContext
): void {
  const carrier = node as EoqNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';

  const annualDemand = config?.annualDemand;
  const orderingCost = config?.orderingCost;
  const holdingCostPerUnit = config?.holdingCostPerUnit;

  if (
    annualDemand === undefined ||
    orderingCost === undefined ||
    holdingCostPerUnit === undefined
  ) {
    context.emit('eoq_error', {
      nodeId,
      error:
        'eoq trait requires config.annualDemand, config.orderingCost, and config.holdingCostPerUnit',
    });
    return;
  }

  try {
    const result = economicOrderQuantity(
      annualDemand,
      orderingCost,
      holdingCostPerUnit,
      config?.leadTimeDays ?? 0,
      config?.workingDaysPerYear ?? 250
    );
    carrier.__eoqResult = result;
    carrier.properties = {
      ...(carrier.properties ?? {}),
      eoq: result.eoq,
      ordersPerYear: result.ordersPerYear,
      totalAnnualCost: result.totalAnnualCost,
    };
    const summary: EoqSolvedEvent = {
      nodeId,
      eoq: result.eoq,
      ordersPerYear: result.ordersPerYear,
      totalAnnualCost: result.totalAnnualCost,
      reorderPoint: result.reorderPoint,
      annualDemand: result.annualDemand,
    };
    context.setState?.({ [`eoq:${nodeId}`]: summary });
    context.emit('eoq_solved', summary);
  } catch (error) {
    context.emit('eoq_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Behavioral handler for the retail-ecommerce `eoq` trait. Runs the
 * deterministic Harris-Wilson Economic Order Quantity solver whenever an orb
 * carrying the trait is attached (and on each per-frame update), writing the
 * result onto the node and emitting `eoq_solved` / `eoq_error`.
 */
export const eoqHandler: RuntimeTraitHandler = {
  name: 'eoq',
  onAttach: (node, config, context) => solveOntoNode(node, config, context),
  onUpdate: (node, config, context) => solveOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register retail-ecommerce behavioral trait handlers into a runtime that
 * exposes `registerTrait(name, handler)` — e.g. `@holoscript/core`
 * HoloScriptRuntime. This is the consumption path the dead-wired tier was
 * missing: after this call the runtime's directive dispatch (applyDirectives /
 * updateTraits) will invoke the retail EOQ solver for `@eoq` orbs.
 */
export function registerRetailEcommerceTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, RETAIL_ECOMMERCE_PLUGIN_ID, [eoqHandler]);
}
