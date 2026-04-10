/**
 * MicroPhaseDecomposer — LLM-powered parallel task decomposition (FW-0.2)
 *
 * Takes a complex task description, uses an LLM to break it into independent
 * micro-phases with dependency edges, then builds a wave-based execution plan
 * where each wave runs in parallel.
 *
 * Two modes:
 * 1. LLM-powered: `decompose()` calls the LLM to analyze task complexity
 * 2. Manual: `decomposeManual()` accepts pre-defined phases (for testing / deterministic use)
 *
 * Wired into Team: when a task's estimated complexity exceeds a threshold,
 * the team decomposes it before distributing sub-phases to agents.
 */

import type { ModelConfig } from '../types';
import { callLLM } from '../llm/llm-adapter';
import type { LLMMessage } from '../llm/llm-adapter';

// ── Public Types ──

export interface TaskDescription {
  id: string;
  title: string;
  description: string;
  requiredCapabilities?: string[];
  maxParallelism?: number;
  complexityThreshold?: number;
}

export interface MicroPhase {
  id: string;
  description: string;
  dependencies: string[];
  estimatedDuration: number;
  requiredCapabilities: string[];
}

export interface WaveExecutionPlan {
  waves: MicroPhase[][];
  totalEstimatedDuration: number;
  parallelizationRatio: number;
  phaseCount: number;
}

export interface DecompositionResult {
  taskId: string;
  phases: MicroPhase[];
  plan: WaveExecutionPlan;
  wasDecomposed: boolean;
}

// ── Complexity Threshold ──

/** Tasks with fewer than this many estimated sub-steps skip decomposition. */
const DEFAULT_COMPLEXITY_THRESHOLD = 2;

// ── LLM Adapter Interface (injectable for testing) ──

export interface LLMAdapter {
  call(
    messages: LLMMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<string>;
}

/** Create an LLMAdapter from a ModelConfig */
export function createLLMAdapter(config: ModelConfig): LLMAdapter {
  return {
    async call(messages, options) {
      const response = await callLLM(config, messages, options);
      return response.content;
    },
  };
}

// ── Decomposer ──

export class SmartMicroPhaseDecomposer {
  constructor(private llm: LLMAdapter) {}

