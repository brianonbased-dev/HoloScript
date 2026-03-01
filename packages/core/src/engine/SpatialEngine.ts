/**
 * SpatialEngine.ts
 *
 * Top-level game loop orchestrator. Owns the requestAnimationFrame loop
 * and ticks subsystems in deterministic order:
 *   1. Input  →  2. Network  →  3. Physics (fixed step)
 *   4. Animation  →  5. Scene graph update  →  6. Cull  →  7. Render
 *
 * @module engine
 */

// =============================================================================
// TYPES
// =============================================================================

export interface EngineConfig {
  /** Target frames per second (0 = uncapped). */
  targetFPS: number;
  /** Fixed physics timestep in seconds (default 1/60). */
  physicsTimestep: number;
  /** Maximum accumulated physics time per frame (prevents spiral-of-death). */
  maxPhysicsAccumulator: number;
  /** Enable performance metrics collection. */
  metrics: boolean;
}

export interface EngineMetrics {
  fps: number;
  frameTimeMs: number;
  physicsTimeMs: number;
  renderTimeMs: number;
  entityCount: number;
  drawCalls: number;
  frameNumber: number;
}

export type EngineState = 'stopped' | 'running' | 'paused';

export interface EngineSystem {
  /** Called once when the engine starts. */
  init?(): void | Promise<void>;
  /** Called every frame with delta time in seconds. */
  update?(dt: number): void;
  /** Called at fixed intervals for physics. */
  fixedUpdate?(dt: number): void;
  /** Called after scene graph update, before render. */
  lateUpdate?(dt: number): void;
  /** Called when the engine stops. */
  destroy?(): void;
  /** Priority (lower = earlier). Default 0. */
  priority?: number;
  /** Human-readable system name. */
  name: string;
}

// =============================================================================
// ENGINE
// =============================================================================

const DEFAULT_CONFIG: EngineConfig = {
  targetFPS: 60,
  physicsTimestep: 1 / 60,
  maxPhysicsAccumulator: 0.25,
  metrics: true,
};

export class SpatialEngine {
  private config: EngineConfig;
  private state: EngineState = 'stopped';
  private systems: EngineSystem[] = [];
  private rafId: number | null = null;
  private lastTime = 0;
  private physicsAccumulator = 0;
  private frameNumber = 0;
  private metrics: EngineMetrics;

  // Frame timing ring buffer for FPS calculation
  private frameTimes: number[] = [];
  private readonly FRAME_SAMPLE_SIZE = 60;

  constructor(config?: Partial<EngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      fps: 0, frameTimeMs: 0, physicsTimeMs: 0,
      renderTimeMs: 0, entityCount: 0, drawCalls: 0, frameNumber: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // System Registration
  // ---------------------------------------------------------------------------

  /** Register a system. Systems are sorted by priority on start. */
  addSystem(system: EngineSystem): this {
    this.systems.push(system);
    this.systems.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    return this;
  }

  /** Remove a system by name. */
  removeSystem(name: string): boolean {
    const idx = this.systems.findIndex(s => s.name === name);
    if (idx >= 0) {
      this.systems[idx].destroy?.();
      this.systems.splice(idx, 1);
      return true;
    }
    return false;
  }

  /** Get a registered system by name. */
  getSystem<T extends EngineSystem>(name: string): T | undefined {
    return this.systems.find(s => s.name === name) as T | undefined;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Initialize all systems and start the game loop. */
  async start(): Promise<void> {
    if (this.state === 'running') return;

    // Init systems
    for (const sys of this.systems) {
      await sys.init?.();
    }

    this.state = 'running';
    this.lastTime = performance.now();
    this.physicsAccumulator = 0;
    this.frameNumber = 0;
    this.frameTimes = [];

    this.scheduleFrame();
  }

  /** Pause the game loop (systems stay alive). */
  pause(): void {
    if (this.state !== 'running') return;
    this.state = 'paused';
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /** Resume from paused state. */
  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.lastTime = performance.now();
    this.scheduleFrame();
  }

  /** Stop the engine and destroy all systems. */
  stop(): void {
    this.state = 'stopped';
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    for (const sys of this.systems) {
      sys.destroy?.();
    }
  }

  getState(): EngineState { return this.state; }
  getMetrics(): Readonly<EngineMetrics> { return this.metrics; }
  getConfig(): Readonly<EngineConfig> { return this.config; }

  // ---------------------------------------------------------------------------
  // Game Loop
  // ---------------------------------------------------------------------------

  private scheduleFrame(): void {
    if (this.state !== 'running') return;
    this.rafId = requestAnimationFrame((now) => this.tick(now));
  }

  private tick(now: number): void {
    if (this.state !== 'running') return;

    const rawDt = (now - this.lastTime) / 1000;
    const dt = Math.min(rawDt, 0.1); // Cap at 100ms to handle tab-away
    this.lastTime = now;
    this.frameNumber++;

    // --- FPS tracking ---
    this.frameTimes.push(rawDt * 1000);
    if (this.frameTimes.length > this.FRAME_SAMPLE_SIZE) this.frameTimes.shift();

    // --- 1. Update systems (variable timestep) ---
    for (const sys of this.systems) {
      sys.update?.(dt);
    }

    // --- 2. Physics (fixed timestep) ---
    const physStart = performance.now();
    this.physicsAccumulator += dt;
    if (this.physicsAccumulator > this.config.maxPhysicsAccumulator) {
      this.physicsAccumulator = this.config.maxPhysicsAccumulator;
    }

    const fixedDt = this.config.physicsTimestep;
    while (this.physicsAccumulator >= fixedDt) {
      for (const sys of this.systems) {
        sys.fixedUpdate?.(fixedDt);
      }
      this.physicsAccumulator -= fixedDt;
    }
    const physEnd = performance.now();

    // --- 3. Late update (post-physics, pre-render) ---
    for (const sys of this.systems) {
      sys.lateUpdate?.(dt);
    }

    // --- Metrics ---
    if (this.config.metrics) {
      const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.metrics = {
        fps: Math.round(1000 / avgFrameTime),
        frameTimeMs: Math.round(rawDt * 1000 * 100) / 100,
        physicsTimeMs: Math.round((physEnd - physStart) * 100) / 100,
        renderTimeMs: 0, // Set by render system
        entityCount: 0,  // Set by ECS system
        drawCalls: 0,    // Set by render system
        frameNumber: this.frameNumber,
      };
    }

    this.scheduleFrame();
  }

  // ---------------------------------------------------------------------------
  // Headless Mode (for tests / server-side)
  // ---------------------------------------------------------------------------

  /**
   * Step the engine by a given delta (in seconds).
   * Useful for deterministic testing without requestAnimationFrame.
   */
  stepManual(dt: number): void {
    for (const sys of this.systems) {
      sys.update?.(dt);
    }

    this.physicsAccumulator += dt;
    const fixedDt = this.config.physicsTimestep;
    while (this.physicsAccumulator >= fixedDt) {
      for (const sys of this.systems) {
        sys.fixedUpdate?.(fixedDt);
      }
      this.physicsAccumulator -= fixedDt;
    }

    for (const sys of this.systems) {
      sys.lateUpdate?.(dt);
    }

    this.frameNumber++;
  }
}
