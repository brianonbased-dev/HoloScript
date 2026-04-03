/**
 * @holoscript/std - Time Module
 *
 * Time, timer, and scheduling utilities for HoloScript Plus programs.
 */

/**
 * Get current timestamp in milliseconds
 */
export function now(): number {
  return Date.now();
}

/**
 * Get high-resolution timestamp (for performance measurement)
 */
export function hrTime(): number {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until a condition is true
 */
export async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 30000, interval = 100 } = options;
  const startTime = now();

  while (true) {
    if (await condition()) return;
    if (now() - startTime > timeout) {
      throw new Error('waitUntil timeout');
    }
    await sleep(interval);
  }
}

/**
 * Execute a function with timeout
 */
export async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, initialDelay = 1000, maxDelay = 30000, factor = 2, onRetry } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) break;

      onRetry?.(lastError, attempt);
      await sleep(delay);
      delay = Math.min(delay * factor, maxDelay);
    }
  }

  throw lastError!;
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return ((...args: unknown[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, ms);
  }) as T;
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): T {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return ((...args: unknown[]) => {
    const elapsed = now() - lastCall;

    if (elapsed >= ms) {
      lastCall = now();
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = now();
        timeoutId = null;
        fn(...args);
      }, ms - elapsed);
    }
  }) as T;
}

/**
 * Measure execution time of a function
 */
export async function measure<T>(
  fn: () => T | Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = hrTime();
  const result = await fn();
  const duration = hrTime() - start;
  return { result, duration };
}

/**
 * Measure execution time and log it
 */
export async function timed<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
  const start = hrTime();
  try {
    return await fn();
  } finally {
    const duration = hrTime() - start;
    void duration; // timing available for callers via return value
  }
}

/**
 * Simple stopwatch for measuring elapsed time
 */
export class Stopwatch {
  private startTime: number = 0;
  private pausedTime: number = 0;
  private running: boolean = false;

  start(): this {
    if (!this.running) {
      this.startTime = hrTime() - this.pausedTime;
      this.running = true;
    }
    return this;
  }

  stop(): number {
    if (this.running) {
      this.pausedTime = hrTime() - this.startTime;
      this.running = false;
    }
    return this.pausedTime;
  }

  reset(): this {
    this.startTime = 0;
    this.pausedTime = 0;
    this.running = false;
    return this;
  }

  restart(): this {
    return this.reset().start();
  }

  get elapsed(): number {
    if (this.running) {
      return hrTime() - this.startTime;
    }
    return this.pausedTime;
  }

  get isRunning(): boolean {
    return this.running;
  }

  lap(): number {
    const elapsed = this.elapsed;
    this.restart();
    return elapsed;
  }
}

/**
 * Interval timer with pause/resume support
 */
export class IntervalTimer {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private callback: () => void;
  private intervalMs: number;
  private isPaused: boolean = false;

  constructor(callback: () => void, intervalMs: number) {
    this.callback = callback;
    this.intervalMs = intervalMs;
  }

  start(): this {
    if (!this.intervalId && !this.isPaused) {
      this.intervalId = setInterval(this.callback, this.intervalMs);
    }
    return this;
  }

  stop(): this {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isPaused = false;
    return this;
  }

  pause(): this {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isPaused = true;
    }
    return this;
  }

  resume(): this {
    if (this.isPaused) {
      this.isPaused = false;
      this.intervalId = setInterval(this.callback, this.intervalMs);
    }
    return this;
  }

  get running(): boolean {
    return this.intervalId !== null;
  }

  get paused(): boolean {
    return this.isPaused;
  }
}

/**
 * Countdown timer
 */
export class CountdownTimer {
  private remainingMs: number;
  private startTime: number = 0;
  private running: boolean = false;
  private onTick?: (remaining: number) => void;
  private onComplete?: () => void;
  private tickIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    durationMs: number,
    options: {
      onTick?: (remaining: number) => void;
      onComplete?: () => void;
      tickInterval?: number;
    } = {}
  ) {
    this.remainingMs = durationMs;
    this.onTick = options.onTick;
    this.onComplete = options.onComplete;

    if (options.onTick && options.tickInterval) {
      this.tickIntervalId = setInterval(() => {
        if (this.running) {
          this.onTick?.(this.remaining);
        }
      }, options.tickInterval);
    }
  }

  start(): this {
    if (!this.running && this.remainingMs > 0) {
      this.startTime = hrTime();
      this.running = true;
      this.scheduleCompletion();
    }
    return this;
  }

  pause(): this {
    if (this.running) {
      this.remainingMs = Math.max(0, this.remainingMs - (hrTime() - this.startTime));
      this.running = false;
    }
    return this;
  }

  resume(): this {
    return this.start();
  }

  reset(durationMs?: number): this {
    this.running = false;
    this.remainingMs = durationMs ?? this.remainingMs;
    return this;
  }

  stop(): this {
    this.running = false;
    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
    return this;
  }

  get remaining(): number {
    if (this.running) {
      return Math.max(0, this.remainingMs - (hrTime() - this.startTime));
    }
    return this.remainingMs;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isComplete(): boolean {
    return this.remaining <= 0;
  }

  private scheduleCompletion(): void {
    setTimeout(() => {
      if (this.running && this.remaining <= 0) {
        this.running = false;
        this.onComplete?.();
      }
    }, this.remainingMs);
  }
}

/**
 * Frame-based timer for game loops
 */
export class FrameTimer {
  private lastFrameTime: number = 0;
  private deltaTime: number = 0;
  private frameCount: number = 0;
  private fps: number = 0;
  private fpsUpdateInterval: number = 1000;
  private lastFpsUpdate: number = 0;
  private framesSinceLastFpsUpdate: number = 0;

