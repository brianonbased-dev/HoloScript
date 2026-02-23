/**
 * LODTransition.ts
 *
 * LOD transition effects: crossfade, dithering,
 * morph-based transitions, and hysteresis bands.
 *
 * @module lod
 */

// =============================================================================
// TYPES
// =============================================================================

export type TransitionMode = 'instant' | 'crossfade' | 'dither' | 'morph';

export interface LODTransitionConfig {
  mode: TransitionMode;
  duration: number;         // Seconds for transition
  hysteresisBand: number;   // Distance band to prevent flip-flopping
}

export interface TransitionState {
  entityId: string;
  fromLOD: number;
  toLOD: number;
  progress: number;         // 0-1
  active: boolean;
}

// =============================================================================
// LOD TRANSITION
// =============================================================================

export class LODTransition {
  private config: LODTransitionConfig;
  private transitions: Map<string, TransitionState> = new Map();
  private ditherLUT: Uint8Array;
  private scheduler: TransitionScheduler;

  constructor(config?: Partial<LODTransitionConfig>) {
    this.config = { mode: 'crossfade', duration: 0.5, hysteresisBand: 5, ...config };
    this.ditherLUT = this.generateDitherLUT();
    this.scheduler = new TransitionScheduler();
  }

  // ---------------------------------------------------------------------------
  // Transition Management
  // ---------------------------------------------------------------------------

