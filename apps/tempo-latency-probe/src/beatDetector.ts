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
  /** optional lateral position, same units as y — enables beat-pattern shapes */
  x?: number;
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
  /**
   * Diagnostic: latency measured to the END of the confirming run — this is
   * gate 1's original (over-strict) stamp, kept so gate-1 and gate-2 numbers
   * stay directly comparable across the definition fix.
   */
  confirmedLatencyMs: number | null;
}

export interface DetectorConfig {
  minStrokeAmplitude: number; // hysteresis: min |peak-trough| to count a beat
  refractorySec: number; // min time between beats
  minBpm: number;
  maxBpm: number;
  stepFraction: number; // relative tempo change that opens a step trial
  lockFraction: number; // click interval within this fraction of target = locked
  lockRunLength: number; // consecutive locked clicks required
  /**
   * Gate 2 estimator: a single stroke whose implied tempo differs from the
   * current estimate by at least this fraction is treated as a deliberate
   * tempo break and trusted immediately (median smoothing resumes after).
   */
  jumpFraction: number;
}

export const XR_CONFIG: DetectorConfig = {
  minStrokeAmplitude: 0.04,
  refractorySec: 0.18,
  minBpm: 40,
  maxBpm: 220,
  stepFraction: 0.15,
  lockFraction: 0.08,
  lockRunLength: 3,
  jumpFraction: 0.12,
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
  /** Lateral position at each beat (NaN when the feed had no x), parallel to beatTimes. */
  readonly beatXs: number[] = [];
  /** Inter-beat intervals (seconds), parallel to beatTimes[1..]. */
  readonly intervals: number[] = [];
  private lastX = NaN;

  private _conductedBpm: number | null = null;
  private stableBpm: number | null = null;
  /** Beats remaining in fast-trust mode after a detected tempo break. */
  private attentive = 0;
  /** True exactly when the most recent beat was a jump-commit (tempo break). */
  lastBeatWasBreak = false;

  /** Open trial waiting for the ensemble to lock, if any. */
  private openTrial: StepTrial | null = null;
  readonly trials: StepTrial[] = [];
  /** No new trial may open until this many intervals exist (post-lock quarantine). */
  private quarantineUntilInterval = 0;

  /** Offsets between each hand beat and the nearest audible click (ms). */
  readonly beatToClickOffsetsMs: number[] = [];
  private clickTimes: number[] = [];

  /** stroke = |peak−trough| of the detected downstroke (m in XR, px desktop). */
  onBeat: ((t: number, bpm: number | null, stroke: number) => void) | null = null;
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
    if (s.x !== undefined) this.lastX = s.x;
    if (this.lastSample === null) {
      this.lastSample = s;
      this.lastExtremeY = s.y;
      return null;
    }
    const dt = s.t - this.lastSample.t;
    if (dt <= 0) return null;

    const rawV = (s.y - this.lastSample.y) / dt;
    this.velocity = 0.55 * this.velocity + 0.45 * rawV;
    const prevV = this.velocity - 0.45 * rawV; // pre-update EMA, sign reference

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
        this.registerBeat(s.t, stroke);
      }
      this.lastExtremeY = s.y; // reset stroke tracking from here
    }

    this.lastSample = s;
    return beatT;
  }

  private registerBeat(t: number, stroke = 0): void {
    if (this.beatTimes.length > 0) {
      const interval = t - this.beatTimes[this.beatTimes.length - 1];
      const bpm = 60 / interval;
      if (bpm >= this.cfg.minBpm && bpm <= this.cfg.maxBpm) {
        this.intervals.push(interval);
      } else {
        // Out-of-range: treat as a fresh start, keep the beat but no interval.
        this.beatTimes.push(t);
        this.beatXs.push(this.lastX);
        this.lastBeatT = t;
        this.onBeat?.(t, this._conductedBpm, stroke);
        return;
      }
    }
    this.beatTimes.push(t);
    this.beatXs.push(this.lastX);
    this.lastBeatT = t;

    const n = this.intervals.length;
    this.lastBeatWasBreak = false;
    if (n >= 1) {
      const instant = 60 / this.intervals[n - 1];
      let est: number;
      if (
        this._conductedBpm !== null &&
        Math.abs(instant - this._conductedBpm) / this._conductedBpm >= this.cfg.jumpFraction
      ) {
        // A single stroke this different is a deliberate tempo break —
        // trust it now; the next beats refine with a short median.
        est = instant;
        this.attentive = 2;
        this.lastBeatWasBreak = true;
      } else if (this.attentive > 0 && n >= 2) {
        est = 60 / median(this.intervals.slice(-2));
        this.attentive--;
      } else if (n >= 3) {
        est = 60 / median(this.intervals.slice(-3));
      } else if (n >= 2) {
        est = 60 / median(this.intervals.slice(-2));
      } else {
        est = instant;
      }
      this.detectStep(est, t);
      this._conductedBpm = est;
    }
    this.onBeat?.(t, this._conductedBpm, stroke);
  }

  private detectStep(newBpm: number, t: number): void {
    const prior = this.intervals.slice(-7, -3);
    if (prior.length >= 3) {
      const priorBpm = 60 / median(prior);
      const rel = Math.abs(newBpm - priorBpm) / priorBpm;
      if (
        rel >= this.cfg.stepFraction &&
        this.openTrial === null &&
        // Post-lock quarantine: the prior-stable window must be entirely
        // fresh intervals, or the just-finished step re-detects as a ghost
        // second trial (seen live: fromBpm=111 ghost with negative
        // detection latency).
        this.intervals.length >= this.quarantineUntilInterval
      ) {
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
          confirmedLatencyMs: null,
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
        // The grid holds the new tempo from the run's BASE click — every
        // confirming interval is measured from it. RUN.md's stated meaning
        // ("the first click at your new speed") is tail[0]; gate 1's code
        // stamped tail[1], silently costing one extra beat by definition.
        // One honesty guard: when the OLD grid's phase happens to line up,
        // tail[0] can precede any possible evidence of the new tempo (seen
        // live: a 69 ms "lock" stamped before the first new-tempo stroke).
        // The stamp is therefore the first run click that could only belong
        // to the new tempo: >= onset + half a target interval.
        const floor = trial.onsetT + targetInterval * 0.5;
        let lockedAt = tail[0];
        for (const c of tail) {
          if (c >= floor) {
            lockedAt = c;
            break;
          }
        }
        trial.lockedAtT = lockedAt;
        trial.latencyMs = (lockedAt - trial.onsetT) * 1000;
        trial.latencyBeats = (lockedAt - trial.onsetT) / targetInterval;
        trial.detectionLatencyMs = (lockedAt - trial.stepAtT) * 1000;
        trial.confirmedLatencyMs = (tail[tail.length - 1] - trial.onsetT) * 1000;
        this.trials.push(trial);
        this.openTrial = null;
        this.quarantineUntilInterval = this.intervals.length + 5;
        this.onLock?.(trial);
      }
    }
  }

  summary() {
    const done = this.trials.filter((tr) => tr.latencyMs !== null);
    return {
      // Flight recorder: raw audible click times (tail) so any surprising
      // trial can be read from the receipt instead of re-derived.
      clickLog: this.clickTimes.slice(-48).map((c) => Math.round(c * 1000) / 1000),
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
      steadinessCV: this.steadinessCV(),
    };
  }

  /** Coefficient of variation of the last 8 intervals — the wobble measure. */
  steadinessCV(window = 8): number | null {
    const xs = this.intervals.slice(-window);
    if (xs.length < 4) return null;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length);
    return mean > 0 ? sd / mean : null;
  }
}
