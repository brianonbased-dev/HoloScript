/**
 * SplinePath.ts
 *
 * Parametric splines: Catmull-Rom, cubic Bezier, linear,
 * looping, arc-length parameterization, and closest point.
 *
 * @module math
 */

// =============================================================================
// TYPES
// =============================================================================

export type SplineType = 'linear' | 'catmull-rom' | 'bezier';

export type SplinePoint = [number, number, number];

function P(x: number, y: number, z: number): SplinePoint {
  return [x, y, z];
}

// =============================================================================
// SPLINE PATH
// =============================================================================

export class SplinePath {
  private points: SplinePoint[] = [];
  private type: SplineType = 'catmull-rom';
  private loop = false;
  private tension = 0.5; // Catmull-Rom tension
  private arcLengthTable: number[] = [];
  private totalLength = 0;
  private dirty = true;
  private resolution = 100; // Samples for arc-length table

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setType(type: SplineType): void {
    this.type = type;
    this.dirty = true;
  }
  getType(): SplineType {
    return this.type;
  }
  setLoop(loop: boolean): void {
    this.loop = loop;
    this.dirty = true;
  }
  isLoop(): boolean {
    return this.loop;
  }
  setTension(t: number): void {
    this.tension = Math.max(0, Math.min(1, t));
    this.dirty = true;
  }

  // ---------------------------------------------------------------------------
  // Points
  // ---------------------------------------------------------------------------

  addPoint(x: number, y: number, z = 0): void {
    this.points.push(P(x, y, z));
    this.dirty = true;
  }

  setPoint(index: number, x: number, y: number, z = 0): void {
    if (index >= 0 && index < this.points.length) {
      this.points[index] = P(x, y, z);
      this.dirty = true;
    }
  }

  removePoint(index: number): void {
    this.points.splice(index, 1);
    this.dirty = true;
  }

  getPoints(): SplinePoint[] {
    return this.points.map(([x, y, z]) => [x, y, z] as SplinePoint);
  }
  getPointCount(): number {
    return this.points.length;
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  evaluate(t: number): SplinePoint {
    if (this.points.length === 0) return P(0, 0, 0);
    if (this.points.length === 1) return P(this.points[0][0], this.points[0][1], this.points[0][2]);

    t = Math.max(0, Math.min(1, t));
    const segments = this.loop ? this.points.length : this.points.length - 1;
    const scaled = t * segments;
    const seg = Math.min(Math.floor(scaled), segments - 1);
    const localT = scaled - seg;

    switch (this.type) {
      case 'linear':
        return this.evalLinear(seg, localT);
      case 'catmull-rom':
        return this.evalCatmullRom(seg, localT);
      case 'bezier':
        return this.evalBezier(seg, localT);
      default:
        return this.evalLinear(seg, localT);
    }
  }

  private evalLinear(seg: number, t: number): SplinePoint {
    const p0 = this.getWrapped(seg);
    const p1 = this.getWrapped(seg + 1);
    return P(
      p0[0] + (p1[0] - p0[0]) * t,
      p0[1] + (p1[1] - p0[1]) * t,
      p0[2] + (p1[2] - p0[2]) * t
    );
  }

  private evalCatmullRom(seg: number, t: number): SplinePoint {
    const p0 = this.getWrapped(seg - 1);
    const p1 = this.getWrapped(seg);
    const p2 = this.getWrapped(seg + 1);
    const p3 = this.getWrapped(seg + 2);

    const tt = t * t;
    const ttt = tt * t;
    const s = this.tension;

    const interp = (a: number, b: number, c: number, d: number) => {
      return (
        b +
        0.5 * s * ((-a + c) * t + (2 * a - 5 * b + 4 * c - d) * tt + (-a + 3 * b - 3 * c + d) * ttt)
      );
    };

    return P(
      interp(p0[0], p1[0], p2[0], p3[0]),
      interp(p0[1], p1[1], p2[1], p3[1]),
      interp(p0[2], p1[2], p2[2], p3[2])
    );
  }

  private evalBezier(seg: number, t: number): SplinePoint {
    // Use pairs of control points: P0, P1 (control), P2 (control), P3
    const idx = seg * 3;
    if (idx + 3 >= this.points.length && !this.loop) {
      // Fallback to linear for incomplete bezier segments
      return this.evalLinear(Math.min(seg, this.points.length - 2), t);
    }
    const p0 = this.getWrapped(idx);
    const p1 = this.getWrapped(idx + 1);
    const p2 = this.getWrapped(idx + 2);
    const p3 = this.getWrapped(idx + 3);

    const u = 1 - t;
    const uu = u * u;
    const uuu = uu * u;
    const tt = t * t;
    const ttt = tt * t;

    return P(
      uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0],
      uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1],
      uuu * p0[2] + 3 * uu * t * p1[2] + 3 * u * tt * p2[2] + ttt * p3[2]
    );
  }

  private getWrapped(index: number): SplinePoint {
    const len = this.points.length;
    if (len === 0) return P(0, 0, 0);
    if (this.loop) return this.points[((index % len) + len) % len];
    return this.points[Math.max(0, Math.min(len - 1, index))];
  }

  // ---------------------------------------------------------------------------
  // Arc Length
  // ---------------------------------------------------------------------------

  getLength(): number {
    if (this.dirty) this.buildArcLengthTable();
    return this.totalLength;
  }

  evaluateAtDistance(distance: number): SplinePoint {
    if (this.dirty) this.buildArcLengthTable();
    if (this.totalLength === 0) return this.evaluate(0);

    const targetDist = Math.max(0, Math.min(this.totalLength, distance));
    const t = this.distanceToT(targetDist);
    return this.evaluate(t);
  }

  private buildArcLengthTable(): void {
    this.arcLengthTable = [0];
    let total = 0;
    let prev = this.evaluate(0);

    for (let i = 1; i <= this.resolution; i++) {
      const t = i / this.resolution;
      const curr = this.evaluate(t);
      const dx = curr[0] - prev[0],
        dy = curr[1] - prev[1],
        dz = curr[2] - prev[2];
      total += Math.sqrt(dx * dx + dy * dy + dz * dz);
      this.arcLengthTable.push(total);
      prev = curr;
    }

    this.totalLength = total;
    this.dirty = false;
  }

  private distanceToT(distance: number): number {
    const table = this.arcLengthTable;
    // Binary search
    let lo = 0,
      hi = table.length - 1;
    while (lo < hi - 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (table[mid] < distance) lo = mid;
      else hi = mid;
    }
    const segLen = table[hi] - table[lo];
    const frac = segLen > 0 ? (distance - table[lo]) / segLen : 0;
    return (lo + frac) / this.resolution;
  }

  // ---------------------------------------------------------------------------
  // Tangent
  // ---------------------------------------------------------------------------

  getTangent(t: number): SplinePoint {
    const eps = 0.001;
    const a = this.evaluate(Math.max(0, t - eps));
    const b = this.evaluate(Math.min(1, t + eps));
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return P(dx / len, dy / len, dz / len);
  }
}