  startTransition(entityId: string, fromLOD: number, toLOD: number): void {
    if (this.config.mode === 'instant') {
      this.transitions.set(entityId, { entityId, fromLOD, toLOD, progress: 1, active: false });
      return;
    }

    this.transitions.set(entityId, { entityId, fromLOD, toLOD, progress: 0, active: true });
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    for (const state of this.transitions.values()) {
      if (!state.active) continue;
      state.progress = Math.min(1, state.progress + dt / this.config.duration);
      if (state.progress >= 1) state.active = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Blend Values
  // ---------------------------------------------------------------------------

  getBlendFactor(entityId: string): number {
    const state = this.transitions.get(entityId);
    if (!state) return 1;

    switch (this.config.mode) {
      case 'instant': return 1;
      case 'crossfade': return state.progress;
      case 'dither': return state.progress > 0.5 ? 1 : 0; // Binary threshold for dither patterns
      case 'morph': return this.smoothstep(state.progress);
    }
  }

  getDitherThreshold(entityId: string): number {
    const state = this.transitions.get(entityId);
    return state ? state.progress : 1;
  }

  // ---------------------------------------------------------------------------
  // Hysteresis  
  // ---------------------------------------------------------------------------

  shouldTransition(currentDist: number, threshold: number, currentLOD: number, newLOD: number): boolean {
    const band = this.config.hysteresisBand;
    if (newLOD > currentLOD) {
      return currentDist > threshold + band;
    }
    return currentDist < threshold - band;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private smoothstep(t: number): number { return t * t * (3 - 2 * t); }

  isTransitioning(entityId: string): boolean { return this.transitions.get(entityId)?.active ?? false; }
  getTransitionState(entityId: string): TransitionState | undefined { return this.transitions.get(entityId); }
  getMode(): TransitionMode { return this.config.mode; }
  setMode(mode: TransitionMode): void { this.config.mode = mode; }

  // ---------------------------------------------------------------------------
  // v3.5 Performance Optimizations
  // ---------------------------------------------------------------------------

  /**
   * Generate optimized dither pattern LUT for smoother visual transitions
   */
  private generateDitherLUT(): Uint8Array {
    // 8x8 Bayer matrix for ordered dithering
    const bayerMatrix = new Uint8Array([
      0, 32, 8, 40, 2, 34, 10, 42,
      48, 16, 56, 24, 50, 18, 58, 26,
      12, 44, 4, 36, 14, 46, 6, 38,
      60, 28, 52, 20, 62, 30, 54, 22,
      3, 35, 11, 43, 1, 33, 9, 41,
      51, 19, 59, 27, 49, 17, 57, 25,
      15, 47, 7, 39, 13, 45, 5, 37,
      63, 31, 55, 23, 61, 29, 53, 21
    ]);

    // Normalize to 0-255 range
    const lut = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      lut[i] = Math.floor((bayerMatrix[i] / 64) * 255);
    }

    return lut;
  }

  /**
   * Get dither threshold from LUT based on screen position
   */
  getDitherPattern(x: number, y: number): number {
    const index = ((y & 7) << 3) | (x & 7);
    return this.ditherLUT[index] / 255;
  }

  /**
   * Optimized crossfade shader code (reduces overdraw)
   */
  getOptimizedCrossfadeShader(): string {
    return `
      // Optimized crossfade with early discard to reduce overdraw
      vec4 lodCrossfade(sampler2D fromTex, sampler2D toTex, vec2 uv, float blend) {
        // Early discard for fully transitioned pixels
        if (blend <= 0.01) {
          return texture2D(fromTex, uv);
        }
        if (blend >= 0.99) {
          return texture2D(toTex, uv);
        }

        // Optimized blend (avoid unnecessary texture samples)
        vec4 from = texture2D(fromTex, uv);
        vec4 to = texture2D(toTex, uv);

        // Premultiplied alpha blend for better performance
        return mix(from, to, blend);
      }
    `;
  }

  /**
   * Geometry morphing shader for critical objects (hero characters)
   */
  getGeometryMorphShader(): string {
    return `
      // Vertex morphing between LOD levels
      attribute vec3 positionFrom;
      attribute vec3 positionTo;
      attribute vec3 normalFrom;
      attribute vec3 normalTo;
      uniform float morphFactor;

      vec3 morphPosition() {
        return mix(positionFrom, positionTo, morphFactor);
      }

      vec3 morphNormal() {
        vec3 n = mix(normalFrom, normalTo, morphFactor);
        return normalize(n);
      }
    `;
  }

  /**
   * Get transition scheduler
   */
  getScheduler(): TransitionScheduler {
    return this.scheduler;
  }

  /**
   * Get dither LUT for external use
   */
  getDitherLUT(): Uint8Array {
    return this.ditherLUT;
  }
}

// =============================================================================
// TRANSITION SCHEDULER
// =============================================================================

/**
 * Budget system for tracking GPU cost per frame
 */
export interface TransitionBudget {
  maxGPUTimeMs: number;
  currentGPUTimeMs: number;
  maxTransitions: number;
  currentTransitions: number;
}

/**
 * Scheduled transition with priority
 */
export interface ScheduledTransition {
  entityId: string;
  fromLOD: number;
  toLOD: number;
  priority: number;
  estimatedCostMs: number;
  timestamp: number;
}

/**
 * TransitionScheduler manages transition budget and scheduling
 */
export class TransitionScheduler {
  private budget: TransitionBudget;
  private queue: ScheduledTransition[] = [];
  private activatedThisFrame: Set<string> = new Set();

  constructor(maxGPUTimeMs: number = 2.0, maxTransitions: number = 10) {
    this.budget = {
      maxGPUTimeMs,
      currentGPUTimeMs: 0,
      maxTransitions,
      currentTransitions: 0
    };
  }

  /**
   * Schedule a transition with priority
   */
  schedule(
    entityId: string,
    fromLOD: number,
    toLOD: number,
    priority: number = 1.0,
    estimatedCostMs: number = 0.1
  ): boolean {
    // Check if already scheduled
    if (this.queue.some(t => t.entityId === entityId)) {
      return false;
    }

    this.queue.push({
      entityId,
      fromLOD,
      toLOD,
      priority,
      estimatedCostMs,
      timestamp: Date.now()
    });

    // Sort by priority (highest first)
    this.queue.sort((a, b) => b.priority - a.priority);

    return true;
  }

  /**
   * Process scheduled transitions within budget
   */
  process(): ScheduledTransition[] {
    const activated: ScheduledTransition[] = [];
    this.activatedThisFrame.clear();

    for (const transition of this.queue) {
      // Check budget constraints
      if (this.budget.currentTransitions >= this.budget.maxTransitions) {
        break;
      }

      if (this.budget.currentGPUTimeMs + transition.estimatedCostMs > this.budget.maxGPUTimeMs) {
        break;
      }

      // Activate transition
      activated.push(transition);
      this.activatedThisFrame.add(transition.entityId);
      this.budget.currentTransitions++;
      this.budget.currentGPUTimeMs += transition.estimatedCostMs;
    }

    // Remove activated transitions from queue
    this.queue = this.queue.filter(t => !this.activatedThisFrame.has(t.entityId));

    return activated;
  }

  /**
   * Reset budget for new frame
   */
  resetFrame(): void {
    this.budget.currentGPUTimeMs = 0;
    this.budget.currentTransitions = 0;
    this.activatedThisFrame.clear();
  }

  /**
   * Get current budget status
   */
  getBudget(): TransitionBudget {
    return { ...this.budget };
  }

  /**
   * Set budget limits
   */
  setBudget(maxGPUTimeMs: number, maxTransitions: number): void {
    this.budget.maxGPUTimeMs = maxGPUTimeMs;
    this.budget.maxTransitions = maxTransitions;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Clear all scheduled transitions
   */
  clear(): void {
    this.queue = [];
    this.activatedThisFrame.clear();
  }

  /**
   * Record actual GPU cost for a transition (for budget tuning)
   */
  recordCost(entityId: string, actualCostMs: number): void {
    // Update cost estimates based on actual measurements
    // This could be used for adaptive budget management
    if (this.activatedThisFrame.has(entityId)) {
      // Store for future cost estimation improvements
    }
  }

  /**
   * Get budget utilization (0-1)
   */
  getBudgetUtilization(): { gpu: number; transitions: number } {
    return {
      gpu: this.budget.currentGPUTimeMs / this.budget.maxGPUTimeMs,
      transitions: this.budget.currentTransitions / this.budget.maxTransitions
    };
  }
}
