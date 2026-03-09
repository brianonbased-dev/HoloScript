/**
 * SynthEngine.ts
 *
 * Software synthesizer: oscillators (sine/square/saw/triangle),
 * ADSR envelopes, filters, wavetables, and polyphony.
 *
 * @module audio
 */

// =============================================================================
// TYPES
// =============================================================================

export type WaveformType = 'sine' | 'square' | 'saw' | 'triangle' | 'noise' | 'wavetable';

export interface ADSREnvelope {
  attack: number; // seconds
  decay: number;
  sustain: number; // 0-1 level
  release: number;
}

export interface OscillatorDef {
  id: string;
  waveform: WaveformType;
  frequency: number;
  amplitude: number;
  phase: number;
  detune: number; // cents
  envelope: ADSREnvelope;
  wavetable?: number[];
}

export interface SynthVoice {
  id: string;
  oscillator: OscillatorDef;
  noteOn: boolean;
  noteOnTime: number;
  noteOffTime: number;
  currentAmplitude: number;
  elapsed: number;
}

export interface FilterDef {
  type: 'lowpass' | 'highpass' | 'bandpass';
  cutoff: number; // Hz
  resonance: number; // Q
}

// =============================================================================
// SYNTH ENGINE
// =============================================================================

let _oscId = 0;

export class SynthEngine {
  private voices: Map<string, SynthVoice> = new Map();
  private maxPolyphony = 16;
  private masterVolume = 1;
  private filter: FilterDef | null = null;
  private sampleRate = 44100;

  // ---------------------------------------------------------------------------
  // Voice Management
  // ---------------------------------------------------------------------------

  noteOn(
    frequency: number,
    waveform: WaveformType = 'sine',
    envelope?: Partial<ADSREnvelope>
  ): string {
    // Steal oldest voice if at max polyphony
    if (this.voices.size >= this.maxPolyphony) {
      const oldest = [...this.voices.entries()].sort((a, b) => a[1].elapsed - b[1].elapsed).pop();
      if (oldest) this.voices.delete(oldest[0]);
    }

    const id = `voice_${_oscId++}`;
    const osc: OscillatorDef = {
      id,
      waveform,
      frequency,
      amplitude: 1,
      phase: 0,
      detune: 0,
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3, ...envelope },
    };

    this.voices.set(id, {
      id,
      oscillator: osc,
      noteOn: true,
      noteOnTime: 0,
      noteOffTime: -1,
      currentAmplitude: 0,
      elapsed: 0,
    });

    return id;
  }

  noteOff(id: string): void {
    const voice = this.voices.get(id);
    if (voice) {
      voice.noteOn = false;
      voice.noteOffTime = voice.elapsed;
    }
  }

  // ---------------------------------------------------------------------------
  // Sample Generation
  // ---------------------------------------------------------------------------

  generateSample(time: number): number {
    let sample = 0;

    for (const voice of this.voices.values()) {
      const osc = voice.oscillator;
      const env = this.computeEnvelope(voice);
      voice.currentAmplitude = env;

      if (env <= 0.001 && !voice.noteOn) {
        continue; // Will be cleaned
      }

      const freq = osc.frequency * Math.pow(2, osc.detune / 1200);
      const t = time + osc.phase;

      let wave = 0;
      switch (osc.waveform) {
        case 'sine':
          wave = Math.sin(2 * Math.PI * freq * t);
          break;
        case 'square':
          wave = Math.sin(2 * Math.PI * freq * t) >= 0 ? 1 : -1;
          break;
        case 'saw':
          wave = 2 * ((freq * t) % 1) - 1;
          break;
        case 'triangle':
          wave = 2 * Math.abs(2 * ((freq * t) % 1) - 1) - 1;
          break;
        case 'noise':
          wave = Math.random() * 2 - 1;
          break;
        default:
          wave = 0;
      }

      sample += wave * osc.amplitude * env;
    }

    return Math.max(-1, Math.min(1, sample * this.masterVolume));
  }

  private computeEnvelope(voice: SynthVoice): number {
    const env = voice.oscillator.envelope;
    const t = voice.elapsed;

    if (voice.noteOn) {
      // Attack
      if (t < env.attack) return t / env.attack;
      // Decay → Sustain
      const decayT = t - env.attack;
      if (decayT < env.decay) return 1 - (1 - env.sustain) * (decayT / env.decay);
      return env.sustain;
    } else {
      // Release
      const releaseT = voice.elapsed - voice.noteOffTime;
      if (releaseT >= env.release) return 0;
      return env.sustain * (1 - releaseT / env.release);
    }
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    const toRemove: string[] = [];
    for (const [id, voice] of this.voices) {
      voice.elapsed += dt;
      if (!voice.noteOn && voice.currentAmplitude <= 0.001) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) this.voices.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
  }
  setMaxPolyphony(n: number): void {
    this.maxPolyphony = n;
  }
  setFilter(filter: FilterDef | null): void {
    this.filter = filter;
  }
  getFilter(): FilterDef | null {
    return this.filter;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getActiveVoiceCount(): number {
    return this.voices.size;
  }
  getVoice(id: string): SynthVoice | undefined {
    return this.voices.get(id);
  }
  getMasterVolume(): number {
    return this.masterVolume;
  }
}
