/**
 * @corona_simulation Trait — Procedural Solar Corona Renderer
 *
 * Renders a physically-motivated solar corona around a star object using:
 *   - MHD flux-tube loop geometry (prominence arcs modelled as Bézier tubes)
 *   - Radial streamer belt pattern (equatorial current-sheet, visible near solar min)
 *   - Coronal hole fast-wind regions shown as open-field polar plumes
 *   - CME (Coronal Mass Ejection) event trigger API for edu-XR space-weather demos
 *
 * Intended for the "Sun" object in solar-system compositions. Without this trait
 * the corona falls back to the bloom + @emissive_gi approximation.
 *
 * Suggested API shape (from A-009 2026-05-17 wish-list):
 * ```
 * @corona_simulation {
 *   base_temperature_mk: 1.5,
 *   loop_count: 24,
 *   prominence_seed: 42,
 *   streamer_belt: true,
 *   coronal_holes: ["north", "south"],
 *   cme_enabled: false
 * }
 * ```
 *
 * @module traits
 */

import type { TraitHandler } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// =============================================================================
// TYPES
// =============================================================================

/** Which polar regions host open-field coronal holes */
export type CoronalHoleRegion = 'north' | 'south' | 'equatorial';

export interface CoronaSimulationConfig {
  /**
   * Base coronal temperature in megakelvin.
   * Controls the emission colour (cooler → reddish; hotter → blue-white).
   * Typical solar value: 1.0–3.0 MK.
   * @default 1.5
   */
  base_temperature_mk: number;

  /**
   * Number of closed MHD flux-tube loops rendered around the equatorial band.
   * Higher counts → denser prominence field; performance scales O(n).
   * @default 24
   */
  loop_count: number;

  /**
   * Seed for the procedural prominence arc generator.
   * Change to get a different stable loop distribution without altering other params.
   * @default 42
   */
  prominence_seed: number;

  /**
   * Render the equatorial current sheet / streamer belt.
   * This bright radial structure is most visible during solar minimum.
   * @default true
   */
  streamer_belt: boolean;

  /**
   * Which polar regions show open-field fast-wind plumes (coronal holes).
   * Empty array disables hole rendering.
   * @default ["north", "south"]
   */
  coronal_holes: CoronalHoleRegion[];

  /**
   * Enable CME event API.
   * When true, the trait listens for `corona_cme_trigger` events and fires an
   * expanding plasma bubble from the specified eruption longitude/latitude.
   * Useful for edu-XR space-weather demonstrations.
   * @default false
   */
  cme_enabled: boolean;

  /**
   * Scale of the corona halo relative to the parent object's bounding sphere.
   * 1.0 = corona extends to ~1× the star radius above the photosphere.
   * @default 2.5
   */
  halo_scale: number;

  /**
   * Opacity of the diffuse electron-scattering halo (K-corona analogue).
   * @default 0.35
   */
  halo_opacity: number;
}

// =============================================================================
// STATE
// =============================================================================

interface CoronaState {
  active: boolean;
  /** Accumulated time for animation */
  time: number;
  /** Active CME events: each entry is { age, longitude, latitude } */
  activeCmes: Array<{ age: number; longitude: number; latitude: number }>;
}

/** Per-node state — avoids casts on node directly */
const traitState = new WeakMap<HSPlusNode, CoronaState>();

// =============================================================================
// HANDLER
// =============================================================================

export const coronaSimulationHandler: TraitHandler<CoronaSimulationConfig> = {
  name: 'corona_simulation',

  defaultConfig: {
    base_temperature_mk: 1.5,
    loop_count: 24,
    prominence_seed: 42,
    streamer_belt: true,
    coronal_holes: ['north', 'south'],
    cme_enabled: false,
    halo_scale: 2.5,
    halo_opacity: 0.35,
  },

  onAttach(node, config, context) {
    const state: CoronaState = {
      active: true,
      time: 0,
      activeCmes: [],
    };
    traitState.set(node, state);

    context.emit('corona_simulation_create', {
      nodeId: node.id,
      baseTemperatureMk: config.base_temperature_mk,
      loopCount: config.loop_count,
      prominenceSeed: config.prominence_seed,
      streamerBelt: config.streamer_belt,
      coronalHoles: config.coronal_holes,
      cmeEnabled: config.cme_enabled,
      haloScale: config.halo_scale,
      haloOpacity: config.halo_opacity,
    });
  },

  onDetach(node, _config, context) {
    if (traitState.has(node)) {
      context.emit('corona_simulation_destroy', { nodeId: node.id });
      traitState.delete(node);
    }
  },

  onUpdate(node, config, context, delta) {
    const state = traitState.get(node);
    if (!state?.active) return;

    state.time += delta;

    // Advance active CME bubble ages
    if (config.cme_enabled && state.activeCmes.length > 0) {
      for (const cme of state.activeCmes) {
        cme.age += delta;
      }
      // Remove CMEs older than 30 s (visual lifetime)
      state.activeCmes = state.activeCmes.filter((c) => c.age < 30);
    }

    context.emit('corona_simulation_update', {
      nodeId: node.id,
      time: state.time,
      activeCmes: config.cme_enabled ? [...state.activeCmes] : [],
    });
  },

  onEvent(node, config, context, event) {
    const state = traitState.get(node);
    if (!state) return;

    switch (event.type) {
      case 'corona_cme_trigger': {
        if (!config.cme_enabled) break;
        const longitude = (event.longitude as number) ?? 0;
        const latitude = (event.latitude as number) ?? 0;
        state.activeCmes.push({ age: 0, longitude, latitude });
        context.emit('corona_cme_launched', {
          nodeId: node.id,
          longitude,
          latitude,
          activeCmeCount: state.activeCmes.length,
        });
        break;
      }

      case 'corona_set_temperature': {
        const mk = event.base_temperature_mk as number;
        if (typeof mk === 'number' && mk > 0) {
          context.emit('corona_simulation_config_update', {
            nodeId: node.id,
            baseTemperatureMk: mk,
          });
        }
        break;
      }

      case 'corona_set_loop_count': {
        const count = event.loop_count as number;
        if (typeof count === 'number' && count >= 0) {
          context.emit('corona_simulation_config_update', {
            nodeId: node.id,
            loopCount: Math.floor(count),
          });
        }
        break;
      }

      case 'corona_pause':
        state.active = false;
        break;

      case 'corona_resume':
        state.active = true;
        break;

      case 'corona_query':
        context.emit('corona_simulation_info', {
          queryId: event.queryId,
          nodeId: node.id,
          active: state.active,
          time: state.time,
          activeCmeCount: state.activeCmes.length,
          config: { ...config },
        });
        break;
    }
  },
};
