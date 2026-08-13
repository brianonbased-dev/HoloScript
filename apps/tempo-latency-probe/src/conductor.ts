/**
 * conductor.ts
 *
 * The connection this prototype exists to prove: gesture beats (BeatDetector)
 * driving the real engine transport (SequencerImpl.setTempoAnchored) with the
 * real engine synth (SynthEngine) rendering the clicks — measured end to end
 * on one clock.
 */

import { SequencerImpl } from '../../../packages/engine/src/audio/Sequencer';
import { SynthEngine } from '../../../packages/engine/src/audio/SynthEngine';
import type { IAudioContext, IAudioEvent } from '../../../packages/engine/src/audio/AudioTypes';
import { BeatDetector, BeatSample, DetectorConfig } from './beatDetector';

/**
 * SequencerImpl reads only `currentTime` off its IAudioContext (verified in
 * source). This adapter hands it the real WebAudio clock so engine musical
 * time IS speaker time, one clock domain end to end.
 */
function webAudioClock(ac: AudioContext): IAudioContext {
  const clock = {
    get currentTime() {
      return ac.currentTime;
    },
    get sampleRate() {
      return ac.sampleRate;
    },
    state: 'running' as const,
    async initialize() {},
    async suspend() {},
    async resume() {},
    dispose() {},
  };
  return clock as unknown as IAudioContext;
}

/** Render a click into an AudioBuffer using the engine's own SynthEngine. */
function renderClick(ac: AudioContext, frequency: number, seconds = 0.09): AudioBuffer {
  const synth = new SynthEngine();
  synth.noteOn(frequency, 'triangle', { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 });
  const n = Math.floor(seconds * ac.sampleRate);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const ch = buf.getChannelData(0);
  const dt = 1 / ac.sampleRate;
  for (let i = 0; i < n; i++) {
    ch[i] = synth.generateSample(i * dt) * 0.8;
    synth.update(dt);
  }
  return buf;
}

export interface ConductorEvents {
  onBeat?: (t: number, bpm: number | null, stroke?: number) => void;
  onClick?: (t: number, isDownbeat: boolean, velocity?: number) => void;
  onStep?: () => void;
  onLock?: (latencyMs: number, latencyBeats: number) => void;
}

export class Conductor {
  readonly ac: AudioContext;
  readonly seq: SequencerImpl;
  readonly detector: BeatDetector;
  private clickHi: AudioBuffer;
  private clickLo: AudioBuffer;
  private events: ConductorEvents;
  private running = false;
  /** Set true to reproduce the naive-setter fault (self-test negative control). */
  useNaiveSetter = false;
  /** Phase correction: fraction of the phase error corrected per hand beat. */
  phaseGain = 0.5;
  /** Phase correction clamp as a fraction of the current beat period. */
  phaseClampFrac = 0.25;
  /**
   * 'follow' (default): the ensemble follows the hand — gates 1–3 behavior.
   * 'lead': the ensemble holds its own tempo (lessons where the drum leads);
   * beats are still detected and scored, but never drive the transport.
   */
  followMode: 'follow' | 'lead' = 'follow';
  /**
   * In follow mode: after this many beats with no hand beat, the ensemble
   * rests (pauses) and waits for the next detected beat to resume — an
   * orchestra that has lost its conductor falls quiet. null = never rest
   * (the probe's original behavior).
   */
  autoRestBeats: number | null = null;
  private lastHandBeatT: number | null = null;
  /** Signed hand-vs-grid offsets (ms; negative = hand early), newest last. */
  readonly signedOffsets: { t: number; ms: number }[] = [];
  /** Per-beat strike velocities (0.35–1.25; 1 = nominal), newest last. */
  readonly velocities: { t: number; v: number }[] = [];
  private strokeWindow: number[] = [];
  private pendingVelocity = 1;

