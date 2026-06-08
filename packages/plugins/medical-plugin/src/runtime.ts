/**
 * Runtime integration for @holoscript/medical-plugin.
 *
 * Bridges the previously dead-wired `parkland_resuscitation` trait into a
 * behavioral TraitHandler that the HoloScript runtime actually dispatches
 * (HoloScriptRuntime.registerTrait -> applyDirectives / updateTraits).
 *
 * Before this module the plugin exported the clinical solvers
 * (`parklandFormula`, `news2Score`, `bmiCalculation`, …) but nothing invoked a
 * solver THROUGH the runtime — the domain-plugin behavioral tier was
 * built-but-dead-wired. This mirrors government-civic-plugin's reference
 * integration (`civic_decision` -> `mcdaAnalysis`): it wires the deterministic
 * Baxter-Parkland burn fluid-resuscitation solver (`parklandFormula`) behind
 * the `parkland_resuscitation` trait so the runtime's directive dispatch can
 * run it. The remaining medical solvers follow the same registrar shape.
 *
 * CLINICAL DISCLAIMER: Decision support ONLY. All outputs require review by a
 * qualified medical professional before clinical application.
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import { parklandFormula, type ParklandResult } from './medicalsolver';

/** Stable id for this plugin's trait ownership tagging. */
export const MEDICAL_PLUGIN_ID = 'medical' as const;

/** Config carried by an orb's `@parkland_resuscitation` trait directive. */
export interface ParklandResuscitationTraitConfig {
  /** Patient weight in kg. Required; absence/invalid emits `parkland_resuscitation_error`. */
  weightKg?: number;
  /** Total body surface area burned (%). Required; must be in (0, 100]. */
  tbsaPct?: number;
}

/** Summary payload emitted on `parkland_resuscitation_solved`. */
export interface ParklandResuscitationSolvedEvent {
  nodeId: string;
  /** Total lactated Ringer's volume over 24 h (mL). */
  totalFluidMl: number;
  /** First-8-hour volume from time of injury (mL). */
  first8hMl: number;
  /** Remaining-16-hour volume (mL). */
  next16hMl: number;
  /** Hourly infusion rate for the first 8 h (mL/h). */
  hourlyRateFirst8h: number;
  /** Patient weight applied (kg). */
  weightKg: number;
  /** Total body surface area burned applied (%). */
  tbsaPct: number;
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
    config: ParklandResuscitationTraitConfig,
    context: TraitDispatchContext
  ) => void;
  onUpdate?: (
    node: unknown,
    config: ParklandResuscitationTraitConfig,
    context: TraitDispatchContext,
    delta: number
  ) => void;
}

interface ParklandResuscitationNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __parklandResult?: ParklandResult;
}

/** Run the Parkland solver on the directive config, write the result onto the node, and emit. */
function solveOntoNode(
  node: unknown,
  config: ParklandResuscitationTraitConfig | undefined,
  context: TraitDispatchContext
): void {
  const carrier = node as ParklandResuscitationNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';
  const weightKg = config?.weightKg;
  const tbsaPct = config?.tbsaPct;

  if (
    typeof weightKg !== 'number' ||
    typeof tbsaPct !== 'number' ||
    !Number.isFinite(weightKg) ||
    !Number.isFinite(tbsaPct)
  ) {
    context.emit('parkland_resuscitation_error', {
      nodeId,
      error:
        'parkland_resuscitation trait requires numeric config.weightKg (kg) and config.tbsaPct (% TBSA, 0–100)',
    });
    return;
  }

  try {
    // parklandFormula itself guards weightKg > 0 and tbsaPct in (0, 100],
    // throwing on violation — caught below and surfaced as a non-throwing event.
    const result = parklandFormula(weightKg, tbsaPct);
    carrier.__parklandResult = result;
    carrier.properties = {
      ...(carrier.properties ?? {}),
      parklandTotalFluidMl: result.totalFluidMl,
      parklandHourlyRateFirst8h: result.hourlyRateFirst8h,
    };
    const summary: ParklandResuscitationSolvedEvent = {
      nodeId,
      totalFluidMl: result.totalFluidMl,
      first8hMl: result.first8hMl,
      next16hMl: result.next16hMl,
      hourlyRateFirst8h: result.hourlyRateFirst8h,
      weightKg,
      tbsaPct,
    };
    context.setState?.({ [`parkland_resuscitation:${nodeId}`]: summary });
    context.emit('parkland_resuscitation_solved', summary);
  } catch (error) {
    context.emit('parkland_resuscitation_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Behavioral handler for the medical `parkland_resuscitation` trait. Runs the
 * deterministic Baxter-Parkland burn fluid-resuscitation solver whenever an orb
 * carrying the trait is attached (and on each per-frame update), writing the
 * result onto the node and emitting `parkland_resuscitation_solved` /
 * `parkland_resuscitation_error`.
 */
export const parklandResuscitationHandler: RuntimeTraitHandler = {
  name: 'parkland_resuscitation',
  onAttach: (node, config, context) => solveOntoNode(node, config, context),
  onUpdate: (node, config, context) => solveOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register medical behavioral trait handlers into a runtime that exposes
 * `registerTrait(name, handler)` — e.g. `@holoscript/core` HoloScriptRuntime.
 * This is the consumption path the dead-wired tier was missing: after this call
 * the runtime's directive dispatch (applyDirectives / updateTraits) will invoke
 * the Parkland solver for `@parkland_resuscitation` orbs.
 */
export function registerMedicalTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, MEDICAL_PLUGIN_ID, [parklandResuscitationHandler]);
}
