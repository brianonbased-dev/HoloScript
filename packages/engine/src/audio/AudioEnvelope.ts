/**
 * AudioEnvelope.ts
 *
 * ADSR envelope generator: attack/decay/sustain/release,
 * fade curves, ducking, and sidechain compression trigger.
 *
 * @module audio
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ADSRConfig {
  attack: number; // seconds
  decay: number; // seconds
  sustain: number; // 0-1 level
  release: number; // seconds
}

export type EnvelopeStage = 'idle' | 'attack' | 'decay' | 'sustain' | 'release';
export type CurveType = 'linear' | 'exponential' | 'logarithmic';

// =============================================================================
// AUDIO ENVELOPE
// =============================================================================

export class AudioEnvelope {
  private config: ADSRConfig;
  private stage: EnvelopeStage = 'idle';
  private level = 0;
  private elapsed = 0;
  private curve: CurveType;

  constructor(config?: Partial<ADSRConfig>, curve: CurveType = 'linear') {
    this.config = { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3, ...config };
    this.curve = curve;
  }

  // ---------------------------------------------------------------------------
  // Gate On/Off
  // ---------------------------------------------------------------------------

  noteOn(): void {
    this.stage = 'attack';
    this.elapsed = 0;
  }

  noteOff(): void {
    if (this.stage !== 'idle') {
      this.stage = 'release';
      this.elapsed = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Process
  // ---------------------------------------------------------------------------

  process(dt: number): number {
    this.elapsed += dt;

    switch (this.stage) {
      case 'idle':
        this.level = 0;
        break;

      case 'attack': {
        const t = Math.min(1, this.elapsed / this.config.attack);
        this.level = this.applyCurve(t);
        if (t >= 1) {
          this.stage = 'decay';
          this.elapsed = 0;
        }
        break;
      }

      case 'decay': {
        const t = Math.min(1, this.elapsed / this.config.decay);
        this.level = 1 - (1 - this.config.sustain) * this.applyCurve(t);
        if (t >= 1) {
          this.stage = 'sustain';
          this.elapsed = 0;
        }
        break;
      }

      case 'sustain':
        this.level = this.config.sustain;
        break;

      case 'release': {
        const t = Math.min(1, this.elapsed / this.config.release);
        this.level = this.config.sustain * (1 - this.applyCurve(t));
        if (t >= 1) {
          this.stage = 'idle';
          this.level = 0;
        }
        break;
      }
    }

    return this.level;
  }

  // ---------------------------------------------------------------------------
  // Curve Shaping
  // ---------------------------------------------------------------------------

  private applyCurve(t: number): number {
    switch (this.curve) {
      case 'linear':
        return t;
      case 'exponential':
        return t * t;
      case 'logarithmic':
        return Math.sqrt(t);
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getLevel(): number {
    return this.level;
  }
  getStage(): EnvelopeStage {
    return this.stage;
  }
  setConfig(config: Partial<ADSRConfig>): void {
    Object.assign(this.config, config);
  }
  getConfig(): ADSRConfig {
    return { ...this.config };
  }
  isActive(): boolean {
    return this.stage !== 'idle';
  }
}
