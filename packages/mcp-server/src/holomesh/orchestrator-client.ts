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
import { computeReputation, resolveReputationTier, DEFAULT_MESH_CONFIG } from './types';

/**
 * What the orchestrator did with a knowledge write (task_1790081256205_w6ui).
 * `synced` is the count it accepted (0 on a refusal or when it could not be
 * reached, never more than was sent); `accepted` is true only when it accepted
 * everything sent; `reason` says why not, in a fixed vocabulary that never
 * carries the orchestrator's own text or a transport error's message (both can
 * hold tokens, hosts, paths or credentials): 'refused (HTTP 403)',
 * 'unreachable (ECONNREFUSED)', 'unreachable (TIMEOUT)', 'HTTP 200 without a
 * JSON body', 'accepted 1 of 3'.
 */
export interface KnowledgeSyncOutcome {
  synced: number;
  accepted: boolean;
  status: number | null;
  reason: string | null;
}

/** A POST to the orchestrator that has not finished in this long counts as unreachable. */
function orchestratorPostTimeoutMs(): number {
  const configured = Number(process.env.HOLOMESH_ORCHESTRATOR_POST_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 15_000;
}

/** The most of a knowledge-write answer that is read; the count is in the first bytes. */
const DETAILED_ANSWER_CAP_BYTES = 64 * 1024;

/**
 * A transport failure, named by its code (ECONNREFUSED, ENOTFOUND, UND_ERR_SOCKET,
 * ...) or TIMEOUT, never by its message: Node's fetch throws TypeError('fetch
 * failed') with the code on `cause`, and a message can name the host, the path,
 * or credentials written into MCP_ORCHESTRATOR_URL (claude3's review of #319).
 */
function transportFailure(error: unknown): string {
  const e = error as { name?: unknown; code?: unknown; cause?: { code?: unknown; name?: unknown } } | null;
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || e?.cause?.name === 'TimeoutError') {
    return 'unreachable (TIMEOUT)';
  }
  for (const code of [e?.cause?.code, e?.code]) {
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,32}$/.test(code)) return `unreachable (${code})`;
  }
  return 'unreachable';
}

/** Stop reading a body nobody will use (a refusal's text never leaves this server). */
async function discardBody(res: Response): Promise<void> {
  try {
    await (res.body as { cancel?: () => Promise<void> } | null | undefined)?.cancel?.();
  } catch {
    /* already closed */
  }
}

/**
 * Read a successful answer as JSON, at most `cap` bytes of it. Returns
 * undefined when it is not JSON (an HTML login page, an empty body, or an
 * answer cut at the cap).
 */
async function readJsonAnswer(res: Response, cap: number): Promise<unknown> {
  const stream = res.body as ReadableStream<Uint8Array> | null | undefined;
  let text: string | undefined;
  if (stream && typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      size += value.byteLength;
      if (size > cap) {
        await reader.cancel().catch(() => undefined);
        return undefined;
      }
    }
    text = Buffer.concat(chunks).toString('utf8');
  } else if (typeof res.text === 'function') {
    text = (await res.text()).slice(0, cap);
  } else if (typeof (res as { json?: unknown }).json === 'function') {
    try {
      return await (res as { json: () => Promise<unknown> }).json();
    } catch {
      return undefined;
    }
  }
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
import { normalizePeerEndpointUrl, resolvePeerEndpoint } from './discovery';
import * as crypto from 'crypto';

let clientInstance: HoloMeshOrchestratorClient | null = null;

/**
 * Singleton accessor for the HoloMesh Orchestrator Client.
 */
export function getClient(): HoloMeshOrchestratorClient {
  if (!clientInstance) {
    const config: MeshConfig = {
      ...DEFAULT_MESH_CONFIG,
      apiKey: process.env.HOLOMESH_API_KEY || '',
    } as any;
    clientInstance = new HoloMeshOrchestratorClient(config);
  }
  return clientInstance;
}

export interface WalletAuth {
  did: string;
  address: string;
  signature: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function configuredMcpBaseUrl(): string {
  const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : undefined;
  return (
    normalizePeerEndpointUrl(
      process.env.MCP_LOCAL_URL ||
        railwayUrl ||
        process.env.HOLOSCRIPT_SERVER_URL ||
        process.env.HOLOSCRIPT_MCP_URL ||
        `http://localhost:${process.env.PORT || '3000'}`
    ) || `http://localhost:${process.env.PORT || '3000'}`
  );
}

export class HoloMeshOrchestratorClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private agentId: string | null = null;

