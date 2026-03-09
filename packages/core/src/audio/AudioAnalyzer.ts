/**
 * AudioAnalyzer.ts
 *
 * Real-time audio analysis: FFT spectrum, beat detection,
 * loudness metering, and audio-reactive parameter extraction.
 *
 * @module audio
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SpectrumData {
  frequencies: Float32Array; // Magnitude per bin
  binCount: number;
  sampleRate: number;
  peakFrequency: number;
  peakMagnitude: number;
}

export interface BeatDetectionConfig {
  sensitivity: number; // 0-1 (higher = more sensitive)
  minInterval: number; // Minimum ms between beats
  energyThreshold: number; // Minimum energy to trigger
  frequencyRange: { low: number; high: number }; // Hz range to analyze
}

export interface BeatEvent {
  timestamp: number;
  energy: number;
  bpm: number;
  strength: number; // 0-1, how strong the beat is
}

export interface LoudnessMetrics {
  rms: number; // Root mean square (0-1)
  peak: number; // Peak amplitude (0-1)
  lufs: number; // Loudness Units Full Scale (dB)
  dynamicRange: number; // Difference between peak and average (dB)
}

export interface AudioBand {
  name: string;
  low: number; // Hz
  high: number; // Hz
  energy: number; // 0-1
}

// =============================================================================
// FFT (simple DFT for testing / headless)
// =============================================================================

function simpleDFT(samples: Float32Array, binCount: number): Float32Array {
  const magnitudes = new Float32Array(binCount);
  const N = samples.length;

  for (let k = 0; k < binCount; k++) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      real += samples[n] * Math.cos(angle);
      imag -= samples[n] * Math.sin(angle);
    }
    magnitudes[k] = Math.sqrt(real * real + imag * imag) / N;
  }

  return magnitudes;
}

// =============================================================================
// AUDIO ANALYZER
// =============================================================================

export const DEFAULT_BANDS: AudioBand[] = [
  { name: 'sub', low: 20, high: 60, energy: 0 },
  { name: 'bass', low: 60, high: 250, energy: 0 },
  { name: 'lowMid', low: 250, high: 500, energy: 0 },
  { name: 'mid', low: 500, high: 2000, energy: 0 },
  { name: 'highMid', low: 2000, high: 4000, energy: 0 },
  { name: 'presence', low: 4000, high: 6000, energy: 0 },
  { name: 'brilliance', low: 6000, high: 20000, energy: 0 },
];

export class AudioAnalyzer {
  private fftSize: number;
  private sampleRate: number;
  private currentSpectrum: SpectrumData | null = null;
  private bands: AudioBand[];
  private beatConfig: BeatDetectionConfig;
  private beatHistory: BeatEvent[] = [];
  private energyHistory: number[] = [];
  private lastBeatTime = 0;
  private smoothedEnergy = 0;
  private loudness: LoudnessMetrics = { rms: 0, peak: 0, lufs: -100, dynamicRange: 0 };

  constructor(
    fftSize: number = 256,
    sampleRate: number = 44100,
    beatConfig?: Partial<BeatDetectionConfig>
  ) {
    this.fftSize = fftSize;
    this.sampleRate = sampleRate;
    this.bands = DEFAULT_BANDS.map((b) => ({ ...b }));
    this.beatConfig = {
      sensitivity: 0.5,
      minInterval: 200,
      energyThreshold: 0.1,
      frequencyRange: { low: 60, high: 250 },
      ...beatConfig,
    };
  }

  // ---------------------------------------------------------------------------
  // Analysis
  // ---------------------------------------------------------------------------

  /**
   * Analyze a buffer of audio samples.
   */
  analyze(samples: Float32Array, currentTimeMs: number): void {
    // FFT
    const binCount = Math.min(this.fftSize / 2, samples.length / 2);
    const frequencies = simpleDFT(samples, binCount);

    // Find peak
    let peakMag = 0;
    let peakBin = 0;
    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] > peakMag) {
        peakMag = frequencies[i];
        peakBin = i;
      }
    }

    this.currentSpectrum = {
      frequencies,
      binCount,
      sampleRate: this.sampleRate,
      peakFrequency: (peakBin * this.sampleRate) / (binCount * 2),
      peakMagnitude: peakMag,
    };

    // Compute band energies
    this.computeBands(frequencies, binCount);

    // Loudness metering
    this.computeLoudness(samples);

    // Beat detection
    this.detectBeat(currentTimeMs);
  }

  private computeBands(frequencies: Float32Array, binCount: number): void {
    const binWidth = this.sampleRate / (binCount * 2);

    for (const band of this.bands) {
      const startBin = Math.floor(band.low / binWidth);
      const endBin = Math.min(Math.ceil(band.high / binWidth), binCount - 1);

      let sum = 0;
      let count = 0;
      for (let i = startBin; i <= endBin; i++) {
        sum += frequencies[i];
        count++;
      }

      band.energy = count > 0 ? sum / count : 0;
    }
  }

  private computeLoudness(samples: Float32Array): void {
    let sumSquares = 0;
    let peak = 0;

    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      sumSquares += samples[i] * samples[i];
      if (abs > peak) peak = abs;
    }

    const rms = Math.sqrt(sumSquares / samples.length);
    const lufs = rms > 0 ? 20 * Math.log10(rms) : -100;
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -100;

    this.loudness = {
      rms,
      peak,
      lufs,
      dynamicRange: peakDb - lufs,
    };
  }

  private detectBeat(currentTimeMs: number): void {
    // Use bass band energy for beat detection
    const bassEnergy = this.getBandEnergy('bass');
    this.energyHistory.push(bassEnergy);
    if (this.energyHistory.length > 43) this.energyHistory.shift(); // ~1 sec at 43 fps

    // Moving average energy
    const avgEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;

    // Exponential smooth
    this.smoothedEnergy = this.smoothedEnergy * 0.8 + bassEnergy * 0.2;

    // Beat threshold: current energy exceeds average by sensitivity factor
    const threshold =
      avgEnergy * (1 + this.beatConfig.sensitivity * 2) + this.beatConfig.energyThreshold;
    const timeSinceLastBeat = currentTimeMs - this.lastBeatTime;

    if (bassEnergy > threshold && timeSinceLastBeat > this.beatConfig.minInterval) {
      // Estimate BPM from recent beats
      const bpm = this.estimateBPM();
      const strength = Math.min(1, (bassEnergy - avgEnergy) / Math.max(avgEnergy, 0.01));

      const beat: BeatEvent = {
        timestamp: currentTimeMs,
        energy: bassEnergy,
        bpm,
        strength,
      };

      this.beatHistory.push(beat);
      if (this.beatHistory.length > 20) this.beatHistory.shift();
      this.lastBeatTime = currentTimeMs;
    }
  }

  private estimateBPM(): number {
    if (this.beatHistory.length < 2) return 0;

    const intervals: number[] = [];
    for (let i = 1; i < this.beatHistory.length; i++) {
      intervals.push(this.beatHistory[i].timestamp - this.beatHistory[i - 1].timestamp);
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return avgInterval > 0 ? 60000 / avgInterval : 0;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getSpectrum(): SpectrumData | null {
    return this.currentSpectrum;
  }

  getBands(): AudioBand[] {
    return this.bands.map((b) => ({ ...b }));
  }

  getBandEnergy(bandName: string): number {
    return this.bands.find((b) => b.name === bandName)?.energy ?? 0;
  }

  getLoudness(): LoudnessMetrics {
    return { ...this.loudness };
  }

  getBeats(): BeatEvent[] {
    return [...this.beatHistory];
  }

  getLastBeat(): BeatEvent | null {
    return this.beatHistory.length > 0 ? this.beatHistory[this.beatHistory.length - 1] : null;
  }

  getEstimatedBPM(): number {
    return this.estimateBPM();
  }

  getSmoothedEnergy(): number {
    return this.smoothedEnergy;
  }

  /**
   * Get a normalized 0-1 value for audio-reactive use.
   * Combines bass energy with beat strength.
   */
  getReactiveValue(): number {
    const bass = this.getBandEnergy('bass');
    const lastBeat = this.getLastBeat();
    const beatBoost = lastBeat ? lastBeat.strength * 0.3 : 0;
    return Math.min(1, bass + beatBoost);
  }

  reset(): void {
    this.currentSpectrum = null;
    this.bands = DEFAULT_BANDS.map((b) => ({ ...b }));
    this.beatHistory = [];
    this.energyHistory = [];
    this.smoothedEnergy = 0;
    this.lastBeatTime = 0;
    this.loudness = { rms: 0, peak: 0, lufs: -100, dynamicRange: 0 };
  }
}
