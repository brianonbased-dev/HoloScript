/**
 * Runtime integration for @holoscript/plugin-hr-workforce.
 *
 * Bridges the previously dead-wired `pay_equity` trait into a behavioral
 * TraitHandler that the HoloScript runtime actually dispatches
 * (HoloScriptRuntime.registerTrait -> applyDirectives / updateTraits).
 *
 * Before this module the plugin declared trait NAMES only (pluginMeta.traits)
 * and exported the workforce solvers (payEquityAnalysis, meritBudgetAllocation,
 * …), but nothing invoked a solver THROUGH the runtime — the whole
 * domain-plugin tier was built-but-dead-wired. This mirrors
 * government-civic-plugin's reference integration (civic_decision): it wires the
 * deterministic pay-equity analytic solver (`payEquityAnalysis`) behind the
 * `pay_equity` trait so the runtime's directive dispatch can run it. The
 * remaining workforce traits follow the same registrar shape.
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import { payEquityAnalysis, type Employee, type PayEquityResult } from './workforce';

/** Stable id for this plugin's trait ownership tagging. */
export const HR_WORKFORCE_PLUGIN_ID = 'hr-workforce' as const;

/** Config carried by an orb's `@pay_equity` trait directive. */
export interface PayEquityTraitConfig {
  /** Employee records to analyze. Required; absence emits `pay_equity_error`. */
  employees?: Employee[];
  /** First demographic group label to compare. Required. */
  groupA?: string;
  /** Second demographic group label to compare. Required. */
  groupB?: string;
}

/** Summary payload emitted on `pay_equity_solved`. */
export interface PayEquitySolvedEvent {
  nodeId: string;
  /** First group label compared. */
  groupA: string;
  /** Second group label compared. */
  groupB: string;
  /** Mean salary of groupA. */
  meanSalaryA: number;
  /** Mean salary of groupB. */
  meanSalaryB: number;
  /** Raw gap % = (meanA - meanB) / meanB × 100. */
  rawGapPct: number;
  /** Adjusted gap % after OLS controls for experience and job level. */
  adjustedGapPct: number;
  /** Whether the raw gap is statistically significant at α=0.05. */
  significant: boolean;
  /** Employee count evaluated. */
  employeeCount: number;
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
  onAttach?: (node: unknown, config: PayEquityTraitConfig, context: TraitDispatchContext) => void;
  onUpdate?: (
    node: unknown,
    config: PayEquityTraitConfig,
    context: TraitDispatchContext,
    delta: number
  ) => void;
}

interface PayEquityNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __payEquityResult?: PayEquityResult;
}

/** Run the pay-equity solver on the directive config, write the result onto the node, and emit. */
function solveOntoNode(
  node: unknown,
  config: PayEquityTraitConfig | undefined,
  context: TraitDispatchContext
): void {
  const carrier = node as PayEquityNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';
  const employees = config?.employees;
  const groupA = config?.groupA;
  const groupB = config?.groupB;

  if (!employees || !Array.isArray(employees) || employees.length === 0 || !groupA || !groupB) {
    context.emit('pay_equity_error', {
      nodeId,
      error:
        'pay_equity trait requires config.employees (Employee[]), config.groupA (string), and config.groupB (string)',
    });
    return;
  }

  try {
    const result = payEquityAnalysis(employees, groupA, groupB);
    carrier.__payEquityResult = result;
    carrier.properties = {
      ...(carrier.properties ?? {}),
      payEquityRawGapPct: result.rawGapPct,
      payEquitySignificant: result.significant,
    };
    const summary: PayEquitySolvedEvent = {
      nodeId,
      groupA: result.groupA,
      groupB: result.groupB,
      meanSalaryA: result.meanSalaryA,
      meanSalaryB: result.meanSalaryB,
      rawGapPct: result.rawGapPct,
      adjustedGapPct: result.adjustedGapPct,
      significant: result.significant,
      employeeCount: employees.length,
    };
    context.setState?.({ [`pay_equity:${nodeId}`]: summary });
    context.emit('pay_equity_solved', summary);
  } catch (error) {
    context.emit('pay_equity_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Behavioral handler for the hr-workforce `pay_equity` trait. Runs the
 * deterministic pay-equity analytic solver whenever an orb carrying the trait
 * is attached (and on each per-frame update), writing the result onto the node
 * and emitting `pay_equity_solved` / `pay_equity_error`.
 */
export const payEquityHandler: RuntimeTraitHandler = {
  name: 'pay_equity',
  onAttach: (node, config, context) => solveOntoNode(node, config, context),
  onUpdate: (node, config, context) => solveOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register hr-workforce behavioral trait handlers into a runtime that exposes
 * `registerTrait(name, handler)` — e.g. `@holoscript/core` HoloScriptRuntime.
 * This is the consumption path the dead-wired tier was missing: after this call
 * the runtime's directive dispatch (applyDirectives / updateTraits) will invoke
 * the pay-equity solver for `@pay_equity` orbs.
 */
export function registerHrWorkforceTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, HR_WORKFORCE_PLUGIN_ID, [payEquityHandler]);
}
