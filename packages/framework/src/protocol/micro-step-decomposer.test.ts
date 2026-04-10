import { describe, it, expect, vi } from 'vitest';
import {
  SmartMicroPhaseDecomposer,
  type LLMAdapter,
  type MicroPhase,
  type TaskDescription,
} from './micro-phase-decomposer';

// ── Test Helpers ──

function mockLLM(response: string): LLMAdapter {
  return { call: vi.fn().mockResolvedValue(response) };
}

function phase(id: string, deps: string[] = [], duration = 5000, caps: string[] = ['coding']): MicroPhase {
  return { id, description: `Phase ${id}`, dependencies: deps, estimatedDuration: duration, requiredCapabilities: caps };
}

const simpleTask: TaskDescription = {
  id: 'task_1',
  title: 'Build login page',
  description: 'Create a login form with email and password fields',
};

// ── Tests ──

describe('SmartMicroPhaseDecomposer', () => {
  describe('buildExecutionPlan', () => {
    it('groups independent phases into the same wave', () => {
      const llm = mockLLM('');
      const decomposer = new SmartMicroPhaseDecomposer(llm);

      const phases: MicroPhase[] = [
        phase('a'),
        phase('b'),
        phase('c'),
      ];

      const plan = decomposer.buildExecutionPlan(phases);

      expect(plan.waves).toHaveLength(1);
      expect(plan.waves[0]).toHaveLength(3);
      expect(plan.phaseCount).toBe(3);
      expect(plan.totalEstimatedDuration).toBe(5000);
      expect(plan.parallelizationRatio).toBe(67); // (15000-5000)/15000 * 100
    });

    it('creates sequential waves for dependent phases', () => {
      const llm = mockLLM('');
      const decomposer = new SmartMicroPhaseDecomposer(llm);

      const phases: MicroPhase[] = [
        phase('a'),
        phase('b', ['a']),
        phase('c', ['b']),
      ];

      const plan = decomposer.buildExecutionPlan(phases);

      expect(plan.waves).toHaveLength(3);
      expect(plan.waves[0].map(p => p.id)).toEqual(['a']);
      expect(plan.waves[1].map(p => p.id)).toEqual(['b']);
      expect(plan.waves[2].map(p => p.id)).toEqual(['c']);
      expect(plan.totalEstimatedDuration).toBe(15000);
      expect(plan.parallelizationRatio).toBe(0);
    });

    it('handles diamond dependencies correctly', () => {
      const llm = mockLLM('');
      const decomposer = new SmartMicroPhaseDecomposer(llm);

      //   a
      //  / \
      // b   c
      //  \ /
      //   d
      const phases: MicroPhase[] = [
        phase('a'),
        phase('b', ['a']),
        phase('c', ['a']),
        phase('d', ['b', 'c']),
      ];

      const plan = decomposer.buildExecutionPlan(phases);

      expect(plan.waves).toHaveLength(3);
      expect(plan.waves[0].map(p => p.id)).toEqual(['a']);
      expect(plan.waves[1].map(p => p.id).sort()).toEqual(['b', 'c']);
      expect(plan.waves[2].map(p => p.id)).toEqual(['d']);
    });

    it('returns empty plan for no phases', () => {
      const llm = mockLLM('');
      const decomposer = new SmartMicroPhaseDecomposer(llm);
      const plan = decomposer.buildExecutionPlan([]);

      expect(plan.waves).toHaveLength(0);
      expect(plan.totalEstimatedDuration).toBe(0);
      expect(plan.phaseCount).toBe(0);
    });

    it('throws on unknown dependency', () => {
      const llm = mockLLM('');
      const decomposer = new SmartMicroPhaseDecomposer(llm);

      expect(() => {
        decomposer.buildExecutionPlan([phase('a', ['nonexistent'])]);
      }).toThrow('depends on unknown phase');
    });

    it('throws on circular dependency', () => {
      const llm = mockLLM('');
      const decomposer = new SmartMicroPhaseDecomposer(llm);

      const phases: MicroPhase[] = [
        phase('a', ['b']),
        phase('b', ['a']),
      ];

      expect(() => decomposer.buildExecutionPlan(phases)).toThrow('Circular dependency');
    });
  });

  describe('decomposeManual', () => {
    it('creates a plan from manually specified phases', () => {
      const llm = mockLLM('');
      const decomposer = new SmartMicroPhaseDecomposer(llm);

      const phases = [phase('setup'), phase('build', ['setup']), phase('test', ['build'])];
      const result = decomposer.decomposeManual('task_manual', phases);

      expect(result.taskId).toBe('task_manual');
      expect(result.wasDecomposed).toBe(true);
      expect(result.plan.waves).toHaveLength(3);
      expect(result.phases).toHaveLength(3);
    });

    it('marks single-phase tasks as not decomposed', () => {
      const llm = mockLLM('');
      const decomposer = new SmartMicroPhaseDecomposer(llm);

      const result = decomposer.decomposeManual('task_simple', [phase('only')]);

      expect(result.wasDecomposed).toBe(false);
      expect(result.plan.waves).toHaveLength(1);
    });
  });

  describe('decompose (LLM-powered)', () => {
    it('parses well-formed LLM JSON response', async () => {
      const llmResponse = JSON.stringify({
        phases: [
          { id: 'phase_1', description: 'Setup project', dependencies: [], estimatedDuration: 3000, requiredCapabilities: ['coding'] },
          { id: 'phase_2', description: 'Write components', dependencies: ['phase_1'], estimatedDuration: 8000, requiredCapabilities: ['coding'] },
          { id: 'phase_3', description: 'Write tests', dependencies: ['phase_1'], estimatedDuration: 5000, requiredCapabilities: ['testing'] },
          { id: 'phase_4', description: 'Integration test', dependencies: ['phase_2', 'phase_3'], estimatedDuration: 4000, requiredCapabilities: ['testing'] },
        ],
      });

      const llm = mockLLM(llmResponse);
      const decomposer = new SmartMicroPhaseDecomposer(llm);
      const result = await decomposer.decompose(simpleTask);

      expect(result.wasDecomposed).toBe(true);
      expect(result.phases).toHaveLength(4);
      expect(result.plan.waves).toHaveLength(3);
      // Wave 0: phase_1, Wave 1: phase_2 + phase_3, Wave 2: phase_4
      expect(result.plan.waves[1]).toHaveLength(2);
    });

    it('extracts JSON from markdown code blocks', async () => {
      const llmResponse = '```json\n{"phases": [{"id": "p1", "description": "Do it", "dependencies": [], "estimatedDuration": 5000, "requiredCapabilities": ["coding"]}]}\n```';

      const llm = mockLLM(llmResponse);
      const decomposer = new SmartMicroPhaseDecomposer(llm);
      const result = await decomposer.decompose({ ...simpleTask, complexityThreshold: 1 });

      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].id).toBe('p1');
    });

    it('falls back to single phase on unparseable LLM output', async () => {
      const llm = mockLLM('I cannot decompose this task because reasons.');
      const decomposer = new SmartMicroPhaseDecomposer(llm);
      const result = await decomposer.decompose(simpleTask);

      expect(result.phases).toHaveLength(1);
      expect(result.wasDecomposed).toBe(false);
      expect(result.phases[0].id).toContain('task_1');
    });

    it('falls back on missing phases array', async () => {
      const llm = mockLLM(JSON.stringify({ steps: ['a', 'b'] }));
      const decomposer = new SmartMicroPhaseDecomposer(llm);
      const result = await decomposer.decompose(simpleTask);

      expect(result.phases).toHaveLength(1);
      expect(result.wasDecomposed).toBe(false);
    });

    it('does not mark as decomposed when below complexity threshold', async () => {
      const llmResponse = JSON.stringify({
        phases: [{ id: 'only', description: 'Just do it', dependencies: [], estimatedDuration: 3000, requiredCapabilities: ['coding'] }],
      });

      const llm = mockLLM(llmResponse);
      const decomposer = new SmartMicroPhaseDecomposer(llm);
      // Default threshold = 2, single phase returned
      const result = await decomposer.decompose(simpleTask);

      expect(result.wasDecomposed).toBe(false);
    });

    it('respects custom complexity threshold', async () => {
      const llmResponse = JSON.stringify({
        phases: [
          { id: 'a', description: 'Step A', dependencies: [], estimatedDuration: 3000, requiredCapabilities: ['coding'] },
          { id: 'b', description: 'Step B', dependencies: [], estimatedDuration: 3000, requiredCapabilities: ['coding'] },
        ],
      });

      const llm = mockLLM(llmResponse);
      const decomposer = new SmartMicroPhaseDecomposer(llm);
      const result = await decomposer.decompose({ ...simpleTask, complexityThreshold: 3 });

      expect(result.wasDecomposed).toBe(false);
    });

    it('enforces maxParallelism by adding synthetic dependencies', async () => {
      const llmResponse = JSON.stringify({
        phases: [
          { id: 'a', description: 'A', dependencies: [], estimatedDuration: 3000, requiredCapabilities: ['coding'] },
          { id: 'b', description: 'B', dependencies: [], estimatedDuration: 3000, requiredCapabilities: ['coding'] },
          { id: 'c', description: 'C', dependencies: [], estimatedDuration: 3000, requiredCapabilities: ['coding'] },
          { id: 'd', description: 'D', dependencies: [], estimatedDuration: 3000, requiredCapabilities: ['coding'] },
        ],
      });

      const llm = mockLLM(llmResponse);
      const decomposer = new SmartMicroPhaseDecomposer(llm);
      const result = await decomposer.decompose({ ...simpleTask, maxParallelism: 2 });

      // With maxParallelism=2, no wave should have more than 2 phases
      for (const wave of result.plan.waves) {
        expect(wave.length).toBeLessThanOrEqual(2);
      }
      expect(result.wasDecomposed).toBe(true);
    });

    it('sends correct prompt to LLM', async () => {
      const llm = mockLLM(JSON.stringify({ phases: [] }));
      const decomposer = new SmartMicroPhaseDecomposer(llm);

      await decomposer.decompose({
        ...simpleTask,
        requiredCapabilities: ['coding', 'testing'],
      });

      expect(llm.call).toHaveBeenCalledTimes(1);
      const [messages, options] = (llm.call as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].content).toContain('Build login page');
      expect(messages[1].content).toContain('coding, testing');
      expect(options?.temperature).toBe(0.3);
    });
  });

  describe('parallelization ratio', () => {
    it('calculates correct ratio for mixed parallel/serial', () => {
      const llm = mockLLM('');
      const decomposer = new SmartMicroPhaseDecomposer(llm);

      // a(5s) and b(5s) in parallel, c(5s) depends on both
      const phases = [
        phase('a', [], 5000),
        phase('b', [], 5000),
        phase('c', ['a', 'b'], 5000),
      ];
      const plan = decomposer.buildExecutionPlan(phases);

      // Sequential: 15000ms, Parallel: 5000 + 5000 = 10000ms
      // Ratio: (15000-10000)/15000 = 33%
      expect(plan.totalEstimatedDuration).toBe(10000);
      expect(plan.parallelizationRatio).toBe(33);
    });

    it('gives 100% ratio when all phases run in parallel (impossible with int rounding but approaches)', () => {
      const llm = mockLLM('');
      const decomposer = new SmartMicroPhaseDecomposer(llm);

      // All independent, same duration
      const phases = [
        phase('a', [], 1000),
        phase('b', [], 1000),
        phase('c', [], 1000),
        phase('d', [], 1000),
      ];
      const plan = decomposer.buildExecutionPlan(phases);

      // Sequential: 4000, Parallel: 1000
      expect(plan.totalEstimatedDuration).toBe(1000);
      expect(plan.parallelizationRatio).toBe(75);
    });
  });
});
