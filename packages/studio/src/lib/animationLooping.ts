/**
 * animationLooping.ts — Animation Loop Control
 *
 * Loop modes, blending, crossfading, and animation queue management.
 */

// Re-export auto-loop detection & seamless loop generation
export {
  type LoopAnalysis,
  type LoopOptions,
  analyzeLoop,
  generateSeamlessLoop,
  reverseAnimation,
  createPalindromeLoop,
  extendAnimation,
  getLoopRecommendations,
} from './animation/animationLooping';

export type LoopMode = 'once' | 'loop' | 'ping-pong' | 'clamp';

export interface AnimationState {
  clipId: string;
  time: number;
  speed: number;
  weight: number;        // 0..1 blend weight
  loopMode: LoopMode;
  playing: boolean;
  loopCount: number;
}

export interface CrossfadeConfig {
  fromClip: string;
  toClip: string;
  durationSec: number;
  curve: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface AnimationQueue {
  clips: QueueEntry[];
  currentIndex: number;
  autoAdvance: boolean;
}

export interface QueueEntry {
  clipId: string;
  loopMode: LoopMode;
  speed: number;
  crossfadeSec: number;
}

/**
 * Advance animation time with loop mode applied.
 */
export function advanceTime(state: AnimationState, dt: number, clipDuration: number): AnimationState {
  if (!state.playing || clipDuration <= 0) return state;

  let newTime = state.time + dt * state.speed;
  let loopCount = state.loopCount;

  switch (state.loopMode) {
    case 'once':
      if (newTime >= clipDuration) {
        return { ...state, time: clipDuration, playing: false, loopCount: loopCount + 1 };
      }
      break;

    case 'loop':
      while (newTime >= clipDuration) {
        newTime -= clipDuration;
        loopCount++;
      }
      while (newTime < 0) {
        newTime += clipDuration;
      }
      break;

    case 'ping-pong': {
      const cycle = clipDuration * 2;
      newTime = newTime % cycle;
      if (newTime < 0) newTime += cycle;
      if (newTime > clipDuration) {
        newTime = cycle - newTime;
        loopCount++;
      }
      break;
    }

    case 'clamp':
      newTime = Math.max(0, Math.min(newTime, clipDuration));
      break;
  }

  return { ...state, time: newTime, loopCount };
}

/**
 * Calculate crossfade blend weights at a given progress.
 */
export function crossfadeWeights(progress: number, curve: CrossfadeConfig['curve']): { from: number; to: number } {
  let t = Math.max(0, Math.min(1, progress));

  switch (curve) {
    case 'ease-in': t = t * t; break;
    case 'ease-out': t = t * (2 - t); break;
    case 'ease-in-out': t = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; break;
    // 'linear' — no transform
  }

  return { from: 1 - t, to: t };
}

/**
 * Create a new animation state.
 */
export function createAnimationState(clipId: string, loopMode: LoopMode = 'loop', speed: number = 1): AnimationState {
  return { clipId, time: 0, speed, weight: 1, loopMode, playing: true, loopCount: 0 };
}

/**
 * Create an animation queue.
 */
export function createQueue(entries: QueueEntry[], autoAdvance: boolean = true): AnimationQueue {
  return { clips: entries, currentIndex: 0, autoAdvance };
}

/**
 * Advance to the next item in the queue.
 */
export function advanceQueue(queue: AnimationQueue): AnimationQueue {
  const next = queue.currentIndex + 1;
  if (next >= queue.clips.length) {
    return { ...queue, currentIndex: 0 }; // Loop queue
  }
  return { ...queue, currentIndex: next };
}

/**
 * Get the current queue entry.
 */
export function currentQueueEntry(queue: AnimationQueue): QueueEntry | null {
  return queue.clips[queue.currentIndex] ?? null;
}

/**
 * Total queue duration estimate (assuming each clip plays once at speed).
 */
export function queueDuration(queue: AnimationQueue, clipDurations: Record<string, number>): number {
  return queue.clips.reduce((sum, entry) => {
    const dur = clipDurations[entry.clipId] ?? 0;
    return sum + dur / entry.speed + entry.crossfadeSec;
  }, 0);
}
