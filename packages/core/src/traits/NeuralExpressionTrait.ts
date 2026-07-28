/**
 * NeuralExpressionTrait
 *
 * EEG-to-blendshape mapping for continuous sub-frame-latency facial animation.
 *
 * Consumes biometric power-band signals (eeg_alpha, eeg_theta, or any normalized
 * 0-1 biofeedback source) and maps them to named ARKit/glTF blendshape weights
 * via a user-defined transform expression, producing a real-time blendshape layer
 * that complements @biofeedback's event/threshold model.
 *
 * Proposed API from A-009 example-driven request (2026-05-22):
 *   @neural_expression {
 *     sources: ['eeg_alpha', 'eeg_theta']
 *     blendshape_map: {
 *       eeg_alpha: { browDown: '-0.6x', jawOpen: '-0.4x' }
 *       eeg_theta: { cheekPuff: '0.3x' }
 *     }
 *     smoothing_hz: 10
 *   }
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';
import type { BiofeedbackSource } from './BiofeedbackTrait';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A scalar expression string that maps a normalized input value `x` (0-1) to
 * a blendshape weight.  Supported forms:
 *   - `'0.6x'`   → weight = 0.6 * x
 *   - `'-0.4x'`  → weight = -0.4 * x  (inverted)
 *   - `'0.5'`    → weight = 0.5        (constant, source-independent)
 *
 * Weights are clamped to [0, 1] after evaluation (ARKit/glTF convention).
 */
export type BlendshapeExpression = string;

/**
 * Map from blendshape name → transform expression for a single source band.
 * Keys are ARKit/glTF morph target names, e.g. 'browDownLeft', 'jawOpen'.
 */
export type BlendshapeMapping = Record<string, BlendshapeExpression>;

/** Extended biofeedback source type — allows any string key for future bands. */
export type NeuralExpressionSource = BiofeedbackSource | (string & {});

export interface NeuralExpressionConfig {
  /** Which biometric/power-band sources drive expressions. */
  sources: NeuralExpressionSource[];
  /**
   * Per-source blendshape mappings.
   * Key = source name, Value = blendshape map for that source.
   */
  blendshape_map: Partial<Record<NeuralExpressionSource, BlendshapeMapping>>;
  /**
   * Low-pass filter cutoff in Hz — smooths jitter in raw EEG signals.
   * Set to 0 to disable smoothing (direct pass-through).
   * Default: 10 Hz.
   */
  smoothing_hz: number;
}

/** Current blendshape weight for one shape key. */
export interface BlendshapeWeight {
  name: string;
  weight: number;
}

/** Per-source smoothed accumulator. */
interface SourceState {
  smoothed: number;
  lastUpdate: number;
}

