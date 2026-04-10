/**
 * AudioDynamics.ts
 *
 * Audio dynamics processing: compressor, limiter,
 * noise gate, and sidechain ducking.
 *
 * @module audio
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CompressorConfig {
  threshold: number; // dB
  ratio: number; // e.g. 4:1 = 4
  attack: number; // seconds
  release: number; // seconds
  makeup: number; // dB
  knee: number; // dB (soft knee width)
}

export interface GateConfig {
  threshold: number; // dB
  attack: number;
  release: number;
  range: number; // dB of attenuation when closed
}

// =============================================================================
// AUDIO DYNAMICS
// =============================================================================

export class AudioDynamics {
  private compressor: CompressorConfig;
  private gate: GateConfig;
  private gainReduction = 0;
  private gateOpen = false;
  private envelope = 0;
  private sidechainLevel = 0;
  private ducking = false;
  private duckAmount = 0; // dB

  constructor() {
    this.compressor = { threshold: -20, ratio: 4, attack: 0.003, release: 0.1, makeup: 0, knee: 6 };
    this.gate = { threshold: -40, attack: 0.001, release: 0.05, range: -80 };
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setCompressor(config: Partial<CompressorConfig>): void {
    Object.assign(this.compressor, config);
  }
  setGate(config: Partial<GateConfig>): void {
    Object.assign(this.gate, config);
  }
  getCompressor(): CompressorConfig {
    return { ...this.compressor };
  }

  // ---------------------------------------------------------------------------
  // Processing
  // ---------------------------------------------------------------------------

  processCompressor(inputDb: number): number {
    const c = this.compressor;
    let outputDb: number;

    if (inputDb <= c.threshold - c.knee / 2) {
      outputDb = inputDb; // Below threshold
    } else if (inputDb >= c.threshold + c.knee / 2) {
      // Above threshold: compress
      outputDb = c.threshold + (inputDb - c.threshold) / c.ratio;
    } else {
      // Soft knee region
      const x = inputDb - c.threshold + c.knee / 2;
      outputDb = inputDb + ((1 / c.ratio - 1) * (x * x)) / (2 * c.knee);
    }

    this.gainReduction = inputDb - outputDb;
    return outputDb + c.makeup;
  }

  processGate(inputDb: number, dt: number): number {
    const g = this.gate;

    if (inputDb > g.threshold) {
      // Opening
      this.envelope = Math.min(1, this.envelope + dt / g.attack);
      this.gateOpen = true;
    } else {
      // Closing
      this.envelope = Math.max(0, this.envelope - dt / g.release);
      if (this.envelope <= 0) this.gateOpen = false;
    }

    // Apply range
    const attenuation = g.range * (1 - this.envelope);
    return inputDb + attenuation;
  }

  // ---------------------------------------------------------------------------
  // Sidechain Ducking
  // ---------------------------------------------------------------------------

  setSidechainLevel(db: number): void {
    this.sidechainLevel = db;
  }

  processDucking(inputDb: number, threshold: number, amount: number): number {
    if (this.sidechainLevel > threshold) {
      this.ducking = true;
      this.duckAmount = amount;
      return inputDb - amount;
    }
    this.ducking = false;
    this.duckAmount = 0;
    return inputDb;
  }

  // ---------------------------------------------------------------------------
  // Limiter
  // ---------------------------------------------------------------------------

  limit(inputDb: number, ceiling: number): number {
    return Math.min(inputDb, ceiling);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getGainReduction(): number {
    return this.gainReduction;
  }
  isGateOpen(): boolean {
    return this.gateOpen;
  }
  isDucking(): boolean {
    return this.ducking;
  }
  getDuckAmount(): number {
    return this.duckAmount;
  }
}
