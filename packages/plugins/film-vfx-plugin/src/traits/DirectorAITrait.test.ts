import { describe, expect, it } from 'vitest';
import {
  createDirectorAIHandler,
  type DirectorAICoverageValidation,
  type DirectorAIPacingAnalysis,
  type DirectorAIShotSuggestion,
  type DirectorAIStoryboardItem,
  type DirectorAIConfig,
} from './DirectorAITrait';

function directorConfig(overrides: Partial<DirectorAIConfig> = {}): DirectorAIConfig {
  return {
    sceneId: 'scene_bridge',
    description: 'Two characters cross before the reveal.',
    blocking: [
      {
        mark: 'A1',
        position: [0, 0, 0],
        facing: 15,
        atTime: 0,
        action: 'Mira enters from left',
      },
      {
        mark: 'B2',
        position: [2, 0, 1],
        facing: 210,
        atTime: 30,
        action: 'Noor turns toward Mira',
      },
    ],
    motivation: {
      Mira: 'hide the warning',
      Noor: 'force the truth into the open',
    },
    emotionalBeats: [
      {
        id: 'beat_1',
        timeRange: [0, 12],
        emotion: 'suspicion',
        intensity: 0.45,
      },
      {
        id: 'beat_2',
        timeRange: [18, 30],
        emotion: 'resolve',
        intensity: 0.85,
      },
    ],
    coverage: [
      {
        type: 'two_shot',
        subjects: ['Mira', 'Noor'],
        mandatory: true,
        status: 'planned',
      },
    ],
    pacingBPM: 4,
    autoSuggestShots: true,
    ...overrides,
  };
}

describe('createDirectorAIHandler', () => {
  it('suggests shots, validates coverage, analyzes pacing, and builds storyboards', () => {
    const handler = createDirectorAIHandler();
    const entity = { id: 'director-scene' };

    handler.onAttach(entity, directorConfig());

    const suggestions = handler.onEvent(
      entity,
      'suggest_shots',
      undefined
    ) as DirectorAIShotSuggestion[];
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      shotId: 'scene_bridge_two_shot_01',
      coverageType: 'two_shot',
      subjects: ['Mira', 'Noor'],
      markRefs: ['A1', 'B2'],
      priority: 'mandatory',
      framing: 'medium_wide',
      cameraMovement: 'tracking',
    });

    const coverage = handler.onEvent(
      entity,
      'validate_coverage',
      undefined
    ) as DirectorAICoverageValidation;
    expect(coverage.valid).toBe(false);
    expect(coverage.plannedMandatory).toHaveLength(1);
    expect(coverage.summary).toContain('1 mandatory coverage');

    const pacing = handler.onEvent(entity, 'analyze_pacing', undefined) as DirectorAIPacingAnalysis;
    expect(pacing.status).toBe('on_target');
    expect(pacing.measuredBPM).toBeCloseTo(4);
    expect(pacing.deltaBPM).toBeCloseTo(0);

    const storyboard = handler.onEvent(
      entity,
      'generate_storyboard',
      undefined
    ) as DirectorAIStoryboardItem[];
    expect(storyboard.map((item) => item.beatId)).toEqual(['beat_1', 'beat_2']);
    expect(storyboard[0]?.suggestedShots[0]?.shotId).toBe('scene_bridge_two_shot_01');

    handler.onUpdate(entity, {
      coverage: [
        {
          type: 'two_shot',
          subjects: ['Mira', 'Noor'],
          mandatory: true,
          status: 'captured',
        },
      ],
    });
    const updated = handler.getContextSnapshot(entity);
    expect(updated?.coverageValidation.valid).toBe(true);
    expect(updated?.changedFields).toEqual(['coverage']);

    handler.onDetach(entity);
    expect(handler.getContextSnapshot(entity)).toBeUndefined();
    expect(() => handler.onEvent(entity, 'suggest_shots', undefined)).toThrow(
      'DirectorAITrait context is not attached'
    );
  });

  it('marks matching coverage captured from an event payload', () => {
    const handler = createDirectorAIHandler();
    const entity = { id: 'director-capture' };
    handler.onAttach(entity, directorConfig());

    const result = handler.onEvent(entity, 'mark_coverage_captured', {
      type: 'two_shot',
      subjects: ['Mira', 'Noor'],
    }) as DirectorAICoverageValidation;

    expect(result.valid).toBe(true);
    expect(result.capturedMandatory).toHaveLength(1);
    expect(handler.getContextSnapshot(entity)?.config.coverage[0]?.status).toBe('captured');
  });
});
