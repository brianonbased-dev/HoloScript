/**
 * @holoscript/core Morph Trait
 *
 * Enables blend shapes/morph targets for facial animation,
 * body morphs, and procedural deformation.
 *
 * @example
 * ```hsplus
 * object "Character" {
 *   @morph {
 *     targets: ["smile", "frown", "blink_L", "blink_R"],
 *     presets: {
 *       happy: { smile: 1.0 },
 *       sad: { frown: 0.8 },
 *       sleeping: { blink_L: 1.0, blink_R: 1.0 }
 *     }
 *   }
 * }
 * ```
 */

/**
 * Morph target definition
 */
export interface MorphTarget {
  /** Target name */
  name: string;

  /** Current weight (0-1) */
  weight: number;

  /** Minimum weight */
  min?: number;

  /** Maximum weight */
  max?: number;

  /** Category (e.g., "mouth", "eyes", "brow") */
  category?: string;

  /** Is additive (vs replacement) */
  additive?: boolean;

  /** Affected vertices (for optimization) */
  vertexCount?: number;
}

/**
 * Morph preset (collection of target weights)
 */
export interface MorphPreset {
  /** Preset name */
  name: string;

  /** Target weights */
  weights: Record<string, number>;

  /** Blend time to transition to this preset */
  blendTime?: number;

  /** Easing function */
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

/**
 * Morph animation keyframe
 */
export interface MorphKeyframe {
  /** Time in animation */
  time: number;

  /** Target weights at this time */
  weights: Record<string, number>;

  /** Easing to next keyframe */
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

/**
 * Morph animation clip
 */
export interface MorphClip {
  /** Clip name */
  name: string;

  /** Duration in seconds */
  duration: number;

  /** Keyframes */
  keyframes: MorphKeyframe[];

  /** Loop the animation */
  loop?: boolean;

  /** Speed multiplier */
  speed?: number;
}

/**
 * Active morph animation
 */
interface ActiveMorphAnimation {
  clip: MorphClip;
  time: number;
  weight: number;
  speed: number;
  loop: boolean;
  onComplete?: () => void;
}

/**
 * Morph blend state
 */
interface BlendState {
  targetWeights: Map<string, number>;
  duration: number;
  elapsed: number;
  startWeights: Map<string, number>;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  onComplete?: () => void;
}

/**
 * Morph event types
 */
export type MorphEventType =
  | 'weight-changed'
  | 'preset-applied'
  | 'animation-start'
  | 'animation-end'
  | 'blend-start'
  | 'blend-end';

/**
 * Morph event
 */
export interface MorphEvent {
  /** Event type */
  type: MorphEventType;

  /** Target name */
  target?: string;

  /** Weight value */
  weight?: number;

  /** Preset name */
  preset?: string;

  /** Animation clip name */
  clip?: string;

  /** Timestamp */
  timestamp: number;
}

/**
 * Morph configuration
 */
export interface MorphConfig {
  /** Morph targets */
  targets?: MorphTarget[];

  /** Presets */
  presets?: MorphPreset[];

  /** Animation clips */
  clips?: MorphClip[];

  /** Default blend time (seconds) */
  defaultBlendTime?: number;

  /** Auto-blink settings */
  autoBlink?: {
    enabled: boolean;
    targets: string[];
    interval: number;
    duration: number;
    randomize?: number;
  };

  /** Lip sync settings */
  lipSync?: {
    enabled: boolean;
    visemeMap: Record<string, string>;
  };
}

/**
 * Morph event callback
 */
type MorphEventCallback = (event: MorphEvent) => void;

/**
 * Morph Trait - Blend Shapes
 */
export class MorphTrait {
  private config: MorphConfig;
  private targets: Map<string, MorphTarget> = new Map();
  private presets: Map<string, MorphPreset> = new Map();
  private clips: Map<string, MorphClip> = new Map();
  private activeAnimations: Map<string, ActiveMorphAnimation> = new Map();
  private blendState: BlendState | null = null;
  private eventListeners: Map<MorphEventType, Set<MorphEventCallback>> = new Map();
  private blinkTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBlinkTime: number = 0;