  /**
   * Call at the start of each frame
   */
  update(): void {
    const currentTime = hrTime();

    if (this.lastFrameTime > 0) {
      this.deltaTime = (currentTime - this.lastFrameTime) / 1000; // Convert to seconds
    }

    this.lastFrameTime = currentTime;
    this.frameCount++;
    this.framesSinceLastFpsUpdate++;

    // Update FPS calculation
    if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.fps = (this.framesSinceLastFpsUpdate * 1000) / (currentTime - this.lastFpsUpdate);
      this.lastFpsUpdate = currentTime;
      this.framesSinceLastFpsUpdate = 0;
    }
  }

  /**
   * Get delta time in seconds since last frame
   */
  get delta(): number {
    return this.deltaTime;
  }

  /**
   * Get delta time in milliseconds since last frame
   */
  get deltaMs(): number {
    return this.deltaTime * 1000;
  }

  /**
   * Get total frame count
   */
  get frames(): number {
    return this.frameCount;
  }

  /**
   * Get current FPS (frames per second)
   */
  get currentFps(): number {
    return this.fps;
  }

  /**
   * Get total elapsed time in seconds
   */
  get totalTime(): number {
    return this.lastFrameTime / 1000;
  }

  /**
   * Reset the timer
   */
  reset(): void {
    this.lastFrameTime = 0;
    this.deltaTime = 0;
    this.frameCount = 0;
    this.fps = 0;
    this.lastFpsUpdate = 0;
    this.framesSinceLastFpsUpdate = 0;
  }
}

/**
 * Schedule a callback to run after a delay
 */
export function schedule(callback: () => void, delayMs: number): () => void {
  const timeoutId = setTimeout(callback, delayMs);
  return () => clearTimeout(timeoutId);
}

/**
 * Schedule a callback to run at regular intervals
 */
export function scheduleInterval(callback: () => void, intervalMs: number): () => void {
  const intervalId = setInterval(callback, intervalMs);
  return () => clearInterval(intervalId);
}

/**
 * Schedule a callback to run on the next animation frame (browser only)
 */
export function scheduleFrame(callback: (timestamp: number) => void): () => void {
  if (typeof requestAnimationFrame !== 'undefined') {
    const id = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(id);
  }
  // Fallback for non-browser environments
  const id = setTimeout(() => callback(hrTime()), 16);
  return () => clearTimeout(id);
}

/**
 * Create a ticker that calls a callback at a target frame rate
 */
export function createTicker(
  callback: (delta: number) => void,
  targetFps: number = 60
): { start: () => void; stop: () => void } {
  const frameTime = 1000 / targetFps;
  let lastTime = 0;
  let running = false;
  let animationId: number | ReturnType<typeof setTimeout>;

  const tick = (currentTime: number) => {
    if (!running) return;

    if (lastTime > 0) {
      const delta = (currentTime - lastTime) / 1000;
      callback(delta);
    }
    lastTime = currentTime;

    if (typeof requestAnimationFrame !== 'undefined') {
      animationId = requestAnimationFrame(tick);
    } else {
      animationId = setTimeout(() => tick(hrTime()), frameTime);
    }
  };

  return {
    start: () => {
      if (!running) {
        running = true;
        lastTime = 0;
        if (typeof requestAnimationFrame !== 'undefined') {
          animationId = requestAnimationFrame(tick);
        } else {
          tick(hrTime());
        }
      }
    },
    stop: () => {
      running = false;
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(animationId as number);
      } else {
        clearTimeout(animationId as ReturnType<typeof setTimeout>);
      }
    },
  };
}

/**
 * Date/time formatting utilities
 */
export const DateTime = {
  /**
   * Format a date as ISO string
   */
  toISO(date: Date = new Date()): string {
    return date.toISOString();
  },

  /**
   * Format a date as local string
   */
  toLocal(date: Date = new Date()): string {
    return date.toLocaleString();
  },

  /**
   * Format a date using a pattern
   * Supports: YYYY, MM, DD, HH, mm, ss, SSS
   */
  format(date: Date, pattern: string): string {
    const pad = (n: number, width: number) => String(n).padStart(width, '0');

    return pattern
      .replace('YYYY', String(date.getFullYear()))
      .replace('MM', pad(date.getMonth() + 1, 2))
      .replace('DD', pad(date.getDate(), 2))
      .replace('HH', pad(date.getHours(), 2))
      .replace('mm', pad(date.getMinutes(), 2))
      .replace('ss', pad(date.getSeconds(), 2))
      .replace('SSS', pad(date.getMilliseconds(), 3));
  },

  /**
   * Parse a date string
   */
  parse(dateString: string): Date {
    return new Date(dateString);
  },

  /**
   * Get difference between two dates in various units
   */
  diff(date1: Date, date2: Date, unit: 'ms' | 's' | 'm' | 'h' | 'd' = 'ms'): number {
    const diffMs = date1.getTime() - date2.getTime();
    switch (unit) {
      case 'ms':
        return diffMs;
      case 's':
        return diffMs / 1000;
      case 'm':
        return diffMs / 60000;
      case 'h':
        return diffMs / 3600000;
      case 'd':
        return diffMs / 86400000;
    }
  },

  /**
   * Add time to a date
   */
  add(date: Date, amount: number, unit: 'ms' | 's' | 'm' | 'h' | 'd'): Date {
    const _ms = DateTime.diff(new Date(amount), new Date(0), 'ms');
    const multipliers = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return new Date(date.getTime() + amount * multipliers[unit]);
  },

  /**
   * Check if a date is today
   */
  isToday(date: Date): boolean {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  },

  /**
   * Get start of day
   */
  startOfDay(date: Date = new Date()): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  },

  /**
   * Get end of day
   */
  endOfDay(date: Date = new Date()): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  },
};
