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

export interface DirectorAIShotSuggestion {
  shotId: string;
  coverageType: CoverageType;
  subjects: string[];
  markRefs: string[];
  startTime: number;
  duration: number;
  framing: string;
  cameraMovement: string;
  lensMm: number;
  priority: 'mandatory' | 'recommended';
  reason: string;
}

export interface DirectorAICoverageValidation {
  valid: boolean;
  missingMandatory: CoverageRequirement[];
  plannedMandatory: CoverageRequirement[];
  capturedMandatory: CoverageRequirement[];
  summary: string;
}

export interface DirectorAIPacingAnalysis {
  status: 'on_target' | 'too_slow' | 'too_fast' | 'insufficient_data';
  targetBPM?: number;
  measuredBPM: number;
  deltaBPM?: number;
  beatCount: number;
  durationSeconds: number;
  notes: string[];
}

export interface DirectorAIStoryboardItem {
  order: number;
  beatId: string;
  timeRange: [number, number];
  emotion: string;
  intensity: number;
  note?: string;
  suggestedShots: DirectorAIShotSuggestion[];
}

export interface DirectorAIContextSnapshot {
  config: DirectorAIConfig;
  shotSuggestions: DirectorAIShotSuggestion[];
  coverageValidation: DirectorAICoverageValidation;
  pacingAnalysis: DirectorAIPacingAnalysis;
  storyboard: DirectorAIStoryboardItem[];
  changedFields: Array<keyof DirectorAIConfig>;
}

export type DirectorAIEventResult =
  | DirectorAIShotSuggestion[]
  | DirectorAICoverageValidation
  | DirectorAIPacingAnalysis
  | DirectorAIStoryboardItem[]
  | DirectorAIContextSnapshot
  | undefined;

// ============================================================================
// Trait Handler
// ============================================================================

export interface DirectorAITraitHandler {
  name: 'director_ai';
  defaultConfig: DirectorAIConfig;
  onAttach(entity: unknown, config: DirectorAIConfig): void;
  onDetach(entity: unknown): void;
  onUpdate(entity: unknown, config: Partial<DirectorAIConfig>): void;
  onEvent(entity: unknown, event: string, payload: unknown): DirectorAIEventResult;
  getContextSnapshot(entity: unknown): DirectorAIContextSnapshot | undefined;
}

interface DirectorAIContext {
  config: DirectorAIConfig;
  shotSuggestions: DirectorAIShotSuggestion[];
  coverageValidation: DirectorAICoverageValidation;
  pacingAnalysis: DirectorAIPacingAnalysis;
  storyboard: DirectorAIStoryboardItem[];
  changedFields: Array<keyof DirectorAIConfig>;
}

const COVERAGE_PRESETS: Record<
  CoverageType,
  { framing: string; cameraMovement: string; lensMm: number }
> = {
  master: { framing: 'wide', cameraMovement: 'static', lensMm: 28 },
  single: { framing: 'medium', cameraMovement: 'static', lensMm: 50 },
  two_shot: { framing: 'medium_wide', cameraMovement: 'tracking', lensMm: 35 },
  over_shoulder: { framing: 'over_the_shoulder', cameraMovement: 'static', lensMm: 65 },
  insert: { framing: 'insert', cameraMovement: 'static', lensMm: 85 },
  reaction: { framing: 'close', cameraMovement: 'static', lensMm: 75 },
  establishing: { framing: 'establishing', cameraMovement: 'crane', lensMm: 24 },
  cutaway: { framing: 'cutaway', cameraMovement: 'static', lensMm: 50 },
};

function cloneBlocking(mark: BlockingMark): BlockingMark {
  return {
    ...mark,
    position: [...mark.position] as [number, number, number],
  };
}

function cloneBeat(beat: EmotionalBeat): EmotionalBeat {
  return {
    ...beat,
    timeRange: [...beat.timeRange] as [number, number],
  };
}

function cloneCoverage(requirement: CoverageRequirement): CoverageRequirement {
  return {
    ...requirement,
    subjects: [...requirement.subjects],
  };
}

