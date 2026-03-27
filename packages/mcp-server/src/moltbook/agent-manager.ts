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

import type { ContentPillar, GeneratedPost, HeartbeatState } from './types';
import type { LLMProvider } from './llm-content-generator';
import { LLMContentGenerator } from './llm-content-generator';
import { MoltbookClient } from './client';
import { MoltbookHeartbeat } from './heartbeat';
import { ContentPipeline } from './content-pipeline';
import { ChallengeEscalationPipeline } from './challenge-solver';
import { MoltbookCreditScorer } from './credit-scorer';
import type { CreditBreakdown } from './credit-scorer';
import { AgentPersistence } from './agent-persistence';
import type { PersistenceConfig } from './agent-persistence';

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
  totalUpvotesGiven: number;
  challengeFailures: number;
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
    totalUpvotesGiven: number;
    challengeFailures: number;
    llmSpentCents: number;
  };
  creditBalanceCents: number;
  creditBreakdown: CreditBreakdown;
}

// ── In-memory agent registry (database-backed in production) ────────────────

interface RunningAgent {
  record: MoltbookAgentRecord;
  generator: LLMContentGenerator;
  client: MoltbookClient;
  heartbeat: MoltbookHeartbeat;
  pipeline: ContentPipeline;
}

export class MoltbookAgentManager {
  private agents = new Map<string, RunningAgent>();
  private llmProviderFactory: (() => LLMProvider) | null;
  private creditScorer = new MoltbookCreditScorer();
  private persistence: AgentPersistence;

  constructor(llmProviderFactory?: () => LLMProvider, persistenceConfig?: Partial<PersistenceConfig>) {
    this.llmProviderFactory = llmProviderFactory ?? null;
    this.persistence = new AgentPersistence(persistenceConfig);
  }

  /**
   * Recover agents with heartbeatEnabled=true from the database on startup.
   */
  async recoverAgents(): Promise<number> {
    const persisted = await this.persistence.loadActiveAgents();
    let recovered = 0;

    for (const agent of persisted) {
      try {
        const heartbeatState = this.persistence.extractHeartbeatState(agent);
        const postHistory = heartbeatState?.postHistory ?? [];

        const client = new MoltbookClient(agent.moltbookApiKey);
        const llmProvider = this.llmProviderFactory ? this.llmProviderFactory() : null;
        const generator = llmProvider
          ? new LLMContentGenerator(llmProvider)
          : new LLMContentGenerator({ complete: async () => ({ content: '' }) });
        if (llmProvider) {
          client.setChallengePipeline(new ChallengeEscalationPipeline(llmProvider));
        }
        const pipeline = new ContentPipeline(postHistory);
        const heartbeat = new MoltbookHeartbeat(client, pipeline, generator, agent.agentName);

        const agentConfig = (agent.config as Record<string, unknown>) ?? {};
        const record: MoltbookAgentRecord = {
          id: agent.id,
          userId: agent.userId,
          projectId: agent.projectId,
          agentName: agent.agentName,
          config: {
            agentName: agent.agentName,
            moltbookApiKey: agent.moltbookApiKey,
            ...(agentConfig as Partial<AgentConfig>),
          },
          heartbeatEnabled: true,
          lastHeartbeat: agent.lastHeartbeat ? new Date(agent.lastHeartbeat) : null,
          totalPostsGenerated: agent.totalPostsGenerated,
          totalCommentsGenerated: agent.totalCommentsGenerated,
          totalUpvotesGiven: agent.totalUpvotesGiven,
          challengeFailures: agent.challengeFailures,
          totalLlmSpentCents: agent.totalLlmSpentCents,
          createdAt: new Date(agent.createdAt),
        };

        this.agents.set(agent.id, { record, generator, client, heartbeat, pipeline });
        heartbeat.start();
        recovered++;

        console.log(`[moltbook-agent-manager] Recovered agent "${agent.agentName}" (${agent.id})`);
      } catch (err) {
        console.warn(`[moltbook-agent-manager] Failed to recover agent ${agent.id}:`, err);
      }
    }

    if (recovered > 0) {
      console.log(`[moltbook-agent-manager] Recovered ${recovered}/${persisted.length} agents`);
    }
    return recovered;
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
      totalUpvotesGiven: 0,
      challengeFailures: 0,
      totalLlmSpentCents: 0,
      createdAt: new Date(),
    };

    // Create per-agent MoltbookClient for API access (karma, followers, etc.)
    const client = new MoltbookClient(config.moltbookApiKey);

