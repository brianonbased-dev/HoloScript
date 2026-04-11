/**
 * @director_ai trait — AI-assisted directing for blocking, motivation, and coverage
 *
 * Provides structured data for AI-driven scene direction: actor blocking,
 * character motivation, emotional beats, and coverage requirements.
 * Integrates with shot_list and virtual_production for automated
 * pre-visualization and shot planning.
 *
 * @module @holoscript/plugin-film-vfx
 */

// ============================================================================
// Types
// ============================================================================

export interface BlockingMark {
  /** Mark label (e.g., "A1", "B2") */
  mark: string;
  /** Position in scene space [x, y, z] meters */
  position: [number, number, number];
  /** Facing direction in degrees (0 = camera) */
  facing: number;
  /** Time in scene when actor hits this mark (seconds) */
  atTime: number;
  /** Action at this mark */
  action?: string;
}

export interface EmotionalBeat {
  /** Beat identifier */
  id: string;
  /** Time range in scene [start, end] seconds */
  timeRange: [number, number];
  /** Primary emotion */
  emotion: string;
  /** Intensity (0-1) */
  intensity: number;
  /** Transition from previous beat */
  transition?: 'sudden' | 'gradual' | 'building' | 'releasing';
  /** Director note */
  note?: string;
}

export type CoverageType =
  | 'master'
  | 'single'
  | 'two_shot'
  | 'over_shoulder'
  | 'insert'
  | 'reaction'
  | 'establishing'
  | 'cutaway';

export interface CoverageRequirement {
  /** Coverage type needed */
  type: CoverageType;
  /** Subject(s) this coverage is for */
  subjects: string[];
  /** Whether this coverage is mandatory */
  mandatory: boolean;
  /** Linked shot ID (if already planned) */
  shotId?: string;
  /** Status */
  status: 'planned' | 'captured' | 'missing';
}

export interface DirectorAIConfig {
  /** Scene identifier */
  sceneId: string;
  /** Scene description / log line */
  description?: string;
  /** Actor blocking marks */
  blocking: BlockingMark[];
  /** Character motivations (character name -> motivation text) */
  motivation: Record<string, string>;
  /** Emotional beats for the scene */
  emotionalBeats: EmotionalBeat[];
  /** Coverage requirements */
  coverage: CoverageRequirement[];
  /** Scene tone / mood keywords */
  tone?: string[];
  /** Reference films/scenes for AI context */
  references?: string[];
  /** Pacing target: beats per minute */
  pacingBPM?: number;
  /** Auto-generate shot suggestions from blocking + coverage */
  autoSuggestShots?: boolean;
}

// ============================================================================
// Trait Handler
// ============================================================================

export interface DirectorAITraitHandler {
  name: 'director_ai';
  defaultConfig: DirectorAIConfig;
  onAttach(entity: unknown, config: DirectorAIConfig): void;
  onDetach(entity: unknown): void;
  onUpdate(entity: unknown, config: Partial<DirectorAIConfig>): void;
  onEvent(entity: unknown, event: string, payload: unknown): void;
}

export function createDirectorAIHandler(): DirectorAITraitHandler {
  return {
    name: 'director_ai',
    defaultConfig: {
      sceneId: 'scene_001',
      blocking: [],
      motivation: {},
      emotionalBeats: [],
      coverage: [],
      autoSuggestShots: true,
    },
    onAttach(entity: unknown, config: DirectorAIConfig): void {
      // Initialize director AI context for the scene
      void entity;
      void config;
    },
    onDetach(entity: unknown): void {
      // Clean up director context
      void entity;
    },
    onUpdate(entity: unknown, config: Partial<DirectorAIConfig>): void {
      // Update blocking, beats, or coverage; re-evaluate shot suggestions
      void entity;
      void config;
    },
    onEvent(entity: unknown, event: string, payload: unknown): void {
      // Handle events: 'suggest_shots', 'validate_coverage', 'analyze_pacing',
      // 'mark_coverage_captured', 'generate_storyboard'
      void entity;
      void event;
      void payload;
    },
  };
}
