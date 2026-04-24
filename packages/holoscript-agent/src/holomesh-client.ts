import type { BoardTask } from './types.js';

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
    return this.req<BoardTask>('PATCH', `/team/${this.teamId}/board/${taskId}/claim`, {});
  }

  async sendMessageOnTask(taskId: string, body: string): Promise<void> {
    await this.req('POST', `/team/${this.teamId}/message`, {
      to: 'team',
      subject: `task:${taskId}`,
      body,
    });
  }

  async markDone(taskId: string, summary: string, commitHash?: string): Promise<void> {
    await this.req('PATCH', `/team/${this.teamId}/board/${taskId}`, {
      status: 'done',
      summary,
      commitHash,
    });
  }

  async whoAmI(): Promise<{ agentId: string; surface: string; wallet?: string }> {
    return this.req<{ agentId: string; surface: string; wallet?: string }>('GET', '/me');
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.apiBase}${path}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        'x-mcp-api-key': this.bearer,
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
