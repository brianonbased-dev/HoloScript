/**
 * CameraPath.ts
 *
 * Spline-based camera paths: Catmull-Rom interpolation,
 * speed control, look-at targets, and looping.
 *
 * @module camera
 */

// =============================================================================
// TYPES
// =============================================================================

export interface PathPoint {
  x: number;
  y: number;
  z: number;
  lookAtX?: number;
  lookAtY?: number;
  lookAtZ?: number;
  speedMultiplier?: number; // 1 = default speed
}

// =============================================================================
// CAMERA PATH
// =============================================================================

export class CameraPath {
  private points: PathPoint[] = [];
  private progress = 0; // 0-1
  private speed = 1; // Units per second
  private loop = false;
  private playing = false;

  // ---------------------------------------------------------------------------
  // Path Setup
  // ---------------------------------------------------------------------------

  setPoints(points: PathPoint[]): void {
    this.points = [...points];
  }
  addPoint(point: PathPoint): void {
    this.points.push(point);
  }
  clearPoints(): void {
    this.points = [];
    this.progress = 0;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }
  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  play(): void {
    this.playing = true;
    this.progress = 0;
  }
  pause(): void {
    this.playing = false;
  }
  resume(): void {
    this.playing = true;
  }
  stop(): void {
    this.playing = false;
    this.progress = 0;
  }

  update(dt: number): {
    position: { x: number; y: number; z: number };
    lookAt: { x: number; y: number; z: number } | null;
  } | null {
    if (!this.playing || this.points.length < 2) return null;

    // Get speed multiplier at current point
    const segIndex = Math.min(
      Math.floor(this.progress * (this.points.length - 1)),
      this.points.length - 2
    );
    const speedMul = this.points[segIndex]?.speedMultiplier ?? 1;

    // Advance
    const totalLength = this.points.length - 1;
    this.progress += (dt * this.speed * speedMul) / totalLength;

    if (this.progress >= 1) {
      if (this.loop) {
        this.progress %= 1;
      } else {
        this.progress = 1;
        this.playing = false;
      }
    }

    return this.evaluate(this.progress);
  }

  // ---------------------------------------------------------------------------
  // Catmull-Rom Evaluation
  // ---------------------------------------------------------------------------

  evaluate(t: number): {
    position: { x: number; y: number; z: number };
    lookAt: { x: number; y: number; z: number } | null;
  } {
    const n = this.points.length;
    if (n === 0) return { position: { x: 0, y: 0, z: 0 }, lookAt: null };
    if (n === 1) return { position: { ...this.points[0] }, lookAt: null };

    const f = t * (n - 1);
    const i = Math.min(Math.floor(f), n - 2);
    const frac = f - i;

    // Get 4 control points (clamped)
    const p0 = this.points[Math.max(0, i - 1)];
    const p1 = this.points[i];
    const p2 = this.points[Math.min(n - 1, i + 1)];
    const p3 = this.points[Math.min(n - 1, i + 2)];

    const position = {
      x: this.catmullRom(p0.x, p1.x, p2.x, p3.x, frac),
      y: this.catmullRom(p0.y, p1.y, p2.y, p3.y, frac),
      z: this.catmullRom(p0.z, p1.z, p2.z, p3.z, frac),
    };

    // Look-at interpolation
    let lookAt: { x: number; y: number; z: number } | null = null;
    if (p1.lookAtX !== undefined && p2.lookAtX !== undefined) {
      lookAt = {
        x: p1.lookAtX! + (p2.lookAtX! - p1.lookAtX!) * frac,
        y: (p1.lookAtY ?? 0) + ((p2.lookAtY ?? 0) - (p1.lookAtY ?? 0)) * frac,
        z: (p1.lookAtZ ?? 0) + ((p2.lookAtZ ?? 0) - (p1.lookAtZ ?? 0)) * frac,
      };
    }

    return { position, lookAt };
  }

  private catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t,
      t3 = t2 * t;
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
    );
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getProgress(): number {
    return this.progress;
  }
  isPlaying(): boolean {
    return this.playing;
  }
  getPointCount(): number {
    return this.points.length;
  }
}