  constructor(config: MorphConfig = {}) {
    this.config = {
      defaultBlendTime: 0.3,
      ...config,
    };

    // Initialize targets
    if (config.targets) {
      for (const target of config.targets) {
        this.addTarget(target);
      }
    }

    // Initialize presets
    if (config.presets) {
      for (const preset of config.presets) {
        this.addPreset(preset);
      }
    }

    // Initialize clips
    if (config.clips) {
      for (const clip of config.clips) {
        this.addClip(clip);
      }
    }

    // Start auto-blink if configured
    if (config.autoBlink?.enabled) {
      this.startAutoBlink();
    }
  }

  // ============================================================================
  // Core API
  // ============================================================================

  /**
   * Get configuration
   */
  public getConfig(): MorphConfig {
    return { ...this.config };
  }

  /**
   * Get all target weights
   */
  public getWeights(): Record<string, number> {
    const weights: Record<string, number> = {};
    for (const [name, target] of this.targets) {
      weights[name] = target.weight;
    }
    return weights;
  }

  // ============================================================================
  // Target Management
  // ============================================================================

  /**
   * Add a morph target
   */
  public addTarget(target: MorphTarget): void {
    this.targets.set(target.name, {
      ...target,
      weight: target.weight ?? 0,
      min: target.min ?? 0,
      max: target.max ?? 1,
    });
  }

  /**
   * Remove a morph target
   */
  public removeTarget(name: string): void {
    this.targets.delete(name);
  }

  /**
   * Get a morph target
   */
  public getTarget(name: string): MorphTarget | undefined {
    return this.targets.get(name);
  }

  /**
   * Get all target names
   */
  public getTargetNames(): string[] {
    return Array.from(this.targets.keys());
  }

  /**
   * Get targets by category
   */
  public getTargetsByCategory(category: string): MorphTarget[] {
    return Array.from(this.targets.values()).filter((t) => t.category === category);
  }

  /**
   * Set target weight
   */
  public setWeight(name: string, weight: number): void {
    const target = this.targets.get(name);
    if (!target) return;

    const clampedWeight = Math.max(target.min ?? 0, Math.min(target.max ?? 1, weight));
    target.weight = clampedWeight;

    this.emit({
      type: 'weight-changed',
      target: name,
      weight: clampedWeight,
      timestamp: Date.now(),
    });
  }

  /**
   * Get target weight
   */
  public getWeight(name: string): number {
    return this.targets.get(name)?.weight ?? 0;
  }

  /**
   * Set multiple weights
   */
  public setWeights(weights: Record<string, number>): void {
    for (const [name, weight] of Object.entries(weights)) {
      this.setWeight(name, weight);
    }
  }

  /**
   * Reset all weights to 0
   */
  public resetWeights(): void {
    for (const target of this.targets.values()) {
      target.weight = 0;
    }
  }

  // ============================================================================
  // Preset Management
  // ============================================================================

  /**
   * Add a preset
   */
  public addPreset(preset: MorphPreset): void {
    this.presets.set(preset.name, preset);
  }

  /**
   * Remove a preset
   */
  public removePreset(name: string): void {
    this.presets.delete(name);
  }

  /**
   * Get a preset
   */
  public getPreset(name: string): MorphPreset | undefined {
    return this.presets.get(name);
  }

  /**
   * Get all preset names
   */
  public getPresetNames(): string[] {
    return Array.from(this.presets.keys());
  }

  /**
   * Apply a preset (instant)
   */
  public applyPreset(name: string): void {
    const preset = this.presets.get(name);
    if (!preset) return;

    this.setWeights(preset.weights);

    this.emit({
      type: 'preset-applied',
      preset: name,
      timestamp: Date.now(),
    });
  }

  /**
   * Blend to a preset over time
   */
  public blendToPreset(name: string, duration?: number, onComplete?: () => void): void {
    const preset = this.presets.get(name);
    if (!preset) return;

    this.blendToWeights(
      preset.weights,
      duration ?? preset.blendTime ?? this.config.defaultBlendTime ?? 0.3,
      preset.easing ?? 'ease-out',
      () => {
        this.emit({
          type: 'preset-applied',
          preset: name,
          timestamp: Date.now(),
        });
        onComplete?.();
      }
    );
  }

  /**
   * Blend to specific weights over time
   */
  public blendToWeights(
    weights: Record<string, number>,
    duration: number,
    easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' = 'ease-out',
    onComplete?: () => void
  ): void {
    // Capture current weights
    const startWeights = new Map<string, number>();
    const targetWeights = new Map<string, number>();

    for (const [name, weight] of Object.entries(weights)) {
      startWeights.set(name, this.getWeight(name));
      targetWeights.set(name, weight);
    }

    this.blendState = {
      targetWeights,
      startWeights,
      duration,
      elapsed: 0,
      easing,
      onComplete,
    };

    this.emit({
      type: 'blend-start',
      timestamp: Date.now(),
    });
  }

