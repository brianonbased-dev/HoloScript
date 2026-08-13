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
  onBeat?: (t: number, bpm: number | null) => void;
  onClick?: (t: number, isDownbeat: boolean) => void;
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

  constructor(ac: AudioContext, cfg: DetectorConfig, events: ConductorEvents = {}) {
    this.ac = ac;
    this.events = events;
    this.seq = new SequencerImpl(webAudioClock(ac));
    this.detector = new BeatDetector(cfg);
    this.clickHi = renderClick(ac, 1660);
    this.clickLo = renderClick(ac, 880);

    this.detector.onBeat = (t, bpm) => {
      if (bpm !== null && this.running) {
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
      this.events.onBeat?.(t, bpm);
    };
    this.detector.onStep = () => this.events.onStep?.();
    this.detector.onLock = (trial) =>
      this.events.onLock?.(trial.latencyMs as number, trial.latencyBeats as number);

    // Engine beat events carry exact musical timestamps — schedule the click
    // buffer at that time (or immediately if the 25ms tick already passed it).
    this.seq.on('beat', (ev: IAudioEvent) => {
      const beatInBar = (ev.data?.beat as number) ?? 0;
      const at = Math.max(ev.timestamp, this.ac.currentTime);
      const src = this.ac.createBufferSource();
      src.buffer = beatInBar === 0 ? this.clickHi : this.clickLo;
      src.connect(this.ac.destination);
      src.start(at);
      const audibleAt = at + (this.ac.outputLatency || this.ac.baseLatency || 0);
      this.detector.addClick(audibleAt);
      this.events.onClick?.(audibleAt, beatInBar === 0);
    });
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
}
