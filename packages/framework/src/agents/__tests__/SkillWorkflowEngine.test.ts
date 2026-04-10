/**
 * SkillWorkflowEngine Tests
 *
 * Tests DAG-based skill composition, validation, and parallel execution.
 * Part of HoloScript v5.5 "Agents as Universal Orchestrators".
 */

import { describe, it, expect, vi } from 'vitest';
import {
  SkillWorkflowEngine,
  type WorkflowDefinition,
  type WorkflowStep,
  type SkillExecutor,
} from '../SkillWorkflowEngine';

// =============================================================================
// FIXTURES
// =============================================================================

function makeLinearWorkflow(): WorkflowDefinition {
  return {
    id: 'linear-1',
    name: 'Linear Pipeline',
    steps: [
      {
        id: 'parse',
        skillId: 'parse_hs',
        inputs: { code: { type: 'context', key: 'source' } },
      },
      {
        id: 'validate',
        skillId: 'validate_composition',
        inputs: { ast: { type: 'ref', stepId: 'parse', outputKey: 'ast' } },
        dependsOn: ['parse'],
      },
      {
        id: 'compile',
        skillId: 'compile_hs',
        inputs: {
          ast: { type: 'ref', stepId: 'parse', outputKey: 'ast' },
          target: { type: 'literal', value: 'threejs' },
        },
        dependsOn: ['validate'],
      },
    ],
    context: { source: 'object Cube { @physics }' },
  };
}

function makeParallelWorkflow(): WorkflowDefinition {
  return {
    id: 'parallel-1',
    name: 'Fan-Out Pipeline',
    steps: [
      {
        id: 'fetch-a',
        skillId: 'fetch_data',
        inputs: { url: { type: 'literal', value: 'https://a.com' } },
      },
      {
        id: 'fetch-b',
        skillId: 'fetch_data',
        inputs: { url: { type: 'literal', value: 'https://b.com' } },
      },
      {
        id: 'merge',
        skillId: 'merge_data',
        inputs: {
          dataA: { type: 'ref', stepId: 'fetch-a', outputKey: 'data' },
          dataB: { type: 'ref', stepId: 'fetch-b', outputKey: 'data' },
        },
        dependsOn: ['fetch-a', 'fetch-b'],
      },
    ],
  };
}

const mockExecutor: SkillExecutor = async (skillId, inputs) => {
  switch (skillId) {
    case 'parse_hs':
      return { ast: { type: 'composition', source: inputs.code }, success: true };
    case 'validate_composition':
      return { valid: true, diagnostics: [] };
    case 'compile_hs':
      return { output: `compiled_${inputs.target}`, target: inputs.target };
    case 'fetch_data':
      return { data: `data_from_${inputs.url}` };
    case 'merge_data':
      return { merged: `${inputs.dataA}+${inputs.dataB}` };
    case 'transform':
      return { transformed: true };
    default:
      return { result: 'ok' };
  }
};

// =============================================================================
// TESTS
// =============================================================================

