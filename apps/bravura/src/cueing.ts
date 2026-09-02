/**
 * cueing.ts — pointing detection for cues. Pure math (unit-checkable
 * in-page) plus a debounced tracker: a cue fires only after pointing is
 * SUSTAINED (~250 ms), and re-arms after release.
 */

import { Mat4, multiply } from './math3';

export type Vec3 = [number, number, number];

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Angle (rad) between ray (origin→dir) and the direction origin→target. */
export function rayAngleTo(origin: Vec3, dir: Vec3, target: Vec3): number {
  const d = norm(dir);
  const to = norm([target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]]);
  const dot = Math.max(-1, Math.min(1, d[0] * to[0] + d[1] * to[1] + d[2] * to[2]));
  return Math.acos(dot);
}

/** True when the ray points within `maxAngleRad` of the target. */
export function rayPointsAt(origin: Vec3, dir: Vec3, target: Vec3, maxAngleRad = 0.35): boolean {
  return rayAngleTo(origin, dir, target) <= maxAngleRad;
}

/** Grip-matrix forward ray (columns are column-major; forward = −Z). */
export function gripRay(grip: Mat4): { origin: Vec3; dir: Vec3 } {
  return {
    origin: [grip[12], grip[13], grip[14]],
    dir: norm([-grip[8], -grip[9], -grip[10]]),
  };
}

/**
 * Project a world point to CSS-pixel screen coordinates. Returns null when
 * the point is behind the camera.
 */
export function projectToScreen(
  proj: Mat4,
  view: Mat4,
  point: Vec3,
  cssW: number,
  cssH: number
): [number, number] | null {
  const m = multiply(proj, view);
  const x = point[0];
  const y = point[1];
  const z = point[2];
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (cw <= 0.0001) return null;
  return [((cx / cw) * 0.5 + 0.5) * cssW, (1 - ((cy / cw) * 0.5 + 0.5)) * cssH];
}

/**
 * One cue per pointing EPISODE. Gaps shorter than `gapSec` merge into the
 * same episode (boundary jitter, tracking flicker); only a clean departure
 * of `gapSec` arms a new episode. A cursor parked on the target therefore
 * fires exactly once — the first field test produced ten cues from two
 * intended points via boundary jitter, which this shape makes impossible.
 */
export class CueTracker {
  /** Called once per sustained point (edge-triggered). */
  onCue: ((t: number) => void) | null = null;
  private lastTrueT = -Infinity;
  private episodeStart: number | null = null;
  private fired = false;

  readonly holdSec: number;
  readonly gapSec: number;
  constructor(holdSec = 0.25, gapSec = 0.6) {
    this.holdSec = holdSec;
    this.gapSec = gapSec;
  }

  update(pointing: boolean, now: number): void {
    if (!pointing) return; // episode expiry is judged by the gap on the next true
    if (this.episodeStart === null || now - this.lastTrueT > this.gapSec) {
      this.episodeStart = now;
      this.fired = false;
    }
    this.lastTrueT = now;
    if (!this.fired && now - this.episodeStart >= this.holdSec) {
      this.fired = true;
      this.onCue?.(now);
    }
  }

  /** Pointing right now (within a live episode's flicker tolerance)? */
  isPointingAt(now: number): boolean {
    return now - this.lastTrueT < 0.15;
  }
}
