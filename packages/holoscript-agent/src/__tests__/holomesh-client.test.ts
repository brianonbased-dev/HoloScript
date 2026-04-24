import { describe, it, expect, vi } from 'vitest';
import { HolomeshClient, pickClaimableTask } from '../holomesh-client.js';
import type { BoardTask } from '../types.js';

describe('pickClaimableTask', () => {
  const tasks: BoardTask[] = [
    { id: 't1', title: 'unrelated UI tweak', description: '', priority: 'low', tags: ['ui', 'cosmetic'], status: 'open' },
    { id: 't2', title: 'cross-paper threat-model memo', description: 'security G10', priority: 'high', tags: ['security', 'paper-21', 'gap-G10'], status: 'open' },
    { id: 't3', title: 'closed task', description: '', priority: 'high', tags: ['security'], status: 'done' },
    { id: 't4', title: 'already-claimed by someone', description: '', priority: 'high', tags: ['security'], status: 'open', claimedBy: 'someone-else' },
    { id: 't5', title: 'Sybil attack spec', description: 'adversarial', priority: 'medium', tags: ['adversarial-evaluation'], status: 'open' },
  ];

  it('selects the highest-scoring open unclaimed task whose tags match the brain', () => {
    const picked = pickClaimableTask(tasks, ['security', 'paper-21', 'threat-model']);
    expect(picked?.id).toBe('t2');
  });

  it('falls through to text-match when tag overlap is empty', () => {
    const picked = pickClaimableTask(tasks, ['adversarial-evaluation']);
    expect(picked?.id).toBe('t5');
  });

  it('returns undefined when nothing matches (so runner can heartbeat-only)', () => {
    expect(pickClaimableTask(tasks, ['ml-systems', 'graphics'])).toBeUndefined();
  });

  it('skips done and already-claimed tasks even on perfect tag match', () => {
    const onlyClaimedOrDone = tasks.filter((t) => t.status === 'done' || t.claimedBy);
    expect(pickClaimableTask(onlyClaimedOrDone, ['security'])).toBeUndefined();
  });
});

describe('HolomeshClient', () => {
  it('sends bearer + content-type on every request and parses JSON', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = new HolomeshClient({
      apiBase: 'https://mcp.holoscript.net/api/holomesh',
      bearer: 'fake-bearer',
      teamId: 'team_test',
      fetchImpl,
    });
    await client.getOpenTasks();

    expect(calls).toHaveLength(1);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-mcp-api-key']).toBe('fake-bearer');
    expect(calls[0].url).toContain('/team/team_test/board');
  });

  it('throws with status + truncated body on non-2xx (W.085 silent-failure prevention)', async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response('forbidden: bad bearer', { status: 403 })) as unknown as typeof fetch;
    const client = new HolomeshClient({
      apiBase: 'https://x',
      bearer: 'b',
      teamId: 't',
      fetchImpl,
    });
    await expect(client.getOpenTasks()).rejects.toThrow(/403/);
  });
});
