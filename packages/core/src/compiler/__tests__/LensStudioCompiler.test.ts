import { describe, expect, it } from 'vitest';
import { LensStudioCompiler } from '../LensStudioCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'LensLogic',
    objects: [],
    spatialGroups: [],
    lights: [],
    ...overrides,
  } as HoloComposition;
}

describe('LensStudioCompiler', () => {
  it('surfaces dropped handler statements in metadata and scene script banners', () => {
    const compiler = new LensStudioCompiler();
    const result = compiler.compile(
      makeComposition({
        logic: {
          type: 'Logic',
          handlers: [
            {
              type: 'EventHandler',
              event: 'on_tap',
              parameters: [],
              body: [{ type: 'Assignment', target: 'score' }],
            },
          ],
          actions: [],
        },
      }),
      ''
    );

    const payload = JSON.parse(result.output) as {
      sceneScript: string;
      droppedStatementCount: number;
      droppedStatements: Array<{
        type: string;
        name?: string;
        context: string;
        owner: string;
      }>;
    };

    expect(result.droppedStatementCount).toBe(1);
    expect(result.droppedStatements[0]).toMatchObject({
      type: 'Assignment',
      name: 'score',
      context: 'logic-handler',
      owner: 'on_tap',
    });
    expect(payload.droppedStatementCount).toBe(1);
    expect(payload.droppedStatements[0]).toMatchObject({
      type: 'Assignment',
      name: 'score',
      context: 'logic-handler',
      owner: 'on_tap',
    });
    expect(payload.sceneScript).toContain('DROPPED_STATEMENT 1');
    expect(payload.sceneScript).toContain('logic-handler:on_tap');
    expect(payload.sceneScript).toContain('Assignment: score');
    expect(payload.sceneScript).not.toContain('// [Assignment: score]');
  });
});
