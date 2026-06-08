/**
 * Runtime integration for @holoscript/plugin-manufacturing-qc.
 *
 * Bridges the previously dead-wired `spc` trait into a behavioral
 * TraitHandler that the HoloScript runtime actually dispatches
 * (HoloScriptRuntime.registerTrait -> applyDirectives / updateTraits).
 *
 * Before this module the plugin declared trait NAMES only (pluginMeta.traits)
 * and exported the SPC solvers (computeCapability, buildSPCChart, …), but
 * nothing invoked a solver THROUGH the runtime — the whole domain-plugin tier
 * was built-but-dead-wired. This mirrors government-civic-plugin's reference
 * integration (civic_decision): it wires the deterministic Statistical Process
 * Control capability solver (`computeCapability`) behind the `spc` trait so the
 * runtime's directive dispatch can run it. The remaining manufacturing-qc
 * traits follow the same registrar shape.
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import { computeCapability, type Subgroup, type ProcessCapability } from './spc';

/** Stable id for this plugin's trait ownership tagging. */
export const MANUFACTURING_QC_PLUGIN_ID = 'manufacturing-qc' as const;

/** Config carried by an orb's `@spc` trait directive. */
export interface SpcTraitConfig {
  /** All individual measurements (flattened across subgroups). Required; absence emits `spc_error`. */
  allValues?: number[];
  /** Original subgroups (used for within-subgroup σ̂ via R̅/d₂). Required. */
  subgroups?: Subgroup[];
  /** Lower specification limit. Required. */
  lsl?: number;
  /** Upper specification limit. Required. */
  usl?: number;
  /** Nominal target (optional; used for Cpm). */
  target?: number;
}

/** Summary payload emitted on `spc_solved`. */
export interface SpcSolvedEvent {
  nodeId: string;
  /** Potential capability index (short-term, within-subgroup σ̂). */
  Cp: number;
  /** Actual capability index (within-subgroup σ̂, accounts for centering). */
  Cpk: number;
  /** Estimated process mean. */
  processMean: number;
  /** Overall (long-term) process standard deviation. */
  processStdDev: number;
  /** Whether the process is capable (Cpk >= 1.33). */
  capable: boolean;
  /** Number of individual measurements evaluated. */
  valueCount: number;
  /** Number of subgroups supplied. */
  subgroupCount: number;
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
  onAttach?: (node: unknown, config: SpcTraitConfig, context: TraitDispatchContext) => void;
  onUpdate?: (
    node: unknown,
    config: SpcTraitConfig,
    context: TraitDispatchContext,
    delta: number
  ) => void;
}

interface SpcNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __spcResult?: ProcessCapability;
}

/** Run the SPC capability solver on the directive config, write the result onto the node, and emit. */
function solveOntoNode(
  node: unknown,
  config: SpcTraitConfig | undefined,
  context: TraitDispatchContext
): void {
  const carrier = node as SpcNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';
  const allValues = config?.allValues;
  const subgroups = config?.subgroups;
  const lsl = config?.lsl;
  const usl = config?.usl;

  if (
    !Array.isArray(allValues) ||
    !Array.isArray(subgroups) ||
    typeof lsl !== 'number' ||
    typeof usl !== 'number'
  ) {
    context.emit('spc_error', {
      nodeId,
      error:
        'spc trait requires config.allValues (number[]), config.subgroups (Subgroup[]), config.lsl (number) and config.usl (number)',
    });
    return;
  }

  try {
    const result = computeCapability(allValues, subgroups, lsl, usl, config?.target);
    carrier.__spcResult = result;
    carrier.properties = {
      ...(carrier.properties ?? {}),
      spcCp: result.Cp,
      spcCpk: result.Cpk,
      spcCapable: result.capable,
    };
    const summary: SpcSolvedEvent = {
      nodeId,
      Cp: result.Cp,
      Cpk: result.Cpk,
      processMean: result.processMean,
      processStdDev: result.processStdDev,
      capable: result.capable,
      valueCount: allValues.length,
      subgroupCount: subgroups.length,
    };
    context.setState?.({ [`spc:${nodeId}`]: summary });
    context.emit('spc_solved', summary);
  } catch (error) {
    context.emit('spc_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Behavioral handler for the manufacturing-qc `spc` trait. Runs the
 * deterministic Statistical Process Control capability solver whenever an orb
 * carrying the trait is attached (and on each per-frame update), writing the
 * Cp/Cpk result onto the node and emitting `spc_solved` / `spc_error`.
 */
export const spcHandler: RuntimeTraitHandler = {
  name: 'spc',
  onAttach: (node, config, context) => solveOntoNode(node, config, context),
  onUpdate: (node, config, context) => solveOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register manufacturing-qc behavioral trait handlers into a runtime that
 * exposes `registerTrait(name, handler)` — e.g. `@holoscript/core`
 * HoloScriptRuntime. This is the consumption path the dead-wired tier was
 * missing: after this call the runtime's directive dispatch (applyDirectives /
 * updateTraits) will invoke the SPC capability solver for `@spc` orbs.
 */
export function registerManufacturingQcTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, MANUFACTURING_QC_PLUGIN_ID, [spcHandler]);
}
