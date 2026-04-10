/**
 * GameLoop.ts — Sprint 6
 *
 * A simple deterministic game loop using setInterval for portability
 * across Node.js and browser environments. Exposes start/stop/pause/resume
 * and calls the provided `onUpdate(deltaMs)` callback each tick.
 *
 * Design choices:
 *  - Uses setInterval rather than requestAnimationFrame so tests can advance
 *    time without requiring a browser runtime.
 *  - `tickIntervalMs` defaults to 16ms (≈60 fps) but is overridable.
 *  - `pause()` keeps the interval alive but skips the onUpdate call,
 *    preserving the timing baseline so resume is seamless.
 *  - `frame` is incremented every time onUpdate fires (not every tick).
 */

export interface GameLoopOptions {
  /** Called each tick with deltaMs since last tick (paused ticks are skipped). */
  onUpdate: (deltaMs: number) => void | Promise<void>;
  /**
   * Interval between ticks in ms.
   * @default 16   (approx. 60 fps)
   */
  tickIntervalMs?: number;
  /**
   * Alias for tickIntervalMs, derived from fps.
   * If provided, takes precedence over tickIntervalMs.
   */
  targetFps?: number;
}

export class GameLoop {
  private _isRunning = false;
  private _isPaused = false;
  private _frame = 0;
  private _handle: ReturnType<typeof setInterval> | null = null;
  private _lastTime: number = 0;

  private readonly onUpdate: GameLoopOptions['onUpdate'];
  private readonly intervalMs: number;

  constructor(options: GameLoopOptions) {
    this.onUpdate = options.onUpdate;

    if (options.targetFps) {
      this.intervalMs = Math.round(1000 / options.targetFps);
    } else {
      this.intervalMs = options.tickIntervalMs ?? 16;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Whether the loop is currently running (not stopped). */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Whether the loop is paused (running but not ticking). */
  get isPaused(): boolean {
    return this._isPaused;
  }

  /** Number of update calls since start() (skips paused frames). */
  get frame(): number {
    return this._frame;
  }

  /**
   * Start the game loop.
   * If already running, this is a no-op.
   */
  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this._lastTime = Date.now();
    this._handle = setInterval(() => this._tick(), this.intervalMs);
  }

  /**
   * Stop the game loop permanently.
   * Resets frame counter and running state.
   */
  stop(): void {
    if (this._handle !== null) {
      clearInterval(this._handle);
      this._handle = null;
    }
    this._isRunning = false;
    this._isPaused = false;
  }

  /**
   * Pause the loop. `isRunning` stays true but `onUpdate` is not called.
   * The interval continues so resuming has minimal lag.
   */
  pause(): void {
    this._isPaused = true;
  }

  /**
   * Resume from a paused state. Resets the last-time baseline so the first
   * resumed tick doesn't produce an artificially large delta.
   */
  resume(): void {
    this._isPaused = false;
    this._lastTime = Date.now();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _tick(): void {
    if (this._isPaused) return;

    const now = Date.now();
    const delta = now - this._lastTime;
    this._lastTime = now;
    this._frame++;

    this.onUpdate(delta);
  }
}

