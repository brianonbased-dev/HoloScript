import type { BoardTask } from './types.js';
import type { CaelAuditRecord } from './cael-builder.js';

export interface HolomeshClientOptions {
  apiBase: string;
  bearer: string;
  teamId: string;
  fetchImpl?: typeof fetch;
}

export class HolomeshClient {
  private readonly apiBase: string;
  private readonly bearer: string;
  private readonly teamId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HolomeshClientOptions) {
    this.apiBase = opts.apiBase.replace(/\/$/, '');
    this.bearer = opts.bearer;
    this.teamId = opts.teamId;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async heartbeat(payload: { agentName: string; surface: string }): Promise<void> {
    await this.req('POST', `/team/${this.teamId}/presence`, payload);
  }

  async getOpenTasks(): Promise<BoardTask[]> {
    const data = await this.req<{ tasks?: BoardTask[]; open?: BoardTask[] }>(
      'GET',
      `/team/${this.teamId}/board`
    );
    return data.tasks ?? data.open ?? [];
  }

  async claim(taskId: string): Promise<BoardTask> {
    return this.req<BoardTask>('PATCH', `/team/${this.teamId}/board/${taskId}`, { action: 'claim' });
  }

  async joinTeam(): Promise<{ success: boolean; role?: string; members?: number }> {
    return this.req<{ success: boolean; role?: string; members?: number }>(
      'POST',
      `/team/${this.teamId}/join`,
      {}
    );
  }

  async sendMessageOnTask(taskId: string, body: string): Promise<void> {
    await this.req('POST', `/team/${this.teamId}/message`, {
      to: 'team',
      subject: `task:${taskId}`,
      content: body,
    });
  }

  async markDone(taskId: string, summary: string, commitHash?: string): Promise<void> {
    await this.req('PATCH', `/team/${this.teamId}/board/${taskId}`, {
      action: 'done',
      summary,
      commitHash,
    });
  }

  // POST CAEL audit records for this agent. Server validator at
  // packages/mcp-server/src/holomesh/routes/core-routes.ts:472-533 requires
  // bearer == handle owner OR founder; the per-surface x402 bearer is the
  // handle owner so this resolves correctly. Records that fail shape
  // validation (layer_hashes != 7 elements, missing tick_iso/operation/
  // fnv1a_chain) are silently dropped server-side, not rejected as a batch.
  async postAuditRecords(handle: string, records: CaelAuditRecord[]): Promise<{ appended: number; rejected: number }> {
    return this.req<{ appended: number; rejected: number }>(
      'POST',
      `/agent/${encodeURIComponent(handle)}/audit`,
      { records }
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

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.apiBase}${path}`;
    // HoloMesh REST auth resolver (packages/mcp-server/src/holomesh/auth-utils.ts
    // resolveRequestingAgent) only inspects `Authorization: Bearer <token>`.
    // It does NOT read `x-mcp-api-key` (that header is the orchestrator-side
    // convention used by mcp-orchestrator-production-45f9.up.railway.app). Sending
    // the bearer under x-mcp-api-key produces HTTP 401 even with a valid per-surface
    // x402 seat key — see W.087 vertex B audit (task_1777073751812_jqye, 2026-04-24).
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
