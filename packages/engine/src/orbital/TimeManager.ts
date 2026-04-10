/**
 * Time Manager for Orbital Simulations
 *
 * Manages simulation time, time scaling, and animation loop for orbital mechanics.
 */

import { dateToJulian, julianToDate } from './KeplerianCalculator';

export type TimeUpdateCallback = (julianDate: number, realDate: Date) => void;

export class TimeManager {
  private julianDate: number;
  private timeScale: number = 1; // 1 = real-time, 10 = 10x speed
  private isPaused: boolean = false;
  private lastUpdateTime: number = 0;
  private callbacks: Set<TimeUpdateCallback> = new Set();
  private intervalId: NodeJS.Timeout | null = null;

  constructor(startDate: Date = new Date()) {
    this.julianDate = dateToJulian(startDate);
    this.lastUpdateTime = Date.now();
  }

  /**
   * Start the time simulation loop
   */
  start(): void {
    if (this.intervalId !== null) {
      return; // Already running
    }

    this.lastUpdateTime = Date.now();

    // Use setInterval for Node.js/browser compatibility (60 FPS)
    this.intervalId = setInterval(() => {
      this.update(Date.now());
    }, 1000 / 60);
  }

  /**
   * Stop the time simulation loop
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Update tick
   */
  private update(currentTime: number): void {
    if (!this.isPaused) {
      const deltaMs = currentTime - this.lastUpdateTime;
      this.advance(deltaMs);
    }

    this.lastUpdateTime = currentTime;
  }

  /**
   * Advance simulation time
   *
   * @param deltaMs - Milliseconds elapsed in real time
   */
  advance(deltaMs: number): void {
    if (this.isPaused) return;

    // Convert real milliseconds to simulation days
    const realDays = deltaMs / (1000 * 60 * 60 * 24);
    const simulationDays = realDays * this.timeScale;

    this.julianDate += simulationDays;

    // Notify callbacks
    this.notifyCallbacks();
  }

  /**
   * Pause time progression
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume time progression
   */
  play(): void {
    this.isPaused = false;
    this.lastUpdateTime = Date.now();
  }

  /**
   * Toggle pause/play
   */
  togglePause(): void {
    if (this.isPaused) {
      this.play();
    } else {
      this.pause();
    }
  }

  /**
   * Set time scale (speed multiplier)
   *
   * @param scale - Time scale (1 = real-time, 10 = 10x speed, etc.)
   */
  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0.1, scale); // Minimum 0.1x speed
  }

  /**
   * Get current time scale
   */
  getTimeScale(): number {
    return this.timeScale;
  }

  /**
   * Set simulation date
   *
   * @param date - JavaScript Date object
   */
  setDate(date: Date): void {
    this.julianDate = dateToJulian(date);
    this.notifyCallbacks();
  }

  /**
   * Get current simulation date as Julian date
   */
  getJulianDate(): number {
    return this.julianDate;
  }

  /**
   * Get current simulation date as JavaScript Date
   */
  getDate(): Date {
    return julianToDate(this.julianDate);
  }

  /**
   * Check if time is paused
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Register a callback for time updates
   *
   * @param callback - Function to call when time updates
   */
  onUpdate(callback: TimeUpdateCallback): void {
    this.callbacks.add(callback);
  }

  /**
   * Unregister a time update callback
   *
   * @param callback - Callback function to remove
   */
  offUpdate(callback: TimeUpdateCallback): void {
    this.callbacks.delete(callback);
  }

  /**
   * Notify all registered callbacks of time update
   */
  private notifyCallbacks(): void {
    const date = this.getDate();
    for (const callback of this.callbacks) {
      callback(this.julianDate, date);
    }
  }

  /**
   * Get time state for serialization
   */
  getState() {
    return {
      julianDate: this.julianDate,
      timeScale: this.timeScale,
      isPaused: this.isPaused,
      date: this.getDate().toISOString(),
    };
  }
}
