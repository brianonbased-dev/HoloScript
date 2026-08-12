/**
 * beatDetector.ts
 *
 * Turns a 1-D vertical position stream (hand wrist, controller grip, or mouse)
 * into conducting beats and a conducted tempo, and measures how long the
 * audible ensemble takes to lock onto a tempo change.
 *
 * All times are seconds on the ONE shared clock (AudioContext.currentTime) so
 * gesture instants and audible click instants are directly comparable.
 */

export interface BeatSample {
  t: number; // seconds, audio clock
  y: number; // vertical position (m in XR, normalized px on desktop)
}

export interface StepTrial {
  fromBpm: number;
  toBpm: number;
  /** When the hand physically left the old tempo (start of first deviating interval). */
  onsetT: number;
  /** When the detector's median crossed the step threshold (diagnostic). */
  stepAtT: number;
  /** First audible click at the new tempo (confirmed by a run of good intervals). */
  lockedAtT: number | null;
  /** Headline: lockedAtT - onsetT. What a player feels. */
  latencyMs: number | null;
  latencyBeats: number | null;
  /** Diagnostic: lockedAtT - stepAtT (excludes the detector's own convergence). */
  detectionLatencyMs: number | null;
}

export interface DetectorConfig {
  minStrokeAmplitude: number; // hysteresis: min |peak-trough| to count a beat
  refractorySec: number; // min time between beats
  minBpm: number;
  maxBpm: number;
  stepFraction: number; // relative tempo change that opens a step trial
  lockFraction: number; // click interval within this fraction of target = locked
  lockRunLength: number; // consecutive locked clicks required
}

export const XR_CONFIG: DetectorConfig = {
  minStrokeAmplitude: 0.04,
  refractorySec: 0.18,
  minBpm: 40,
  maxBpm: 220,
  stepFraction: 0.15,
  lockFraction: 0.08,
  lockRunLength: 3,
};

export const DESKTOP_CONFIG: DetectorConfig = {
  ...XR_CONFIG,
  minStrokeAmplitude: 24, // px
};

