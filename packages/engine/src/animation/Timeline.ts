/**
 * Timeline.ts
 *
 * Sequential and parallel animation group orchestration.
 * Enables complex choreographed animation sequences.
 */

import { AnimationEngine, AnimationClip, Easing } from './AnimationEngine';

// =============================================================================
// TYPES
// =============================================================================

export type TimelineMode = 'sequential' | 'parallel';

export interface TimelineEntry {
  clip: AnimationClip;
  setter: (value: number) => void;
  startOffset?: number; // Manual offset within a parallel group
}

export interface TimelineConfig {
  mode: TimelineMode;
  loop: boolean;
  loopCount: number; // -1 = infinite
  pingPong: boolean;
  delay: number;
  onComplete?: () => void;
  onLoop?: (count: number) => void;
}

// =============================================================================
// TIMELINE
// =============================================================================

export class Timeline {
  private entries: TimelineEntry[] = [];
  private config: TimelineConfig;
  private engine: AnimationEngine;
  private elapsed: number = 0;
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private currentLoop: number = 0;
  private direction: 1 | -1 = 1;
  private totalDuration: number = 0;

  constructor(config: Partial<TimelineConfig> = {}, engine?: AnimationEngine) {
    this.config = {
      mode: 'sequential',
      loop: false,
      loopCount: 1,
      pingPong: false,
      delay: 0,
      ...config,
    };
    this.engine = engine || new AnimationEngine();
  }

  /**
   * Add an animation to the timeline.
   */
  add(clip: AnimationClip, setter: (value: number) => void, startOffset?: number): Timeline {
    this.entries.push({ clip, setter, startOffset });
    this.recalcDuration();
    return this; // Chainable
  }

  /**
   * Start playing the timeline.
   */
  play(): void {
    this.elapsed = -this.config.delay;
    this.isPlaying = true;
    this.isPaused = false;
    this.currentLoop = 0;
    this.direction = 1;
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  stop(): void {
    this.isPlaying = false;
    this.engine.clear();
  }

  /**
   * Update the timeline. Call every frame.
   */
  update(delta: number): void {
    if (!this.isPlaying || this.isPaused) return;

    this.elapsed += delta * this.direction;

    // Still in delay?
    if (this.elapsed < 0) return;

    const t = this.totalDuration > 0 ? this.elapsed / this.totalDuration : 1;

    if (this.config.mode === 'sequential') {
      this.updateSequential(this.elapsed);
    } else {
      this.updateParallel(this.elapsed);
    }

    // Update the engine (drives any clips we've started)
    this.engine.update(delta);

    // Check for completion
    if (this.elapsed >= this.totalDuration) {
      this.handleCompletion();
    }
  }

  private updateSequential(elapsed: number): void {
    let cumulativeTime = 0;

    for (const entry of this.entries) {
      const clipStart = cumulativeTime + (entry.clip.delay || 0);
      const clipEnd = clipStart + entry.clip.duration;

      if (elapsed >= clipStart && elapsed < clipEnd) {
        // Start this clip if not already active
        if (!this.engine.isActive(entry.clip.id)) {
          this.engine.play(entry.clip, entry.setter);
        }
      }

      cumulativeTime = clipEnd;
    }
  }

  private updateParallel(elapsed: number): void {
    for (const entry of this.entries) {
      const offset = entry.startOffset || 0;

      if (elapsed >= offset && !this.engine.isActive(entry.clip.id)) {
        // Adjust delay for offset
        const adjustedClip = {
          ...entry.clip,
          delay: Math.max(0, offset - elapsed),
        };
        this.engine.play(adjustedClip, entry.setter);
      }
    }
  }

  private handleCompletion(): void {
    this.currentLoop++;

    if (this.config.pingPong) {
      this.direction *= -1;
      this.elapsed = this.direction === -1 ? this.totalDuration : 0;
      this.engine.clear();

      if (this.config.onLoop) this.config.onLoop(this.currentLoop);

      if (!this.config.loop && this.currentLoop >= this.config.loopCount * 2) {
        this.isPlaying = false;
        if (this.config.onComplete) this.config.onComplete();
      }
    } else if (this.config.loop) {
      if (this.config.loopCount !== -1 && this.currentLoop >= this.config.loopCount) {
        this.isPlaying = false;
        if (this.config.onComplete) this.config.onComplete();
      } else {
        this.elapsed = 0;
        this.engine.clear();
        if (this.config.onLoop) this.config.onLoop(this.currentLoop);
      }
    } else {
      this.isPlaying = false;
      if (this.config.onComplete) this.config.onComplete();
    }
  }

  private recalcDuration(): void {
    if (this.config.mode === 'sequential') {
      this.totalDuration = this.entries.reduce(
        (sum, e) => sum + e.clip.duration + (e.clip.delay || 0),
        0
      );
    } else {
      this.totalDuration = this.entries.reduce(
        (max, e) => Math.max(max, (e.startOffset || 0) + e.clip.duration),
        0
      );
    }
  }

  /**
   * Get total duration of the timeline.
   */
  getDuration(): number {
    return this.totalDuration;
  }

  /**
   * Get current elapsed time.
   */
  getElapsed(): number {
    return Math.max(0, this.elapsed);
  }

  /**
   * Get normalized progress (0-1).
   */
  getProgress(): number {
    return this.totalDuration > 0 ? Math.max(0, Math.min(1, this.elapsed / this.totalDuration)) : 0;
  }
}

