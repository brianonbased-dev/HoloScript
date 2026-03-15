/**
 * Sonification Trait
 *
 * Map data and state values to audio representation.
 * Useful for data visualization, accessibility, and artistic expression.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type MappingType = 'pitch' | 'volume' | 'pan' | 'filter' | 'tempo' | 'timbre';
type Instrument = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise' | 'custom';

interface DataMapping {
  property: string;
  type: MappingType;
  min_input: number;
  max_input: number;
  min_output: number;
  max_output: number;
  curve: 'linear' | 'exponential' | 'logarithmic';
}

interface SonificationState {
  isActive: boolean;
  currentValues: Map<string, number>;
  oscillatorNode: unknown;
  gainNode: unknown;
  currentFrequency: number;
  currentGain: number;
  currentPan: number;
  lastDataUpdate: number;
}

interface SonificationConfig {
  data_source: string; // Property path to watch
  mapping: MappingType;
  min_freq: number;
  max_freq: number;
  min_value: number;
  max_value: number;
  pan_mode: 'spatial' | 'stereo' | 'mono';
  continuous: boolean;
  instrument: Instrument;
  volume: number;
  attack: number;
  release: number;
  custom_mappings: DataMapping[];
}

// =============================================================================
// HELPERS
// =============================================================================

function mapValue(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  curve: 'linear' | 'exponential' | 'logarithmic'
): number {
  const normalized = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));

  let curved: number;
  switch (curve) {
    case 'exponential':
      curved = Math.pow(normalized, 2);
      break;
    case 'logarithmic':
      curved = Math.log10(1 + normalized * 9) / Math.log10(10);
      break;
    default:
      curved = normalized;
  }

  return outMin + curved * (outMax - outMin);
}

// =============================================================================
// HANDLER
// =============================================================================

export const sonificationHandler: TraitHandler<SonificationConfig> = {
  name: 'sonification',

  defaultConfig: {
    data_source: '',
    mapping: 'pitch',
    min_freq: 200,
    max_freq: 2000,
    min_value: 0,
    max_value: 100,
    pan_mode: 'spatial',
    continuous: false,
    instrument: 'sine',
    volume: 0.5,
    attack: 0.01,
    release: 0.1,
    custom_mappings: [],
  },

  onAttach(node, config, context) {
    const state: SonificationState = {
      isActive: false,
      currentValues: new Map(),
      oscillatorNode: null,
      gainNode: null,
      currentFrequency: config.min_freq,
      currentGain: 0,
      currentPan: 0,
      lastDataUpdate: 0,
    };
    (node as any).__sonificationState = state;

    // Create audio nodes
    context.emit?.('sonification_create', {
      node,
      instrument: config.instrument,
      volume: config.volume,
      attack: config.attack,
      release: config.release,
    });
  },

  onDetach(node, config, context) {
    const state = (node as any).__sonificationState as SonificationState;
    if (state?.isActive) {
      context.emit?.('sonification_stop', { node });
    }
    context.emit?.('sonification_destroy', { node });
    delete (node as any).__sonificationState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__sonificationState as SonificationState;
    if (!state || !state.isActive) return;

    // Continuous mode - keep updating audio parameters
    if (config.continuous) {
      context.emit?.('sonification_update_params', {
        node,
        frequency: state.currentFrequency,
        gain: state.currentGain * config.volume,
        pan: state.currentPan,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__sonificationState as SonificationState;
    if (!state) return;

    if (event.type === 'sonification_data_update') {
      const value = event.value as number;
      const property = (event.property as string) || config.data_source;

      state.currentValues.set(property, value);
      state.lastDataUpdate = Date.now();

      // Apply primary mapping
      if (property === config.data_source || !config.data_source) {
        switch (config.mapping) {
          case 'pitch':
            state.currentFrequency = mapValue(
              value,
              config.min_value,
              config.max_value,
              config.min_freq,
              config.max_freq,
              'exponential'
            );
            break;
          case 'volume':
            state.currentGain = mapValue(value, config.min_value, config.max_value, 0, 1, 'linear');
            break;
          case 'pan':
            state.currentPan = mapValue(value, config.min_value, config.max_value, -1, 1, 'linear');
            break;
        }
      }

      // Apply custom mappings
      for (const mapping of config.custom_mappings) {
        if (mapping.property === property) {
          const mappedValue = mapValue(
            value,
            mapping.min_input,
            mapping.max_input,
            mapping.min_output,
            mapping.max_output,
            mapping.curve
          );

          switch (mapping.type) {
            case 'pitch':
              state.currentFrequency = mappedValue;
              break;
            case 'volume':
              state.currentGain = mappedValue;
              break;
            case 'pan':
              state.currentPan = mappedValue;
              break;
          }
        }
      }

      // Trigger sound if not continuous
      if (!config.continuous && !state.isActive) {
        state.isActive = true;
        context.emit?.('sonification_trigger', {
          node,
          frequency: state.currentFrequency,
          gain: state.currentGain * config.volume,
          pan: state.currentPan,
          duration: config.release,
        });

        // Auto-stop after release
        setTimeout(() => {
          state.isActive = false;
        }, config.release * 1000);
      }

      context.emit?.('sonification_value_changed', {
        node,
        property,
        value,
        frequency: state.currentFrequency,
        gain: state.currentGain,
      });
    } else if (event.type === 'sonification_start') {
      state.isActive = true;
      state.currentGain = config.volume;

      context.emit?.('sonification_play', {
        node,
        frequency: state.currentFrequency,
        gain: state.currentGain,
        pan: state.currentPan,
      });
    } else if (event.type === 'sonification_stop') {
      state.isActive = false;
      context.emit?.('sonification_stop', { node });
    } else if (event.type === 'sonification_set_instrument') {
      context.emit?.('sonification_change_instrument', {
        node,
        instrument: event.instrument,
      });
    }
  },
};

export default sonificationHandler;
