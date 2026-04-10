/**
 * ReAct Protocol: Think -> Act -> Observe -> Repeat
 *
 * Implementation of the Reason+Act loop where an agent iteratively:
 * 1. Thinks about the current state and what to do next
 * 2. Selects and executes a tool/action
 * 3. Observes the result
 * 4. Repeats until a stop condition is met or max iterations reached
 */

import type { ReactProtocolSpec, AgentIdentity } from './index';

// =============================================================================
// TYPES
// =============================================================================

export interface Thought {
  reasoning: string;
  action: string;
  actionInput: unknown;
  confidence: number;
}

export interface Observation {
  action: string;
  result: unknown;
  success: boolean;
  error?: string;
}

export interface ReactStep {
  iteration: number;
  thought: Thought;
  observation: Observation;
  timestamp: number;
  durationMs: number;
}

export interface ReactResult {
  task: string;
  steps: ReactStep[];
  finalAnswer: unknown;
  status: 'solved' | 'max_iterations' | 'error';
  totalIterations: number;
  totalDurationMs: number;
}

/** Adapter for LLM calls — implement this to plug in any model */
export interface ReactLLMAdapter {
  /** Given task + history, produce a thought with action selection */
  think(task: string, history: ReactStep[]): Promise<Thought>;
  /** Given the full trace, produce a final answer */
  synthesize(task: string, history: ReactStep[]): Promise<unknown>;
}

/** Adapter for tool execution */
export interface ReactToolExecutor {
  /** Execute a named action with given input, return observation */
  execute(action: string, input: unknown): Promise<Observation>;
  /** List available tool names */
  availableTools(): string[];
}

// =============================================================================
// REACT AGENT
// =============================================================================

export class ReactAgent {
  readonly identity: AgentIdentity;
  private readonly spec: ReactProtocolSpec;
  private readonly llm: ReactLLMAdapter;
  private readonly tools: ReactToolExecutor;

  constructor(
    identity: AgentIdentity,
    spec: ReactProtocolSpec,
    llm: ReactLLMAdapter,
    tools: ReactToolExecutor
  ) {
    this.identity = identity;
    this.spec = spec;
    this.llm = llm;
    this.tools = tools;
  }

  async run(task: string): Promise<ReactResult> {
    const startedAt = Date.now();
    const steps: ReactStep[] = [];

    for (let i = 0; i < this.spec.maxIterations; i++) {
      const stepStart = Date.now();

      // Think
      const thought = await this.llm.think(task, steps);

      // Act
      let observation: Observation;
      try {
        observation = await this.tools.execute(thought.action, thought.actionInput);
      } catch (err) {
        observation = {
          action: thought.action,
          result: null,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      const step: ReactStep = {
        iteration: i,
        thought,
        observation,
        timestamp: Date.now(),
        durationMs: Date.now() - stepStart,
      };
      steps.push(step);

      // Check stop condition
      if (this.spec.stopCondition(observation)) {
        const finalAnswer = await this.llm.synthesize(task, steps);
        return {
          task,
          steps,
          finalAnswer,
          status: 'solved',
          totalIterations: i + 1,
          totalDurationMs: Date.now() - startedAt,
        };
      }
    }

    // Max iterations reached — synthesize best-effort answer
    const finalAnswer = await this.llm.synthesize(task, steps);
    return {
      task,
      steps,
      finalAnswer,
      status: 'max_iterations',
      totalIterations: this.spec.maxIterations,
      totalDurationMs: Date.now() - startedAt,
    };
  }
}
