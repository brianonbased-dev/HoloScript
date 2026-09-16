/**
 * What a refused knowledge filing says to the person who tried.
 *
 * Once /api/knowledge/sync and /api/knowledge/query started refusing signed-out
 * callers, the form rethrew the raw response body, so the toast read:
 *
 *   Sync Failed: {"error":"Sign in to HoloScript Studio to file knowledge…","signInRequired":true}
 *
 * The answer was in there, wearing punctuation that hides it. These cases pin
 * the sentence and, just as importantly, that the JSON wrapper never survives.
 */
import { describe, expect, it } from 'vitest';

import { knowledgeFailureMessage } from './WPGEntryForm';

const SIGN_IN_SENTENCE =
  'Sign in to HoloScript Studio to file knowledge, or send your own mesh API key as "x-mcp-api-key: <your key>" to file it as yourself.';

describe('knowledgeFailureMessage', () => {
  it('shows the sentence the route wrote, not the JSON it arrived in', () => {
    const raw = JSON.stringify({ error: SIGN_IN_SENTENCE, signInRequired: true });

    const message = knowledgeFailureMessage(raw, 401);

    expect(message).toBe(SIGN_IN_SENTENCE);
    expect(message).not.toContain('{');
    expect(message).not.toContain('signInRequired');
  });

  it('reads a "message" field when that is what the body carries', () => {
    const message = knowledgeFailureMessage(JSON.stringify({ message: 'Upstream is busy.' }), 503);

    expect(message).toBe('Upstream is busy.');
  });

  it('keeps a short plain-text body as it is', () => {
    expect(knowledgeFailureMessage('Rate limit reached, try again shortly.', 429)).toBe(
      'Rate limit reached, try again shortly.'
    );
  });

  it('falls back to a readable sentence for an HTML error page', () => {
    const html = `<!doctype html><html><body><h1>502 Bad Gateway</h1>${'x'.repeat(400)}</body></html>`;

    const message = knowledgeFailureMessage(html, 502);

    expect(message).toBe('The knowledge store refused this (502).');
    expect(message).not.toContain('<');
  });

  it('falls back to the sign-in sentence when the body is empty on a 401', () => {
    expect(knowledgeFailureMessage('', 401)).toBe(
      'Sign in to file knowledge, or send your own mesh API key.'
    );
  });

  it('never hands back a JSON object as the whole message', () => {
    const raw = JSON.stringify({ unexpected: 'shape', nested: { deep: true } });

    const message = knowledgeFailureMessage(raw, 400);

    expect(message).toBe('The knowledge store refused this (400).');
    expect(message).not.toContain('unexpected');
  });
});
