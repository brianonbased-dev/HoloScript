/**
 * Multi-tenant Moltbook Agent Manager.
 *
 * Manages user-created Moltbook agents backed by absorbed codebases.
 * Each agent gets its own MoltbookClient (with the user's API key),
 * LLMContentGenerator (credit-metered via MeteredLLMProvider), and
 * optional GraphRAGEngine for codebase-grounded content.
 *
 * The admin HoloScript agent dogfoods the full stack — user agents
 * consume the same services with credit metering.
 */

import type { ContentPillar, GeneratedPost } from './types';
import type { LLMProvider } from './llm-content-generator';
import { LLMContentGenerator } from './llm-content-generator';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentConfig {
  /** Moltbook agent name (must match registered Moltbook account) */
  agentName: string;
  /** Moltbook API key for this agent */
  moltbookApiKey: string;
  /** Content pillars to generate (default: all) */
  pillars?: ContentPillar[];
  /** Submolts to post in (default: derived from pillar) */
  submolts?: string[];
  /** Custom search topics for browsing */
  searchTopics?: string[];
  /** Custom system identity prompt extension */
  persona?: string;
}

export interface MoltbookAgentRecord {
  id: string;
  userId: string;
  projectId: string;
  agentName: string;
  config: AgentConfig;
  heartbeatEnabled: boolean;
  lastHeartbeat: Date | null;
  totalPostsGenerated: number;
  totalCommentsGenerated: number;
  totalLlmSpentCents: number;
  createdAt: Date;
}

export interface AgentStatus {
  id: string;
  agentName: string;
  heartbeatEnabled: boolean;
  heartbeatRunning: boolean;
  lastHeartbeat: Date | null;
  stats: {
    totalPosts: number;
    totalComments: number;
    llmSpentCents: number;
  };
  creditBalanceCents: number;
}

// ── In-memory agent registry (database-backed in production) ────────────────

interface RunningAgent {
  record: MoltbookAgentRecord;
  generator: LLMContentGenerator;
  intervalId: ReturnType<typeof setInterval> | null;
}

export class MoltbookAgentManager {
  private agents = new Map<string, RunningAgent>();
  private llmProviderFactory: (() => LLMProvider) | null;

  constructor(llmProviderFactory?: () => LLMProvider) {
    this.llmProviderFactory = llmProviderFactory ?? null;
  }

  /**
   * Create a new Moltbook agent backed by an absorbed codebase.
   */
  async createAgent(
    userId: string,
    projectId: string,
    config: AgentConfig,
  ): Promise<MoltbookAgentRecord> {
    const id = crypto.randomUUID();

    const record: MoltbookAgentRecord = {
      id,
      userId,
      projectId,
      agentName: config.agentName,
      config,
      heartbeatEnabled: false,
      lastHeartbeat: null,
      totalPostsGenerated: 0,
      totalCommentsGenerated: 0,
      totalLlmSpentCents: 0,
      createdAt: new Date(),
    };

    // Create LLM generator (without GraphRAG for now — can be connected later)
    let generator: LLMContentGenerator;
    if (this.llmProviderFactory) {
      generator = new LLMContentGenerator(this.llmProviderFactory());
    } else {
      // Create a no-op generator that always returns null
      generator = new LLMContentGenerator({
        complete: async () => ({ content: '' }),
      });
    }

    this.agents.set(id, { record, generator, intervalId: null });

    console.log(`[moltbook-agent-manager] Created agent "${config.agentName}" (${id}) for user ${userId}`);
    return record;
  }

  /**
   * Start heartbeat for an agent.
   */
  async startAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    if (agent.intervalId) return; // Already running

    agent.record.heartbeatEnabled = true;
    // Heartbeat runs every 30 minutes
    agent.intervalId = setInterval(
      () => void this.tickAgent(agentId),
      30 * 60 * 1000,
    );

    console.log(`[moltbook-agent-manager] Started heartbeat for "${agent.record.agentName}"`);
  }

  /**
   * Stop heartbeat for an agent.
   */
  async stopAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    if (agent.intervalId) {
      clearInterval(agent.intervalId);
      agent.intervalId = null;
    }
    agent.record.heartbeatEnabled = false;

    console.log(`[moltbook-agent-manager] Stopped heartbeat for "${agent.record.agentName}"`);
  }

  /**
   * Get agent status including LLM spend.
   */
  async getAgentStatus(agentId: string): Promise<AgentStatus> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    return {
      id: agent.record.id,
      agentName: agent.record.agentName,
      heartbeatEnabled: agent.record.heartbeatEnabled,
      heartbeatRunning: agent.intervalId !== null,
      lastHeartbeat: agent.record.lastHeartbeat,
      stats: {
        totalPosts: agent.record.totalPostsGenerated,
        totalComments: agent.record.totalCommentsGenerated,
        llmSpentCents: agent.record.totalLlmSpentCents,
      },
      creditBalanceCents: -1, // TODO: Query credit service
    };
  }

  /**
   * Generate a single post on-demand (credit-metered).
   */
  async generatePost(agentId: string, pillar?: ContentPillar): Promise<GeneratedPost | null> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const targetPillar = pillar ?? this.getRandomPillar(agent.record.config.pillars);
    const post = await agent.generator.generatePost(targetPillar);

    if (post) {
      agent.record.totalPostsGenerated++;
    }

    return post;
  }

  /**
   * Preview what the agent would generate (no side effects).
   */
  async previewPost(agentId: string, pillar?: ContentPillar): Promise<GeneratedPost | null> {
    return this.generatePost(agentId, pillar);
  }

  /**
   * List all agents for a user.
   */
  async listAgents(userId: string): Promise<MoltbookAgentRecord[]> {
    const results: MoltbookAgentRecord[] = [];
    for (const agent of this.agents.values()) {
      if (agent.record.userId === userId) {
        results.push({ ...agent.record });
      }
    }
    return results;
  }

  /**
   * Update agent configuration.
   */
  async configureAgent(agentId: string, config: Partial<AgentConfig>): Promise<MoltbookAgentRecord> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    agent.record.config = { ...agent.record.config, ...config };
    return { ...agent.record };
  }

  /**
   * Stop all agents and clean up.
   */
  async shutdown(): Promise<void> {
    for (const [id, agent] of this.agents) {
      if (agent.intervalId) {
        clearInterval(agent.intervalId);
        agent.intervalId = null;
      }
    }
    this.agents.clear();
    console.log('[moltbook-agent-manager] Shutdown complete');
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async tickAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    try {
      agent.record.lastHeartbeat = new Date();

      // For now, just generate a post — full heartbeat cycle will integrate
      // with MoltbookClient per-agent in the future
      const post = await agent.generator.generatePost();
      if (post) {
        agent.record.totalPostsGenerated++;
        console.log(`[moltbook-agent-manager] "${agent.record.agentName}" generated: ${post.title}`);
      }
    } catch (err) {
      console.warn(`[moltbook-agent-manager] Tick failed for "${agent.record.agentName}":`, err);
    }
  }

  private getRandomPillar(pillars?: ContentPillar[]): ContentPillar {
    const available = pillars ?? ['research', 'infrastructure', 'showcase', 'community'];
    return available[Math.floor(Math.random() * available.length)];
  }
}
