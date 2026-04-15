/**
 * Lightweight keyframe AnimationEngine for HoloScript core.
 */

export interface Keyframe {
  time: number;
  value: number;
}

export interface AnimClip {
  id: string;
  property: string;
  duration: number;
  loop: boolean;
  pingPong: boolean;
  delay: number;
  keyframes: Keyframe[];
}

interface ActiveClip {
  clip: AnimClip;
  elapsed: number;
  paused: boolean;
  callback: (value: number) => void;
}

/** Easing functions, each accepts a normalized time t ∈ [0, 1]. */
export const Easing = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => (--t) * t * t + 1,
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeOutBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

/** Interpolate linearly between two keyframes. */
function interpolateKeyframes(keyframes: Keyframe[], t: number): number {
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return keyframes[0].value;

  // Clamp to bounds
  if (t <= keyframes[0].time) return keyframes[0].value;
  if (t >= keyframes[keyframes.length - 1].time)
    return keyframes[keyframes.length - 1].value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      if (span === 0) return a.value;
      const local = (t - a.time) / span;
      return a.value + local * (b.value - a.value);
    }
  }

  return keyframes[keyframes.length - 1].value;
}

export class AnimationEngine {
  private active: Map<string, ActiveClip> = new Map();

  play(clip: AnimClip, callback: (value: number) => void): void {
    this.active.set(clip.id, { clip, elapsed: -clip.delay, paused: false, callback });
    if (clip.delay <= 0) {
      const v = interpolateKeyframes(clip.keyframes, 0);
      callback(v);
    }
  }

  update(dt: number): void {
    for (const [id, entry] of this.active) {
      if (entry.paused) continue;

      entry.elapsed += dt;
      const { clip } = entry;

      if (entry.elapsed < 0) continue; // Still in delay

      let t = entry.elapsed;
      const dur = clip.duration;

      if (dur <= 0) {
        entry.callback(interpolateKeyframes(clip.keyframes, 0));
        continue;
      }

      if (clip.loop) {
        t = t % dur;
      } else if (clip.pingPong) {
        const cycle = dur * 2;
        const mod = t % cycle;
        t = mod <= dur ? mod : cycle - mod;
      } else {
        if (t >= dur) {
          entry.callback(
            interpolateKeyframes(clip.keyframes, clip.keyframes[clip.keyframes.length - 1]?.time ?? dur)
          );
          this.active.delete(id);
          continue;
        }
      }

      // Normalize t to keyframe space
      const normalizedT = clip.keyframes.length > 0
        ? t
        : t / dur;

      entry.callback(interpolateKeyframes(clip.keyframes, normalizedT));
    }
  }

  pause(id: string): void {
    const entry = this.active.get(id);
    if (entry) entry.paused = true;
  }

  resume(id: string): void {
    const entry = this.active.get(id);
    if (entry) entry.paused = false;
  }

  stop(id: string): void {
    this.active.delete(id);
  }

  isActive(id: string): boolean {
    return this.active.has(id);
  }

  clear(): void {
    this.active.clear();
  }

  getActiveIds(): string[] {
    return Array.from(this.active.keys());
  }
}
