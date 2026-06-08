/**
 * Runtime integration for @holoscript/plugin-geolocation-gis.
 *
 * Wires the declared-but-dead `vincenty_geodesy` trait (listed in
 * pluginMeta.traits with NO handler — the exact analog of energy-grid's
 * power_flow) into a behavioral TraitHandler that runs the REAL WGS-84
 * Vincenty inverse solver through the runtime, via the shared P1 registrar.
 *
 * Second plugin of the domain-plugin rollout (task_1780878631657_j63f PATH-3):
 * a deliberately DIFFERENT domain (geodesy, not power-flow) to prove the shared
 * registration pattern generalizes. Also addresses the geolocation OVERCLAIM
 * (PATH-5 / deep-ratchet 2026-06-07): the plugin's real geodesy now drives a
 * live trait instead of sitting unused behind thin map/route/geocode stubs.
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import { vincentyInverse, type VincentyResult } from './geodesy';

export const GEOLOCATION_GIS_PLUGIN_ID = 'geolocation-gis' as const;

/** A WGS-84 surface point in decimal degrees. */
export interface LatLon {
  latDeg: number;
  lonDeg: number;
}

/** Config carried by an orb's `@vincenty_geodesy` trait directive. */
export interface VincentyGeodesyTraitConfig {
  from?: LatLon;
  to?: LatLon;
}

/** Summary payload emitted on `vincenty_geodesy_solved`. */
export interface VincentyGeodesySolvedEvent {
  nodeId: string;
  distanceM: number;
  forwardAzimuthDeg: number;
  backAzimuthDeg: number;
  antipodal: boolean;
}

export interface TraitDispatchContext {
  emit: (event: string, payload?: unknown) => void;
  setState?: (updates: Record<string, unknown>) => void;
}

export interface RuntimeTraitHandler {
  name: string;
  onAttach?: (
    node: unknown,
    config: VincentyGeodesyTraitConfig,
    context: TraitDispatchContext,
  ) => void;
  onUpdate?: (
    node: unknown,
    config: VincentyGeodesyTraitConfig,
    context: TraitDispatchContext,
    delta: number,
  ) => void;
}

interface VincentyNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __vincentyResult?: VincentyResult;
}

/** Run the Vincenty inverse for `config.{from,to}`, write onto the node, emit. */
function solveOntoNode(
  node: unknown,
  config: VincentyGeodesyTraitConfig | undefined,
  context: TraitDispatchContext,
): void {
  const carrier = node as VincentyNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';
  const from = config?.from;
  const to = config?.to;

  if (!from || !to) {
    context.emit('vincenty_geodesy_error', {
      nodeId,
      error: 'vincenty_geodesy trait requires config.from and config.to ({ latDeg, lonDeg })',
    });
    return;
  }

  try {
    const result = vincentyInverse(from, to);
    carrier.__vincentyResult = result;
    carrier.properties = {
      ...(carrier.properties ?? {}),
      distanceM: result.distanceM,
      antipodal: result.antipodal,
    };
    const summary: VincentyGeodesySolvedEvent = {
      nodeId,
      distanceM: result.distanceM,
      forwardAzimuthDeg: result.forwardAzimuthDeg,
      backAzimuthDeg: result.backAzimuthDeg,
      antipodal: result.antipodal,
    };
    context.setState?.({ [`vincenty_geodesy:${nodeId}`]: summary });
    context.emit('vincenty_geodesy_solved', summary);
  } catch (error) {
    context.emit('vincenty_geodesy_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Behavioral handler for the `vincenty_geodesy` trait — real WGS-84 geodesics. */
export const vincentyGeodesyHandler: RuntimeTraitHandler = {
  name: 'vincenty_geodesy',
  onAttach: (node, config, context) => solveOntoNode(node, config, context),
  onUpdate: (node, config, context) => solveOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register geolocation behavioral trait handlers into a runtime (opt-in).
 * Uses the shared P1 registrar so this plugin registers identically to every
 * other domain plugin (owner-tagged, collision-guarded).
 */
export function registerGeolocationTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, GEOLOCATION_GIS_PLUGIN_ID, [vincentyGeodesyHandler]);
}
