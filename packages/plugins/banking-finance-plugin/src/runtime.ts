/**
 * Runtime integration for @holoscript/plugin-banking-finance.
 *
 * Bridges the previously dead-wired `fixed_income_solver` trait into a
 * behavioral TraitHandler that the HoloScript runtime actually dispatches
 * (HoloScriptRuntime.registerTrait -> applyDirectives / updateTraits).
 *
 * Before this module the plugin declared trait NAMES only (pluginMeta.traits)
 * and exported the fixed-income solvers (analyzeBond, analyzePortfolio,
 * blackScholes, …), but nothing invoked a solver THROUGH the runtime — the
 * whole domain-plugin tier was built-but-dead-wired. This mirrors
 * government-civic-plugin's reference integration (civic_decision): it wires the
 * deterministic bond-pricing solver (`analyzeBond`) behind the
 * `fixed_income_solver` trait so the runtime's directive dispatch can run it.
 * The remaining banking-finance traits follow the same registrar shape.
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import { analyzeBond, type BondSpec, type BondResult } from './fixedincome';

/** Stable id for this plugin's trait ownership tagging. */
export const BANKING_FINANCE_PLUGIN_ID = 'banking-finance' as const;

/**
 * Config carried by an orb's `@fixed_income_solver` trait directive. Mirrors the
 * `analyzeBond(spec, annualYield)` parameters as a flat directive payload: the
 * BondSpec fields plus the annual yield to discount at. All four spec fields and
 * `annualYield` are required; absence emits `fixed_income_solver_error`.
 */
export interface FixedIncomeSolverTraitConfig {
  /** Face (par) value of the bond. Required; absence emits `fixed_income_solver_error`. */
  faceValue?: number;
  /** Annual coupon rate (e.g. 0.05 = 5%). Required. */
  couponRate?: number;
  /** Periods to maturity (coupon payments; semi-annual = years × 2). Required. */
  periods?: number;
  /** Periods per year (2 = semi-annual, 1 = annual). Required. */
  periodsPerYear?: number;
  /** Annual yield to discount the cashflows at (e.g. 0.05 = 5%). Required. */
  annualYield?: number;
  /** Optional market price; when present the solver also bisects for YTM. */
  marketPrice?: number;
}

/** Summary payload emitted on `fixed_income_solver_solved`. */
export interface FixedIncomeSolverSolvedEvent {
  nodeId: string;
  /** Clean price (sum of discounted cash flows) at the given annual yield. */
  price: number;
  /** Macaulay duration in years. */
  macaulayDuration: number;
  /** Modified duration (% price change per 1% yield change). */
  modifiedDuration: number;
  /** Dollar duration (DV01): price change for a 1 bp yield change. */
  dv01: number;
  /** Convexity. */
  convexity: number;
  /** Yield to maturity (annual, bond-equivalent) — null unless marketPrice given. */
  ytm: number | null;
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
    config: FixedIncomeSolverTraitConfig,
    context: TraitDispatchContext
  ) => void;
  onUpdate?: (
    node: unknown,
    config: FixedIncomeSolverTraitConfig,
    context: TraitDispatchContext,
    delta: number
  ) => void;
}

interface FixedIncomeSolverNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __fixedIncomeResult?: BondResult;
}

/** Run the bond solver on the directive config, write the result onto the node, and emit. */
function solveOntoNode(
  node: unknown,
  config: FixedIncomeSolverTraitConfig | undefined,
  context: TraitDispatchContext
): void {
  const carrier = node as FixedIncomeSolverNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';
  const { faceValue, couponRate, periods, periodsPerYear, annualYield, marketPrice } = config ?? {};

  // All bond-spec fields plus the annual yield are required. couponRate may be 0
  // (zero-coupon bond), so it is checked for presence, not truthiness.
  if (
    faceValue === undefined ||
    couponRate === undefined ||
    periods === undefined ||
    periodsPerYear === undefined ||
    annualYield === undefined
  ) {
    context.emit('fixed_income_solver_error', {
      nodeId,
      error:
        'fixed_income_solver trait requires config.faceValue, config.couponRate, config.periods, config.periodsPerYear and config.annualYield',
    });
    return;
  }

  try {
    const spec: BondSpec = { faceValue, couponRate, periods, periodsPerYear, marketPrice };
    const result = analyzeBond(spec, annualYield);
    carrier.__fixedIncomeResult = result;
    carrier.properties = {
      ...(carrier.properties ?? {}),
      fixedIncomePrice: result.price,
      fixedIncomeModifiedDuration: result.modifiedDuration,
    };
    const summary: FixedIncomeSolverSolvedEvent = {
      nodeId,
      price: result.price,
      macaulayDuration: result.macaulayDuration,
      modifiedDuration: result.modifiedDuration,
      dv01: result.dv01,
      convexity: result.convexity,
      ytm: result.ytm,
    };
    context.setState?.({ [`fixed_income_solver:${nodeId}`]: summary });
    context.emit('fixed_income_solver_solved', summary);
  } catch (error) {
    context.emit('fixed_income_solver_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Behavioral handler for the banking-finance `fixed_income_solver` trait. Runs
 * the deterministic bond-pricing solver whenever an orb carrying the trait is
 * attached (and on each per-frame update), writing the result onto the node and
 * emitting `fixed_income_solver_solved` / `fixed_income_solver_error`.
 */
export const fixedIncomeSolverHandler: RuntimeTraitHandler = {
  name: 'fixed_income_solver',
  onAttach: (node, config, context) => solveOntoNode(node, config, context),
  onUpdate: (node, config, context) => solveOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register banking-finance behavioral trait handlers into a runtime that
 * exposes `registerTrait(name, handler)` — e.g. `@holoscript/core`
 * HoloScriptRuntime. This is the consumption path the dead-wired tier was
 * missing: after this call the runtime's directive dispatch (applyDirectives /
 * updateTraits) will invoke the bond solver for `@fixed_income_solver` orbs.
 */
export function registerBankingFinanceTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, BANKING_FINANCE_PLUGIN_ID, [fixedIncomeSolverHandler]);
}