  constructor(ac: AudioContext, cfg: DetectorConfig, events: ConductorEvents = {}) {
    this.ac = ac;
    this.events = events;
    this.seq = new SequencerImpl(webAudioClock(ac));
    this.detector = new BeatDetector(cfg);
    this.clickHi = renderClick(ac, 1660);
    this.clickLo = renderClick(ac, 880);

    this.detector.onBeat = (t, bpm, stroke) => {
      this.lastHandBeatT = t;
      // A resting ensemble wakes on the conductor's next beat.
      if (this.running && this.seq.state === 'paused') {
        this.seq.start();
      }
      // Scoring senses — always on, in both modes.
      if (this.running) {
        const period = 60 / this.seq.getBPM();
        const { prevBeatT, nextBeatT } = this.seq.gridAround(t);
        const sErr =
          Math.abs(t - prevBeatT) <= Math.abs(t - nextBeatT) ? t - prevBeatT : t - nextBeatT;
        this.signedOffsets.push({ t, ms: sErr * 1000 });
        if (this.signedOffsets.length > 128) this.signedOffsets.shift();

        // Stroke size → strike velocity, normalized against the hand's own
        // recent median so "big" and "small" are relative to the player.
        if (stroke && stroke > 0) {
          this.strokeWindow.push(stroke);
          if (this.strokeWindow.length > 12) this.strokeWindow.shift();
          const med = [...this.strokeWindow].sort((a, b) => a - b)[
            Math.floor(this.strokeWindow.length / 2)
          ];
          const ratio = med > 0 ? stroke / med : 1;
          this.pendingVelocity =
            this.followMode === 'lead' ? 1 : Math.max(0.35, Math.min(1.25, 0.25 + 0.75 * ratio));
          this.velocities.push({ t, v: this.pendingVelocity });
          if (this.velocities.length > 128) this.velocities.shift();
        }
        void period;
      }

      if (bpm !== null && this.running && this.followMode === 'follow') {
        if (this.useNaiveSetter) {
          this.seq.setBPM(bpm);
        } else {
          this.seq.setTempoAnchored(bpm);
          // Phase follows speed. Steady conducting: slide the grid a little
          // toward the hand's beat each stroke (gate-1 finding #2). A tempo
          // BREAK is a musical restart: snap the grid decisively onto the
          // conductor's beat, so the new tempo's clicks are clean at once —
          // gentle nudges after a break would smear corrections across
          // several intervals and delay the audible lock.
          // Phase reference is the ENGINE's actual grid (gridAround) —
          // reconstructing it as lastClick + period is wrong right after a
          // retempo (fractional-beat continuation) and silently
          // under-corrects (measured: +6 ms "error" vs a true ~280 ms).
          {
            const period = 60 / this.seq.getBPM();
            const { prevBeatT, nextBeatT } = this.seq.gridAround(t);
            const err =
              Math.abs(t - prevBeatT) <= Math.abs(t - nextBeatT) ? t - prevBeatT : t - nextBeatT;
            if (this.detector.lastBeatWasBreak) {
              // Full snap: a break stroke restarts the grid on the
              // conductor's beat; a truncated snap leaves a residue that
              // delays every subsequent clean interval (measured 157 ms).
              this.seq.nudgePhase(err, 0.95 * period);
            } else {
              this.seq.nudgePhase(this.phaseGain * err, this.phaseClampFrac * period);
            }
          }
        }
      }
      this.events.onBeat?.(t, bpm, stroke);
    };
    this.detector.onStep = () => this.events.onStep?.();
    this.detector.onLock = (trial) =>
      this.events.onLock?.(trial.latencyMs as number, trial.latencyBeats as number);

    // Engine beat events carry exact musical timestamps — schedule the click
    // buffer at that time (or immediately if the 25ms tick already passed it).
    this.seq.on('beat', (ev: IAudioEvent) => {
      // Conductor gone quiet? The ensemble rests until the next downbeat.
      if (
        this.autoRestBeats !== null &&
        this.followMode === 'follow' &&
        this.lastHandBeatT !== null &&
        ev.timestamp - this.lastHandBeatT > (this.autoRestBeats * 60) / this.seq.getBPM()
      ) {
        this.seq.pause();
        return;
      }
      const beatInBar = (ev.data?.beat as number) ?? 0;
      const at = Math.max(ev.timestamp, this.ac.currentTime);
      const velocity = this.pendingVelocity;
      const src = this.ac.createBufferSource();
      src.buffer = beatInBar === 0 ? this.clickHi : this.clickLo;
      const gainNode = this.ac.createGain();
      gainNode.gain.value = velocity;
      src.connect(gainNode);
      gainNode.connect(this.ac.destination);
      src.start(at);
      const audibleAt = at + (this.ac.outputLatency || this.ac.baseLatency || 0);
      this.detector.addClick(audibleAt);
      this.events.onClick?.(audibleAt, beatInBar === 0, velocity);
    });
  }

  /**
   * Replace the beat sounds (e.g. the Bravura room swaps clicks for timpani
   * strikes rendered through the same SynthEngine). hi = downbeat.
   */
  setClickBuffers(hi: AudioBuffer, lo: AudioBuffer): void {
    this.clickHi = hi;
    this.clickLo = lo;
  }

  start(initialBpm = 90): void {
    if (this.running) return;
    this.seq.setBPM(initialBpm);
    this.seq.start();
    this.running = true;
  }

  stop(): void {
    if (!this.running) return;
    this.seq.stop();
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  feed(sample: BeatSample): void {
    this.detector.addSample(sample);
  }

  /** Current audible tempo (what the sequencer transport is set to). */
  get ensembleBpm(): number {
    return this.seq.getBPM();
  }

  /** True while the ensemble is resting, waiting for the conductor. */
  get isResting(): boolean {
    return this.running && this.seq.state === 'paused';
  }

  /** Reset the scoring senses (called at each lesson boundary). */
  clearScoring(): void {
    this.signedOffsets.length = 0;
    this.velocities.length = 0;
    this.strokeWindow.length = 0;
    this.pendingVelocity = 1;
  }
}
