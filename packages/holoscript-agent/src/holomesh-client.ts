import type { BoardTask } from './types.js';
import type { CaelAuditRecord } from './cael-builder.js';

/** Wraps a request body in a signed envelope for strict-mode endpoints (e.g. /team/:id/join). */
export type RequestSigner = (
  body: Record<string, unknown>
) => Promise<Record<string, unknown>>;

export interface HolomeshClientOptions {
  apiBase: string;
  bearer: string;
  teamId: string;
  fetchImpl?: typeof fetch;
  /** EIP-191 signing function. When present, used on strict endpoints like joinTeam(). */
  signer?: RequestSigner;
}

export interface TeamMessage {
  id: string;
  fromAgentId: string;
  fromAgentName: string;
  content: string;
  messageType: string;
  createdAt: string;
}

/** Minimal knowledge-entry shape returned by the mesh knowledge endpoints. */
export interface KnowledgeEntry {
  id: string;
  content: string;
  domain?: string;
  type?: string;
  createdAt?: string;
}

export class HolomeshClient {
  private readonly apiBase: string;
  private readonly bearer: string;
  private readonly teamId: string;
  private readonly fetchImpl: typeof fetch;
  private readonly signer?: RequestSigner;

  constructor(opts: HolomeshClientOptions) {
    this.apiBase = opts.apiBase.replace(/\/$/, '');
    this.bearer = opts.bearer;
    this.teamId = opts.teamId;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.signer = opts.signer;
  }

  /** Wrap body in a signed envelope when a signer is available (strict-mode endpoints). */
  private async signBody(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.signer ? await this.signer(body) : body;
  }

  async heartbeat(payload: { agentName: string; surface: string }): Promise<void> {
    await this.req('POST', `/team/${this.teamId}/presence`, await this.signBody(payload as Record<string, unknown>));
  }

  async getOpenTasks(): Promise<BoardTask[]> {
    const data = await this.req<{ tasks?: BoardTask[]; open?: BoardTask[] }>(
      'GET',
      `/team/${this.teamId}/board`
    );
    return data.tasks ?? data.open ?? [];
  }

  async claim(taskId: string): Promise<BoardTask> {
    return this.req<BoardTask>('PATCH', `/team/${this.teamId}/board/${taskId}`, await this.signBody({ action: 'claim' }));
  }

  async joinTeam(): Promise<{ success: boolean; role?: string; members?: number }> {
    return this.req<{ success: boolean; role?: string; members?: number }>(
      'POST',
      `/team/${this.teamId}/join`,
      await this.signBody({})
    );
  }

  async sendMessageOnTask(taskId: string, body: string): Promise<void> {
    await this.req('POST', `/team/${this.teamId}/message`, await this.signBody({
      to: 'team',
      subject: `task:${taskId}`,
      content: body,
    }));
  }

  async markDone(taskId: string, summary: string, commitHash?: string): Promise<void> {
    await this.req('PATCH', `/team/${this.teamId}/board/${taskId}`, await this.signBody({
      action: 'done',
      summary,
      // verification_evidence required by server before task can be closed.
      verification_evidence: summary,
      // Exclude commitHash when undefined — JSON.stringify drops undefined but
      // canonicalizeSigning preserves it as the literal string "undefined",
      // causing a signature-mismatch vs what the server sees after JSON.parse.
      ...(commitHash !== undefined ? { commitHash } : {}),
    }));
  }

  // POST CAEL audit records for this agent. Server validator at
  // packages/mcp-server/src/holomesh/routes/core-routes.ts:472-533 requires
  // bearer == handle owner OR founder; the per-surface x402 bearer is the
  // handle owner so this resolves correctly. Records that fail shape
  // validation (layer_hashes != 7 elements, missing tick_iso/operation/
  // fnv1a_chain) are silently dropped server-side, not rejected as a batch.
  async postAuditRecords(
    handle: string,
    records: CaelAuditRecord[]
  ): Promise<{ appended: number; rejected: number }> {
    // Audit endpoint uses bearer-only auth — no signed envelope wrapper.
    return this.req<{ appended: number; rejected: number }>(
      'POST',
      `/agent/${encodeURIComponent(handle)}/audit`,
      { records } as unknown as Record<string, unknown>
    );
  }