/** Median of a non-empty array. */
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export class BeatDetector {
  private cfg: DetectorConfig;

  private lastSample: BeatSample | null = null;
  private velocity = 0; // EMA-smoothed
  private lastExtremeY: number | null = null; // top of the current stroke
  private lastBeatT = -Infinity;

  /** Hand-beat instants (audio-clock seconds). */
  readonly beatTimes: number[] = [];
  /** Inter-beat intervals (seconds), parallel to beatTimes[1..]. */
  readonly intervals: number[] = [];

  private _conductedBpm: number | null = null;
  private stableBpm: number | null = null;

  /** Open trial waiting for the ensemble to lock, if any. */
  private openTrial: StepTrial | null = null;
  readonly trials: StepTrial[] = [];

  /** Offsets between each hand beat and the nearest audible click (ms). */
  readonly beatToClickOffsetsMs: number[] = [];
  private clickTimes: number[] = [];

  onBeat: ((t: number, bpm: number | null) => void) | null = null;
  onStep: ((trial: StepTrial) => void) | null = null;
  onLock: ((trial: StepTrial) => void) | null = null;

  constructor(cfg: DetectorConfig) {
    this.cfg = cfg;
  }

  get conductedBpm(): number | null {
    return this._conductedBpm;
  }

  /** Feed one position sample. Returns a beat time if this sample closed a beat. */
  addSample(s: BeatSample): number | null {
    if (this.lastSample === null) {
      this.lastSample = s;
      this.lastExtremeY = s.y;
      return null;
    }
    const dt = s.t - this.lastSample.t;
    if (dt <= 0) return null;

    const rawV = (s.y - this.lastSample.y) / dt;
    this.velocity = 0.7 * this.velocity + 0.3 * rawV;
    const prevV = this.velocity - 0.3 * rawV; // pre-update EMA, sign reference

    let beatT: number | null = null;

    // Track the top of the stroke while moving up.
    if (this.velocity > 0 && s.y > (this.lastExtremeY ?? -Infinity)) {
      this.lastExtremeY = s.y;
    }

    // Bottom of a downstroke: velocity turns from down to up.
    const turnedUp = prevV < 0 && this.velocity >= 0;
    if (turnedUp) {
      const stroke = (this.lastExtremeY ?? s.y) - s.y;
      const sinceLast = s.t - this.lastBeatT;
      if (stroke >= this.cfg.minStrokeAmplitude && sinceLast >= this.cfg.refractorySec) {
        beatT = s.t;
        this.registerBeat(s.t);
      }
      this.lastExtremeY = s.y; // reset stroke tracking from here
    }

    this.lastSample = s;
    return beatT;
  }

  private registerBeat(t: number): void {
    if (this.beatTimes.length > 0) {
      const interval = t - this.beatTimes[this.beatTimes.length - 1];
      const bpm = 60 / interval;
      if (bpm >= this.cfg.minBpm && bpm <= this.cfg.maxBpm) {
        this.intervals.push(interval);
      } else {
        // Out-of-range: treat as a fresh start, keep the beat but no interval.
        this.beatTimes.push(t);
        this.lastBeatT = t;
        this.onBeat?.(t, this._conductedBpm);
        return;
      }
    }
    this.beatTimes.push(t);
    this.lastBeatT = t;

    const recent = this.intervals.slice(-3);
    if (recent.length >= 2) {
      const newBpm = 60 / median(recent);
      this.detectStep(newBpm, t);
      this._conductedBpm = newBpm;
    }
    this.onBeat?.(t, this._conductedBpm);
  }

  private detectStep(newBpm: number, t: number): void {
    const prior = this.intervals.slice(-7, -3);
    if (prior.length >= 3) {
      const priorBpm = 60 / median(prior);
      const rel = Math.abs(newBpm - priorBpm) / priorBpm;
      if (rel >= this.cfg.stepFraction && this.openTrial === null) {
        this.stableBpm = priorBpm;
        // Walk back to the first interval that already deviated from the old
        // tempo — its start is when the hand physically changed speed.
        let k0 = this.intervals.length - 1;
        for (let k = this.intervals.length - 1; k >= Math.max(0, this.intervals.length - 4); k--) {
          const iv = this.intervals[k];
          if (Math.abs(60 / iv - priorBpm) / priorBpm >= this.cfg.stepFraction) k0 = k;
          else break;
        }
        this.openTrial = {
          fromBpm: priorBpm,
          toBpm: newBpm,
          onsetT: this.beatTimes[k0],
          stepAtT: t,
          lockedAtT: null,
          latencyMs: null,
          latencyBeats: null,
          detectionLatencyMs: null,
        };
        this.onStep?.(this.openTrial);
      } else if (this.openTrial !== null) {
        // Keep the trial's target current while the conductor settles.
        this.openTrial.toBpm = newBpm;
      }
    }
  }

  /** Report an audible click (scheduled time + output latency, audio clock). */
  addClick(t: number): void {
    this.clickTimes.push(t);

    // Per-beat phase offset: nearest hand beat within half a second.
    let best = Infinity;
    for (let i = this.beatTimes.length - 1; i >= 0 && this.beatTimes[i] > t - 1.5; i--) {
      const d = Math.abs(t - this.beatTimes[i]);
      if (d < best) best = d;
    }
    if (best <= 0.5) this.beatToClickOffsetsMs.push(best * 1000);

    // Step-trial lock detection on audible inter-click intervals.
    const trial = this.openTrial;
    if (trial && this.clickTimes.length >= this.cfg.lockRunLength + 1) {
      const targetInterval = 60 / trial.toBpm;
      const tail = this.clickTimes.slice(-(this.cfg.lockRunLength + 1));
      let locked = true;
      for (let i = 1; i < tail.length; i++) {
        const iv = tail[i] - tail[i - 1];
        if (Math.abs(iv - targetInterval) / targetInterval > this.cfg.lockFraction) {
          locked = false;
          break;
        }
      }
      if (locked && tail[0] >= trial.onsetT - targetInterval * 0.5) {
        // The ensemble was at the new tempo from the FIRST click of the
        // confirming run; the rest of the run is evidence, not latency.
        const lockedAt = tail[1];
        trial.lockedAtT = lockedAt;
        trial.latencyMs = (lockedAt - trial.onsetT) * 1000;
        trial.latencyBeats = (lockedAt - trial.onsetT) / targetInterval;
        trial.detectionLatencyMs = (lockedAt - trial.stepAtT) * 1000;
        this.trials.push(trial);
        this.openTrial = null;
        this.onLock?.(trial);
      }
    }
  }

  summary() {
    const done = this.trials.filter((tr) => tr.latencyMs !== null);
    return {
      beats: this.beatTimes.length,
      conductedBpm: this._conductedBpm,
      trials: done,
      medianStepLatencyMs: done.length ? median(done.map((tr) => tr.latencyMs as number)) : null,
      medianStepLatencyBeats: done.length
        ? median(done.map((tr) => tr.latencyBeats as number))
        : null,
      medianBeatOffsetMs: this.beatToClickOffsetsMs.length
        ? median(this.beatToClickOffsetsMs)
        : null,
    };
  }
}