    // Create LLM generator (without GraphRAG for now — can be connected later)
    let generator: LLMContentGenerator;
    if (this.llmProviderFactory) {
      const llmProvider = this.llmProviderFactory();
      generator = new LLMContentGenerator(llmProvider);
      client.setChallengePipeline(new ChallengeEscalationPipeline(llmProvider));
    } else {
      // Create a no-op generator that always returns null
      generator = new LLMContentGenerator({
        complete: async () => ({ content: '' }),
      });
    }

    // Create per-agent content pipeline and heartbeat
    const pipeline = new ContentPipeline();
    const heartbeat = new MoltbookHeartbeat(client, pipeline, generator, config.agentName);

    this.agents.set(id, { record, generator, client, heartbeat, pipeline });

    console.log(`[moltbook-agent-manager] Created agent "${config.agentName}" (${id}) for user ${userId}`);
    return record;
  }

  /**
   * Start heartbeat for an agent.
   */
  async startAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    if (agent.heartbeat.isRunning()) return; // Already running

    agent.record.heartbeatEnabled = true;
    agent.heartbeat.start();

    console.log(`[moltbook-agent-manager] Started heartbeat for "${agent.record.agentName}"`);
  }

  /**
   * Stop heartbeat for an agent and persist final state.
   */
  async stopAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    agent.heartbeat.stop();
    agent.record.heartbeatEnabled = false;

    // Persist final state with postHistory
    const state = agent.heartbeat.getState();
    const postHistory = agent.pipeline.getPostedTitles();
    await this.persistence.markStopped(agentId, { ...state, postHistory });

    console.log(`[moltbook-agent-manager] Stopped heartbeat for "${agent.record.agentName}"`);
  }

  /**
   * Get agent status with live credit scoring from Moltbook stats.
   */
  async getAgentStatus(agentId: string): Promise<AgentStatus> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const creditBreakdown = await this.creditScorer.calculateCredits(
      agent.client,
      {
        totalPosts: agent.record.totalPostsGenerated,
        totalComments: agent.record.totalCommentsGenerated,
        totalUpvotesGiven: agent.record.totalUpvotesGiven,
        challengeFailures: agent.record.challengeFailures,
        llmSpentCents: agent.record.totalLlmSpentCents,
      },
    );

    return {
      id: agent.record.id,
      agentName: agent.record.agentName,
      heartbeatEnabled: agent.record.heartbeatEnabled,
      heartbeatRunning: agent.heartbeat.isRunning(),
      lastHeartbeat: agent.record.lastHeartbeat,
      stats: {
        totalPosts: agent.record.totalPostsGenerated,
        totalComments: agent.record.totalCommentsGenerated,
        totalUpvotesGiven: agent.record.totalUpvotesGiven,
        challengeFailures: agent.record.challengeFailures,
        llmSpentCents: agent.record.totalLlmSpentCents,
      },
      creditBalanceCents: creditBreakdown.balanceCents,
      creditBreakdown,
    };
  }

  /**
   * Generate a single post on-demand (credit-metered).
   */
  async generatePost(agentId: string, pillar?: ContentPillar): Promise<GeneratedPost | null> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const targetPillar = pillar ?? agent.pipeline.getPillarForToday();
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
    for (const [, agent] of this.agents) {
      agent.heartbeat.stop();
    }
    this.agents.clear();
    console.log('[moltbook-agent-manager] Shutdown complete');
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /**
   * Sync heartbeat stats back into the agent record after each tick.
   * Persists state to database asynchronously.
   */
  syncHeartbeatStats(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const state = agent.heartbeat.getState();
    const postHistory = agent.pipeline.getPostedTitles();
    const stateWithHistory: HeartbeatState = { ...state, postHistory };

    agent.record.lastHeartbeat = new Date();
    agent.record.totalPostsGenerated = state.totalPosts;
    agent.record.totalCommentsGenerated = state.totalComments;
    agent.record.totalUpvotesGiven = state.totalUpvotes;
    agent.record.challengeFailures = agent.client.getChallengeFailures();

    // Persist to DB (fire-and-forget)
    void this.persistence.saveAgentState(agentId, stateWithHistory, {
      totalPostsGenerated: agent.record.totalPostsGenerated,
      totalCommentsGenerated: agent.record.totalCommentsGenerated,
      totalUpvotesGiven: agent.record.totalUpvotesGiven,
      challengeFailures: agent.record.challengeFailures,
      totalLlmSpentCents: agent.record.totalLlmSpentCents,
    });
  }

  /**
   * Trigger a single heartbeat tick on-demand (for the moltbook_agent_trigger tool).
   */
  async triggerAgent(agentId: string): Promise<{ result: import('./types').HeartbeatResult }> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const result = await agent.heartbeat.triggerNow();
    this.syncHeartbeatStats(agentId);
    return { result };
  }
}
