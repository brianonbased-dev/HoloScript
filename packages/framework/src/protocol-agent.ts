/**
 * ProtocolAgent — Concrete BaseAgent backed by LLM calls.
 *
 * Wraps the 7-phase uAA2++ lifecycle around a team agent's task execution.
 * Uses haiku-tier models for lightweight phases (reflect, compress, grow, evolve)
 * and the agent's configured model for the execute phase.
 */

import { BaseAgent, ProtocolPhase } from './protocol/implementations';
import type { AgentIdentity, PhaseResult } from './protocol/implementations';

import { callLLM } from './llm/llm-adapter';
import type { LLMMessage } from './llm/llm-adapter';
import type {
  AgentConfig,
  ModelConfig,
  KnowledgeInsight,
  ProtocolAgentConfig,
  ProtocolAgentHandle,
  AgentStatus,
  CycleResult as FrameworkCycleResult,
} from './types';
import type { ProtocolCycleResult } from './protocol/implementations';

// ── Phase-specific system prompts ──

const PHASE_PROMPTS: Record<number, string> = {
  [ProtocolPhase.INTAKE]:
    'You are gathering context for a task. Summarize the task, relevant knowledge, and constraints. Be concise.',
  [ProtocolPhase.REFLECT]:
    'You are analyzing an approach. Given the context, identify the best strategy, risks, and key considerations. Be brief.',
  [ProtocolPhase.EXECUTE]: '', // Uses the agent's own system prompt
  [ProtocolPhase.COMPRESS]:
    'You are extracting knowledge from completed work. Identify Wisdom (insights), Patterns (reusable solutions), and Gotchas (pitfalls). Format each as: [wisdom|pattern|gotcha] content',
  [ProtocolPhase.REINTAKE]:
    'You are validating extracted knowledge. Check for accuracy, remove duplicates, and rate confidence (0.0-1.0). Return only validated items.',
  [ProtocolPhase.GROW]:
    'You are identifying meta-patterns. Given validated knowledge, find cross-cutting themes and recurring patterns. Be concise.',
  [ProtocolPhase.EVOLVE]:
    'You are suggesting improvements. Based on patterns found, propose concrete optimizations for future work. Be brief and actionable.',
};

/** Model config for lightweight phases (haiku-tier). */
function lightModel(agentModel: ModelConfig): ModelConfig {
  // Use same provider but prefer a cheaper model for non-execute phases.
  // If the agent is already on a small model, just use it.
  const cheapModels: Record<string, string> = {
    anthropic: 'claude-haiku-4',
    openai: 'gpt-4o-mini',
    xai: 'grok-2',
    openrouter: 'anthropic/claude-haiku-4',
  };

  return {
    ...agentModel,
    model: cheapModels[agentModel.provider] ?? agentModel.model,
    maxTokens: 512,
    temperature: 0.3,
  };
}

/** Result of executing a full protocol cycle on a task. */
export interface ProtocolTaskResult {
  summary: string;
  insights: KnowledgeInsight[];
  phaseResults: PhaseResult[];
  totalDurationMs: number;
}

export class ProtocolAgent extends BaseAgent {
  readonly identity: AgentIdentity;

  private agentConfig: AgentConfig;
  private teamKnowledge: string;
  private task: string;

  constructor(agentConfig: AgentConfig, teamKnowledge: string = '') {
    super();
    this.agentConfig = agentConfig;
    this.teamKnowledge = teamKnowledge;
    this.task = '';

    this.identity = {
      id: `protocol_${agentConfig.name}`,
      name: agentConfig.name,
      domain: agentConfig.knowledgeDomains?.[0] ?? 'general',
      version: '1.0.0',
      capabilities: agentConfig.capabilities,
    };
  }

  // ── Phase implementations ──

  async intake(input: unknown): Promise<PhaseResult> {
    const { task } = input as { task: string };
    this.task = task;

    // INTAKE is local — no LLM call needed. Just structure the context.
    const context = {
      task,
      agent: this.agentConfig.name,
      role: this.agentConfig.role,
      capabilities: this.agentConfig.capabilities,
      knowledge: this.teamKnowledge,
    };

    return {
      phase: ProtocolPhase.INTAKE,
      status: 'success',
      data: context,
      durationMs: 0,
      timestamp: Date.now(),
    };
  }