  // ============================================================================
  // Animation Clips
  // ============================================================================

  /**
   * Add a morph animation clip
   */
  public addClip(clip: MorphClip): void {
    this.clips.set(clip.name, clip);
  }

  /**
   * Remove a clip
   */
  public removeClip(name: string): void {
    this.clips.delete(name);
  }

  /**
   * Get a clip
   */
  public getClip(name: string): MorphClip | undefined {
    return this.clips.get(name);
  }

  /**
   * Play a morph animation
   */
  public play(
    clipName: string,
    options?: {
      weight?: number;
      speed?: number;
      loop?: boolean;
      onComplete?: () => void;
    }
  ): boolean {
    const clip = this.clips.get(clipName);
    if (!clip) return false;

    this.activeAnimations.set(clipName, {
      clip,
      time: 0,
      weight: options?.weight ?? 1,
      speed: options?.speed ?? clip.speed ?? 1,
      loop: options?.loop ?? clip.loop ?? false,
      onComplete: options?.onComplete,
    });

    this.emit({
      type: 'animation-start',
      clip: clipName,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Stop a morph animation
   */
  public stop(clipName: string): void {
    const anim = this.activeAnimations.get(clipName);
    if (!anim) return;

    this.activeAnimations.delete(clipName);

    this.emit({
      type: 'animation-end',
      clip: clipName,
      timestamp: Date.now(),
    });
  }

  /**
   * Stop all animations
   */
  public stopAll(): void {
    for (const name of this.activeAnimations.keys()) {
      this.stop(name);
    }
  }

  /**
   * Check if animation is playing
   */
  public isPlaying(clipName?: string): boolean {
    if (clipName) {
      return this.activeAnimations.has(clipName);
    }
    return this.activeAnimations.size > 0;
  }

  // ============================================================================
  // Update
  // ============================================================================

  /**
   * Update morph state (call each frame)
   */
  public update(deltaTime: number): void {
    // Update blend state
    this.updateBlend(deltaTime);

    // Update animations
    this.updateAnimations(deltaTime);
  }

  /**
   * Update blend transition
   */
  private updateBlend(deltaTime: number): void {
    if (!this.blendState) return;

    this.blendState.elapsed += deltaTime;
    const t = Math.min(1, this.blendState.elapsed / this.blendState.duration);
    const easedT = this.applyEasing(t, this.blendState.easing);

    // Interpolate weights
    for (const [name, target] of this.blendState.targetWeights) {
      const start = this.blendState.startWeights.get(name) ?? 0;
      const weight = start + (target - start) * easedT;
      this.setWeight(name, weight);
    }

    // Complete
    if (t >= 1) {
      const onComplete = this.blendState.onComplete;
      this.blendState = null;

      this.emit({
        type: 'blend-end',
        timestamp: Date.now(),
      });

      onComplete?.();
    }
  }

  /**
   * Update animations
   */
  private updateAnimations(deltaTime: number): void {
    for (const [name, anim] of this.activeAnimations) {
      anim.time += deltaTime * anim.speed;

      if (anim.time >= anim.clip.duration) {
        if (anim.loop) {
          anim.time %= anim.clip.duration;
        } else {
          this.stop(name);
          anim.onComplete?.();
          continue;
        }
      }

      // Sample animation
      this.sampleClip(anim.clip, anim.time, anim.weight);
    }
  }

  /**
   * Sample clip at time
   */
  private sampleClip(clip: MorphClip, time: number, weight: number): void {
    const keyframes = clip.keyframes;
    if (keyframes.length === 0) return;

    // Find surrounding keyframes
    let prev = keyframes[0];
    let next = keyframes[0];

    for (let i = 0; i < keyframes.length; i++) {
      if (keyframes[i].time <= time) {
        prev = keyframes[i];
      }
      if (keyframes[i].time >= time && next === keyframes[0]) {
        next = keyframes[i];
      }
    }

    // Calculate interpolation factor
    const duration = next.time - prev.time;
    const t = duration > 0 ? (time - prev.time) / duration : 0;
    const easedT = this.applyEasing(t, prev.easing ?? 'linear');

    // Interpolate weights
    const allTargets = new Set([...Object.keys(prev.weights), ...Object.keys(next.weights)]);

    for (const target of allTargets) {
      const prevWeight = prev.weights[target] ?? 0;
      const nextWeight = next.weights[target] ?? 0;
      const interpolated = prevWeight + (nextWeight - prevWeight) * easedT;

      // Apply with animation weight
      this.setWeight(target, interpolated * weight);
    }
  }

  /**
   * Apply easing function
   */
  private applyEasing(
    t: number,
    easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  ): number {
    switch (easing) {
      case 'ease-in':
        return t * t;
      case 'ease-out':
        return 1 - (1 - t) * (1 - t);
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      default:
        return t;
    }
  }

  // ============================================================================
  // Auto-Blink
  // ============================================================================

  /**
   * Start auto-blink
   */
  public startAutoBlink(): void {
    if (!this.config.autoBlink) return;

    const scheduleNextBlink = () => {
      const { interval, randomize } = this.config.autoBlink!;
      const randomOffset = (randomize ?? 0) * (Math.random() - 0.5) * 2;
      const delay = (interval + randomOffset) * 1000;

      this.blinkTimer = setTimeout(() => {
        this.blink();
        scheduleNextBlink();
      }, delay);
    };

    scheduleNextBlink();
  }

  /**
   * Stop auto-blink
   */
  public stopAutoBlink(): void {
    if (this.blinkTimer) {
      clearTimeout(this.blinkTimer);
      this.blinkTimer = null;
    }
  }

  /**
   * Perform a blink
   */
  public blink(duration?: number): void {
    const config = this.config.autoBlink;
    if (!config) return;

    const blinkDuration = duration ?? config.duration ?? 0.15;
    const targets = config.targets ?? [];

    // Close eyes
    const closeWeights: Record<string, number> = {};
    const openWeights: Record<string, number> = {};

    for (const target of targets) {
      closeWeights[target] = 1;
      openWeights[target] = 0;
    }

    // Close then open
    this.blendToWeights(closeWeights, blinkDuration / 2, 'ease-in', () => {
      this.blendToWeights(openWeights, blinkDuration / 2, 'ease-out');
    });

    this.lastBlinkTime = Date.now();
  }

  /**
   * Get the timestamp of the last blink
   */
  public getLastBlinkTime(): number {
    return this.lastBlinkTime;
  }

  // ============================================================================
  // Lip Sync
  // ============================================================================

  /**
   * Set viseme (for lip sync)
   */
  public setViseme(viseme: string, weight: number = 1): void {
    if (!this.config.lipSync) return;

    const targetName = this.config.lipSync.visemeMap[viseme];
    if (targetName) {
      this.setWeight(targetName, weight);
    }
  }

  /**
   * Clear all visemes
   */
  public clearVisemes(): void {
    if (!this.config.lipSync) return;

    for (const targetName of Object.values(this.config.lipSync.visemeMap)) {
      this.setWeight(targetName, 0);
    }
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * Register event listener
   */
  public on(event: MorphEventType, callback: MorphEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unregister event listener
   */
  public off(event: MorphEventType, callback: MorphEventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Emit event
   */
  private emit(event: MorphEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event);
        } catch (e) {
          console.error('Morph event listener error:', e);
        }
      }
    }
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Export current weights
   */
  public exportWeights(): Record<string, number> {
    return this.getWeights();
  }

  /**
   * Import weights
   */
  public importWeights(weights: Record<string, number>): void {
    this.setWeights(weights);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.stopAutoBlink();
    this.stopAll();
    this.eventListeners.clear();
  }
}

/**
 * Create a morph trait
 */
export function createMorphTrait(config?: MorphConfig): MorphTrait {
  return new MorphTrait(config);
}

// ── Handler (delegates to MorphTrait) ──
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, TraitInstanceDelegate } from './TraitTypes';

export const morphHandler = {
  name: 'morph',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: any, ctx: TraitContext): void {
    const instance = new MorphTrait(config);
    node.__morph_instance = instance;
    ctx.emit('morph_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: any, ctx: TraitContext): void {
    const instance = node.__morph_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('morph_detached', { node });
    delete node.__morph_instance;
  },
  onEvent(node: HSPlusNode, _config: any, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__morph_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'morph_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('morph_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: any, ctx: TraitContext, dt: number): void {
    const instance = node.__morph_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
