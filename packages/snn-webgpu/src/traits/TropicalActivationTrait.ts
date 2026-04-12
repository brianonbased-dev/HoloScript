export interface TropicalActivationConfig {
  variant: 'max-plus' | 'min-plus';
  gain: number;
  threshold: number;
}

/**
 * Bridge between SNN rate-coded activations and tropical / classical activations.
 *
 * - max-plus: gain * max(0, x - threshold)   (ReLU bridge)
 * - min-plus: gain * min(0, x - threshold)   (cost-style dual)
 */
export class TropicalActivationTrait {
  forward(
    spikeRates: Float32Array,
    config: TropicalActivationConfig
  ): Float32Array {
    const result = new Float32Array(spikeRates.length);

    for (let i = 0; i < spikeRates.length; i++) {
      const shifted = spikeRates[i] - config.threshold;
      result[i] =
        config.variant === 'max-plus'
          ? config.gain * Math.max(0, shifted)
          : config.gain * Math.min(0, shifted);
    }

    return result;
  }

  toSpikeTiming(activations: Float32Array, maxTime: number): Float32Array {
    const result = new Float32Array(activations.length);

    for (let i = 0; i < activations.length; i++) {
      const activation = activations[i];
      result[i] = activation > 0 ? maxTime / activation : Number.POSITIVE_INFINITY;
    }

    return result;
  }
}
