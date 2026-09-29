/**
 * When /api/brittney refuses a message and explains itself to people (a
 * `notice`, as the daily limit sends), the chat shows that sentence as
 * Brittney's reply. It used to show "API error 429: Too Many Requests" and
 * throw the explanation away. Technical text (the route's 503 diagnostic puts
 * it in `message`) is still not shown as if Brittney had said it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamAssistant } from '../BrittneySession';

async function eventsFor(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response)
  );
  const events: Array<{ type: string; payload: unknown }> = [];
  for await (const e of streamAssistant([{ role: 'user', content: 'hi' }], '')) {
    events.push(e as { type: string; payload: unknown });
  }
  return events;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a refusal from /api/brittney reaches the person in plain words', () => {
  it('shows the notice the route wrote for people, as Brittney’s reply', async () => {
    const notice =
      "You have used today's 40 free messages with Brittney. They come back at midnight UTC, in about 5 hours.";
    const events = await eventsFor(
      json(429, { error: 'Daily limit reached', code: 'daily_limit', notice })
    );

    expect(events).toEqual([
      { type: 'text', payload: notice },
      { type: 'done', payload: null },
    ]);
  });

  it('does not show technical text as Brittney’s words', async () => {
    const events = await eventsFor(
      json(503, {
        error: 'brittney-route-failure',
        phase: 'provider',
        message: 'SOVEREIGN_WARMING: ...',
      })
    );

    expect(events[0].type).toBe('error');
    expect(String(events[0].payload)).toMatch(/^API error 503/);
    expect(JSON.stringify(events)).not.toContain('SOVEREIGN_WARMING');
  });

  it('keeps the old line when the refusal body is not JSON', async () => {
    const events = await eventsFor(new Response('Too Many Requests', { status: 429 }));

    expect(events[0]).toMatchObject({ type: 'error' });
    expect(String(events[0].payload)).toMatch(/^API error 429/);
  });
});