describe('SkillWorkflowEngine', () => {
  const engine = new SkillWorkflowEngine();

  describe('validate', () => {
    it('validates a valid linear workflow', () => {
      const result = engine.validate(makeLinearWorkflow());

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.executionPlan.estimatedSteps).toBe(3);
      expect(result.executionPlan.groups).toHaveLength(3); // Sequential: parse → validate → compile
      expect(result.executionPlan.groups[0]).toEqual(['parse']);
    });

    it('validates a parallel workflow', () => {
      const result = engine.validate(makeParallelWorkflow());

      expect(result.valid).toBe(true);
      expect(result.executionPlan.groups).toHaveLength(2); // [fetch-a, fetch-b] → [merge]
      expect(result.executionPlan.groups[0]).toContain('fetch-a');
      expect(result.executionPlan.groups[0]).toContain('fetch-b');
      expect(result.executionPlan.groups[1]).toEqual(['merge']);
    });

    it('detects cycles', () => {
      const workflow: WorkflowDefinition = {
        id: 'cycle',
        name: 'Cyclic',
        steps: [
          { id: 'a', skillId: 's1', inputs: {}, dependsOn: ['b'] },
          { id: 'b', skillId: 's2', inputs: {}, dependsOn: ['a'] },
        ],
      };

      const result = engine.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Cycle');
    });

    it('detects missing dependencies', () => {
      const workflow: WorkflowDefinition = {
        id: 'missing-dep',
        name: 'Missing Dep',
        steps: [{ id: 'a', skillId: 's1', inputs: {}, dependsOn: ['nonexistent'] }],
      };

      const result = engine.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('nonexistent');
    });

    it('detects missing skills', () => {
      const workflow: WorkflowDefinition = {
        id: 'missing-skill',
        name: 'Missing Skill',
        steps: [{ id: 'a', skillId: 'unknown_skill', inputs: {} }],
      };

      const result = engine.validate(workflow, ['parse_hs', 'compile_hs']);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('unknown_skill');
    });

    it('detects invalid ref inputs', () => {
      const workflow: WorkflowDefinition = {
        id: 'bad-ref',
        name: 'Bad Ref',
        steps: [
          {
            id: 'a',
            skillId: 's1',
            inputs: {
              data: { type: 'ref', stepId: 'nonexistent', outputKey: 'x' },
            },
          },
        ],
      };

      const result = engine.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('non-existent step');
    });

    it('rejects empty workflow', () => {
      const workflow: WorkflowDefinition = { id: 'empty', name: 'Empty', steps: [] };

      const result = engine.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at least one step');
    });

    it('warns about ref without explicit dependsOn', () => {
      const workflow: WorkflowDefinition = {
        id: 'implicit-dep',
        name: 'Implicit Dep',
        steps: [
          { id: 'a', skillId: 's1', inputs: {} },
          {
            id: 'b',
            skillId: 's2',
            inputs: { data: { type: 'ref', stepId: 'a', outputKey: 'x' } },
            // Note: no explicit dependsOn
          },
        ],
      };

      const result = engine.validate(workflow);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('implicit dependency');
    });
  });

  describe('execute', () => {
    it('executes a linear workflow end-to-end', async () => {
      const workflow = makeLinearWorkflow();
      const result = await engine.execute(workflow, mockExecutor);

      expect(result.status).toBe('completed');
      expect(result.stepResults).toHaveLength(3);
      expect(result.stepResults[0].stepId).toBe('parse');
      expect(result.stepResults[0].status).toBe('completed');
      expect(result.stepResults[2].stepId).toBe('compile');
      expect((result.stepResults[2].output as Record<string, unknown>).target).toBe('threejs');
    });

    it('executes a parallel fan-out workflow', async () => {
      const workflow = makeParallelWorkflow();
      const result = await engine.execute(workflow, mockExecutor);

      expect(result.status).toBe('completed');
      const mergeResult = result.stepResults.find((r) => r.stepId === 'merge')!;
      expect(mergeResult.status).toBe('completed');
      expect((mergeResult.output as Record<string, unknown>).merged).toContain('data_from_');
    });

    it('resolves context inputs', async () => {
      const workflow = makeLinearWorkflow();
      const result = await engine.execute(workflow, mockExecutor);

      const parseResult = result.stepResults[0];
      expect(parseResult.status).toBe('completed');
      expect((parseResult.output as Record<string, unknown>).ast).toBeDefined();
    });

    it('resolves ref inputs from previous step outputs', async () => {
      const workflow = makeLinearWorkflow();
      const result = await engine.execute(workflow, mockExecutor);

      expect(result.status).toBe('completed');
    });

    it('calls progress callback', async () => {
      const workflow = makeLinearWorkflow();
      const progress: [string, string][] = [];

      await engine.execute(workflow, mockExecutor, (stepId, status) => {
        progress.push([stepId, status]);
      });

      expect(progress.length).toBeGreaterThanOrEqual(6); // 3 steps × (starting + completed)
      expect(progress.some(([id, s]) => id === 'parse' && s === 'starting')).toBe(true);
      expect(progress.some(([id, s]) => id === 'compile' && s === 'completed')).toBe(true);
    });

    it('handles step failure with status=failed', async () => {
      const workflow: WorkflowDefinition = {
        id: 'fail-test',
        name: 'Fail Test',
        steps: [
          { id: 'a', skillId: 'will_fail', inputs: {} },
          { id: 'b', skillId: 'transform', inputs: {}, dependsOn: ['a'] },
        ],
      };

      const failExecutor: SkillExecutor = async (skillId) => {
        if (skillId === 'will_fail') throw new Error('Boom!');
        return { ok: true };
      };

      const result = await engine.execute(workflow, failExecutor);

      expect(result.status).toBe('failed');
      expect(result.stepResults[0].status).toBe('failed');
      expect(result.stepResults[0].error).toBe('Boom!');
      expect(result.stepResults[1].status).toBe('skipped');
    });

    it('skips step on error when onError=skip', async () => {
      const workflow: WorkflowDefinition = {
        id: 'skip-test',
        name: 'Skip Test',
        steps: [
          { id: 'a', skillId: 'will_fail', inputs: {}, onError: 'skip' },
          { id: 'b', skillId: 'transform', inputs: {}, dependsOn: ['a'] },
        ],
      };

      const failExecutor: SkillExecutor = async (skillId) => {
        if (skillId === 'will_fail') throw new Error('Non-critical');
        return { ok: true };
      };

      const result = await engine.execute(workflow, failExecutor);

      expect(result.status).toBe('partial');
      expect(result.stepResults[0].status).toBe('skipped');
      expect(result.stepResults[1].status).toBe('completed');
    });

    it('uses fallback skill when onError=fallback', async () => {
      const workflow: WorkflowDefinition = {
        id: 'fallback-test',
        name: 'Fallback Test',
        steps: [
          {
            id: 'a',
            skillId: 'will_fail',
            inputs: {},
            onError: 'fallback',
            fallbackSkillId: 'transform',
          },
        ],
      };

      const failExecutor: SkillExecutor = async (skillId) => {
        if (skillId === 'will_fail') throw new Error('Primary failed');
        return { fallback: true, skillId };
      };

      const result = await engine.execute(workflow, failExecutor);

      expect(result.status).toBe('completed');
      expect(result.stepResults[0].status).toBe('completed');
      expect((result.stepResults[0].output as Record<string, unknown>).fallback).toBe(true);
    });

    it('handles per-step timeout', async () => {
      const workflow: WorkflowDefinition = {
        id: 'timeout-test',
        name: 'Timeout Test',
        steps: [{ id: 'slow', skillId: 'slow_skill', inputs: {}, timeout: 50 }],
      };

      const slowExecutor: SkillExecutor = async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { result: 'too-slow' };
      };

      const result = await engine.execute(workflow, slowExecutor);

      expect(result.status).toBe('failed');
      expect(result.stepResults[0].status).toBe('failed');
      expect(result.stepResults[0].error).toContain('timed out');
    });
  });
});
