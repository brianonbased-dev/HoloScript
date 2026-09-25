import { describe, expect, it } from 'vitest';
import { omitDuplicateTurns, type TurnIdentity } from './messageIdentity';

const user = (content: string, timestamp: number): TurnIdentity => ({
  role: 'user',
  content,
  timestamp,
});

const assistant = (
  content: string,
  timestamp: number,
  toolCalls?: unknown[]
): TurnIdentity => ({
  role: 'assistant',
  content,
  timestamp,
  ...(toolCalls ? { toolCalls } : {}),
});

describe('omitDuplicateTurns', () => {
  it('drops a user replay that arrives after the assistant row when the client timestamp matches', () => {
    const existing = [user('hello', 10), assistant('hi', 11)];
    const incoming = [
      user('hello', 10),
      assistant('hi', 99, [{ tool: 'scene', success: true, message: 'ok' }]),
    ];

    expect(omitDuplicateTurns(existing, incoming)).toEqual([]);
  });

  it('collapses a consecutive double user append before any assistant row exists', () => {
    const existing = [user('hello', 1)];
    expect(omitDuplicateTurns(existing, [user('hello', 2)])).toEqual([]);
  });

  it('keeps an intentional repeat of the same user text after an assistant reply', () => {
    const existing = [user('hello', 10), assistant('hi', 11)];
    const again = user('hello', 20);
    expect(omitDuplicateTurns(existing, [again])).toEqual([again]);
  });

  it('keeps a genuinely new assistant reply', () => {
    const existing = [user('hello', 10), assistant('hi', 11)];
    const next = assistant('a different reply', 30);
    expect(omitDuplicateTurns(existing, [next])).toEqual([next]);
  });
});
