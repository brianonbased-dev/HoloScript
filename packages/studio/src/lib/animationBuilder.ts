/**
 * animationBuilder.ts — Animation Construction Engine
 *
 * Build keyframe animations programmatically for scene objects.
 */

export interface Keyframe {
  time: number;           // seconds
  value: number | number[];
  easing: EasingFunction;
}

export interface AnimationTrack {
  id: string;
  property: string;       // e.g., 'position.x', 'rotation.y', 'opacity'
  keyframes: Keyframe[];
  loop: boolean;
  duration: number;
}

export interface AnimationClip {
  id: string;
  name: string;
  tracks: AnimationTrack[];
  duration: number;
  speed: number;
}

export type EasingFunction = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce' | 'elastic';

/**
 * Create an animation track from keyframes.
 */
export function createTrack(
  property: string,
  keyframes: Array<{ time: number; value: number | number[]; easing?: EasingFunction }>,
  loop: boolean = false
): AnimationTrack {
  const kfs: Keyframe[] = keyframes.map(kf => ({
    time: kf.time,
    value: kf.value,
    easing: kf.easing ?? 'ease-in-out',
  }));
  const duration = kfs.length > 0 ? Math.max(...kfs.map(k => k.time)) : 0;
  return {
    id: `track-${property}-${Date.now().toString(36)}`,
    property,
    keyframes: kfs.sort((a, b) => a.time - b.time),
    loop,
    duration,
  };
}

/**
 * Build a clip from multiple tracks.
 */
export function buildClip(name: string, tracks: AnimationTrack[], speed: number = 1): AnimationClip {
  return {
    id: `clip-${Date.now().toString(36)}`,
    name,
    tracks,
    duration: Math.max(0, ...tracks.map(t => t.duration)),
    speed,
  };
}

/**
 * Sample a track value at a given time.
 */
export function sampleTrack(track: AnimationTrack, time: number): number {
  const { keyframes } = track;
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return keyframes[0].value as number;

  // Clamp or loop
  let t = track.loop && track.duration > 0 ? time % track.duration : Math.min(time, track.duration);

  // Find surrounding keyframes
  let prev = keyframes[0];
  let next = keyframes[keyframes.length - 1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (t >= keyframes[i].time && t <= keyframes[i + 1].time) {
      prev = keyframes[i];
      next = keyframes[i + 1];
      break;
    }
  }

  if (prev === next) return prev.value as number;
  const dt = next.time - prev.time;
  const progress = dt > 0 ? (t - prev.time) / dt : 0;
  const prevVal = prev.value as number;
  const nextVal = next.value as number;

  return prevVal + (nextVal - prevVal) * progress;
}

/**
 * Calculate total animation clip duration including speed multiplier.
 */
export function clipPlaybackDuration(clip: AnimationClip): number {
  return clip.speed > 0 ? clip.duration / clip.speed : Infinity;
}

/**
 * Count total keyframes across all tracks.
 */
export function totalKeyframes(clip: AnimationClip): number {
  return clip.tracks.reduce((sum, t) => sum + t.keyframes.length, 0);
}
