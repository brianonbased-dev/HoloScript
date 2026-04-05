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
import type { AgentConfig, ModelConfig, KnowledgeInsight } from './types';

// ── Phase-specific system prompts ──

const PHASE_PROMPTS: Record<number, string> = {
  [ProtocolPhase.INTAKE]:
    'You are gathering context for a task. Summarize the task, relevant knowledge, and constraints. Be concise.',
  [ProtocolPhase.REFLECT]:
    'You are analyzing an approach. Given the context, identify the best strategy, risks, and key considerations. Be brief.',
  [ProtocolPhase.EXECUTE]:
    '', // Uses the agent's own system prompt
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
function parseKnowledgeItems(
  content: string,
  domain: string,
  source: string
): KnowledgeInsight[] {
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
  const executePhase = cycleResult.phases.find(
    (p) => p.phase === ProtocolPhase.EXECUTE
  );
  const summary =
    (executePhase?.data as { output?: string })?.output?.slice(0, 500) ??
    'Task completed';

  // Extract insights from REINTAKE phase (validated) or COMPRESS phase (raw)
  const reintakePhase = cycleResult.phases.find(
    (p) => p.phase === ProtocolPhase.REINTAKE
  );
  const compressPhase = cycleResult.phases.find(
    (p) => p.phase === ProtocolPhase.COMPRESS
  );
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
