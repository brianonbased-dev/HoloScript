/**
 * SimulationPlayback — State machine for replaying recorded simulation snapshots.
 *
 * States: idle → recording → paused → playing ↔ paused
 *
 * During playback, interpolates between bracketing snapshots for smooth
 * scrubbing at arbitrary speeds (including reverse).
 *
 * @see SimulationRecorder — produces the snapshot history this consumes
 */

import { SimulationRecorder, type FieldSnapshot } from './SimulationRecorder';

// ── Types ────────────────────────────────────────────────────────────────────

export type PlaybackState = 'idle' | 'recording' | 'paused' | 'playing';

export interface PlaybackConfig {
  /** Playback speed multiplier (default: 1.0). Negative = reverse. */
  playbackSpeed?: number;
  /** Enable linear interpolation between snapshots (default: true) */
  interpolation?: boolean;
  /** Loop playback when reaching the end (default: false) */
  loop?: boolean;
}

// ── Playback Controller ──────────────────────────────────────────────────────

export class SimulationPlayback {
  private state: PlaybackState = 'idle';
  private currentTime = 0;
  private speed: number;
  private interpolate: boolean;
  private loop: boolean;
  private recorder: SimulationRecorder;

  // Scratch buffer for interpolation (reused per tick to avoid GC)
  private scratchBuffers: Map<string, Float32Array> = new Map();

  constructor(recorder: SimulationRecorder, config: PlaybackConfig = {}) {
    this.recorder = recorder;
    this.speed = config.playbackSpeed ?? 1.0;
    this.interpolate = config.interpolation ?? true;
    this.loop = config.loop ?? false;
  }

  // ── State Transitions ──────────────────────────────────────────

  startRecording(): void {
    this.state = 'recording';
  }

  stopRecording(): void {
    if (this.state !== 'recording') return;
    this.state = 'paused';
    // Position at end of recording
    const [, end] = this.recorder.timeRange;
    this.currentTime = end;
  }

  play(): void {
    if (this.state === 'paused' || this.state === 'idle') {
      this.state = 'playing';
    }
  }

  pause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
    }
  }

  stop(): void {
    this.state = 'paused';
    this.currentTime = this.recorder.timeRange[0];
  }

  // ── Scrubbing ──────────────────────────────────────────────────

  seekTo(time: number): void {
    const [start, end] = this.recorder.timeRange;
    this.currentTime = Math.max(start, Math.min(end, time));
  }

  seekToFrame(index: number): void {
    const snap = this.recorder.getSnapshot(index);
    if (snap) this.currentTime = snap.time;
  }

  seekToProgress(progress: number): void {
    const [start, end] = this.recorder.timeRange;
    this.currentTime = start + progress * (end - start);
  }

  stepForward(): void {
    const bracket = this.recorder.findBracket(this.currentTime);
    const nextSnap = this.recorder.getSnapshot(bracket.after + 1);
    if (nextSnap) this.currentTime = nextSnap.time;
    else {
      const snap = this.recorder.getSnapshot(bracket.after);
      if (snap) this.currentTime = snap.time;
    }
  }

  stepBackward(): void {
    const bracket = this.recorder.findBracket(this.currentTime);
    const idx = bracket.alpha > 0.01 ? bracket.before : bracket.before - 1;
    const prevSnap = this.recorder.getSnapshot(Math.max(0, idx));
    if (prevSnap) this.currentTime = prevSnap.time;
  }

  // ── Playback Tick ──────────────────────────────────────────────

  /**
   * Advance playback by wall-clock delta seconds.
   * Returns interpolated field data, or null if not in playback mode.
   */
  tick(wallDelta: number): Map<string, Float32Array> | null {
    if (this.state !== 'playing') return null;
    if (this.recorder.frameCount === 0) return null;

    // Advance simulation time by speed-scaled wall delta
    this.currentTime += wallDelta * this.speed;

    // Clamp or loop
    const [start, end] = this.recorder.timeRange;
    if (this.currentTime > end) {
      if (this.loop) {
        this.currentTime = start + (this.currentTime - end) % (end - start || 1);
      } else {
        this.currentTime = end;
        this.state = 'paused';
      }
    } else if (this.currentTime < start) {
      if (this.loop) {
        this.currentTime = end - (start - this.currentTime) % (end - start || 1);
      } else {
        this.currentTime = start;
        this.state = 'paused';
      }
    }

    return this.getFieldsAtCurrentTime();
  }

  /**
   * Get interpolated fields at the current playback time.
   * Can be called from paused state for scrubber preview.
   */
  getFieldsAtCurrentTime(): Map<string, Float32Array> | null {
    if (this.recorder.frameCount === 0) return null;

    const { before, after, alpha } = this.recorder.findBracket(this.currentTime);
    const snapA = this.recorder.getSnapshot(before);
    const snapB = this.recorder.getSnapshot(after);

    if (!snapA) return null;
    if (!snapB || before === after || !this.interpolate) return snapA.fields;

    // Interpolate between snapA and snapB
    return this.interpolateFields(snapA, snapB, alpha);
  }

  // ── Accessors ──────────────────────────────────────────────────

  getState(): PlaybackState { return this.state; }
  getCurrentTime(): number { return this.currentTime; }
  getSpeed(): number { return this.speed; }

  getCurrentFrame(): number {
    const { before } = this.recorder.findBracket(this.currentTime);
    return before;
  }

  getTotalFrames(): number { return this.recorder.frameCount; }
  getTimeRange(): [number, number] { return this.recorder.timeRange; }

  getProgress(): number {
    const [start, end] = this.recorder.timeRange;
    if (end <= start) return 0;
    return (this.currentTime - start) / (end - start);
  }

  getMemoryUsage(): number { return this.recorder.memoryUsage; }

  setSpeed(speed: number): void { this.speed = speed; }
  setLoop(loop: boolean): void { this.loop = loop; }

  // ── Interpolation ──────────────────────────────────────────────

  private interpolateFields(
    a: FieldSnapshot,
    b: FieldSnapshot,
    alpha: number,
  ): Map<string, Float32Array> {
    const result = new Map<string, Float32Array>();
    const oneMinusAlpha = 1 - alpha;

    for (const [name, dataA] of a.fields) {
      const dataB = b.fields.get(name);
      if (!dataB || dataA.length !== dataB.length) {
        result.set(name, dataA); // no interpolation possible
        continue;
      }

      // Reuse scratch buffer if same size
      let out = this.scratchBuffers.get(name);
      if (!out || out.length !== dataA.length) {
        out = new Float32Array(dataA.length);
        this.scratchBuffers.set(name, out);
      }

      // Linear interpolation: out = (1-alpha)*a + alpha*b
      for (let i = 0; i < dataA.length; i++) {
        out[i] = oneMinusAlpha * dataA[i] + alpha * dataB[i];
      }

      result.set(name, out);
    }

    return result;
  }
}
