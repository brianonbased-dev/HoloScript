/**
 * GoalSynthesizer — Autonomous goal generation from context
 *
 * When a team's board is empty, agents should not idle. This module
 * synthesizes goals from knowledge store context, recent activity,
 * and domain expertise using an LLM (when available) or falling back
 * to heuristic goal generation.
 *
 * Absorbed from @holoscript/agent-protocol per FW-0.2.
 */

import type { KnowledgeInsight, ModelConfig } from '../types';
import type { KnowledgeStore, StoredEntry } from '../knowledge/knowledge-store';
import { callLLM } from '../llm/llm-adapter';
import type { LLMMessage } from '../llm/llm-adapter';
import type { Goal } from './implementations';

// ── Types ──

export interface GoalContext {
  /** Agent's primary domain (e.g. 'coding', 'research', 'security') */
  domain: string;
  /** Recent knowledge entries for context */
  recentKnowledge?: StoredEntry[];
  /** Recent completed task titles for dedup */
  recentCompletedTasks?: string[];
  /** Team name for context */
  teamName?: string;
  /** Agent name for personalization */
  agentName?: string;
  /** Agent capabilities */
  capabilities?: string[];
  /** Additional context to inject into the LLM prompt */
  additionalContext?: string;
}

export interface SynthesizedGoal extends Goal {
  /** Rationale explaining why this goal was chosen */
  rationale: string;
  /** Relevance score 0-1 based on context alignment */
  relevanceScore: number;
}

// ── Fallback goal templates (used when LLM is unavailable) ──

const GENERIC_GOALS = [
  'Analyze accumulated wisdom for contradictions',
  'Refactor internal pattern database for efficiency',
  'Explore adjacent domain knowledge',
  'Review recent failures and simulate alternative outcomes',
  'Update self-documentation and capability manifest',
  'Ping other agents for potential collaboration',
  'Optimize internal decision weights',
  'Study historical logs for anomaly detection',
];

const DOMAIN_GOALS: Record<string, string[]> = {
  coding: [
    'Refactor legacy modules in the codebase',
    'Write unit tests for untested components',
    'Research new design patterns applicable to current architecture',
    'Audit dependencies for security vulnerabilities',
    'Profile and optimize hot code paths',
  ],
  research: [
    'Survey recent papers in the domain',
    'Cross-reference findings across knowledge domains',
    'Identify gaps in current knowledge coverage',
    'Synthesize contradictory findings into unified model',
    'Map emerging trends and their implications',
  ],
  security: [
    'Audit access control policies for gaps',
    'Review cryptographic implementations for weaknesses',
    'Scan for hardcoded credentials or secrets',
    'Update threat model with recent attack vectors',
    'Verify rate limiting and abuse prevention measures',
  ],
  reviewer: [
    'Review recent changes for architectural consistency',
    'Check test coverage for recently modified modules',
    'Audit error handling patterns across the codebase',
    'Verify documentation matches implementation',
    'Identify code duplication opportunities',
  ],
  testing: [
    'Create automated integration test for recent scenarios',
    'Design fuzzing scenarios for core protocol serializers',
    'Update legacy snapshots with modern state data',
    'Verify deterministic behavior of CRDT synchronization',
    'Set up load-testing harness for agent autonomous loop',
  ],
  architecture: [
    'Analyze service boundaries for proper decoupling',
    'Evaluate event schemas against backward compatibility',
    'Design migration path for deprecated APIs',
    'Document implicit domain knowledge into architecture guidelines',
    'Evaluate storage engine scalability under node churn',
  ],
  performance: [
    'Profile and optimize hot code paths',
    'Reduce bundle size or optimize build times',
    'Identify and resolve memory leaks in background daemon',
    'Benchmark network latency in cross-region mesh',
  ],
  devops: [
    'Review and refine CI/CD pipeline efficiency',
    'Automate environment provisioning for local scenario tests',
    'Evaluate telemetry logging cardinality and storage costs',
  ]
};

// ── GoalSynthesizer ──

export class GoalSynthesizer {
  private llmConfig: ModelConfig | null;
  private knowledgeStore: KnowledgeStore | null;

  constructor(opts?: { llm?: ModelConfig; knowledge?: KnowledgeStore }) {
    this.llmConfig = opts?.llm ?? null;
    this.knowledgeStore = opts?.knowledge ?? null;
  }

  /**
   * Synthesize goals from context. Uses LLM when available, falls back to heuristics.
   * Returns goals ranked by relevance.
   */
  async synthesizeMultiple(
    context: GoalContext,
    count = 3
  ): Promise<SynthesizedGoal[]> {
    // Gather knowledge context
    const knowledgeEntries = context.recentKnowledge ?? this.queryKnowledge(context.domain);

    // Try LLM-based synthesis first
    if (this.llmConfig) {
      try {
        return await this.synthesizeWithLLM(context, knowledgeEntries, count);
      } catch {
        // Fall through to heuristic
      }
    }

    // Heuristic fallback
    return this.synthesizeHeuristic(context, knowledgeEntries, count);
  }

  /**
   * Synthesize a single goal. Backward-compatible with the original API.
   */
  synthesize(
    agentDomain: string = 'general',
    source: Goal['source'] = 'autonomous-boredom'
  ): Goal {
    const goals = this.synthesizeHeuristic(
      { domain: agentDomain },
      [],
      1
    );
    if (goals.length > 0) {
      return { ...goals[0], source };
    }
    // Ultimate fallback
    const description = GENERIC_GOALS[Math.floor(Math.random() * GENERIC_GOALS.length)];
    return {
      id: `GOAL-${Date.now().toString(36)}`,
      description,
      category: 'self-improvement',
      priority: 'low',
      estimatedComplexity: Math.floor(Math.random() * 5) + 1,
      generatedAt: new Date().toISOString(),
      source,
    };
  }