  async whoAmI(): Promise<{ agentId: string; surface: string; wallet?: string }> {
    // GET /api/holomesh/me returns { agentId, name, wallet, isFounder, teamId, teams, permissions }
    // (see packages/mcp-server/src/holomesh/routes/core-routes.ts §/me handler).
    // It does NOT return a `surface` field — derive it from the seat name on the
    // client side. Seat naming convention (set by the provisioning admin path):
    //   claudecode-claude-x402  → claude-code
    //   cursor-claude-x402      → claude-cursor
    //   gemini-antigravity      → gemini-antigravity
    //   copilot-vscode          → copilot-vscode
    //   Founder                 → unknown (shared key, no surface attribution)
    const raw = await this.req<{
      agentId: string;
      name?: string;
      wallet?: string;
    }>('GET', '/me');
    return {
      agentId: raw.agentId,
      surface: deriveSurface(raw.name),
      wallet: raw.wallet,
    };
  }

  // ── Team Message Surface (E4 delegated-authority protocol) ───────────────────

  /** Read recent team messages. */
  async getTeamMessages(limit = 20): Promise<TeamMessage[]> {
    const data = await this.req<{ messages?: TeamMessage[]; success?: boolean }>(
      'GET',
      `/team/${this.teamId}/messages?limit=${limit}`
    );
    return data.messages ?? [];
  }

  /** Post a message to the team feed. */
  async sendTeamMessage(content: string, messageType = 'text'): Promise<void> {
    await this.req('POST', `/team/${this.teamId}/message`, await this.signBody({ content, type: messageType }));
  }

  // ── Owner-op API wrappers (E4) ─────────────────────────────────────────────

  /** Switch team mode. Requires owner or founder role. */
  async setTeamMode(mode: string, reason?: string): Promise<{ mode: string; unchanged?: boolean }> {
    return this.req('POST', `/team/${this.teamId}/mode`, await this.signBody({ mode, reason } as Record<string, unknown>));
  }

  /** Update room preferences. Requires config:write permission. */
  async patchRoomPrefs(prefs: { communicationStyle?: string; objective?: string }): Promise<{
    communicationStyle: string;
    objective: string;
  }> {
    return this.req('PATCH', `/team/${this.teamId}/room`, await this.signBody(prefs as Record<string, unknown>));
  }

  /** Update a board task. */
  async updateTask(
    taskId: string,
    updates: {
      title?: string;
      description?: string;
      priority?: number;
      tags?: string[];
    }
  ): Promise<unknown> {
    return this.req('PATCH', `/team/${this.teamId}/board/${taskId}`, await this.signBody({ action: 'update', ...updates } as Record<string, unknown>));
  }

  /** Delete a board task. */
  async deleteTask(taskId: string): Promise<unknown> {
    return this.req('PATCH', `/team/${this.teamId}/board/${taskId}`, await this.signBody({ action: 'delete' }));
  }

  /** Delegate a board task to another agent. */
  async delegateTask(taskId: string, toAgentId: string): Promise<unknown> {
    return this.req('PATCH', `/team/${this.teamId}/board/${taskId}`, await this.signBody({ action: 'delegate', toAgentId }));
  }

  // ── Cognitive-verb knowledge surface (Phase 2.2 — recall / rag_query) ────────