function normalizeConfig(
  defaultConfig: DirectorAIConfig,
  config: Partial<DirectorAIConfig>
): DirectorAIConfig {
  return {
    ...defaultConfig,
    ...config,
    blocking: (config.blocking ?? defaultConfig.blocking).map(cloneBlocking),
    motivation: { ...defaultConfig.motivation, ...(config.motivation ?? {}) },
    emotionalBeats: (config.emotionalBeats ?? defaultConfig.emotionalBeats).map(cloneBeat),
    coverage: (config.coverage ?? defaultConfig.coverage).map(cloneCoverage),
    tone: config.tone ? [...config.tone] : defaultConfig.tone ? [...defaultConfig.tone] : undefined,
    references: config.references
      ? [...config.references]
      : defaultConfig.references
        ? [...defaultConfig.references]
        : undefined,
  };
}

function cloneConfig(config: DirectorAIConfig): DirectorAIConfig {
  return normalizeConfig(config, config);
}

function sortedBlocking(config: DirectorAIConfig): BlockingMark[] {
  return [...config.blocking].sort((a, b) => a.atTime - b.atTime);
}

function sceneDurationSeconds(config: DirectorAIConfig): number {
  const blockingTimes = config.blocking.map((mark) => mark.atTime);
  const beatTimes = config.emotionalBeats.flatMap((beat) => beat.timeRange);
  const times = [...blockingTimes, ...beatTimes].filter((time) => Number.isFinite(time));
  if (times.length === 0) return 0;
  return Math.max(...times) - Math.min(0, ...times);
}

function markRefsForCoverage(config: DirectorAIConfig, requirement: CoverageRequirement): string[] {
  const marks = sortedBlocking(config);
  if (marks.length === 0) return [];
  if (requirement.type === 'master' || requirement.type === 'establishing') {
    return marks.map((mark) => mark.mark);
  }
  const subjectTokens = requirement.subjects.map((subject) => subject.toLowerCase());
  const subjectMarks = marks.filter((mark) => {
    const haystack = `${mark.mark} ${mark.action ?? ''}`.toLowerCase();
    return subjectTokens.some((subject) => haystack.includes(subject));
  });
  return (subjectMarks.length > 0 ? subjectMarks : marks.slice(0, Math.min(2, marks.length))).map(
    (mark) => mark.mark
  );
}

function deriveShotSuggestions(config: DirectorAIConfig): DirectorAIShotSuggestion[] {
  const marks = sortedBlocking(config);
  const duration = Math.max(2, sceneDurationSeconds(config) || 2);
  const startTime = marks[0]?.atTime ?? 0;

  if (config.coverage.length === 0 && marks.length > 0) {
    const preset = COVERAGE_PRESETS.master;
    return [
      {
        shotId: `${config.sceneId}_master_1`,
        coverageType: 'master',
        subjects: Object.keys(config.motivation),
        markRefs: marks.map((mark) => mark.mark),
        startTime,
        duration,
        framing: preset.framing,
        cameraMovement: preset.cameraMovement,
        lensMm: preset.lensMm,
        priority: 'recommended',
        reason: 'Derived master coverage from blocking marks because no coverage list exists.',
      },
    ];
  }

  return config.coverage.map((requirement, index) => {
    const preset = COVERAGE_PRESETS[requirement.type];
    const shotId =
      requirement.shotId ??
      `${config.sceneId}_${requirement.type}_${String(index + 1).padStart(2, '0')}`;
    return {
      shotId,
      coverageType: requirement.type,
      subjects: [...requirement.subjects],
      markRefs: markRefsForCoverage(config, requirement),
      startTime,
      duration,
      framing: preset.framing,
      cameraMovement: preset.cameraMovement,
      lensMm: preset.lensMm,
      priority: requirement.mandatory ? 'mandatory' : 'recommended',
      reason:
        requirement.status === 'captured'
          ? `Coverage ${requirement.type} is captured; keep as continuity reference.`
          : `Plan ${requirement.type} coverage for ${requirement.subjects.join(', ') || 'scene'}.`,
    };
  });
}

