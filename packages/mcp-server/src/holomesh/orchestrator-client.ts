/**
 * HoloMesh Orchestrator Client (V1)
 *
 * Wraps the MCP Orchestrator's existing endpoints for agent registration,
 * peer discovery, messaging, and knowledge exchange.
 *
 * V1 uses the orchestrator as a hub. V2 (discovery.ts + crdt-sync.ts)
 * adds direct P2P gossip via agent-card.json and Loro CRDT.
 */

import type { HoloMeshAgentCard, MeshConfig, MeshKnowledgeEntry, AgentReputation } from './types';
import { computeReputation, resolveReputationTier } from './types';
import * as crypto from 'crypto';

export interface WalletAuth {
  did: string;
  address: string;
  signature: string;
}

export class HoloMeshOrchestratorClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private agentId: string | null = null;

  constructor(private readonly config: MeshConfig) {
    this.baseUrl = config.orchestratorUrl.replace(/\/$/, '');
    this.headers = {
      'x-mcp-api-key': config.apiKey,
      'Content-Type': 'application/json',
    };
  }

  /** Set persistent wallet identity headers for all subsequent requests. */
  setWalletAuth(did: string, address: string): void {
    this.headers['x-agent-did'] = did;
    this.headers['x-agent-wallet'] = address;
  }

  // ── Agent Lifecycle ──

  /** Register this agent on the mesh via orchestrator. Returns agent ID. */
  async registerAgent(traits: string[], walletAuth?: WalletAuth): Promise<string> {
    const id =
      walletAuth?.did || `holomesh-${this.config.agentName}-${crypto.randomUUID().slice(0, 8)}`;
    const res = await this.post('/agents/register', {
      id,
      name: this.config.agentName,
      role: 'holomesh-agent',
      capabilities: traits,
      workspace: this.config.workspace,
      metadata: {
        type: 'holomesh',
        version: walletAuth ? '4.0' : '1.0',
      },
      ...(walletAuth && {
        walletAddress: walletAuth.address,
        walletSignature: walletAuth.signature,
      }),
    });

    this.agentId = res?.agent?.id || res?.id || id;
    return this.agentId as string;
  }

  /** Send heartbeat to keep agent alive. */
  async heartbeat(metadata?: Record<string, unknown>): Promise<boolean> {
    if (!this.agentId) return false;
    return this.postOk(`/agents/${this.agentId}/heartbeat`, {
      status: 'active',
      metadata: { type: 'holomesh', ...metadata },
    });
  }

  // ── Peer Discovery ──

  /** Discover peer agents. */
  async discoverPeers(opts?: { traits?: string[] }): Promise<HoloMeshAgentCard[]> {
    const data = await this.get('/agents');
    const agents: any[] = Array.isArray(data) ? data : data?.agents || data?.data || [];

    return agents
      .filter((a: any) => a.id !== this.agentId)
      .filter((a: any) => {
        if (!opts?.traits?.length) return true;
        const caps: string[] = a.capabilities || [];
        return opts.traits!.some((t) => caps.includes(t));
      })
      .map(
        (a: any): HoloMeshAgentCard => ({
          id: a.id,
          name: a.name || a.id,
          workspace: a.workspace || this.config.workspace,
          traits: a.capabilities || [],
          reputation: a.metadata?.reputation || 0,
          contributionCount: a.metadata?.contributionCount || 0,
          queryCount: a.metadata?.queryCount || 0,
          joinedAt: a.createdAt || a.created_at || new Date().toISOString(),
        })
      );
  }

  /** Get a specific agent's DNA/capabilities. */
  async getAgentCard(agentId: string): Promise<HoloMeshAgentCard | null> {
    const data = await this.get(`/agents/${agentId}/dna`);
    if (!data) return null;
    return {
      id: agentId,
      name: data.name || agentId,
      workspace: data.workspace || this.config.workspace,
      traits: data.traits || data.capabilities || [],
      reputation: data.reputation || 0,
      contributionCount: data.contributionCount || 0,
      queryCount: data.queryCount || 0,
      joinedAt: data.createdAt || new Date().toISOString(),
    };
  }

  // ── Messaging ──

  /** Send a message to a peer. */
  async sendMessage(toAgentId: string, content: Record<string, unknown>): Promise<boolean> {
    if (!this.agentId) return false;
    return this.postOk('/agents/message', {
      from: this.agentId,
      to: toAgentId,
      content: JSON.stringify(content),
      metadata: { type: 'holomesh-gossip' },
    });
  }

  /** Read inbox. */
  async readInbox(): Promise<any[]> {
    if (!this.agentId) return [];
    const data = await this.get(`/agents/${this.agentId}/inbox`);
    return Array.isArray(data) ? data : data?.messages || data?.inbox || [];
  }

  /** Subscribe to a topic. */
  async subscribe(topic: string): Promise<boolean> {
    if (!this.agentId) return false;
    return this.postOk(`/agents/${this.agentId}/subscribe`, { topic });
  }

  /** Broadcast to all agents. */
  async broadcast(content: Record<string, unknown>): Promise<boolean> {
    if (!this.agentId) return false;
    return this.postOk('/agents/broadcast', {
      from: this.agentId,
      content: JSON.stringify(content),
      metadata: { type: 'holomesh-gossip' },
    });
  }

  // ── Knowledge Exchange ──

  /** Contribute knowledge entries to the orchestrator store. */
  async contributeKnowledge(entries: MeshKnowledgeEntry[]): Promise<number> {
    const orchEntries = entries.map((e) => ({
      id: e.id,
      workspace_id: e.workspaceId,
      type: e.type,
      content: e.content,
      metadata: {
        provenanceHash: e.provenanceHash,
        authorId: e.authorId,
        authorName: e.authorName,
        price: e.price,
        domain: e.domain,
        confidence: e.confidence,
        source: 'holomesh',
      },
      tags: e.tags,
    }));

    // Use the entry-level workspace if all entries share one (e.g. private vault),
    // otherwise fall back to the global workspace configured for this orchestrator.
    const entryWs = orchEntries[0]?.workspace_id;
    const allSameWs = entryWs && orchEntries.every((e) => e.workspace_id === entryWs);
    const syncWorkspace = allSameWs ? entryWs : this.config.workspace;

    const res = await this.post('/knowledge/sync', {
      workspace_id: syncWorkspace,
      entries: orchEntries,
    });

    return res?.synced || res?.count || entries.length;
  }

  /** Query knowledge across workspaces (cross-agent discovery). */
  async queryKnowledge(
    search: string,
    opts?: {
      type?: string;
      limit?: number;
      workspaceId?: string;
    }
  ): Promise<MeshKnowledgeEntry[]> {
    const body: Record<string, unknown> = {
      search,
      limit: opts?.limit || 10,
    };
    if (opts?.type) body.type = opts.type;
    if (opts?.workspaceId) body.workspace_id = opts.workspaceId;
    // Omit workspace_id for cross-workspace search

    const data = await this.post('/knowledge/query', body);
    const results: any[] = data?.results || data?.entries || [];

    return results.map(
      (r: any): MeshKnowledgeEntry => ({
        id: r.id,
        workspaceId: r.workspace_id || '',
        type: r.type || 'wisdom',
        content: r.content || '',
        provenanceHash: r.metadata?.provenanceHash || this.hashContent(r.content || ''),
        authorId: r.metadata?.authorId || '',
        authorName: r.metadata?.authorName || 'unknown',
        price: r.metadata?.price || 0,
        queryCount: r.metadata?.queryCount || 0,
        reuseCount: r.metadata?.reuseCount || 0,
        domain: r.metadata?.domain,
        tags: r.tags || [],
        confidence: r.metadata?.confidence,
        createdAt: r.created_at || new Date().toISOString(),
      })
    );
  }

  /** Get knowledge stats for reputation calculation. */
  async getAgentReputation(agentId: string, agentName: string): Promise<AgentReputation> {
    // Query contributions by this agent
    const contributions = await this.queryKnowledge(agentName, { limit: 100 });
    const ownContributions = contributions.filter((e) => e.authorId === agentId);

    const totalContributions = ownContributions.length;
    const queriesAnswered = ownContributions.reduce((sum, e) => sum + e.queryCount, 0);
    const totalReuse = ownContributions.reduce((sum, e) => sum + e.reuseCount, 0);
    const reuseRate = totalContributions > 0 ? totalReuse / totalContributions : 0;

    const score = computeReputation(totalContributions, queriesAnswered, reuseRate);

    return {
      agentId,
      agentName,
      contributions: totalContributions,
      queriesAnswered,
      reuseRate,
      score,
      tier: resolveReputationTier(score),
    };
  }

  // ── Helpers ──

  getAgentId(): string | null {
    return this.agentId;
  }
  setAgentId(id: string): void {
    this.agentId = id;
  }

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async get(path: string): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private async post(path: string, body: Record<string, unknown>): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private async postOk(path: string, body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