  /**
   * Query the TEAM knowledge base (the `rag_query` cognitive verb). Bearer-only
   * GET; `q` is the server-side search filter. Returns [] on any failure so a
   * retrieval miss never breaks a tick.
   */
  async queryTeamKnowledge(query: string, limit = 5): Promise<KnowledgeEntry[]> {
    const qs = new URLSearchParams({ q: query, limit: String(limit) }).toString();
    try {
      const data = await this.req<{ entries?: KnowledgeEntry[] }>(
        'GET',
        `/team/${this.teamId}/knowledge?${qs}`
      );
      return data.entries ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Query this agent's PRIVATE workspace knowledge (the `recall` cognitive verb).
   * The endpoint has no server-side search param, so the caller filters by query
   * client-side. Returns [] on any failure.
   */
  async queryPrivateKnowledge(): Promise<KnowledgeEntry[]> {
    try {
      const data = await this.req<{ entries?: KnowledgeEntry[] }>('GET', `/knowledge/private`);
      return data.entries ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Persist facts to this agent's PRIVATE workspace — the WRITE side of `recall`
   * (POST /knowledge/private). The server stamps id / workspaceId (`private:<wallet>`)
   * / author / timestamps; the caller supplies `content` (+ optional type/tags/title).
   * This is what gives `recall` something to recall: without it the private store
   * stays empty and every `recall` returns [] (the W.752 loop-gap). Best-effort —
   * returns false on any failure so a write miss never breaks a tick (the task is
   * already done by the time this runs).
   */
  async writePrivateKnowledge(
    entries: Array<{ content: string; type?: string; tags?: string[]; title?: string }>
  ): Promise<boolean> {
    if (!entries.length) return false;
    try {
      await this.req('POST', `/knowledge/private`, { entries });
      return true;
    } catch {
      return false;
    }
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.apiBase}${path}`;
    // HoloMesh REST auth: server (packages/mcp-server/src/holomesh/auth-utils.ts
    // resolveRequestingAgent) accepts EITHER `Authorization: Bearer <token>`
    // (HTTP-standard, used here) OR `x-mcp-api-key: <token>` (orchestrator
    // convention). Both resolve through the same key-registry / agent-store /
    // env-fallback chain. Bearer is preferred for new code (W.087 vertex B,
    // task_1777073616424_klls).
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.bearer}`,
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HoloMesh ${method} ${path} ${res.status}: ${txt.slice(0, 300)}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

/**
 * Derive a surface tag from a seat name returned by /me. Mirrors the surface
 * detection in scripts/probe-surface-bearers.mjs and hooks/lib/holomesh-env.mjs
 * so a single agent's surface attribution is consistent across read and write
 * paths. Returns 'unknown' when the seat name doesn't encode a surface
 * (e.g. shared-key resolution to "Founder").
 */
export function deriveSurface(seatName: string | undefined): string {
  if (!seatName) return 'unknown';
  const n = seatName.toLowerCase();
  if (n.startsWith('claudecode')) return 'claude-code';
  if (n.startsWith('cursor')) return 'claude-cursor';
  if (n.startsWith('claudedesktop')) return 'claude-desktop';
  if (n.startsWith('vscode-claude') || n.startsWith('claude-vscode')) return 'claude-vscode';
  if (n.startsWith('gemini')) return 'gemini-antigravity';
  if (n.startsWith('copilot')) return 'copilot-vscode';
  return 'unknown';
}

export function pickClaimableTask(
  tasks: BoardTask[],
  brainCapabilityTags: string[]
): BoardTask | undefined {
  const wanted = new Set(brainCapabilityTags.map((t) => t.toLowerCase()));
  const open = tasks.filter((t) => t.status === 'open' && !t.claimedBy);
  const scored = open
    .map((t) => ({ task: t, score: scoreTask(t, wanted) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || priority(a.task) - priority(b.task));
  return scored[0]?.task;
}

function scoreTask(task: BoardTask, wanted: Set<string>): number {
  const tags = (task.tags ?? []).map((t) => t.toLowerCase());
  const text = `${task.title} ${task.description ?? ''}`.toLowerCase();
  let score = 0;
  for (const tag of tags) if (wanted.has(tag)) score += 2;
  for (const w of wanted) if (text.includes(w)) score += 1;
  return score;
}

function priority(t: BoardTask): number {
  if (typeof t.priority === 'number') return t.priority;
  const map: Record<string, number> = { critical: 1, high: 2, medium: 4, low: 6 };
  return map[String(t.priority).toLowerCase()] ?? 5;
}
