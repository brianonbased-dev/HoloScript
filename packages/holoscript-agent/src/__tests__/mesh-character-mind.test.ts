/**
 * MeshCharacterMind — the live D.102 portable-mind binding over the wallet-scoped private store.
 *
 * Asserts: identity() maps seat wallet+handle; loadMemory maps the private store's entries,
 * filters by query client-side, and caps by limit; loadMemory degrades to [] when the store
 * fails (so the embodied body stays mind-less, never throws through bindMind); rememberOutcome
 * writes content best-effort and swallows failure. Pure data, no network — a fake store stands in
 * for HolomeshClient.
 */
import { describe, it, expect, vi } from 'vitest';
import { MeshCharacterMind, type PrivateMemoryStore } from '../mesh-character-mind';
import type { AgentIdentity } from '../types';
import type { KnowledgeEntry } from '../holomesh-client';

const seat = (over: Partial<AgentIdentity> = {}): AgentIdentity => ({
  handle: 'brittney',
  surface: 'jetson',
  wallet: '0xWALLET',
  x402Bearer: 'b',
  llmProvider: 'mock',
  llmModel: 'm',
  brainPath: '/b',
  budgetUsdPerDay: 5,
  teamId: 't',
  meshApiBase: 'http://x',
  ...over,
});

const store = (entries: KnowledgeEntry[], opts: { failRead?: boolean } = {}): PrivateMemoryStore & {
  writes: Array<{ content: string }>;
} => {
  const writes: Array<{ content: string }> = [];
  return {
    writes,
    queryPrivateKnowledge: async () => {
      if (opts.failRead) throw new Error('store unreachable');
      return entries;
    },
    writePrivateKnowledge: async (e) => {
      writes.push(...e.map((x) => ({ content: x.content })));
      return true;
    },
  };
};

const mem = (content: string, id?: string): KnowledgeEntry => ({ id: id ?? content, content });

describe('MeshCharacterMind.identity', () => {
  it('maps the seat wallet (anchor) and handle (agent id)', () => {
    const mind = new MeshCharacterMind(seat(), store([]));
    expect(mind.identity()).toEqual({ wallet: '0xWALLET', agentId: 'brittney' });
  });

  it('treats an empty wallet as absent (pre-attestation)', () => {
    const mind = new MeshCharacterMind(seat({ wallet: '' }), store([]));
    expect(mind.identity().wallet).toBeUndefined();
  });
});

describe('MeshCharacterMind.loadMemory', () => {
  it('maps private-store entries and preserves content', async () => {
    const mind = new MeshCharacterMind(seat(), store([mem('prefers concise answers'), mem('likes tea')]));
    const out = await mind.loadMemory();
    expect(out).toHaveLength(2);
    expect(out[0].content).toBe('prefers concise answers');
  });

  it('filters by query client-side and caps by limit', async () => {
    const s = store([mem('working on the WebGPU renderer'), mem('likes tea'), mem('webgpu splat route')]);
    const mind = new MeshCharacterMind(seat(), s);
    expect(await mind.loadMemory('webgpu')).toHaveLength(2);
    expect(await mind.loadMemory(undefined, 1)).toHaveLength(1);
  });

  it('degrades to [] when the store fails — never throws (body stays mind-less)', async () => {
    const mind = new MeshCharacterMind(seat(), store([], { failRead: true }));
    await expect(mind.loadMemory()).resolves.toEqual([]);
  });
});

describe('MeshCharacterMind.rememberOutcome', () => {
  it('writes content to the private store', async () => {
    const s = store([]);
    const mind = new MeshCharacterMind(seat(), s);
    await mind.rememberOutcome({ content: 'shipped the splat route' });
    expect(s.writes).toEqual([{ content: 'shipped the splat route' }]);
  });

  it('swallows a write failure (best-effort, never breaks a tick)', async () => {
    const failing: PrivateMemoryStore = {
      queryPrivateKnowledge: async () => [],
      writePrivateKnowledge: vi.fn(async () => {
        throw new Error('write failed');
      }),
    };
    const mind = new MeshCharacterMind(seat(), failing);
    await expect(mind.rememberOutcome({ content: 'x' })).resolves.toBeUndefined();
  });
});
