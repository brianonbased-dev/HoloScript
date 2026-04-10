/**
 * SplineFollower.ts
 *
 * Object following along a spline: constant speed,
 * easing, look-ahead, events at markers, and looping.
 *
 * @module math
 */

import { SplinePath, SplinePoint } from './SplinePath';

// =============================================================================
// TYPES
// =============================================================================

export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface SplineMarker {
  id: string;
  t: number; // 0-1 position on spline
  label: string;
  triggered: boolean;
}

// =============================================================================
// SPLINE FOLLOWER
// =============================================================================

let _markerId = 0;

export class SplineFollower {
  private spline: SplinePath;
  private t = 0; // Current parameter (0-1)
  private speed = 1; // Units per second
  private easing: EasingType = 'linear';
  private playing = false;
  private loop = false;
  private pingPong = false;
  private direction = 1; // 1 forward, -1 reverse
  private lookAhead = 0.05; // How far ahead for orientation
  private markers: SplineMarker[] = [];
  private listeners: Array<(marker: SplineMarker) => void> = [];
  private completeListeners: Array<() => void> = [];

  constructor(spline: SplinePath) {
    this.spline = spline;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setSpeed(speed: number): void {
    this.speed = Math.max(0, speed);
  }
  getSpeed(): number {
    return this.speed;
  }
  setEasing(easing: EasingType): void {
    this.easing = easing;
  }
  setLoop(loop: boolean): void {
    this.loop = loop;
  }
  setPingPong(pp: boolean): void {
    this.pingPong = pp;
  }
  setLookAhead(dist: number): void {
    this.lookAhead = dist;
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  play(): void {
    this.playing = true;
  }
  pause(): void {
    this.playing = false;
  }
  stop(): void {
    this.playing = false;
    this.t = 0;
    this.direction = 1;
    this.resetMarkers();
  }
  isPlaying(): boolean {
    return this.playing;
  }
  getT(): number {
    return this.t;
  }
  setT(t: number): void {
    this.t = Math.max(0, Math.min(1, t));
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): SplinePoint {
    if (this.playing) {
      const length = this.spline.getLength();
      if (length > 0) {
        const dtParam = (this.speed * dt) / length;
        this.t += dtParam * this.direction;

        // Check markers
        this.checkMarkers();

        // Bounds
        if (this.t >= 1) {
          if (this.pingPong) {
            this.t = 1;
            this.direction = -1;
          } else if (this.loop) {
            this.t -= 1;
            this.resetMarkers();
          } else {
            this.t = 1;
            this.playing = false;
            for (const l of this.completeListeners) l();
          }
        } else if (this.t <= 0) {
          if (this.pingPong) {
            this.t = 0;
            this.direction = 1;
          } else if (this.loop) {
            this.t += 1;
          } else {
            this.t = 0;
            this.playing = false;
            for (const l of this.completeListeners) l();
          }
        }
      }
    }

    return this.getPosition();
  }

  // ---------------------------------------------------------------------------
  // Position & Orientation
  // ---------------------------------------------------------------------------

  getPosition(): SplinePoint {
    const eased = this.applyEasing(this.t);
    return this.spline.evaluate(eased);
  }

  getLookDirection(): SplinePoint {
    const eased = this.applyEasing(this.t);
    return this.spline.getTangent(eased);
  }

  getLookAheadPosition(): SplinePoint {
    const ahead = Math.min(1, this.applyEasing(this.t) + this.lookAhead);
    return this.spline.evaluate(ahead);
  }

  // ---------------------------------------------------------------------------
  // Easing
  // ---------------------------------------------------------------------------

  private applyEasing(t: number): number {
    switch (this.easing) {
      case 'ease-in':
        return t * t;
      case 'ease-out':
        return 1 - (1 - t) * (1 - t);
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      default:
        return t;
    }
  }

  // ---------------------------------------------------------------------------
  // Markers
  // ---------------------------------------------------------------------------

  addMarker(t: number, label: string): SplineMarker {
    const marker: SplineMarker = { id: `marker_${_markerId++}`, t, label, triggered: false };
    this.markers.push(marker);
    return marker;
  }

  private checkMarkers(): void {
    for (const m of this.markers) {
      if (!m.triggered && this.t >= m.t) {
        m.triggered = true;
        for (const l of this.listeners) l(m);
      }
    }
  }

  private resetMarkers(): void {
    for (const m of this.markers) m.triggered = false;
  }

  onMarker(listener: (marker: SplineMarker) => void): void {
    this.listeners.push(listener);
  }
  onComplete(listener: () => void): void {
    this.completeListeners.push(listener);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getMarkers(): SplineMarker[] {
    return [...this.markers];
  }
  getDistanceTraveled(): number {
    return this.t * this.spline.getLength();
  }
  getRemainingDistance(): number {
    return (1 - this.t) * this.spline.getLength();
  }
}
