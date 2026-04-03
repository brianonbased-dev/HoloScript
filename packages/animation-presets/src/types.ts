/**
 * @holoscript/animation-presets — Type Definitions
 *
 * Core interfaces for animation preset definitions, Mixamo clip mapping,
 * timing configuration, and category grouping.
 *
 * Pattern P.012: Behavior Presets Over Keyframing
 */

// ---------------------------------------------------------------------------
// Enums & Literal Types
// ---------------------------------------------------------------------------

/**
 * Animation loop mode controlling playback repetition behavior.
 *
 * - `once`:     Play forward once then stop at the last frame.
 * - `loop`:     Restart from the beginning when the end is reached.
 * - `pingpong`: Alternate between forward and reverse playback.
 * - `clamp`:    Play once and hold the final frame indefinitely.
 */
export type LoopMode = 'once' | 'loop' | 'pingpong' | 'clamp';

/**
 * Easing function applied to the animation timeline.
 */
export type EasingFunction =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'ease-in-bounce'
  | 'ease-out-bounce'
  | 'ease-in-out-bounce'
  | 'ease-in-elastic'
  | 'ease-out-elastic'
  | 'ease-in-back'
  | 'ease-out-back';

/**
 * Preset category for organizational grouping within the registry.
 *
 * - `locomotion`:    Movement behaviors (walk, run, jump, climb, swim, fly, crouch)
 * - `combat`:        Combat-related actions (attack)
 * - `social`:        Social / communication behaviors (speak, wave)
 * - `emote`:         Expressive emotes and performances (dance, emote)
 * - `environmental`: Environmental / ambient states (idle, sit, sleep)
 */
export type PresetCategory = 'locomotion' | 'combat' | 'social' | 'emote' | 'environmental';

/**
 * The 15 canonical preset behavior names.
 */
export type PresetName =
  | 'walk'
  | 'idle'
  | 'attack'
  | 'speak'
  | 'dance'
  | 'run'
  | 'jump'
  | 'wave'
  | 'sit'
  | 'sleep'
  | 'crouch'
  | 'swim'
  | 'fly'
  | 'climb'
  | 'emote';

// ---------------------------------------------------------------------------
// Timing Configuration
// ---------------------------------------------------------------------------

/**
 * Timing parameters for an animation preset.
 */
export interface AnimationTiming {
  /** Duration of one animation cycle in seconds. */
  duration: number;

  /** Delay before the animation begins (seconds). Default: 0 */
  delay: number;

  /** Easing function applied to the timeline. Default: 'linear' */
  easing: EasingFunction;
}

// ---------------------------------------------------------------------------
// Mixamo Clip Mapping
// ---------------------------------------------------------------------------

/**
 * Mapping between a preset behavior and its corresponding Mixamo animation clip.
 *
 * Mixamo provides standardized character animations via Adobe's online library.
 * Each mapping includes the canonical clip name, an optional pack reference,
 * and alternative clip names that may be used for variation.
 */
export interface MixamoClipMapping {
  /** Primary Mixamo clip name (e.g. "Walking", "Idle", "Sword And Shield Attack"). */
  clipName: string;

  /**
   * Mixamo animation pack this clip belongs to.
   * Useful for batch-downloading related clips.
   */
  pack: string;

  /**
   * Alternative Mixamo clip names that can be swapped in for variety.
   * Ordered from most-similar to least-similar.
   */
  alternatives: string[];
}

// ---------------------------------------------------------------------------
// Animation Preset
// ---------------------------------------------------------------------------

/**
 * Complete definition of an animation preset for the `@animated` trait.
 *
 * Presets encapsulate all parameters needed to apply a named behavior
 * to a character object: timing, loop behavior, blend weight,
 * speed multiplier, and Mixamo clip mapping.
 *
 * Pattern P.012: Behavior Presets Over Keyframing — prefer pre-authored
 * parameter sets over manual keyframe definitions for common behaviors.
 */
export interface AnimationPreset {
  /** Unique preset identifier (e.g. "walk", "idle", "attack"). */
  name: PresetName;

  /** Human-readable description of the behavior. */
  description: string;

  /** Category for registry grouping. */
  category: PresetCategory;

  /** Timing configuration (duration, delay, easing). */
  timing: AnimationTiming;

  /** How the animation repeats after completing. */
  loopMode: LoopMode;

  /**
   * Blend weight when layering animations (0.0 - 1.0).
   * 1.0 = full influence, 0.0 = no influence.
   * Used for additive blending and cross-fade layering.
   */
  blendWeight: number;

  /**
   * Playback speed multiplier (1.0 = normal speed).
   * Values > 1.0 speed up, < 1.0 slow down.
   * Negative values play in reverse.
   */
  speedMultiplier: number;

  /**
   * Mapping to the corresponding Mixamo animation clip.
   * Includes the primary clip name, pack reference, and alternatives.
   */
  mixamoClip: MixamoClipMapping;

  /**
   * Optional tags for filtering and search within the registry.
   */
  tags: string[];
}

/**
 * An animation preset that allows arbitrary (non-canonical) names.
 * Used for custom presets registered at runtime via `PresetRegistry.register()`.
 */
export interface CustomAnimationPreset extends Omit<AnimationPreset, 'name'> {
  name: string;
}

// ---------------------------------------------------------------------------
// Resolved Trait Annotation
// ---------------------------------------------------------------------------

/**
 * The resolved output from `resolvePreset()` — a complete `@animated` trait
 * annotation ready for injection into a HoloScript composition.
 */
export interface ResolvedAnimatedTrait {
  /** The raw HoloScript `@animated(...)` annotation string. */
  annotation: string;

  /** The animation block(s) to insert into the object body. */
  animationBlock: string;

  /**
   * Full combined output: trait annotation + animation block,
   * ready to paste into a HoloScript composition.
   */
  fullOutput: string;

  /** The source preset this was resolved from. */
  preset: AnimationPreset;
}

// ---------------------------------------------------------------------------
// Preset Override
// ---------------------------------------------------------------------------

/**
 * Partial overrides that can be applied when resolving a preset.
 * Allows customizing timing, speed, blend weight, etc. without
 * defining a whole new preset.
 */
export interface PresetOverrides {
  timing?: Partial<AnimationTiming>;
  loopMode?: LoopMode;
  blendWeight?: number;
  speedMultiplier?: number;
}
