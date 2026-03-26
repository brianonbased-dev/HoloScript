/**
 * Moltbook Agent Persistence Layer.
 *
 * Bridges the in-memory MoltbookAgentManager with the PostgreSQL
 * moltbook_agents table in absorb-service. Uses the absorb-service
 * REST API rather than direct DB access (MCP server ≠ absorb-service).
 */

import type { HeartbeatState } from './types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PersistedAgent {
  id: string;
  userId: string;
  projectId: string;
  agentName: string;
  moltbookApiKey: string;
  config: Record<string, unknown>;
  heartbeatEnabled: boolean;
  lastHeartbeat: string | null;
  totalPostsGenerated: number;
  totalCommentsGenerated: number;
  totalUpvotesGiven: number;
  challengeFailures: number;
  totalLlmSpentCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersistenceConfig {
  /** Base URL for the absorb-service API (default: http://localhost:3005) */
  absorbServiceUrl: string;
  /** Auth token for absorb-service API calls */
  authToken?: string;
}

const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  absorbServiceUrl: process.env.ABSORB_SERVICE_URL || 'http://localhost:3005',
  authToken: process.env.ABSORB_SERVICE_TOKEN,
};

// ── Persistence Layer ────────────────────────────────────────────────────────

export class AgentPersistence {
  private config: PersistenceConfig;

  constructor(config?: Partial<PersistenceConfig>) {
    this.config = { ...DEFAULT_PERSISTENCE_CONFIG, ...config };
  }

  /**
   * Load all agents that have heartbeat enabled (for recovery on startup).
   */
  async loadActiveAgents(): Promise<PersistedAgent[]> {
    try {
      const res = await this.fetch('/api/absorb/moltbook');
      if (!res.ok) {
        console.warn(`[agent-persistence] Failed to load agents: ${res.status}`);
        return [];
      }
      const data = await res.json();
      const agents: PersistedAgent[] = data.agents || [];
      return agents.filter((a) => a.heartbeatEnabled);
    } catch (err) {
      console.warn('[agent-persistence] Load failed:', err);
      return [];
    }
  }

  /**
   * Save heartbeat state + stats back to the DB for a given agent.
   */
  async saveAgentState(
    agentId: string,
    state: HeartbeatState,
    stats: {
      totalPostsGenerated: number;
      totalCommentsGenerated: number;
      totalUpvotesGiven: number;
      challengeFailures: number;
      totalLlmSpentCents: number;
    },
  ): Promise<boolean> {
    try {
      const res = await this.fetch(`/api/absorb/moltbook/${agentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          heartbeatEnabled: true,
          config: { heartbeatState: state },
          ...stats,
        }),
      });
      return res.ok;
    } catch (err) {
      console.warn(`[agent-persistence] Save failed for ${agentId}:`, err);
      return false;
    }
  }

  /**
   * Mark an agent as stopped (heartbeatEnabled = false) and persist final state.
   */
  async markStopped(
    agentId: string,
    state: HeartbeatState,
  ): Promise<boolean> {
    try {
      const res = await this.fetch(`/api/absorb/moltbook/${agentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          heartbeatEnabled: false,
          config: { heartbeatState: state },
        }),
      });
      return res.ok;
    } catch (err) {
      console.warn(`[agent-persistence] Mark-stopped failed for ${agentId}:`, err);
      return false;
    }
  }

  /**
   * Extract HeartbeatState from persisted agent config JSONB.
   */
  extractHeartbeatState(agent: PersistedAgent): HeartbeatState | null {
    const config = agent.config as Record<string, unknown>;
    if (!config?.heartbeatState) return null;
    return config.heartbeatState as HeartbeatState;
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.config.absorbServiceUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }
    return globalThis.fetch(url, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
    });
  }
}
