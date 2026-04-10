import { describe, it, expect } from 'vitest';
import { PlanExecuteAgent } from '../plan-execute-protocol';
import type { PlanLLMAdapter, PlanStepExecutor, Plan, PlanStep, StepResult } from '../plan-execute-protocol';
import type { AgentIdentity, PlanExecProtocolSpec } from '../index';

// =============================================================================
// MOCKS
// =============================================================================

const identity: AgentIdentity = {
  id: 'planexec-test-001',
  name: 'PlanExecTestAgent',
  domain: 'testing',
  version: '1.0.0',
  capabilities: ['planning'],
};

function makePlan(steps: PlanStep[]): Plan {
  return { goal: 'test goal', steps, reasoning: 'test reasoning' };
}

function makeStep(id: string, deps: string[] = []): PlanStep {
  return { id, description: `Step ${id}`, action: 'do', input: null, dependencies: deps };
}

// =============================================================================
// TESTS
// =============================================================================

describe('PlanExecuteAgent', () => {
  it('completes a simple two-step plan', async () => {
    const spec: PlanExecProtocolSpec = { maxReplans: 0, planPrompt: '', stepTimeout: 5000 };

    const llm: PlanLLMAdapter = {
      plan: async () => makePlan([makeStep('A'), makeStep('B', ['A'])]),
    };

    const executor: PlanStepExecutor = {
      executeStep: async (step: PlanStep): Promise<StepResult> => ({
        stepId: step.id,
        status: 'success',
        output: `${step.id} done`,
        durationMs: 1,
      }),
    };

    const agent = new PlanExecuteAgent(identity, spec, llm, executor);
    const result = await agent.run('Do A then B');

    expect(result.status).toBe('complete');
    expect(result.stepResults).toHaveLength(2);
    expect(result.replansUsed).toBe(0);
    expect(result.stepResults.every(r => r.status === 'success')).toBe(true);
  });

  it('replans on step failure', async () => {
    const spec: PlanExecProtocolSpec = { maxReplans: 1, planPrompt: '', stepTimeout: 5000 };
    let planCount = 0;

    const llm: PlanLLMAdapter = {
      plan: async (_goal, context) => {
        planCount++;
        if (planCount === 1) {
          return makePlan([makeStep('A'), makeStep('B_fail')]);
        }
        // Replan: skip the failing step
        return makePlan([makeStep('A'), makeStep('C')]);
      },
    };

    let callCount = 0;
    const executor: PlanStepExecutor = {
      executeStep: async (step: PlanStep): Promise<StepResult> => {
        callCount++;
        if (step.id === 'B_fail') {
          return { stepId: step.id, status: 'failure', output: null, error: 'B broke', durationMs: 1 };
        }
        return { stepId: step.id, status: 'success', output: `${step.id} ok`, durationMs: 1 };
      },
    };

    const agent = new PlanExecuteAgent(identity, spec, llm, executor);
    const result = await agent.run('Replan test');

    expect(result.replansUsed).toBe(1);
    expect(result.plans).toHaveLength(2);
    expect(result.status).toBe('complete');
  });

  it('fails when max replans exhausted', async () => {
    const spec: PlanExecProtocolSpec = { maxReplans: 0, planPrompt: '', stepTimeout: 5000 };

    const llm: PlanLLMAdapter = {
      plan: async () => makePlan([makeStep('FAIL')]),
    };

    const executor: PlanStepExecutor = {
      executeStep: async (step: PlanStep): Promise<StepResult> => ({
        stepId: step.id,
        status: 'failure',
        output: null,
        error: 'always fails',
        durationMs: 1,
      }),
    };

    const agent = new PlanExecuteAgent(identity, spec, llm, executor);
    const result = await agent.run('Doomed task');

    expect(result.status).toBe('failed');
    expect(result.replansUsed).toBe(0);
  });

  it('skips steps with unmet dependencies', async () => {
    const spec: PlanExecProtocolSpec = { maxReplans: 0, planPrompt: '', stepTimeout: 5000 };

    const llm: PlanLLMAdapter = {
      plan: async () => makePlan([
        makeStep('A'),
        makeStep('B', ['A']),
      ]),
    };

    // A fails, so B should be skipped due to unmet dependency
    const executor: PlanStepExecutor = {
      executeStep: async (step: PlanStep): Promise<StepResult> => {
        if (step.id === 'A') {
          return { stepId: 'A', status: 'failure', output: null, error: 'A broke', durationMs: 1 };
        }
        return { stepId: step.id, status: 'success', output: 'ok', durationMs: 1 };
      },
    };

    const agent = new PlanExecuteAgent(identity, spec, llm, executor);
    const result = await agent.run('Dep test');

    expect(result.status).toBe('failed');
    const bResult = result.stepResults.find(r => r.stepId === 'B');
    expect(bResult?.status).toBe('skipped');
  });
});
