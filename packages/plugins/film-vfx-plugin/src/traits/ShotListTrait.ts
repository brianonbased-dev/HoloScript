/**
 * @shot_list trait — Shot planning and sequencing for film/VFX productions
 *
 * Defines shot type, duration, lens, and camera movement for each take.
 * Used by director AI and virtual production pipelines to pre-visualize
 * and execute camera choreography.
 *
 * @module @holoscript/plugin-film-vfx
 */

// ============================================================================
// Types
// ============================================================================

export type ShotType =
  | 'extreme_wide'
  | 'wide'
  | 'medium_wide'
  | 'medium'
  | 'medium_close'
  | 'close'
  | 'extreme_close'
  | 'over_the_shoulder'
  | 'pov'
  | 'insert'
  | 'cutaway'
  | 'two_shot'
  | 'establishing';

export type CameraMovement =
  | 'static'
  | 'pan'
  | 'tilt'
  | 'dolly'
  | 'crane'
  | 'steadicam'
  | 'handheld'
  | 'drone'
  | 'tracking'
  | 'zoom'
  | 'whip_pan'
  | 'rack_focus';

export interface LensConfig {
  /** Focal length in mm */
  focalLength: number;
  /** T-stop (cinematic f-stop) */
  tStop?: number;
  /** Focus distance in meters */
  focusDistance?: number;
  /** Anamorphic lens enabled */
  anamorphic?: boolean;
  /** Lens model name for metadata */
  model?: string;
}

export interface ShotListConfig {
  /** Shot identifier (e.g., "1A", "2B") */
  shotId: string;
  /** Scene number */
  scene: number;
  /** Shot type framing */
  shotType: ShotType;
  /** Duration in seconds */
  duration: number;
  /** Lens configuration */
  lens: LensConfig;
  /** Camera movement type */
  movement: CameraMovement;
  /** Movement speed (0-1, 0=static, 1=fastest) */
  movementSpeed?: number;
  /** Description / director notes */
  description?: string;
  /** Subject(s) in frame */
  subjects?: string[];
  /** Transition to next shot */
  transition?: 'cut' | 'dissolve' | 'wipe' | 'fade_in' | 'fade_out' | 'match_cut';
  /** Take number (for multi-take tracking) */
  take?: number;
  /** Priority for coverage requirements */
  priority?: 'essential' | 'preferred' | 'optional';
}

// ============================================================================
// Trait Handler
// ============================================================================

export interface ShotListTraitHandler {
  name: 'shot_list';
  defaultConfig: ShotListConfig;
  onAttach(entity: unknown, config: ShotListConfig): void;
  onDetach(entity: unknown): void;
  onUpdate(entity: unknown, config: Partial<ShotListConfig>): void;
  onEvent(entity: unknown, event: string, payload: unknown): void;
}

export function createShotListHandler(): ShotListTraitHandler {
  return {
    name: 'shot_list',
    defaultConfig: {
      shotId: '1A',
      scene: 1,
      shotType: 'medium',
      duration: 5,
      lens: { focalLength: 50 },
      movement: 'static',
      priority: 'essential',
    },
    onAttach(entity: unknown, config: ShotListConfig): void {
      // Register shot in the shot list registry for the scene
      void entity;
      void config;
    },
    onDetach(entity: unknown): void {
      // Remove shot from registry
      void entity;
    },
    onUpdate(entity: unknown, config: Partial<ShotListConfig>): void {
      // Update shot parameters (lens change, reframing, etc.)
      void entity;
      void config;
    },
    onEvent(entity: unknown, event: string, payload: unknown): void {
      // Handle events: 'mark_take', 'print_take', 'advance_shot', 'cut'
      void entity;
      void event;
      void payload;
    },
  };
}
