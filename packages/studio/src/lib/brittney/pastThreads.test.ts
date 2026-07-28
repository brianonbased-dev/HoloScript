/**
 * Tests for the D.053 past-threads relational-memory module: fail-soft fetch,
 * same-scope listing, active-thread exclusion, excerpt shape, the
 * MAX_PAST_THREADS cap, the TTL cache, and the prompt-block budget clamp.
 *
 * NOTE: fetchPastThreads has a module-level TTL cache keyed by owner:scope —
 * each test uses a unique owner so cache state never leaks between tests
 * (except the cache test, which relies on it deliberately).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// No DB → in-memory conversation store fallback.
vi.mock('../../db/client', () => ({
  getDb: vi.fn(() => null),
}));

import { fetchPastThreads, MAX_PAST_THREADS } from './pastThreads';
import { buildContextualPrompt } from './systemPrompt';
import { createConversation, appendMessages } from './conversationStore';

beforeEach(() => {
  (globalThis as { __brittneyConversations__?: Map<string, unknown> }).__brittneyConversations__ =
    new Map();
  (globalThis as { __brittneyMessages__?: Map<string, unknown> }).__brittneyMessages__ = new Map();
});

async function seedThread(ownerId: string, scope: string, userText: string, assistantText: string) {
  const convo = await createConversation(ownerId, scope);
  await appendMessages(ownerId, convo.id, [
    { role: 'user', content: userText },
    { role: 'assistant', content: assistantText },
  ]);
  return convo;
}

describe('fetchPastThreads', () => {
  it('returns [] when the owner has no threads in scope', async () => {
    expect(await fetchPastThreads('pt-empty', 'workspace:none')).toEqual([]);
  });

  it('returns titled snippets with role-prefixed excerpts for recent threads', async () => {
    await seedThread(
      'pt-1',
      'workspace:a',
      'Plan the rover wheel sim',
      'Six wheels, rocker-bogie.'
    );
    const threads = await fetchPastThreads('pt-1', 'workspace:a');
    expect(threads).toHaveLength(1);
    expect(threads[0].title).toContain('Plan the rover wheel sim');
    expect(threads[0].messageCount).toBe(2);
    expect(threads[0].excerpts.some((e) => e.startsWith('user: "'))).toBe(true);
    expect(threads[0].excerpts.some((e) => e.startsWith('brittney: "'))).toBe(true);
  });

  it('excludes the active conversation and empty threads', async () => {
    const a = await seedThread('pt-2', 'workspace:b', 'thread alpha topic', 'alpha answer');
    const active = await seedThread('pt-2', 'workspace:b', 'active thread topic', 'active answer');
    // Empty thread (no messages) must be filtered out.
    await createConversation('pt-2', 'workspace:b');

    const threads = await fetchPastThreads('pt-2', 'workspace:b', active.id);
    expect(threads.map((t) => t.id)).toEqual([a.id]);
  });

  it('does not leak threads across scopes', async () => {
    await seedThread('pt-3', 'workspace:left', 'left-scope secret plan', 'noted');
    await seedThread('pt-3', 'workspace:right', 'right-scope topic', 'noted');
    const threads = await fetchPastThreads('pt-3', 'workspace:right');
    expect(threads).toHaveLength(1);
    expect(threads[0].title).toContain('right-scope topic');
  });

  it(`caps the result at MAX_PAST_THREADS (${MAX_PAST_THREADS})`, async () => {
    for (let i = 0; i < MAX_PAST_THREADS + 2; i++) {
      await seedThread('pt-4', 'workspace:c', `thread number ${i}`, `answer ${i}`);
    }
    const threads = await fetchPastThreads('pt-4', 'workspace:c');
    expect(threads).toHaveLength(MAX_PAST_THREADS);
  });

  it('serves from the per-owner cache within the TTL window', async () => {
    await seedThread('pt-5', 'workspace:d', 'first thread', 'first answer');
    const before = await fetchPastThreads('pt-5', 'workspace:d');
    expect(before).toHaveLength(1);
    // A thread added after the first fetch is invisible until the TTL expires —
    // proving the cache short-circuits the store read.
    await seedThread('pt-5', 'workspace:d', 'second thread', 'second answer');
    const after = await fetchPastThreads('pt-5', 'workspace:d');
    expect(after).toHaveLength(1);
  });
});

describe('buildContextualPrompt past-threads block', () => {
  const snippet = (id: string, title: string, excerpts: string[] = []) => ({
    id,
    title,
    lastMessageAt: '2026-06-09T12:00:00.000Z',
    messageCount: 4,
    excerpts,
  });

  it('renders the relational-memory block when threads are provided', () => {
    const prompt = buildContextualPrompt(null, null, false, {}, null, false, [
      snippet('c1', 'Rover wheel sim', ['user: "plan the rover"']),
    ]);
    expect(prompt).toContain('--- Past Conversations (relational memory) ---');
    expect(prompt).toContain('Rover wheel sim');
    expect(prompt).toContain('user: "plan the rover"');
  });

  it('omits the block entirely when there are no past threads', () => {
    const prompt = buildContextualPrompt(null, null, false, {}, null, false, []);
    expect(prompt).not.toContain('Past Conversations');
  });

  it('clamps the block to the character budget by dropping overflow threads', () => {
    const bigExcerpts = Array.from({ length: 3 }, (_, i) => `user: "${'x'.repeat(400)}${i}"`);
    const threads = Array.from({ length: 5 }, (_, i) =>
      snippet(`c${i}`, `budget-thread-${i}`, bigExcerpts)
    );
    const prompt = buildContextualPrompt(null, null, false, {}, null, false, threads);
    expect(prompt).toContain('budget-thread-0');
    // ~1,300 chars per entry against a 3,000-char budget → the tail threads
    // must be dropped, never blowing the prompt up.
    expect(prompt).not.toContain('budget-thread-4');
  });
});
