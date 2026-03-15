/**
 * AudioMaterial Trait
 *
 * Per-material acoustic properties for realistic sound propagation.
 * Defines absorption, reflection, and transmission characteristics.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type MaterialPreset =
  | 'concrete'
  | 'wood'
  | 'glass'
  | 'metal'
  | 'fabric'
  | 'carpet'
  | 'tile'
  | 'custom';

interface FrequencyBands {
  125: number;
  250: number;
  500: number;
  1000: number;
  2000: number;
  4000: number;
}

interface AudioMaterialState {
  isRegistered: boolean;
  effectiveAbsorption: number;
}

interface AudioMaterialConfig {
  absorption_coefficients: Partial<FrequencyBands>;
  reflection_coefficient: number;
  transmission_coefficient: number;
  scattering_coefficient: number;
  material_preset: MaterialPreset;
}

// =============================================================================
// PRESETS
// =============================================================================

const MATERIAL_PRESETS: Record<MaterialPreset, Partial<FrequencyBands>> = {
  concrete: { 125: 0.01, 250: 0.01, 500: 0.02, 1000: 0.02, 2000: 0.02, 4000: 0.03 },
  wood: { 125: 0.15, 250: 0.11, 500: 0.1, 1000: 0.07, 2000: 0.06, 4000: 0.07 },
  glass: { 125: 0.35, 250: 0.25, 500: 0.18, 1000: 0.12, 2000: 0.07, 4000: 0.04 },
  metal: { 125: 0.01, 250: 0.01, 500: 0.01, 1000: 0.01, 2000: 0.02, 4000: 0.02 },
  fabric: { 125: 0.03, 250: 0.09, 500: 0.2, 1000: 0.54, 2000: 0.7, 4000: 0.72 },
  carpet: { 125: 0.08, 250: 0.24, 500: 0.57, 1000: 0.69, 2000: 0.71, 4000: 0.73 },
  tile: { 125: 0.01, 250: 0.01, 500: 0.02, 1000: 0.02, 2000: 0.02, 4000: 0.02 },
  custom: { 125: 0.1, 250: 0.1, 500: 0.1, 1000: 0.1, 2000: 0.1, 4000: 0.1 },
};

// =============================================================================
// HANDLER
// =============================================================================

export const audioMaterialHandler: TraitHandler<AudioMaterialConfig> = {
  name: 'audio_material',

  defaultConfig: {
    absorption_coefficients: {},
    reflection_coefficient: 0.5,
    transmission_coefficient: 0.1,
    scattering_coefficient: 0.3,
    material_preset: 'concrete',
  },

  onAttach(node, config, context) {
    const state: AudioMaterialState = {
      isRegistered: false,
      effectiveAbsorption: 0,
    };
    (node as any).__audioMaterialState = state;

    // Get absorption from preset or custom
    const absorption =
      Object.keys(config.absorption_coefficients).length > 0
        ? config.absorption_coefficients
        : MATERIAL_PRESETS[config.material_preset];

    // Calculate average absorption
    const values = Object.values(absorption);
    state.effectiveAbsorption = values.reduce((a, b) => a + b, 0) / values.length;

    context.emit?.('audio_material_register', {
      node,
      absorption,
      reflection: config.reflection_coefficient,
      transmission: config.transmission_coefficient,
      scattering: config.scattering_coefficient,
    });
    state.isRegistered = true;
  },

  onDetach(node, config, context) {
    context.emit?.('audio_material_unregister', { node });
    delete (node as any).__audioMaterialState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Audio materials are static - no per-frame updates needed
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__audioMaterialState as AudioMaterialState;
    if (!state) return;

    if (event.type === 'audio_material_query') {
      const absorption =
        Object.keys(config.absorption_coefficients).length > 0
          ? config.absorption_coefficients
          : MATERIAL_PRESETS[config.material_preset];

      context.emit?.('audio_material_response', {
        queryId: event.queryId,
        node,
        absorption,
        reflection: config.reflection_coefficient,
        transmission: config.transmission_coefficient,
        scattering: config.scattering_coefficient,
        effectiveAbsorption: state.effectiveAbsorption,
      });
    } else if (event.type === 'audio_material_set_preset') {
      const preset = event.preset as MaterialPreset;
      const absorption = MATERIAL_PRESETS[preset];

      context.emit?.('audio_material_update', {
        node,
        absorption,
      });
    }
  },
};

export default audioMaterialHandler;