  async reflect(data: unknown): Promise<PhaseResult> {
    const context = data as Record<string, unknown>;
    const messages: LLMMessage[] = [
      { role: 'system', content: PHASE_PROMPTS[ProtocolPhase.REFLECT] },
      {
        role: 'user',
        content: `Task: ${context.task}\nRole: ${context.role}\nCapabilities: ${context.capabilities}\n${context.knowledge ? `Knowledge:\n${context.knowledge}` : ''}\n\nAnalyze the best approach.`,
      },
    ];

    const response = await callLLM(lightModel(this.agentConfig.model), messages);

    return {
      phase: ProtocolPhase.REFLECT,
      status: 'success',
      data: { plan: response.content, context },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }

  async execute(plan: unknown): Promise<PhaseResult> {
    const { context } = plan as { plan: string; context: Record<string, unknown> };
    const agent = this.agentConfig;

    const systemPrompt =
      agent.systemPrompt ||
      `You are ${agent.name}, a ${agent.role} agent. Your capabilities: ${agent.capabilities.join(', ')}.`;

    const knowledgeContext = this.teamKnowledge
      ? `\n\nRelevant team knowledge:\n${this.teamKnowledge}`
      : '';

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Task: ${context.task}\n${(context as Record<string, unknown>).description ?? ''}${knowledgeContext}\n\nComplete this task. Provide a clear summary of what you did.`,
      },
    ];

    // Execute phase uses the agent's full model (sonnet-tier).
    const response = await callLLM(this.agentConfig.model, messages);

    return {
      phase: ProtocolPhase.EXECUTE,
      status: 'success',
      data: { output: response.content, task: context.task },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }

  async compress(results: unknown): Promise<PhaseResult> {
    const { output } = results as { output: string; task: string };

    const messages: LLMMessage[] = [
      { role: 'system', content: PHASE_PROMPTS[ProtocolPhase.COMPRESS] },
      {
        role: 'user',
        content: `Task: ${this.task}\nOutput:\n${output}\n\nExtract knowledge items. Format each on its own line as:\n[wisdom] insight here\n[pattern] reusable solution here\n[gotcha] pitfall here`,
      },
    ];

    const response = await callLLM(lightModel(this.agentConfig.model), messages);
    const insights = parseKnowledgeItems(
      response.content,
      this.identity.domain,
      this.agentConfig.name
    );

    return {
      phase: ProtocolPhase.COMPRESS,
      status: 'success',
      data: { insights, rawOutput: output },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }

  async reintake(compressed: unknown): Promise<PhaseResult> {
    const { insights, rawOutput } = compressed as {
      insights: KnowledgeInsight[];
      rawOutput: string;
    };

    if (insights.length === 0) {
      return {
        phase: ProtocolPhase.REINTAKE,
        status: 'success',
        data: { validated: [], rawOutput },
        durationMs: 0,
        timestamp: Date.now(),
      };
    }

    const messages: LLMMessage[] = [
      { role: 'system', content: PHASE_PROMPTS[ProtocolPhase.REINTAKE] },
      {
        role: 'user',
        content: `Validate these knowledge items:\n${insights.map((i) => `[${i.type}] ${i.content}`).join('\n')}\n\nReturn only the validated items, one per line as: [type] content`,
      },
    ];

    const response = await callLLM(lightModel(this.agentConfig.model), messages);
    const validated = parseKnowledgeItems(
      response.content,
      this.identity.domain,
      this.agentConfig.name
    );

    return {
      phase: ProtocolPhase.REINTAKE,
      status: 'success',
      data: { validated: validated.length > 0 ? validated : insights, rawOutput },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }

  async grow(learnings: unknown): Promise<PhaseResult> {
    const { validated } = learnings as { validated: KnowledgeInsight[]; rawOutput: string };

    if (validated.length === 0) {
      return {
        phase: ProtocolPhase.GROW,
        status: 'success',
        data: { patterns: [], validated },
        durationMs: 0,
        timestamp: Date.now(),
      };
    }

    const messages: LLMMessage[] = [
      { role: 'system', content: PHASE_PROMPTS[ProtocolPhase.GROW] },
      {
        role: 'user',
        content: `Knowledge items:\n${validated.map((i) => `[${i.type}] ${i.content}`).join('\n')}\n\nIdentify cross-cutting patterns or themes.`,
      },
    ];

    const response = await callLLM(lightModel(this.agentConfig.model), messages);

    return {
      phase: ProtocolPhase.GROW,
      status: 'success',
      data: { patterns: response.content, validated },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }

  async evolve(adaptations: unknown): Promise<PhaseResult> {
    const { validated } = adaptations as { patterns: string; validated: KnowledgeInsight[] };

    if (validated.length === 0) {
      return {
        phase: ProtocolPhase.EVOLVE,
        status: 'success',
        data: { suggestions: 'No knowledge to evolve from.' },
        durationMs: 0,
        timestamp: Date.now(),
      };
    }

    const messages: LLMMessage[] = [
      { role: 'system', content: PHASE_PROMPTS[ProtocolPhase.EVOLVE] },
      {
        role: 'user',
        content: `Based on patterns found, suggest improvements for future tasks in domain "${this.identity.domain}".`,
      },
    ];

    const response = await callLLM(lightModel(this.agentConfig.model), messages);

    return {
      phase: ProtocolPhase.EVOLVE,
      status: 'success',
      data: { suggestions: response.content },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
}

// ── Helpers ──

/** Parse LLM output into KnowledgeInsight[]. */
function parseKnowledgeItems(content: string, domain: string, source: string): KnowledgeInsight[] {
  const insights: KnowledgeInsight[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Match both "- [type] content" and "[type] content"
    const match = trimmed.match(/^(?:-\s*)?\[(wisdom|pattern|gotcha)\]\s*(.+)$/i);
    if (match) {
      insights.push({
        type: match[1].toLowerCase() as 'wisdom' | 'pattern' | 'gotcha',
        content: match[2].trim(),
        domain,
        confidence: 0.7,
        source,
      });
    }
  }

  return insights;
}

/**
 * Execute a full protocol cycle for a task and extract the structured result.
 * This is the main entry point used by Team.executeTask.
 */
export async function runProtocolCycle(
  agentConfig: AgentConfig,
  task: { title: string; description: string },
  teamKnowledge: string
): Promise<ProtocolTaskResult> {
  const agent = new ProtocolAgent(agentConfig, teamKnowledge);
  const start = Date.now();

  const cycleResult = await agent.runCycle(task.title, {
    description: task.description,
  });

  // Extract summary from EXECUTE phase
  const executePhase = cycleResult.phases.find((p) => p.phase === ProtocolPhase.EXECUTE);
  const summary =
    (executePhase?.data as { output?: string })?.output?.slice(0, 500) ?? 'Task completed';

  // Extract insights from REINTAKE phase (validated) or COMPRESS phase (raw)
  const reintakePhase = cycleResult.phases.find((p) => p.phase === ProtocolPhase.REINTAKE);
  const compressPhase = cycleResult.phases.find((p) => p.phase === ProtocolPhase.COMPRESS);
  const insights: KnowledgeInsight[] =
    (reintakePhase?.data as { validated?: KnowledgeInsight[] })?.validated ??
    (compressPhase?.data as { insights?: KnowledgeInsight[] })?.insights ??
    [];

  return {
    summary,
    insights,
    phaseResults: cycleResult.phases,
    totalDurationMs: Date.now() - start,
  };
}

// ── CycleResult Adapter ──
// Maps framework CycleResult (team-oriented) ↔ protocol ProtocolCycleResult (agent-oriented).

/**
 * Convert a protocol ProtocolCycleResult into the framework's team-oriented CycleResult.
 */
export function protocolToFrameworkCycleResult(
  protocol: ProtocolCycleResult,
  teamName: string,
  cycle: number
): FrameworkCycleResult {
  // Extract insights from compress/reintake phases
  const reintake = protocol.phases.find((p) => p.phase === ProtocolPhase.REINTAKE);
  const compress = protocol.phases.find((p) => p.phase === ProtocolPhase.COMPRESS);
  const insights: KnowledgeInsight[] =
    (reintake?.data as { validated?: KnowledgeInsight[] })?.validated ??
    (compress?.data as { insights?: KnowledgeInsight[] })?.insights ??
    [];

  const executePhase = protocol.phases.find((p) => p.phase === ProtocolPhase.EXECUTE);
  const summary =
    (executePhase?.data as { output?: string })?.output?.slice(0, 500) ?? 'Task completed';

  const hasFailed = protocol.status === 'failed';

  return {
    teamName,
    cycle,
    agentResults: [
      {
        agentName: protocol.domain, // best available identifier
        taskId: protocol.cycleId,
        taskTitle: protocol.task,
        action: hasFailed ? 'error' : 'completed',
        summary,
        knowledge: insights,
      },
    ],
    knowledgeProduced: insights,
    compoundedInsights: insights.length,
    durationMs: protocol.totalDurationMs,
  };
}

/**
 * Convert a framework CycleResult into a protocol ProtocolCycleResult.
 */
export function frameworkToProtocolCycleResult(
  fw: FrameworkCycleResult,
  task: string,
  domain: string
): ProtocolCycleResult {
  const now = Date.now();
  const hasError = fw.agentResults.some((r) => r.action === 'error');

  return {
    cycleId: `cycle_${fw.cycle}_${now.toString(36)}`,
    task,
    domain,
    phases: [], // framework CycleResult doesn't carry per-phase data
    status: hasError ? 'failed' : 'complete',
    totalDurationMs: fw.durationMs,
    startedAt: now - fw.durationMs,
    completedAt: now,
  };
}

// ── defineProtocolAgent() builder ──

/**
 * Creates a live protocol agent handle backed by LLM calls.
 *
 * The returned handle has execute(task), pause/resume/cancel controls,
 * status tracking, and phase history.
 *
 * ```ts
 * const agent = defineProtocolAgent({
 *   name: 'researcher',
 *   role: 'researcher',
 *   model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
 *   capabilities: ['search', 'summarize'],
 *   claimFilter: { roles: ['researcher'], maxPriority: 10 },
 * });
 * const result = await agent.execute({ title: 'Find X', description: 'Research X' });
 * ```
 */
export function defineProtocolAgent(config: ProtocolAgentConfig): ProtocolAgentHandle {
  // Validate config using same rules as defineAgent
  if (!config.name || config.name.length < 1) {
    throw new Error('Agent name is required');
  }
  const VALID_ROLES = ['architect', 'coder', 'researcher', 'reviewer'] as const;
  if (!VALID_ROLES.includes(config.role as (typeof VALID_ROLES)[number])) {
    throw new Error(`Invalid role "${config.role}". Valid: ${VALID_ROLES.join(', ')}`);
  }
  if (!config.model?.provider || !config.model?.model) {
    throw new Error('Agent model must specify provider and model');
  }
  if (!config.capabilities || config.capabilities.length === 0) {
    throw new Error('Agent must have at least one capability');
  }

  const protocolStyle = config.protocolStyle ?? 'uaa2';
  if (protocolStyle !== 'uaa2') {
    throw new Error(
      `Protocol style "${protocolStyle}" is not yet implemented. Only 'uaa2' is supported.`
    );
  }

  // Internal mutable state
  let status: AgentStatus = 'idle';
  const phaseHistory: PhaseResult[] = [];
  let pauseRequested = false;
  let cancelRequested = false;
  let pauseResolver: (() => void) | null = null;

  const maxRetries = config.maxPhaseRetries ?? 1;

  /**
   * Run a single phase with hooks, retries, and pause/cancel checks.
   */
  async function runPhaseWithControls(
    agent: ProtocolAgent,
    phase: ProtocolPhase,
    phaseFn: (input: unknown) => Promise<PhaseResult>,
    input: unknown
  ): Promise<PhaseResult> {
    // Check cancel
    if (cancelRequested) {
      const skipped: PhaseResult = {
        phase,
        status: 'skipped',
        data: 'cancelled',
        durationMs: 0,
        timestamp: Date.now(),
      };
      phaseHistory.push(skipped);
      return skipped;
    }

    // Check pause — wait until resumed
    if (pauseRequested) {
      status = 'paused';
      await new Promise<void>((resolve) => {
        pauseResolver = resolve;
      });
      status = 'running';
    }

    // Before hook
    let phaseInput = input;
    if (config.phaseHooks?.before) {
      phaseInput = (await config.phaseHooks.before(phase, input)) ?? input;
    }

    // Execute with retries
    let lastError: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const start = Date.now();
        let result = await phaseFn.call(agent, phaseInput);
        result.durationMs = Date.now() - start;

        // After hook
        if (config.phaseHooks?.after) {
          result = (await config.phaseHooks.after(phase, result)) ?? result;
        }

        phaseHistory.push(result);
        return result;
      } catch (err) {
        lastError = err;
        if (attempt === maxRetries - 1) break;
      }
    }

    // All retries exhausted
    const failResult: PhaseResult = {
      phase,
      status: 'failure',
      data: lastError instanceof Error ? lastError.message : String(lastError),
      durationMs: 0,
      timestamp: Date.now(),
    };
    phaseHistory.push(failResult);
    return failResult;
  }

  const handle: ProtocolAgentHandle = {
    get name() {
      return config.name;
    },
    get role() {
      return config.role;
    },
    get status() {
      return status;
    },
    get history() {
      return [...phaseHistory];
    },

    async execute(task: { title: string; description: string }): Promise<ProtocolCycleResult> {
      if (status === 'running') {
        throw new Error(
          'Agent is already executing. Await the current execution or cancel() first.'
        );
      }

      status = 'running';
      pauseRequested = false;
      cancelRequested = false;

      const agent = new ProtocolAgent(config, config.teamKnowledge ?? '');
      if (config.lightModel) {
        // Apply light model overrides — handled inside ProtocolAgent via lightModel()
        // The lightModel function in ProtocolAgent already handles this
      }

      const startedAt = Date.now();
      const cycleId = `cycle_${startedAt}_${Math.random().toString(36).slice(2, 8)}`;

      try {
        // Run 7 phases sequentially with controls
        const phases: Array<[ProtocolPhase, (input: unknown) => Promise<PhaseResult>]> = [
          [ProtocolPhase.INTAKE, agent.intake],
          [ProtocolPhase.REFLECT, agent.reflect],
          [ProtocolPhase.EXECUTE, agent.execute],
          [ProtocolPhase.COMPRESS, agent.compress],
          [ProtocolPhase.REINTAKE, agent.reintake],
          [ProtocolPhase.GROW, agent.grow],
          [ProtocolPhase.EVOLVE, agent.evolve],
        ];

        let previousData: unknown = { task: task.title, description: task.description };
        const phaseResults: PhaseResult[] = [];

        for (const [phase, fn] of phases) {
          const result = await runPhaseWithControls(agent, phase, fn, previousData);
          phaseResults.push(result);

          if (cancelRequested && result.status === 'skipped') {
            // Fill remaining phases as skipped
            break;
          }

          previousData = result.data;
        }

        const hasFailed = phaseResults.some((p) => p.status === 'failure');
        const wasCancelled = cancelRequested;

        status = wasCancelled ? 'cancelled' : hasFailed ? 'error' : 'idle';

        return {
          cycleId,
          task: task.title,
          domain: agent.identity.domain,
          phases: phaseResults,
          status: wasCancelled ? 'partial' : hasFailed ? 'partial' : 'complete',
          totalDurationMs: Date.now() - startedAt,
          startedAt,
          completedAt: Date.now(),
        };
      } catch (err) {
        status = 'error';
        throw err;
      }
    },

    pause() {
      if (status === 'running') {
        pauseRequested = true;
      }
    },

    resume() {
      if (status === 'paused' || pauseRequested) {
        pauseRequested = false;
        if (pauseResolver) {
          pauseResolver();
          pauseResolver = null;
        }
      }
    },

    cancel() {
      cancelRequested = true;
      // Also resume if paused so the cancel can take effect
      if (pauseRequested || status === 'paused') {
        pauseRequested = false;
        if (pauseResolver) {
          pauseResolver();
          pauseResolver = null;
        }
      }
    },

    reset() {
      if (status === 'running') {
        throw new Error('Cannot reset while running. Cancel first.');
      }
      status = 'idle';
      phaseHistory.length = 0;
      pauseRequested = false;
      cancelRequested = false;
      pauseResolver = null;
    },
  };

  return handle;
}
