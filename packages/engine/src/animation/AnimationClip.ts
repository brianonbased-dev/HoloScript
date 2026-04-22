/**
 * AnimationClip.ts
 *
 * Keyframe-based animation clip: multi-track keyframes,
 * interpolation modes, animation events, looping, and blending.
 *
 * @module animation
 */

// =============================================================================
// TYPES
// =============================================================================

export type InterpolationMode = 'step' | 'linear' | 'cubic' | 'slerp';

export interface ClipKeyframe {
  time: number;
  value: number | number[];
  inTangent?: number;
  outTangent?: number;
}

export interface ClipTrack {
  id: string;
  targetPath: string; // e.g. "root/spine/head"
  property: string; // e.g. "position", "rotation", "scale"
  component?: string; // e.g. "x", "y", "z" or null for full vector
  interpolation: InterpolationMode;
  keyframes: ClipKeyframe[];
}

export interface ClipEvent {
  time: number;
  name: string;
  data: Record<string, unknown>;
}

// =============================================================================
// ANIMATION CLIP
// =============================================================================

export class AnimClip {
  readonly id: string;
  readonly name: string;
  private tracks: ClipTrack[] = [];
  private events: ClipEvent[] = [];
  private _duration = 0;
  private loop = false;
  private speed = 1;
  private wrapMode: 'once' | 'loop' | 'ping-pong' | 'clamp' = 'once';

  constructor(id: string, name: string, duration: number) {
    this.id = id;
    this.name = name;
    this._duration = duration;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setLoop(loop: boolean): void {
    this.loop = loop;
    this.wrapMode = loop ? 'loop' : 'once';
  }
  isLooping(): boolean {
    return this.loop;
  }
  setSpeed(speed: number): void {
    this.speed = Math.max(0.01, speed);
  }
  getSpeed(): number {
    return this.speed;
  }
  setWrapMode(mode: typeof this.wrapMode): void {
    this.wrapMode = mode;
  }
  getWrapMode(): string {
    return this.wrapMode;
  }
  getDuration(): number {
    return this._duration;
  }

  // ---------------------------------------------------------------------------
  // Tracks
  // ---------------------------------------------------------------------------

  addTrack(track: ClipTrack): void {
    this.tracks.push(track);
    // Update duration from keyframes
    for (const kf of track.keyframes) {
      if (kf.time > this._duration) this._duration = kf.time;
    }
  }

  getTrack(id: string): ClipTrack | undefined {
    return this.tracks.find((t) => t.id === id);
  }
  getTracks(): ClipTrack[] {
    return [...this.tracks];
  }
  getTrackCount(): number {
    return this.tracks.length;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  addEvent(time: number, name: string, data: Record<string, unknown> = {}): void {
    this.events.push({ time, name, data });
    this.events.sort((a, b) => a.time - b.time);
  }

  getEventsInRange(fromTime: number, toTime: number): ClipEvent[] {
    return this.events.filter((e) => e.time >= fromTime && e.time < toTime);
  }

  getEvents(): ClipEvent[] {
    return [...this.events];
  }

  // ---------------------------------------------------------------------------
  // Sampling
  // ---------------------------------------------------------------------------

  sample(time: number): Map<string, number> {
    const wrapped = this.wrapTime(time);
    const result = new Map<string, number>();

    for (const track of this.tracks) {
      const value = this.sampleTrack(track, wrapped);
      const key = track.component
          ? `${track.targetPath}.${track.property}.${track.component}`
        : `${track.targetPath}.${track.property}`;
      result.set(key, value);
    }

    return result;
  }

  private componentIndex(component: string): number {
    const map: Record<string, number> = { x: 0, y: 1, z: 2, w: 3 };
    return map[component] ?? parseInt(component, 10);
  }

  private sampleTrack(track: ClipTrack, time: number): number {
    const kfs = track.keyframes;
    if (kfs.length === 0) return 0;
    if (kfs.length === 1) return typeof kfs[0].value === 'number' ? kfs[0].value : 0;

    // Find surrounding keyframes
    let i = 0;
    for (; i < kfs.length - 1; i++) {
      if (time < kfs[i + 1].time) break;
    }
    if (i >= kfs.length - 1) i = kfs.length - 2;

    const k0 = kfs[i];
    const k1 = kfs[i + 1];
    const dt = k1.time - k0.time;
    const t = dt > 0 ? (time - k0.time) / dt : 0;

    const v0 =
      typeof k0.value === 'number'
        ? k0.value
        : Array.isArray(k0.value) && track.component
          ? k0.value[this.componentIndex(track.component)] ?? 0
          : 0;
    const v1 =
      typeof k1.value === 'number'
        ? k1.value
        : Array.isArray(k1.value) && track.component
          ? k1.value[this.componentIndex(track.component)] ?? 0
          : 0;

    switch (track.interpolation) {
      case 'step':
        return v0;
      case 'linear':
        return v0 + (v1 - v0) * t;
      case 'cubic': {
        // Hermite
        const m0 = k0.outTangent ?? 0;
        const m1 = k1.inTangent ?? 0;
        const t2 = t * t,
          t3 = t2 * t;
        return (
          (2 * t3 - 3 * t2 + 1) * v0 +
          (t3 - 2 * t2 + t) * m0 * dt +
          (-2 * t3 + 3 * t2) * v1 +
          (t3 - t2) * m1 * dt
        );
      }
      default:
        return v0 + (v1 - v0) * t;
    }
  }

  private wrapTime(time: number): number {
    if (this._duration <= 0) return 0;
    const t = time * this.speed;

    switch (this.wrapMode) {
      case 'once':
        return Math.min(t, this._duration);
      case 'clamp':
        return Math.max(0, Math.min(t, this._duration));
      case 'loop':
        return ((t % this._duration) + this._duration) % this._duration;
      case 'ping-pong': {
        const cycle = t / this._duration;
        const phase = cycle % 2;
        return phase < 1 ? phase * this._duration : (2 - phase) * this._duration;
      }
      default:
        return t;
    }
  }

  // ---------------------------------------------------------------------------
  // Blending
  // ---------------------------------------------------------------------------

  static blend(
    a: Map<string, number>,
    b: Map<string, number>,
    weight: number
  ): Map<string, number> {
    const result = new Map<string, number>();
    const allKeys = new Set([...a.keys(), ...b.keys()]);

    for (const key of allKeys) {
      const va = a.get(key) ?? 0;
      const vb = b.get(key) ?? 0;
      result.set(key, va * (1 - weight) + vb * weight);
    }

    return result;
  }
}