  // ── Private ──

  private queryKnowledge(domain: string): StoredEntry[] {
    if (!this.knowledgeStore) return [];
    try {
      return this.knowledgeStore.search(domain, 5);
    } catch {
      return [];
    }
  }

  private async synthesizeWithLLM(
    context: GoalContext,
    knowledge: StoredEntry[],
    count: number
  ): Promise<SynthesizedGoal[]> {
    const knowledgeContext = knowledge.length > 0
      ? knowledge.map(k => `[${k.type}] ${k.content}`).join('\n')
      : 'No relevant knowledge entries found.';

    const recentTasks = context.recentCompletedTasks?.length
      ? context.recentCompletedTasks.slice(0, 10).join('\n- ')
      : 'None';

    const systemPrompt = [
      `You are a goal synthesizer for an autonomous AI agent team.`,
      `The agent "${context.agentName ?? 'unknown'}" operates in the "${context.domain}" domain.`,
      context.capabilities?.length
        ? `Agent capabilities: ${context.capabilities.join(', ')}`
        : '',
      context.teamName ? `Team: ${context.teamName}` : '',
      ``,
      `Your job: propose ${count} actionable goals the agent should pursue autonomously.`,
      `Goals should be specific, achievable, and build on existing knowledge.`,
      `Avoid duplicating recently completed tasks.`,
    ].filter(Boolean).join('\n');

    const userPrompt = [
      `## Knowledge Context`,
      knowledgeContext,
      ``,
      `## Recently Completed Tasks`,
      `- ${recentTasks}`,
      context.additionalContext ? `\n## Additional Context\n${context.additionalContext}` : '',
      ``,
      `## Instructions`,
      `Propose exactly ${count} goals. For each, respond in this JSON format:`,
      `[{"description": "...", "category": "...", "priority": "low|medium|high", "rationale": "...", "estimatedComplexity": 1-5}]`,
      ``,
      `Respond with ONLY the JSON array, no markdown fences.`,
    ].filter(Boolean).join('\n');

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await callLLM(this.llmConfig!, messages, {
      maxTokens: 1024,
      temperature: 0.8,
    });

    return this.parseLLMGoals(response.content, context, count);
  }

  private parseLLMGoals(
    content: string,
    context: GoalContext,
    count: number
  ): SynthesizedGoal[] {
    try {
      // Strip markdown fences if present
      const cleaned = content.replace(/```(?:json)?\s*\n?/g, '').trim();
      const parsed = JSON.parse(cleaned) as Array<{
        description: string;
        category?: string;
        priority?: 'low' | 'medium' | 'high';
        rationale?: string;
        estimatedComplexity?: number;
      }>;

      if (!Array.isArray(parsed)) return this.synthesizeHeuristic(context, [], count);

      return parsed.slice(0, count).map((g, i) => ({
        id: `GOAL-${Date.now().toString(36)}-${i}`,
        description: g.description || 'Explore new opportunities',
        category: g.category || 'self-improvement',
        priority: g.priority || 'medium',
        estimatedComplexity: Math.min(5, Math.max(1, g.estimatedComplexity ?? 3)),
        generatedAt: new Date().toISOString(),
        source: 'autonomous-boredom' as const,
        rationale: g.rationale || 'LLM-generated goal based on context',
        relevanceScore: 1 - (i * 0.1), // rank order from LLM
      }));
    } catch {
      return this.synthesizeHeuristic(context, [], count);
    }
  }

  private synthesizeHeuristic(
    context: GoalContext,
    knowledge: StoredEntry[],
    count: number
  ): SynthesizedGoal[] {
    const completedSet = new Set(
      (context.recentCompletedTasks ?? []).map(t => t.toLowerCase().trim())
    );

    // Build candidate pool from domain + generic goals
    const domainGoals = DOMAIN_GOALS[context.domain] ?? [];
    const candidates = [...domainGoals, ...GENERIC_GOALS];

    // If we have knowledge, generate knowledge-derived goals
    const knowledgeGoals = knowledge
      .filter(k => k.type === 'gotcha')
      .map(k => `Investigate and resolve: ${k.content.slice(0, 120)}`);

    const allCandidates = [...knowledgeGoals, ...candidates]
      .filter(desc => !completedSet.has(desc.toLowerCase().trim()));

    // Shuffle and pick
    const shuffled = allCandidates.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);

    return selected.map((description, i) => ({
      id: `GOAL-${Date.now().toString(36)}-${i}`,
      description,
      category: knowledgeGoals.includes(description) ? 'knowledge-gap' : 'self-improvement',
      priority: (i === 0 ? 'medium' : 'low') as 'low' | 'medium' | 'high',
      estimatedComplexity: Math.floor(Math.random() * 4) + 1,
      generatedAt: new Date().toISOString(),
      source: 'autonomous-boredom' as const,
      rationale: knowledgeGoals.includes(description)
        ? 'Derived from knowledge store gotcha entries'
        : `Heuristic goal for ${context.domain} domain`,
      relevanceScore: Math.max(0.3, 1 - (i * 0.2)),
    }));
  }
}

/** Exported domain goals for testing */
export { GENERIC_GOALS, DOMAIN_GOALS };