function validateCoverage(config: DirectorAIConfig): DirectorAICoverageValidation {
  const mandatory = config.coverage.filter((requirement) => requirement.mandatory);
  const missingMandatory = mandatory.filter((requirement) => requirement.status === 'missing');
  const plannedMandatory = mandatory.filter((requirement) => requirement.status === 'planned');
  const capturedMandatory = mandatory.filter((requirement) => requirement.status === 'captured');
  const openMandatory = missingMandatory.length + plannedMandatory.length;
  return {
    valid: openMandatory === 0,
    missingMandatory: missingMandatory.map(cloneCoverage),
    plannedMandatory: plannedMandatory.map(cloneCoverage),
    capturedMandatory: capturedMandatory.map(cloneCoverage),
    summary:
      openMandatory === 0
        ? 'All mandatory coverage is captured.'
        : `${openMandatory} mandatory coverage requirement(s) still need capture.`,
  };
}

function analyzePacing(config: DirectorAIConfig): DirectorAIPacingAnalysis {
  const beatCount = config.emotionalBeats.length;
  const durationSeconds = sceneDurationSeconds(config);
  if (beatCount < 2 || durationSeconds <= 0) {
    return {
      status: 'insufficient_data',
      targetBPM: config.pacingBPM,
      measuredBPM: 0,
      beatCount,
      durationSeconds,
      notes: ['Need at least two emotional beats with non-zero duration to analyze pacing.'],
    };
  }

  const measuredBPM = (beatCount / durationSeconds) * 60;
  const targetBPM = config.pacingBPM;
  const deltaBPM = targetBPM === undefined ? undefined : measuredBPM - targetBPM;
  const tolerance = targetBPM === undefined ? 0 : Math.max(2, targetBPM * 0.15);
  const status =
    targetBPM === undefined || deltaBPM === undefined || Math.abs(deltaBPM) <= tolerance
      ? 'on_target'
      : deltaBPM < 0
        ? 'too_slow'
        : 'too_fast';

  const notes = [`Measured ${measuredBPM.toFixed(1)} beats per minute across ${beatCount} beats.`];
  if (targetBPM !== undefined && deltaBPM !== undefined) {
    notes.push(`Target delta is ${deltaBPM.toFixed(1)} BPM.`);
  }

  return {
    status,
    targetBPM,
    measuredBPM,
    deltaBPM,
    beatCount,
    durationSeconds,
    notes,
  };
}

function generateStoryboard(
  config: DirectorAIConfig,
  suggestions: DirectorAIShotSuggestion[]
): DirectorAIStoryboardItem[] {
  return [...config.emotionalBeats]
    .sort((a, b) => a.timeRange[0] - b.timeRange[0])
    .map((beat, index) => {
      const beatShots = suggestions.filter(
        (shot) =>
          shot.startTime <= beat.timeRange[1] && shot.startTime + shot.duration >= beat.timeRange[0]
      );
      return {
        order: index + 1,
        beatId: beat.id,
        timeRange: [...beat.timeRange] as [number, number],
        emotion: beat.emotion,
        intensity: beat.intensity,
        note: beat.note,
        suggestedShots: beatShots.length > 0 ? beatShots : suggestions.slice(0, 1),
      };
    });
}

function snapshotContext(context: DirectorAIContext): DirectorAIContextSnapshot {
  return {
    config: cloneConfig(context.config),
    shotSuggestions: context.shotSuggestions.map((shot) => ({
      ...shot,
      subjects: [...shot.subjects],
      markRefs: [...shot.markRefs],
    })),
    coverageValidation: {
      ...context.coverageValidation,
      missingMandatory: context.coverageValidation.missingMandatory.map(cloneCoverage),
      plannedMandatory: context.coverageValidation.plannedMandatory.map(cloneCoverage),
      capturedMandatory: context.coverageValidation.capturedMandatory.map(cloneCoverage),
    },
    pacingAnalysis: {
      ...context.pacingAnalysis,
      notes: [...context.pacingAnalysis.notes],
    },
    storyboard: context.storyboard.map((item) => ({
      ...item,
      timeRange: [...item.timeRange] as [number, number],
      suggestedShots: item.suggestedShots.map((shot) => ({
        ...shot,
        subjects: [...shot.subjects],
        markRefs: [...shot.markRefs],
      })),
    })),
    changedFields: [...context.changedFields],
  };
}