  constructor(private readonly config: MeshConfig) {
    this.baseUrl = config.orchestratorUrl.replace(/\/$/, '');
    this.headers = {
      'x-mcp-api-key': config.apiKey,
      'Content-Type': 'application/json; charset=utf-8',
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
    const mcpEndpoint = configuredMcpBaseUrl();
    const res = await this.post('/agents/register', {
      id,
      name: this.config.agentName,
      role: 'holomesh-agent',
      capabilities: traits,
      workspace: this.config.workspace,
      mcpEndpoint,
      mcp_endpoint: mcpEndpoint,
      metadata: {
        type: 'holomesh',
        version: walletAuth ? '4.0' : '1.0',
        did: walletAuth?.did || id,
        mcpEndpoint,
        mcp_endpoint: mcpEndpoint,
        mcpBaseUrl: mcpEndpoint,
        mcp_base_url: mcpEndpoint,
        agentCardUrl: `${mcpEndpoint}/.well-known/agent-card.json`,
        crdtGossipUrl: `${mcpEndpoint}/.well-known/crdt-gossip`,
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
        const metadata = isRecord(a.metadata) ? a.metadata : {};
        const caps: string[] = [
          ...asStringArray(a.capabilities),
          ...asStringArray(a.traits),
          ...asStringArray(metadata.capabilities),
          ...asStringArray(metadata.traits),
        ];
        return opts.traits!.some((t) => caps.includes(t));
      })
      .map((a: any): HoloMeshAgentCard => {
        const metadata = isRecord(a.metadata) ? a.metadata : {};
        const endpoint = resolvePeerEndpoint(a);
        const did = asString(a.did) || asString(metadata.did) || a.id;
        const traits = [
          ...asStringArray(a.capabilities),
          ...asStringArray(a.traits),
          ...asStringArray(metadata.capabilities),
          ...asStringArray(metadata.traits),
        ];
        return {
          id: a.id,
          name: a.name || a.id,
          did,
          mcpEndpoint: endpoint || undefined,
          mcpBaseUrl: endpoint || undefined,
          endpoint: asString(a.endpoint) || asString(metadata.endpoint),
          url: asString(a.url) || asString(metadata.url),
          metadata,
          workspace: a.workspace || this.config.workspace,
          traits,
          reputation: a.metadata?.reputation || 0,
          contributionCount: a.metadata?.contributionCount || 0,
          queryCount: a.metadata?.queryCount || 0,
          joinedAt: a.createdAt || a.created_at || new Date().toISOString(),
        };
      });
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
  async contributeKnowledgeDetailed(entries: MeshKnowledgeEntry[]): Promise<KnowledgeSyncOutcome> {
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

    const res = await this.postDetailed('/knowledge/sync', {
      workspace_id: syncWorkspace,
      entries: orchEntries,
    });

    if (!res.ok) return { synced: 0, accepted: false, status: res.status, reason: res.failure };
    // A 2xx is not acceptance by itself: an HTML login page, an empty body or a
    // redirect to a login page all answer 200 (claude3's review of #319).
    if (!isRecord(res.answer)) {
      return {
        synced: 0,
        accepted: false,
        status: res.status,
        reason: `HTTP ${res.status ?? 'unknown'} without a JSON body`,
      };
    }
    const sent = entries.length;
    const counted = Number(res.answer.synced ?? res.answer.count);
    // A JSON answer that names no count accepted the batch as sent; a count comes from
    // another service, so it is clamped to what was sent.
    const synced = Number.isFinite(counted) ? Math.min(sent, Math.max(0, Math.trunc(counted))) : sent;
    const accepted = synced === sent;
    return {
      synced,
      accepted,
      status: res.status,
      reason: accepted ? null : `accepted ${synced} of ${sent}`,
    };
  }

  /**
   * The orchestrator's accepted count: 0 when it refused or could not be
   * reached, never the caller's own count. (task_1790081256205_w6ui: a refusal
   * came back as null, the same shape as a network failure, and the old
   * fallback to entries.length reported refused writes as synced.)
   */
  async contributeKnowledge(entries: MeshKnowledgeEntry[]): Promise<number> {
    return (await this.contributeKnowledgeDetailed(entries)).synced;
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

    return results.map((r: any): MeshKnowledgeEntry => {
      const metadata = isRecord(r.metadata) ? r.metadata : undefined;
      return {
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
        metadata,
      };
    });
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

  /**
   * POST and say what happened. A refusal (any non-2xx) used to come back as
   * null, the same shape as a network failure, so a caller could not tell
   * "refused" from "unreachable". The status, the parsed answer of a 2xx, and a
   * failure named in a fixed vocabulary are what a caller needs; a refusal's
   * body is never read, so its text cannot travel on (claude3's review of #319).
   * The whole exchange, body included, is bounded by a timeout.
   */
  private async postDetailed(
    path: string,
    body: Record<string, unknown>
  ): Promise<{ ok: boolean; status: number | null; answer: unknown; failure: string | null }> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(orchestratorPostTimeoutMs()),
      });
    } catch (error) {
      return { ok: false, status: null, answer: undefined, failure: transportFailure(error) };
    }
    const status = typeof res.status === 'number' ? res.status : null;
    if (!res.ok) {
      await discardBody(res);
      return { ok: false, status, answer: undefined, failure: `refused (HTTP ${status ?? 'unknown'})` };
    }
    try {
      return { ok: true, status, answer: await readJsonAnswer(res, DETAILED_ANSWER_CAP_BYTES), failure: null };
    } catch (error) {
      // The answer's body stalled or broke after the headers: no answer arrived, so
      // this is unreachable, not a status the orchestrator chose (status null).
      return { ok: false, status: null, answer: undefined, failure: transportFailure(error) };
    }
  }

  /** POST for callers that only need the answer: null on any failure, as it always was. */
  private async post(path: string, body: Record<string, unknown>): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(orchestratorPostTimeoutMs()),
      });
      if (!res.ok) {
        await discardBody(res);
        return null;
      }
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
