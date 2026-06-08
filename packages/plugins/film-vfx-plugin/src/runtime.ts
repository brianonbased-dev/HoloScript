/**
 * Runtime integration for @holoscript/plugin-film-vfx.
 *
 * Bridges the previously dead-wired `cinematography_exposure` trait into a
 * behavioral TraitHandler that the HoloScript runtime actually dispatches
 * (HoloScriptRuntime.registerTrait -> applyDirectives / updateTraits).
 *
 * Before this module the plugin declared trait NAMES only (pluginMeta.traits)
 * and exported the film/VFX solvers (exposureValue, depthOfField, …), but
 * nothing invoked a solver THROUGH the runtime — the whole domain-plugin tier
 * was built-but-dead-wired. This mirrors government-civic-plugin's reference
 * integration (civic_decision): it wires the deterministic exposure-value
 * solver (`exposureValue`) behind the `cinematography_exposure` trait so the
 * runtime's directive dispatch can run it. The remaining film/VFX solvers
 * follow the same registrar shape.
 *
 * EV formula (filmvfxsolver.ts): EV₁₀₀ = log₂(N² × 100 / (t × ISO))
 *   = log₂(N²/t) − log₂(ISO/100). The ISO term is applied by the solver.
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import {
  exposureValue,
  type ExposureSettings,
  type ExposureResult,
} from './filmvfxsolver';

/** Stable id for this plugin's trait ownership tagging. */
export const FILM_VFX_PLUGIN_ID = 'film-vfx' as const;

/**
 * Config carried by an orb's `@cinematography_exposure` trait directive.
 * Mirrors `ExposureSettings` (aperture / shutterSpeedS / iso). Any missing or
 * non-positive field emits `cinematography_exposure_error` (the underlying
 * solver throws on aperture/shutterSpeedS/iso ≤ 0).
 */
export interface CinematographyExposureTraitConfig {
  /** f-number / aperture (e.g. 1.4, 2.8, 5.6, 8). Required, must be > 0. */
  aperture?: number;
  /** Shutter speed in seconds (e.g. 1/250 = 0.004). Required, must be > 0. */
  shutterSpeedS?: number;
  /** ISO sensitivity (e.g. 100, 800). Required, must be > 0. */
  iso?: number;
}

/** Summary payload emitted on `cinematography_exposure_solved`. */
export interface CinematographyExposureSolvedEvent {
  nodeId: string;
  /** Exposure value at ISO 100: log₂(N² × 100 / (t × ISO)). */
  ev100: number;
  /** Approximate captured dynamic range (stops). */
  dynamicRangeStops: number;
  /** Exposure index relative to ISO 100 reference (iso / 100). */
  exposureIndex: number;
  /** Aperture (f-number) the EV was computed from. */
  aperture: number;
  /** Shutter speed (seconds) the EV was computed from. */
  shutterSpeedS: number;
  /** ISO the EV was computed from. */
  iso: number;
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
    config: CinematographyExposureTraitConfig,
    context: TraitDispatchContext,
  ) => void;
  onUpdate?: (
    node: unknown,
    config: CinematographyExposureTraitConfig,
    context: TraitDispatchContext,
    delta: number,
  ) => void;
}

interface CinematographyExposureNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __exposureResult?: ExposureResult;
}

/**
 * Run the exposure-value solver on the directive config, write the result onto
 * the node, persist a summary into runtime state, and emit.
 */
function solveOntoNode(
  node: unknown,
  config: CinematographyExposureTraitConfig | undefined,
  context: TraitDispatchContext,
): void {
  const carrier = node as CinematographyExposureNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';
  const aperture = config?.aperture;
  const shutterSpeedS = config?.shutterSpeedS;
  const iso = config?.iso;

  if (
    typeof aperture !== 'number' ||
    typeof shutterSpeedS !== 'number' ||
    typeof iso !== 'number' ||
    !Number.isFinite(aperture) ||
    !Number.isFinite(shutterSpeedS) ||
    !Number.isFinite(iso) ||
    aperture <= 0 ||
    shutterSpeedS <= 0 ||
    iso <= 0
  ) {
    context.emit('cinematography_exposure_error', {
      nodeId,
      error:
        'cinematography_exposure trait requires config.aperture (>0), config.shutterSpeedS (>0), and config.iso (>0)',
    });
    return;
  }

  try {
    const settings: ExposureSettings = { aperture, shutterSpeedS, iso };
    const result = exposureValue(settings);
    carrier.__exposureResult = result;
    carrier.properties = {
      ...(carrier.properties ?? {}),
      cinematographyEv100: result.ev100,
      cinematographyExposureIndex: result.exposureIndex,
      cinematographyDynamicRangeStops: result.dynamicRangeStops,
    };
    const summary: CinematographyExposureSolvedEvent = {
      nodeId,
      ev100: result.ev100,
      dynamicRangeStops: result.dynamicRangeStops,
      exposureIndex: result.exposureIndex,
      aperture,
      shutterSpeedS,
      iso,
    };
    context.setState?.({ [`cinematography_exposure:${nodeId}`]: summary });
    context.emit('cinematography_exposure_solved', summary);
  } catch (error) {
    context.emit('cinematography_exposure_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Behavioral handler for the film-vfx `cinematography_exposure` trait. Runs the
 * deterministic exposure-value solver whenever an orb carrying the trait is
 * attached (and on each per-frame update), writing the result onto the node and
 * emitting `cinematography_exposure_solved` / `cinematography_exposure_error`.
 */
export const cinematographyExposureHandler: RuntimeTraitHandler = {
  name: 'cinematography_exposure',
  onAttach: (node, config, context) => solveOntoNode(node, config, context),
  onUpdate: (node, config, context) => solveOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register film-vfx behavioral trait handlers into a runtime that exposes
 * `registerTrait(name, handler)` — e.g. `@holoscript/core` HoloScriptRuntime.
 * This is the consumption path the dead-wired tier was missing: after this call
 * the runtime's directive dispatch (applyDirectives / updateTraits) will invoke
 * the exposure-value solver for `@cinematography_exposure` orbs.
 */
export function registerFilmVfxTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, FILM_VFX_PLUGIN_ID, [cinematographyExposureHandler]);
}