export interface NeuralExpressionState {
  /** Smoothed normalized value per source. */
  sourceState: Map<NeuralExpressionSource, SourceState>;
  /**
   * Current blendshape weights (merged across all contributing sources).
   * Key = blendshape name, Value = accumulated weight (clamped 0-1).
   */
  blendshapes: Map<string, number>;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Evaluate a BlendshapeExpression given a normalized input value x.
 * Supports:
 *   - `'<coeff>x'`  → coeff * x  (e.g. '0.6x', '-0.4x', '1.2x')
 *   - `'<constant>'` → constant  (e.g. '0.5', '1')
 * Returns NaN for unrecognized expressions.
 */
export function evaluateExpression(expr: BlendshapeExpression, x: number): number {
  const trimmed = expr.trim();
  // Match optional sign, coefficient, then 'x'
  const xMatch = trimmed.match(/^(-?\d*\.?\d+)x$/i);
  if (xMatch) {
    return parseFloat(xMatch[1]) * x;
  }
  // Constant
  const constMatch = trimmed.match(/^(-?\d*\.?\d+)$/);
  if (constMatch) {
    return parseFloat(constMatch[1]);
  }
  return NaN;
}

/**
 * One-pole low-pass exponential smoothing.
 * alpha = 1 for no smoothing (direct), approaches 0 for heavy smoothing.
 * With dt in seconds and cutoff_hz as the -3dB frequency:
 *   RC = 1 / (2π * cutoff_hz)
 *   alpha = dt / (RC + dt)
 */
function lowPassAlpha(dt: number, cutoff_hz: number): number {
  if (cutoff_hz <= 0 || dt <= 0) return 1;
  const RC = 1 / (2 * Math.PI * cutoff_hz);
  return Math.min(1, dt / (RC + dt));
}

// =============================================================================
// HANDLER
// =============================================================================

export const neuralExpressionHandler: TraitHandler<NeuralExpressionConfig> = {
  name: 'neural_expression',

  defaultConfig: {
    sources: ['eeg_alpha', 'eeg_theta'],
    blendshape_map: {},
    smoothing_hz: 10,
  },

  onAttach(node, config, context) {
    const state: NeuralExpressionState = {
      sourceState: new Map(),
      blendshapes: new Map(),
    };
    for (const src of config.sources) {
      state.sourceState.set(src, { smoothed: 0, lastUpdate: Date.now() });
    }
    node.__neuralExpressionState = state;

    context.emit?.('neural_expression_init', {
      node,
      sources: config.sources,
      blendshapes: Object.keys(Object.assign({}, ...Object.values(config.blendshape_map))),
    });
  },

  onDetach(node, _config, context) {
    const state = node.__neuralExpressionState as NeuralExpressionState | undefined;
    if (state) {
      context.emit?.('neural_expression_reset', { node });
    }
    delete node.__neuralExpressionState;
  },

  onEvent(node, config, context, event) {
    const state = node.__neuralExpressionState as NeuralExpressionState | undefined;
    if (!state) return;

    // ── Incoming biofeedback sample → update expression layer ──
    if (event.type === 'biofeedback_reading' || event.type === 'neural_expression_sample') {
      const source = event.source as NeuralExpressionSource | undefined;
      const normalized = event.normalized as number | undefined;

      if (source == null || normalized == null) return;
      if (!config.sources.includes(source)) return;

      const srcState = state.sourceState.get(source);
      if (!srcState) return;

      // Low-pass smooth
      const now = Date.now();
      const dt = Math.min((now - srcState.lastUpdate) / 1000, 0.1); // cap at 100ms
      const alpha = lowPassAlpha(dt, config.smoothing_hz);
      srcState.smoothed = srcState.smoothed + alpha * (normalized - srcState.smoothed);
      srcState.lastUpdate = now;

      // Recompute blendshape weights for all sources
      state.blendshapes.clear();
      for (const [src, bmap] of Object.entries(config.blendshape_map) as [
        NeuralExpressionSource,
        BlendshapeMapping,
      ][]) {
        const ss = state.sourceState.get(src);
        if (!ss) continue;
        for (const [shapeName, expr] of Object.entries(bmap)) {
          const w = evaluateExpression(expr, ss.smoothed);
          if (!isNaN(w)) {
            const existing = state.blendshapes.get(shapeName) ?? 0;
            // Additive accumulation across sources; clamp to [0, 1]
            state.blendshapes.set(shapeName, Math.max(0, Math.min(1, existing + w)));
          }
        }
      }

      // Build snapshot array for the event payload
      const weights: BlendshapeWeight[] = [];
      state.blendshapes.forEach((weight, name) => weights.push({ name, weight }));

      context.emit?.('neural_expression_frame', {
        node,
        source,
        weights,
        blendshapes: Object.fromEntries(state.blendshapes),
      });
    }

    // ── Query current blendshape state ──
    else if (event.type === 'neural_expression_query') {
      const weights: BlendshapeWeight[] = [];
      state.blendshapes.forEach((weight, name) => weights.push({ name, weight }));
      context.emit?.('neural_expression_response', {
        queryId: event.queryId,
        node,
        weights,
        blendshapes: Object.fromEntries(state.blendshapes),
      });
    }

    // ── Reset all smoothed state (re-zero on device reconnect) ──
    else if (event.type === 'neural_expression_reset') {
      state.blendshapes.clear();
      for (const ss of state.sourceState.values()) {
        ss.smoothed = 0;
        ss.lastUpdate = Date.now();
      }
      context.emit?.('neural_expression_reset', { node });
    }
  },
};

export default neuralExpressionHandler;