function buildContext(
  config: DirectorAIConfig,
  changedFields: Array<keyof DirectorAIConfig> = []
): DirectorAIContext {
  const shotSuggestions = deriveShotSuggestions(config);
  const coverageValidation = validateCoverage(config);
  const pacingAnalysis = analyzePacing(config);
  const storyboard = generateStoryboard(config, shotSuggestions);
  return {
    config,
    shotSuggestions,
    coverageValidation,
    pacingAnalysis,
    storyboard,
    changedFields,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function coverageMatchesPayload(requirement: CoverageRequirement, payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  if (typeof payload.shotId === 'string' && requirement.shotId === payload.shotId) return true;
  if (payload.type === requirement.type) {
    if (!Array.isArray(payload.subjects)) return true;
    const requested = payload.subjects.map(String).sort().join('|');
    const actual = [...requirement.subjects].sort().join('|');
    return requested === actual;
  }
  return false;
}

export function createDirectorAIHandler(): DirectorAITraitHandler {
  const contexts = new Map<unknown, DirectorAIContext>();

  const defaultConfig: DirectorAIConfig = {
    sceneId: 'scene_001',
    blocking: [],
    motivation: {},
    emotionalBeats: [],
    coverage: [],
    autoSuggestShots: true,
  };

  const requireContext = (entity: unknown): DirectorAIContext => {
    const context = contexts.get(entity);
    if (!context) {
      throw new Error('DirectorAITrait context is not attached');
    }
    return context;
  };

  const setContext = (
    entity: unknown,
    config: DirectorAIConfig,
    changedFields: Array<keyof DirectorAIConfig> = []
  ): DirectorAIContext => {
    const context = buildContext(config, changedFields);
    contexts.set(entity, context);
    return context;
  };

  return {
    name: 'director_ai',
    defaultConfig,
    onAttach(entity: unknown, config: DirectorAIConfig): void {
      setContext(entity, normalizeConfig(defaultConfig, config), ['blocking', 'coverage']);
    },
    onDetach(entity: unknown): void {
      contexts.delete(entity);
    },
    onUpdate(entity: unknown, config: Partial<DirectorAIConfig>): void {
      const current = requireContext(entity);
      const changedFields = Object.keys(config) as Array<keyof DirectorAIConfig>;
      setContext(entity, normalizeConfig(current.config, config), changedFields);
    },
    onEvent(entity: unknown, event: string, payload: unknown): DirectorAIEventResult {
      const context = requireContext(entity);
      switch (event) {
        case 'suggest_shots':
          return snapshotContext(context).shotSuggestions;
        case 'validate_coverage':
          return snapshotContext(context).coverageValidation;
        case 'analyze_pacing':
          return snapshotContext(context).pacingAnalysis;
        case 'generate_storyboard':
          return snapshotContext(context).storyboard;
        case 'mark_coverage_captured': {
          const coverage = context.config.coverage.map((requirement) =>
            coverageMatchesPayload(requirement, payload)
              ? { ...requirement, status: 'captured' as const }
              : requirement
          );
          const next = setContext(entity, normalizeConfig(context.config, { coverage }), [
            'coverage',
          ]);
          return snapshotContext(next).coverageValidation;
        }
        case 'snapshot':
          return snapshotContext(context);
        default:
          return undefined;
      }
    },
    getContextSnapshot(entity: unknown): DirectorAIContextSnapshot | undefined {
      const context = contexts.get(entity);
      return context ? snapshotContext(context) : undefined;
    },
  };
}