  /**
   * Decompose a complex task into parallel micro-phases using LLM analysis.
   * Returns phases with dependency edges and a wave-based execution plan.
   */
  async decompose(task: TaskDescription): Promise<DecompositionResult> {
    const threshold = task.complexityThreshold ?? DEFAULT_COMPLEXITY_THRESHOLD;

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a task decomposition engine. Break complex tasks into independent micro-phases.

Output ONLY valid JSON matching this schema:
{
  "phases": [
    {
      "id": "phase_1",
      "description": "what this phase does",
      "dependencies": [],
      "estimatedDuration": 5000,
      "requiredCapabilities": ["coding"]
    }
  ]
}

Rules:
- Each phase must have a unique id (phase_1, phase_2, etc.)
- dependencies is an array of phase ids this phase depends on
- estimatedDuration is in milliseconds
- requiredCapabilities: one or more of ["coding", "research", "review", "testing", "architecture"]
- Maximize parallelism: only add dependencies when truly required
- If the task is simple (1-2 steps), return a single phase
- Keep phases focused — each should be independently executable`,
      },
      {
        role: 'user',
        content: `Decompose this task:\n\nTitle: ${task.title}\nDescription: ${task.description}\nCapabilities available: ${(task.requiredCapabilities ?? ['coding']).join(', ')}`,
      },
    ];

    const raw = await this.llm.call(messages, { maxTokens: 2048, temperature: 0.3 });
    const phases = this.parseLLMResponse(raw, task.id);

    if (phases.length < threshold) {
      return {
        taskId: task.id,
        phases,
        plan: this.buildExecutionPlan(phases),
        wasDecomposed: false,
      };
    }

    // Enforce maxParallelism if set
    if (task.maxParallelism) {
      this.enforceParallelismLimit(phases, task.maxParallelism);
    }

    const plan = this.buildExecutionPlan(phases);
    return { taskId: task.id, phases, plan, wasDecomposed: true };
  }

  /**
   * Manual decomposition — accepts pre-defined phases. Useful for testing
   * and deterministic pipelines where LLM analysis isn't needed.
   */
  decomposeManual(taskId: string, phases: MicroPhase[]): DecompositionResult {
    this.validatePhases(phases);
    const plan = this.buildExecutionPlan(phases);
    return { taskId, phases, plan, wasDecomposed: phases.length > 1 };
  }

  /**
   * Build an execution plan from phases — topological sort into parallel waves.
   * Each wave contains phases that can run simultaneously.
   */
  buildExecutionPlan(phases: MicroPhase[]): WaveExecutionPlan {
    if (phases.length === 0) {
      return { waves: [], totalEstimatedDuration: 0, parallelizationRatio: 0, phaseCount: 0 };
    }

    this.validatePhases(phases);

    const sorted = this.topologicalSort(phases);
    const phaseMap = new Map(phases.map((p) => [p.id, p]));
    const waveAssignment = new Map<string, number>();
    const waves: MicroPhase[][] = [];

    for (const phaseId of sorted) {
      const phase = phaseMap.get(phaseId)!;
      let waveIdx = 0;

      for (const depId of phase.dependencies) {
        waveIdx = Math.max(waveIdx, (waveAssignment.get(depId) ?? 0) + 1);
      }

      while (waves.length <= waveIdx) {
        waves.push([]);
      }
      waves[waveIdx].push(phase);
      waveAssignment.set(phaseId, waveIdx);
    }

    // Calculate timing
    const sequentialTime = phases.reduce((sum, p) => sum + p.estimatedDuration, 0);
    const parallelTime = waves.reduce((sum, wave) => {
      return sum + Math.max(...wave.map((p) => p.estimatedDuration));
    }, 0);

    return {
      waves,
      totalEstimatedDuration: parallelTime,
      parallelizationRatio:
        sequentialTime > 0
          ? Math.round(((sequentialTime - parallelTime) / sequentialTime) * 100)
          : 0,
      phaseCount: phases.length,
    };
  }

  // ── Internal ──

  private parseLLMResponse(raw: string, taskId: string): MicroPhase[] {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
      const cleaned = (jsonMatch[1] ?? raw).trim();
      const parsed = JSON.parse(cleaned) as { phases?: unknown[] };

      if (!parsed.phases || !Array.isArray(parsed.phases)) {
        return this.fallbackSinglePhase(taskId);
      }

      return (parsed.phases as Record<string, unknown>[]).map((p, i) => ({
        id: String(p.id ?? `phase_${i + 1}`),
        description: String(p.description ?? 'Unknown phase'),
        dependencies: Array.isArray(p.dependencies) ? p.dependencies.map(String) : [],
        estimatedDuration: typeof p.estimatedDuration === 'number' ? p.estimatedDuration : 5000,
        requiredCapabilities: Array.isArray(p.requiredCapabilities)
          ? p.requiredCapabilities.map(String)
          : ['coding'],
      }));
    } catch {
      return this.fallbackSinglePhase(taskId);
    }
  }

  private fallbackSinglePhase(taskId: string): MicroPhase[] {
    return [
      {
        id: `${taskId}_single`,
        description: 'Execute task as single unit',
        dependencies: [],
        estimatedDuration: 10000,
        requiredCapabilities: ['coding'],
      },
    ];
  }

  private validatePhases(phases: MicroPhase[]): void {
    const ids = new Set(phases.map((p) => p.id));

    for (const phase of phases) {
      for (const dep of phase.dependencies) {
        if (!ids.has(dep)) {
          throw new Error(`Phase "${phase.id}" depends on unknown phase "${dep}"`);
        }
      }
    }

    // Check for cycles
    this.topologicalSort(phases); // throws on cycle
  }

  private topologicalSort(phases: MicroPhase[]): string[] {
    const phaseMap = new Map(phases.map((p) => [p.id, p]));
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const result: string[] = [];

    const dfs = (id: string) => {
      if (inStack.has(id)) {
        throw new Error(`Circular dependency detected involving phase "${id}"`);
      }
      if (visited.has(id)) return;

      inStack.add(id);
      const phase = phaseMap.get(id)!;
      for (const dep of phase.dependencies) {
        dfs(dep);
      }
      inStack.delete(id);
      visited.add(id);
      result.push(id);
    };

    for (const id of phaseMap.keys()) {
      if (!visited.has(id)) dfs(id);
    }

    return result;
  }

  /**
   * If maxParallelism is set, add synthetic dependencies to limit
   * the number of phases running concurrently in any wave.
   */
  private enforceParallelismLimit(phases: MicroPhase[], maxParallelism: number): void {
    // Build initial plan to see wave sizes
    const plan = this.buildExecutionPlan(phases);
    const phaseMap = new Map(phases.map((p) => [p.id, p]));

    for (const wave of plan.waves) {
      if (wave.length <= maxParallelism) continue;

      // Split oversized wave: phases beyond the limit depend on earlier ones
      const overflow = wave.slice(maxParallelism);
      for (let i = 0; i < overflow.length; i++) {
        const target = phaseMap.get(overflow[i].id)!;
        const anchor = wave[i % maxParallelism];
        if (!target.dependencies.includes(anchor.id)) {
          target.dependencies.push(anchor.id);
        }
      }
    }
  }
}
