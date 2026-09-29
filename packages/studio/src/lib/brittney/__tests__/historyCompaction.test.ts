/**
 * Planning a long chat's compaction (lib/brittney/historyCompaction.ts).
 *
 * The route refuses a body over 32,000 bytes. A chat that would pass
 * COMPACT_TRIGGER_BYTES has its older part summed up; the recent part is kept
 * verbatim, starts on a user turn, and always includes the latest message.
 */
import { describe, expect, it } from 'vitest';

import type { AssistantMessage } from '../BrittneySession';
import {
  COMPACT_KEEP_RECENT_BYTES,
  COMPACT_TRIGGER_BYTES,
  SUMMARY_MAX_CHARS,
  SUMMARY_PREFIX,
  cleanSummary,
  compactedHistory,
  droppedHistory,
  isSummaryMessage,
  messageBytes,
  planCompaction,
  summaryMessages,
  summaryPrompt,
} from '../historyCompaction';

/** A chat of `turns` user/assistant pairs, each message about `size` characters. */
function chat(turns: number, size = 900): AssistantMessage[] {
  const out: AssistantMessage[] = [];
  for (let i = 0; i < turns; i += 1) {
    out.push({ role: 'user', content: `Turn ${i}: ${'u'.repeat(size)}` });
    out.push({ role: 'assistant', content: `Reply ${i}: ${'a'.repeat(size)}` });
  }
  return out;
}
const bytes = (ms: AssistantMessage[]) => ms.reduce((s, m) => s + messageBytes(m), 0);

describe('when a chat is compacted, and where it splits', () => {
  it('leaves a chat that fits alone', () => {
    const short = chat(4);
    expect(bytes(short)).toBeLessThan(COMPACT_TRIGGER_BYTES);
    expect(planCompaction(short, 1_000)).toBeNull();
  });

  it('splits a long chat: recent fits the budget, starts on a user turn, keeps the latest', () => {
    const long = [...chat(20), { role: 'user' as const, content: 'Now make the roses red.' }];
    expect(bytes(long)).toBeGreaterThan(COMPACT_TRIGGER_BYTES);
    const plan = planCompaction(long, 1_000);
    expect(plan).not.toBeNull();
    expect([...plan!.older, ...plan!.recent]).toEqual(long);
    expect(plan!.recent[0].role).toBe('user');
    expect(plan!.recent.at(-1)).toEqual({ role: 'user', content: 'Now make the roses red.' });
    expect(bytes(plan!.recent)).toBeLessThanOrEqual(COMPACT_KEEP_RECENT_BYTES);
  });

  it('moves the split forward to a user turn when the budget ends on an assistant turn', () => {
    // Long questions, short replies: counting back from the latest message, the
    // budget runs out on an assistant reply, which must not open the kept part.
    const history: AssistantMessage[] = [];
    for (let i = 0; i < 16; i += 1) {
      history.push({ role: 'user', content: `Question ${i}: ${'q'.repeat(2000)}` });
      history.push({ role: 'assistant', content: `Answer ${i}.` });
    }
    history.push({ role: 'user', content: `Last: ${'q'.repeat(2000)}` });
    const plan = planCompaction(history, 1_000)!;
    expect(plan).not.toBeNull();
    expect(plan.recent[0].role).toBe('user');
    expect(plan.older.at(-1)!.role).toBe('assistant');
  });

  it('counts the rest of the request body toward the trigger', () => {
    const middling = chat(12);
    expect(bytes(middling)).toBeLessThan(COMPACT_TRIGGER_BYTES);
    expect(planCompaction(middling, 0)).toBeNull();
    expect(planCompaction(middling, COMPACT_TRIGGER_BYTES)).not.toBeNull();
  });

  it('folds an earlier summary into the next one, and never keeps it as recent', () => {
    const history = [...summaryMessages('They are building a rose garden.'), ...chat(20)];
    const plan = planCompaction(history, 1_000)!;
    expect(isSummaryMessage(plan.older[0])).toBe(true);
    expect(plan.recent.some(isSummaryMessage)).toBe(false);
  });

  it('does not compact when only an earlier summary lies before the recent part', () => {
    const history = [...summaryMessages('x'), { role: 'user' as const, content: 'y'.repeat(40_000) }];
    expect(planCompaction(history, 1_000)).toBeNull();
  });
});

describe('what is sent in place of the older part', () => {
  it('the summary pair keeps user and assistant turns alternating', () => {
    const recent: AssistantMessage[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ];
    const h = compactedHistory('They want red roses.', recent);
    expect(h.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
    expect(h[0].content.startsWith(SUMMARY_PREFIX)).toBe(true);
    expect(h[0].content).toContain('They want red roses.');
  });

  it('when no summary could be written, says so plainly and keeps an earlier summary', () => {
    const older = [...summaryMessages('They are building a rose garden.'), ...chat(3)];
    const h = droppedHistory(older, [{ role: 'user', content: 'next' }]);
    expect(h[0].content).toContain('They are building a rose garden.');
    expect(h[0].content).toContain('6 older messages could not be summed up');
    expect(h.at(-1)).toEqual({ role: 'user', content: 'next' });
  });

  it('cleans the model’s summary: thinking removed, held to the budget at a sentence end', () => {
    expect(cleanSummary('<think>hmm</think>\n They want roses. ')).toBe('They want roses.');
    const long = 'A sentence that goes on. '.repeat(400);
    const cleaned = cleanSummary(long);
    expect(cleaned.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(cleaned.endsWith('.')).toBe(true);
  });

  it('asks for what continuing needs, and carries the transcript', () => {
    const p = summaryPrompt('Person: make a rose garden');
    expect(p).toContain('Person: make a rose garden');
    expect(p).toContain('exact names');
    expect(p).toContain(String(SUMMARY_MAX_CHARS));
  });
});
