/**
 * CurveEditor.ts
 *
 * Editable animation curves: keyframes with tangent handles,
 * evaluation, presets, and curve manipulation.
 *
 * @module math
 */

// =============================================================================
// TYPES
// =============================================================================

export type TangentMode = 'auto' | 'free' | 'flat' | 'linear' | 'stepped';

export interface CurveKeyframe {
  time: number;
  value: number;
  inTangent: number;
  outTangent: number;
  tangentMode: TangentMode;
}

export type CurvePreset =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'constant'
  | 'bounce'
  | 'spring';

// =============================================================================
// CURVE EDITOR
// =============================================================================

export class CurveEditor {
  private keyframes: CurveKeyframe[] = [];
  private wrapMode: 'clamp' | 'loop' | 'ping-pong' = 'clamp';

  // ---------------------------------------------------------------------------
  // Keyframe Management
  // ---------------------------------------------------------------------------

  addKey(time: number, value: number, tangentMode: TangentMode = 'auto'): CurveKeyframe {
    const key: CurveKeyframe = { time, value, inTangent: 0, outTangent: 0, tangentMode };
    this.keyframes.push(key);
    this.keyframes.sort((a, b) => a.time - b.time);
    this.autoComputeTangents();
    return key;
  }

  removeKey(index: number): void {
    this.keyframes.splice(index, 1);
    this.autoComputeTangents();
  }

  setKey(index: number, time: number, value: number): void {
    if (index < 0 || index >= this.keyframes.length) return;
    this.keyframes[index].time = time;
    this.keyframes[index].value = value;
    this.keyframes.sort((a, b) => a.time - b.time);
    this.autoComputeTangents();
  }

  setTangents(index: number, inTangent: number, outTangent: number): void {
    if (index < 0 || index >= this.keyframes.length) return;
    this.keyframes[index].inTangent = inTangent;
    this.keyframes[index].outTangent = outTangent;
    this.keyframes[index].tangentMode = 'free';
  }

  getKeyframes(): CurveKeyframe[] {
    return [...this.keyframes];
  }
  getKeyCount(): number {
    return this.keyframes.length;
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  evaluate(time: number): number {
    if (this.keyframes.length === 0) return 0;
    if (this.keyframes.length === 1) return this.keyframes[0].value;

    // Wrap time
    const first = this.keyframes[0].time;
    const last = this.keyframes[this.keyframes.length - 1].time;
    const duration = last - first;

    if (duration <= 0) return this.keyframes[0].value;

    let t = time;
    if (this.wrapMode === 'loop' && duration > 0) {
      t = first + ((((t - first) % duration) + duration) % duration);
    } else if (this.wrapMode === 'ping-pong' && duration > 0) {
      const cycle = (t - first) / duration;
      const phase = cycle % 2;
      t = phase < 1 ? first + phase * duration : first + (2 - phase) * duration;
    }

    // Clamp
    if (t <= first) return this.keyframes[0].value;
    if (t >= last) return this.keyframes[this.keyframes.length - 1].value;

    // Find segment
    let i = 0;
    for (; i < this.keyframes.length - 1; i++) {
      if (t >= this.keyframes[i].time && t < this.keyframes[i + 1].time) break;
    }

    const k0 = this.keyframes[i];
    const k1 = this.keyframes[i + 1];

    // Stepped mode
    if (k0.tangentMode === 'stepped') return k0.value;

    const dt = k1.time - k0.time;
    const localT = (t - k0.time) / dt;

    // Hermite interpolation
    return this.hermite(k0.value, k0.outTangent * dt, k1.value, k1.inTangent * dt, localT);
  }

  private hermite(p0: number, m0: number, p1: number, m1: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1
    );
  }

  // ---------------------------------------------------------------------------
  // Auto Tangents
  // ---------------------------------------------------------------------------

  private autoComputeTangents(): void {
    for (let i = 0; i < this.keyframes.length; i++) {
      const key = this.keyframes[i];
      if (key.tangentMode !== 'auto') continue;

      const prev = this.keyframes[i - 1];
      const next = this.keyframes[i + 1];

      if (prev && next) {
        const slope = (next.value - prev.value) / (next.time - prev.time);
        key.inTangent = slope;
        key.outTangent = slope;
      } else if (next) {
        const slope = (next.value - key.value) / (next.time - key.time);
        key.inTangent = slope;
        key.outTangent = slope;
      } else if (prev) {
        const slope = (key.value - prev.value) / (key.time - prev.time);
        key.inTangent = slope;
        key.outTangent = slope;
      } else {
        key.inTangent = 0;
        key.outTangent = 0;
      }

      if (key.tangentMode === 'flat') {
        key.inTangent = 0;
        key.outTangent = 0;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Presets
  // ---------------------------------------------------------------------------

  loadPreset(preset: CurvePreset): void {
    this.keyframes = [];
    switch (preset) {
      case 'linear':
        this.addKey(0, 0, 'linear');
        this.addKey(1, 1, 'linear');
        this.keyframes[0].outTangent = 1;
        this.keyframes[1].inTangent = 1;
        break;
      case 'ease-in':
        this.addKey(0, 0, 'free');
        this.addKey(1, 1, 'free');
        this.keyframes[0].outTangent = 0;
        this.keyframes[1].inTangent = 2;
        break;
      case 'ease-out':
        this.addKey(0, 0, 'free');
        this.addKey(1, 1, 'free');
        this.keyframes[0].outTangent = 2;
        this.keyframes[1].inTangent = 0;
        break;
      case 'ease-in-out':
        this.addKey(0, 0, 'free');
        this.addKey(1, 1, 'free');
        this.keyframes[0].outTangent = 0;
        this.keyframes[1].inTangent = 0;
        break;
      case 'constant':
        this.addKey(0, 1, 'stepped');
        this.addKey(1, 1, 'stepped');
        break;
      case 'bounce':
        this.addKey(0, 0, 'auto');
        this.addKey(0.5, 1, 'auto');
        this.addKey(0.75, 0.5, 'auto');
        this.addKey(1, 1, 'auto');
        break;
      case 'spring':
        this.addKey(0, 0, 'auto');
        this.addKey(0.3, 1.2, 'auto');
        this.addKey(0.6, 0.9, 'auto');
        this.addKey(1, 1, 'auto');
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Wrap Mode
  // ---------------------------------------------------------------------------

  setWrapMode(mode: 'clamp' | 'loop' | 'ping-pong'): void {
    this.wrapMode = mode;
  }
  getWrapMode(): string {
    return this.wrapMode;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getValueRange(): { min: number; max: number } {
    if (this.keyframes.length === 0) return { min: 0, max: 0 };
    let min = Infinity,
      max = -Infinity;
    for (const k of this.keyframes) {
      if (k.value < min) min = k.value;
      if (k.value > max) max = k.value;
    }
    return { min, max };
  }

  getTimeRange(): { start: number; end: number } {
    if (this.keyframes.length === 0) return { start: 0, end: 0 };
    return { start: this.keyframes[0].time, end: this.keyframes[this.keyframes.length - 1].time };
  }
}
