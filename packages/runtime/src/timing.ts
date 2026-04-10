/**
 * @holoscript/runtime - Timing Utilities
 *
 * Timer functions for HoloScript: after(), every(), debounce(), throttle()
 */

import { hasIdleCallback } from './runtime-types';

export type TimerId = number;
export type CancelFn = () => void;

/**
 * Execute callback after a delay
 */
export function after(ms: number, callback: () => void): CancelFn {
  const id = window.setTimeout(callback, ms) as unknown as TimerId;
  return () => window.clearTimeout(id);
}

/**
 * Execute callback repeatedly at an interval
 */
export function every(ms: number, callback: () => void): CancelFn {
  const id = window.setInterval(callback, ms) as unknown as TimerId;
  return () => window.clearInterval(id);
}

/**
 * Debounce a function - only execute after delay with no new calls
 */
export function debounce<T extends (...args: unknown[]) => void>(
  ms: number,
  callback: T
): T & { cancel: () => void } {
  let timeoutId: TimerId | null = null;

  const debounced = ((...args: unknown[]) => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      callback(...args);
      timeoutId = null;
    }, ms) as unknown as TimerId;
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}

/**
 * Throttle a function - execute at most once per interval
 */
export function throttle<T extends (...args: unknown[]) => void>(
  ms: number,
  callback: T
): T & { cancel: () => void } {
  let lastCall = 0;
  let timeoutId: TimerId | null = null;

  const throttled = ((...args: unknown[]) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= ms) {
      lastCall = now;
      callback(...args);
    } else if (timeoutId === null) {
      timeoutId = window.setTimeout(() => {
        lastCall = Date.now();
        callback(...args);
        timeoutId = null;
      }, ms - timeSinceLastCall) as unknown as TimerId;
    }
  }) as T & { cancel: () => void };

  throttled.cancel = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return throttled;
}

/**
 * Wait for a specified duration (Promise-based)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for next animation frame
 */
export function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * Create a repeating animation frame loop
 */
export function createLoop(callback: (deltaTime: number, elapsed: number) => void): CancelFn {
  let lastTime = performance.now();
  const startTime = lastTime;
  let animationId: number;
  let running = true;

  const loop = (currentTime: number) => {
    if (!running) return;

    const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
    const elapsed = (currentTime - startTime) / 1000;
    lastTime = currentTime;

    callback(deltaTime, elapsed);
    animationId = requestAnimationFrame(loop);
  };

  animationId = requestAnimationFrame(loop);

  return () => {
    running = false;
    cancelAnimationFrame(animationId);
  };
}

/**
 * Execute callback on next idle period
 */
export function onIdle(callback: () => void, timeout = 1000): CancelFn {
  if (hasIdleCallback(window)) {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(id);
  }

  // Fallback for browsers without requestIdleCallback
  const id = setTimeout(callback, 1) as unknown as TimerId;
  return () => clearTimeout(id);
}

/**
 * Tween between values over time
 */
export function tween(
  from: number,
  to: number,
  duration: number,
  onUpdate: (value: number) => void,
  easing: (t: number) => number = (t) => t // Linear by default
): CancelFn {
  const startTime = performance.now();
  let animationId: number;
  let running = true;

  const animate = (currentTime: number) => {
    if (!running) return;

    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easing(progress);
    const value = from + (to - from) * easedProgress;

    onUpdate(value);

    if (progress < 1) {
      animationId = requestAnimationFrame(animate);
    }
  };

  animationId = requestAnimationFrame(animate);

  return () => {
    running = false;
    cancelAnimationFrame(animationId);
  };
}

// Common easing functions
export const easing = {
  linear: (t: number): number => t,
  easeIn: (t: number): number => t * t,
  easeOut: (t: number): number => t * (2 - t),
  easeInOut: (t: number): number => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t: number): number => t * t * t,
  easeOutCubic: (t: number): number => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeInElastic: (t: number): number => {
    if (t === 0 || t === 1) return t;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3));
  },
  easeOutElastic: (t: number): number => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  easeOutBounce: (t: number): number => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

export default {
  after,
  every,
  debounce,
  throttle,
  wait,
  nextFrame,
  createLoop,
  onIdle,
  tween,
  easing,
};
