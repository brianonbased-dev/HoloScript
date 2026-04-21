import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetHologramSendRateForTests,
  assertRecipientOnTeam,
  fetchTeamMemberIds,
  publishHologramTeamFeed,
  resolveHolomeshApiBase,
  sendHologramTeamMessage,
} from '../hologram-holomesh-send';

describe('hologram-holomesh-send', () => {
  const prevFetch = globalThis.fetch;
  const prevServerUrl = process.env.HOLOSCRIPT_SERVER_URL;
  const prevMeshBase = process.env.HOLOMESH_API_BASE_URL;

  beforeEach(() => {
    __resetHologramSendRateForTests();
    delete process.env.HOLOMESH_API_BASE_URL;
    process.env.HOLOSCRIPT_SERVER_URL = 'https://example-holomesh.test';
  });

  afterEach(() => {
    globalThis.fetch = prevFetch;
    if (prevServerUrl === undefined) delete process.env.HOLOSCRIPT_SERVER_URL;
    else process.env.HOLOSCRIPT_SERVER_URL = prevServerUrl;
    if (prevMeshBase === undefined) delete process.env.HOLOMESH_API_BASE_URL;
    else process.env.HOLOMESH_API_BASE_URL = prevMeshBase;
  });

  it('resolveHolomeshApiBase uses server URL + /api/holomesh', () => {
    expect(resolveHolomeshApiBase()).toBe('https://example-holomesh.test/api/holomesh');
  });

  it('resolveHolomeshApiBase respects HOLOMESH_API_BASE_URL', () => {
    process.env.HOLOMESH_API_BASE_URL = 'https://custom/api/holomesh/';
    expect(resolveHolomeshApiBase()).toBe('https://custom/api/holomesh');
  });

  it('assertRecipientOnTeam rejects non-members', () => {
    expect(() =>
      assertRecipientOnTeam([{ agentId: 'a1' }], 'ghost'),
    ).toThrow('not a member');
  });

  it('sendHologramTeamMessage posts hologram payload', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const u = String(url);
      if (u.endsWith('/team/t1')) {
        return new Response(
          JSON.stringify({ team: { members: [{ agentId: 'peer1', agentName: 'Peer' }] } }),
          { status: 200 },
        );
      }
      if (u.endsWith('/team/t1/message')) {
        return new Response(JSON.stringify({ success: true, message: { id: 'm1' } }), { status: 201 });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const out = await sendHologramTeamMessage({
      teamId: 't1',
      apiKey: 'k1',
      hash: 'deadbeef',
      shareUrl: 'https://studio.example/h/x',
      recipientAgentId: 'peer1',
      note: 'look',
    });

    expect((out as { success?: boolean }).success).toBe(true);
    expect(calls.length).toBe(2);
    const post = calls[1];
    expect(post.init?.method).toBe('POST');
    const body = JSON.parse((post.init?.body as string) ?? '{}');
    expect(body.messageType).toBe('hologram');
    const inner = JSON.parse(body.content);
    expect(inner.kind).toBe('hologram');
    expect(inner.hash).toBe('deadbeef');
    expect(inner.recipientAgentId).toBe('peer1');
  });

  it('rate limits repeated sends per API key', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith('/team/t1')) {
        return new Response(
          JSON.stringify({ team: { members: [{ agentId: 'peer1' }] } }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 201 });
    }) as typeof fetch;

    for (let i = 0; i < 20; i++) {
      await sendHologramTeamMessage({
        teamId: 't1',
        apiKey: 'same-key',
        hash: `h${i}`,
        shareUrl: 'https://x/u',
        recipientAgentId: 'peer1',
      });
    }
    await expect(
      sendHologramTeamMessage({
        teamId: 't1',
        apiKey: 'same-key',
        hash: 'overflow',
        shareUrl: 'https://x/u',
        recipientAgentId: 'peer1',
      }),
    ).rejects.toThrow('rate limited');
  });

  it('publishHologramTeamFeed POSTs to team feed', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const u = String(url);
      if (u.includes('/team/t1/feed')) {
        return new Response(JSON.stringify({ success: true, item: { id: 'f1' } }), { status: 201 });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const out = await publishHologramTeamFeed({
      teamId: 't1',
      apiKey: 'k1',
      hash: 'deadbeef',
      shareUrl: 'https://studio.holoscript.net/g/deadbeef',
    });

    expect((out as { success?: boolean }).success).toBe(true);
    expect(calls.length).toBe(1);
    const body = JSON.parse((calls[0].init?.body as string) ?? '{}');
    expect(body.kind).toBe('hologram');
    expect(body.hash).toBe('deadbeef');
  });

  it('fetchTeamMemberIds throws on HTTP error', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: 'nope' }), { status: 403 }),
    ) as typeof fetch;
    await expect(fetchTeamMemberIds('t1', 'k')).rejects.toThrow('nope');
  });
});
