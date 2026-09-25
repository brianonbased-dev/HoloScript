import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client', () => ({
  getDb: vi.fn(() => null),
}));

import { appendMessages, createConversation, getMessages } from './conversationStore';

beforeEach(() => {
  (globalThis as { __brittneyConversations__?: Map<string, unknown> }).__brittneyConversations__ =
    new Map();
  (globalThis as { __brittneyMessages__?: Map<string, unknown> }).__brittneyMessages__ = new Map();
});

describe('appendMessages newest-turn idempotency', () => {
  it('does not grow the thread when the newest user turn is appended again after the assistant row', async () => {
    const convo = await createConversation('dup-owner', 'workspace:dup');
    await appendMessages('dup-owner', convo.id, [
      { role: 'user', content: 'newest question', timestamp: 1_700_000_000_000 },
    ]);
    await appendMessages('dup-owner', convo.id, [
      { role: 'assistant', content: 'newest answer', timestamp: 1_700_000_000_100 },
    ]);

    const replay = await appendMessages('dup-owner', convo.id, [
      { role: 'user', content: 'newest question', timestamp: 1_700_000_000_000 },
      {
        role: 'assistant',
        content: 'newest answer',
        timestamp: 1_700_000_000_500,
        toolCalls: [{ tool: 'scene', success: true, message: 'ok' }],
      },
    ]);

    expect(replay?.messages).toEqual([]);
    expect(replay?.conversation.messageCount).toBe(2);
    const rows = await getMessages('dup-owner', convo.id);
    expect(rows?.map((row) => `${row.role}:${row.content}`)).toEqual([
      'user:newest question',
      'assistant:newest answer',
    ]);
  });

  it('collapses two consecutive copies of the same user turn', async () => {
    const convo = await createConversation('dup-owner-2', 'workspace:dup');
    await appendMessages('dup-owner-2', convo.id, [
      { role: 'user', content: 'double click', timestamp: 10 },
    ]);
    const second = await appendMessages('dup-owner-2', convo.id, [
      { role: 'user', content: 'double click', timestamp: 11 },
    ]);

    expect(second?.messages).toEqual([]);
    expect(second?.conversation.messageCount).toBe(1);
  });

  it('still stores a later user turn that repeats the text after a reply', async () => {
    const convo = await createConversation('dup-owner-3', 'workspace:dup');
    await appendMessages('dup-owner-3', convo.id, [
      { role: 'user', content: 'again', timestamp: 10 },
      { role: 'assistant', content: 'first reply', timestamp: 11 },
    ]);
    const next = await appendMessages('dup-owner-3', convo.id, [
      { role: 'user', content: 'again', timestamp: 20 },
    ]);

    expect(next?.messages).toHaveLength(1);
    expect(next?.conversation.messageCount).toBe(3);
  });
});
