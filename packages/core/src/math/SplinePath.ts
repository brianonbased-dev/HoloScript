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

export interface SplinePoint {
  x: number;
  y: number;
  z: number;
}

function withIndexAccess(point: SplinePoint): SplinePoint {
  if (!Object.prototype.hasOwnProperty.call(point, 0)) {
    Object.defineProperty(point, 0, {
      get() {
        return point.x;
      },
      enumerable: false,
    });
    Object.defineProperty(point, 1, {
      get() {
        return point.y;
      },
      enumerable: false,
    });
    Object.defineProperty(point, 2, {
      get() {
        return point.z;
      },
      enumerable: false,
    });
  }
  return point;
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
    this.points.push({ x, y, z });
    this.dirty = true;
  }

  setPoint(index: number, x: number, y: number, z = 0): void {
    if (index >= 0 && index < this.points.length) {
      this.points[index] = { x, y, z };
      this.dirty = true;
    }
  }

  removePoint(index: number): void {
    this.points.splice(index, 1);
    this.dirty = true;
  }

  getPoints(): SplinePoint[] {
    return [...this.points];
  }
  getPointCount(): number {
    return this.points.length;
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  evaluate(t: number): SplinePoint {
    if (this.points.length === 0) return withIndexAccess({ x: 0, y: 0, z: 0 });
    if (this.points.length === 1) return withIndexAccess({ ...this.points[0] });

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
    return withIndexAccess({
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t,
      z: p0.z + (p1.z - p0.z) * t,
    });
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

    return withIndexAccess({
      x: interp(p0.x, p1.x, p2.x, p3.x),
      y: interp(p0.y, p1.y, p2.y, p3.y),
      z: interp(p0.z, p1.z, p2.z, p3.z),
    });
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

    return withIndexAccess({
      x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
      y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
      z: uuu * p0.z + 3 * uu * t * p1.z + 3 * u * tt * p2.z + ttt * p3.z,
    });
  }

  private getWrapped(index: number): SplinePoint {
    const len = this.points.length;
    if (len === 0) return { x: 0, y: 0, z: 0 };
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
      const dx = curr.x - prev.x,
        dy = curr.y - prev.y,
        dz = curr.z - prev.z;
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
    const dx = b.x - a.x,
      dy = b.y - a.y,
      dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return { x: dx / len, y: dy / len, z: dz / len };
  }
}
