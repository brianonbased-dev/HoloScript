import { describe, expect, it } from 'vitest';
import {
  OutcomeLoop,
  artifactHash,
  validateOutcomeSpec,
  type OutcomeLoopContext,
  type OutcomeSpec,
} from '../OutcomeLoop';

function makeSpec(overrides: Partial<OutcomeSpec> = {}): OutcomeSpec {
  return {
    id: 'docs-code-fixture',
    threshold: 0.9,
    maxIterations: 3,
    rubric: [
      { id: 'no-todo', description: 'Artifact must not contain TODO markers.' },
      { id: 'validation', description: 'Validation command must pass.' },
    ],
    artifacts: [
      {
        path: 'docs/fixture.md',
        kind: 'docs',
        content: 'Outcome draft\n\nTODO: fill in acceptance evidence.\n',
      },
    ],
    grader: { id: 'isolated-grader', kind: 'tool', label: 'Fixture grader' },
    validationCommands: [{ id: 'fixture-test', command: 'node fixture-check.mjs' }],
    ...overrides,
  };
}

describe('OutcomeLoop', () => {
  it('iterates until rubric and validation threshold pass', async () => {
    const implementerContexts: OutcomeLoopContext[] = [];
    const graderContexts: OutcomeLoopContext[] = [];
    const implementerGapInputs: string[][] = [];

    const loop = new OutcomeLoop({
      now: () => new Date('2026-05-06T00:00:00Z'),
      implementer(input) {
        implementerContexts.push(input.context);
        implementerGapInputs.push(input.previousGaps.map((gap) => gap.criterionId));

        const shouldFix = input.previousGaps.some((gap) => gap.criterionId === 'no-todo');
        const content = shouldFix
          ? 'Outcome complete\n\nAcceptance evidence is present.\n'
          : input.artifacts[0].content;

        return {
          artifacts: [{ ...input.artifacts[0], content }],
          notes: shouldFix ? 'Applied grader gaps.' : 'Initial attempt.',
        };
      },
      validationRunner(command, context) {
        return {
          ...command,
          passed: context.iteration > 1,
          exitCode: context.iteration > 1 ? 0 : 1,
        };
      },
      grader(input) {
        graderContexts.push(input.context);
        const artifact = input.artifacts[0];
        const noTodo = !artifact.content.includes('TODO');
        const validationPassed = input.validationResults.every((result) => result.passed);

        return {
          criteria: [
            {
              criterionId: 'no-todo',
              score: noTodo ? 1 : 0,
              passed: noTodo,
              gap: noTodo ? undefined : 'Remove TODO markers and add acceptance evidence.',
            },
            {
              criterionId: 'validation',
              score: validationPassed ? 1 : 0,
              passed: validationPassed,
              gap: validationPassed ? undefined : 'Run the fixture validation command cleanly.',
            },
          ],
          summary: noTodo && validationPassed ? 'ready' : 'needs iteration',
        };
      },
    });

    const receipt = await loop.run(makeSpec());

    expect(receipt.passed).toBe(true);
    expect(receipt.status).toBe('pass');
    expect(receipt.iterations).toBe(2);
    expect(receipt.score).toBe(1);
    expect(receipt.graderIdentity.id).toBe('isolated-grader');
    expect(receipt.validationCommands[0].command).toBe('node fixture-check.mjs');
    expect(receipt.artifactHashes[0].hash).toHaveLength(64);
    expect(implementerGapInputs[0]).toEqual([]);
    expect(implementerGapInputs[1]).toEqual(['no-todo', 'validation']);
    expect(implementerContexts[0].role).toBe('implementer');
    expect(graderContexts[0].role).toBe('grader');
    expect(implementerContexts[0].contextId).not.toBe(graderContexts[0].contextId);
  });

  it('stops on circuit breaker failure before exhausting iterations', async () => {
    const loop = new OutcomeLoop({
      implementer: (input) => ({ artifacts: input.artifacts }),
      grader: () => ({
        criteria: [{ criterionId: 'no-todo', score: 0, passed: false, gap: 'Still incomplete.' }],
      }),
    });

    const receipt = await loop.run(
      makeSpec({
        maxIterations: 5,
        circuitBreaker: { maxConsecutiveFailures: 1 },
      })
    );

    expect(receipt.status).toBe('circuit_breaker_failure');
    expect(receipt.passed).toBe(false);
    expect(receipt.iterations).toBe(1);
    expect(receipt.stoppedReason).toContain('Circuit breaker tripped');
  });

  it('stops at iteration cap when the threshold never passes', async () => {
    const loop = new OutcomeLoop({
      implementer: (input) => ({ artifacts: input.artifacts }),
      grader: () => ({
        criteria: [{ criterionId: 'no-todo', score: 0.25, passed: false, gap: 'Weak evidence.' }],
      }),
    });

    const receipt = await loop.run(makeSpec({ maxIterations: 2 }));

    expect(receipt.status).toBe('iteration_cap');
    expect(receipt.passed).toBe(false);
    expect(receipt.iterations).toBe(2);
  });

  it('validates required OutcomeSpec fields and hashes artifacts deterministically', () => {
    expect(validateOutcomeSpec(makeSpec())).toEqual([]);

    const errors = validateOutcomeSpec(makeSpec({ rubric: [], threshold: 1.5, maxIterations: 0 }));
    expect(errors).toContain('OutcomeSpec.rubric must include at least one criterion.');
    expect(errors).toContain('OutcomeSpec.threshold must be in (0, 1].');
    expect(errors).toContain('OutcomeSpec.maxIterations must be a positive integer.');

    const first = artifactHash({ path: 'a.ts', kind: 'code', content: 'export const a = 1;' });
    const second = artifactHash({ path: 'a.ts', kind: 'code', content: 'export const a = 1;' });
    expect(first).toEqual(second);
  });
});
