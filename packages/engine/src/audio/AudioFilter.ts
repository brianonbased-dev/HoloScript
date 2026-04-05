/**
 * AudioFilter.ts
 *
 * Audio filters: low-pass, high-pass, band-pass,
 * parametric EQ, resonance, and cascaded biquads.
 *
 * @module audio
 */

// =============================================================================
// TYPES
// =============================================================================

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking';

export interface FilterConfig {
  type: FilterType;
  frequency: number; // Cutoff/center Hz
  q: number; // Resonance / Q factor
  gain: number; // dB (for peaking)
}

export interface EQBand {
  id: string;
  config: FilterConfig;
  enabled: boolean;
}

// =============================================================================
// AUDIO FILTER
// =============================================================================

export class AudioFilter {
  private bands: Map<string, EQBand> = new Map();

  // ---------------------------------------------------------------------------
  // Band Management
  // ---------------------------------------------------------------------------

  addBand(id: string, config: FilterConfig): void {
    this.bands.set(id, { id, config, enabled: true });
  }

  removeBand(id: string): void {
    this.bands.delete(id);
  }

  setBandEnabled(id: string, enabled: boolean): void {
    const band = this.bands.get(id);
    if (band) band.enabled = enabled;
  }

  setFrequency(id: string, freq: number): void {
    const band = this.bands.get(id);
    if (band) band.config.frequency = Math.max(20, Math.min(20000, freq));
  }

  setQ(id: string, q: number): void {
    const band = this.bands.get(id);
    if (band) band.config.q = Math.max(0.1, Math.min(30, q));
  }

  setGain(id: string, gain: number): void {
    const band = this.bands.get(id);
    if (band) band.config.gain = Math.max(-24, Math.min(24, gain));
  }

  // ---------------------------------------------------------------------------
  // Processing (simplified magnitude response)
  // ---------------------------------------------------------------------------

  getResponse(frequency: number): number {
    let totalGain = 0;

    for (const band of this.bands.values()) {
      if (!band.enabled) continue;
      totalGain += this.computeBandResponse(band.config, frequency);
    }

    return totalGain;
  }

  private computeBandResponse(config: FilterConfig, freq: number): number {
    const ratio = freq / config.frequency;

    switch (config.type) {
      case 'lowpass':
        return ratio <= 1 ? 0 : -12 * Math.log2(ratio) * config.q;
      case 'highpass':
        return ratio >= 1 ? 0 : -12 * Math.log2(1 / ratio) * config.q;
      case 'bandpass': {
        const bw = config.frequency / config.q;
        const dist = Math.abs(freq - config.frequency);
        return dist <= bw / 2 ? 0 : -(dist / bw) * 6;
      }
      case 'notch': {
        const bw = config.frequency / config.q;
        const dist = Math.abs(freq - config.frequency);
        return dist <= bw / 2 ? -config.gain : 0;
      }
      case 'peaking': {
        const bw = config.frequency / config.q;
        const dist = Math.abs(freq - config.frequency);
        if (dist >= bw) return 0;
        return config.gain * (1 - dist / bw);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getBand(id: string): EQBand | undefined {
    return this.bands.get(id);
  }
  getBandCount(): number {
    return this.bands.size;
  }
  getEnabledBandCount(): number {
    return [...this.bands.values()].filter((b) => b.enabled).length;
  }
}

