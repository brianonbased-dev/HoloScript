/**
 * BiofeedbackTrait
 *
 * Biometric signal integration for immersive XR:
 * Routes physiological readings (heart rate, GSR, pupil dilation,
 * breath rate, EEG alpha) into HoloScript's reactive event system.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type BiofeedbackSource = 'heart_rate' | 'gsr' | 'pupil' | 'breath_rate' | 'eeg_alpha';

export interface BiofeedbackThreshold {
  low: number;
  high: number;
}

export interface BiofeedbackSample {
  source: BiofeedbackSource;
  raw: number;
  normalized: number; // 0-1
  timestamp: number;
}

export interface BiofeedbackState {
  isConnected: boolean;
  samples: Map<BiofeedbackSource, BiofeedbackSample>;
  lastSampleTime: number;
  thresholdEdge: Map<BiofeedbackSource, 'low' | 'high' | 'normal'>;
}

export interface BiofeedbackConfig {
  /** Which biometric sources to monitor */
  sources: BiofeedbackSource[];
  /** Samples per second */
  sample_rate_hz: number;
  /** Normalize raw readings to [0, 1] */
  normalize: boolean;
  /** Fire threshold events when crossing */
  emit_on_threshold: boolean;
  /** Source-specific low and high thresholds */
  thresholds: Partial<Record<BiofeedbackSource, BiofeedbackThreshold>>;
  /** Expected ranges for normalization per source (raw min/max) */
  ranges: Partial<Record<BiofeedbackSource, { min: number; max: number }>>;
}

// Default physiological ranges for normalization
const DEFAULT_RANGES: Record<BiofeedbackSource, { min: number; max: number }> = {
  heart_rate: { min: 40, max: 200 },    // BPM
  gsr:        { min: 0.1, max: 20 },    // µS
  pupil:      { min: 2, max: 8 },       // mm
  breath_rate: { min: 4, max: 40 },     // breaths/min
  eeg_alpha:  { min: 0, max: 100 },     // µV²
};

// =============================================================================
// HANDLER
// =============================================================================

export const biofeedbackHandler: TraitHandler<BiofeedbackConfig> = {
  name: 'biofeedback' as any,

  defaultConfig: {
    sources: ['heart_rate'],
    sample_rate_hz: 10,
    normalize: true,
    emit_on_threshold: true,
    thresholds: {},
    ranges: {},
  },

  onAttach(node, config, context) {
    const state: BiofeedbackState = {
      isConnected: false,
      samples: new Map(),
      lastSampleTime: 0,
      thresholdEdge: new Map(),
    };
    (node as any).__biofeedbackState = state;

    context.emit?.('biofeedback_connect', {
      node,
      sources: config.sources,
      sampleRateHz: config.sample_rate_hz,
    });
  },

  onDetach(node, _config, context) {
    const state = (node as any).__biofeedbackState as BiofeedbackState;
    if (state?.isConnected) {
      context.emit?.('biofeedback_disconnect', { node });
    }
    delete (node as any).__biofeedbackState;
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__biofeedbackState as BiofeedbackState;
    if (!state) return;

    if (event.type === 'biofeedback_device_connected') {
      state.isConnected = true;
      context.emit?.('on_biofeedback_ready', { node, sources: config.sources });

    } else if (event.type === 'biofeedback_device_disconnected') {
      state.isConnected = false;
      context.emit?.('on_biofeedback_lost', { node });

    } else if (event.type === 'biofeedback_sample') {
      const source = event.source as BiofeedbackSource;
      const rawValue = event.value as number;

      if (!config.sources.includes(source)) return;

      const range = config.ranges[source] ?? DEFAULT_RANGES[source];
      const normalized = config.normalize
        ? Math.max(0, Math.min(1, (rawValue - range.min) / (range.max - range.min)))
        : rawValue;

      const sample: BiofeedbackSample = {
        source,
        raw: rawValue,
        normalized,
        timestamp: Date.now(),
      };

      state.samples.set(source, sample);
      state.lastSampleTime = Date.now();

      context.emit?.('biofeedback_reading', {
        node, source, raw: rawValue, normalized, timestamp: sample.timestamp,
      });

      // Threshold edge detection
      if (config.emit_on_threshold && config.thresholds[source]) {
        const threshold = config.thresholds[source]!;
        const prevEdge = state.thresholdEdge.get(source) ?? 'normal';
        let newEdge: 'low' | 'high' | 'normal';

        if (rawValue <= threshold.low) newEdge = 'low';
        else if (rawValue >= threshold.high) newEdge = 'high';
        else newEdge = 'normal';

        if (newEdge !== prevEdge) {
          state.thresholdEdge.set(source, newEdge);
          context.emit?.('biofeedback_threshold_crossed', {
            node, source, direction: newEdge, value: rawValue, normalized,
          });
        }
      }

    } else if (event.type === 'biofeedback_query') {
      const source = event.source as BiofeedbackSource | undefined;
      if (source) {
        const sample = state.samples.get(source);
        context.emit?.('biofeedback_response', {
          queryId: event.queryId, node, source, sample: sample ?? null,
        });
      } else {
        // Return all samples
        const allSamples = Object.fromEntries(state.samples.entries());
        context.emit?.('biofeedback_response', {
          queryId: event.queryId, node, samples: allSamples,
        });
      }

    } else if (event.type === 'biofeedback_calibrate') {
      // Recalibrate zero-point (clear samples, reconnect)
      state.samples.clear();
      state.thresholdEdge.clear();
      context.emit?.('biofeedback_connect', {
        node, sources: config.sources, sampleRateHz: config.sample_rate_hz,
      });
    }
  },
};

export default biofeedbackHandler;
