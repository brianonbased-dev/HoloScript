/**
 * A long chat keeps working (founder report, 2026-09-29): before a request would
 * pass the route's 32,000-byte cap, streamAssistant has the older part summed up
 * by /api/brittney/compact, sends the summary in its place, and tells the caller
 * the new history. When no summary can be written, the older part is left out
 * with a plain note instead of the request failing. A short chat is sent as before.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { compactedMessagesFrom, streamAssistant, type AssistantMessage } from '../BrittneySession';
import { SUMMARY_PREFIX, compactedHistory } from '../historyCompaction';

const ROUTE_CAP_BYTES = 32_000;

function chat(turns: number, size = 900): AssistantMessage[] {
  const out: AssistantMessage[] = [];
  for (let i = 0; i < turns; i += 1) {
    out.push({ role: 'user', content: `Turn ${i}: ${'u'.repeat(size)}` });
    out.push({ role: 'assistant', content: `Reply ${i}: ${'a'.repeat(size)}` });
  }
  out.push({ role: 'user', content: 'Now make the roses red.' });
  return out;
}

const sse = () =>
  new Response('data: {"type":"text","payload":"Done."}\n\ndata: {"type":"done","payload":null}\n\n', {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });

type Call = { url: string; body: { messages: AssistantMessage[] }; bytes: number };

async function run(history: AssistantMessage[], compact: () => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const raw = String(init.body);
      calls.push({ url, body: JSON.parse(raw), bytes: new TextEncoder().encode(raw).length });
      return url === '/api/brittney/compact' ? compact() : sse();
    })
  );
  const events: Array<{ type: string; payload: unknown }> = [];
  for await (const e of streamAssistant(history, 'Scene contains 3 object(s).')) {
    events.push(e as { type: string; payload: unknown });
  }
  return { calls, events };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a long Brittney chat keeps working', () => {
  it('sums up the older part, sends the summary in its place, and stays under the cap', async () => {
    const history = chat(20);
    const { calls, events } = await run(history, () =>
      Response.json({ summary: 'They are building a rose garden with 20 bushes.' })
    );

    expect(calls.map((c) => c.url)).toEqual(['/api/brittney/compact', '/api/brittney']);
    const [compactCall, chatCall] = calls;
    // The older part went to the summary, the recent part was sent verbatim after it.
    const summarized = compactCall.body.messages.length;
    const recent = history.slice(summarized);
    expect(chatCall.body.messages).toEqual(
      compactedHistory('They are building a rose garden with 20 bushes.', recent)
    );
    expect(chatCall.bytes).toBeLessThan(ROUTE_CAP_BYTES);
    // The caller is told the new history.
    const compactedEvent = events.find((e) => e.type === 'history_compacted');
    expect(compactedEvent).toBeDefined();
    expect(compactedMessagesFrom(compactedEvent as never)).toEqual(chatCall.body.messages);
    expect(events.filter((e) => e.type === 'text')).toEqual([{ type: 'text', payload: 'Done.' }]);
  });

  it('when no summary can be written, leaves the older part out with a note, and still answers', async () => {
    const { calls, events } = await run(chat(20), () =>
      Response.json({ error: 'No model can write the summary right now' }, { status: 503 })
    );

    const chatCall = calls.find((c) => c.url === '/api/brittney')!;
    expect(chatCall.bytes).toBeLessThan(ROUTE_CAP_BYTES);
    expect(chatCall.body.messages[0].content.startsWith(SUMMARY_PREFIX)).toBe(true);
    expect(chatCall.body.messages[0].content).toContain('could not be summed up and were left out');
    expect(chatCall.body.messages.at(-1)).toEqual({ role: 'user', content: 'Now make the roses red.' });
    expect(events.some((e) => e.type === 'text')).toBe(true);
  });

  it('every chat window keeps the short history, so the next turn does not pay for the same summary', () => {
    for (const file of ['BrittneyChatPanel.tsx', 'BrittneyFullScreen.tsx', 'BrittneyBuildSurface.tsx']) {
      const src = readFileSync(resolve(__dirname, '../../../components/ai', file), 'utf8');
      expect(src, file).toMatch(
        /event\.type === 'history_compacted'\) \{[\s\S]{0,300}?compactedMessagesFrom\(event\)[\s\S]{0,120}?setLlmHistory\(shortened\)/
      );
    }
  });

  it('sends a short chat exactly as before, with no summary call', async () => {
    const short = chat(3);
    const { calls, events } = await run(short, () => Response.json({ summary: 'unused' }));

    expect(calls.map((c) => c.url)).toEqual(['/api/brittney']);
    expect(calls[0].body.messages).toEqual(short);
    expect(events.some((e) => e.type === 'history_compacted')).toBe(false);
  });
});
