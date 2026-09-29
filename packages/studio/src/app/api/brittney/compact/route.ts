/**
 * POST /api/brittney/compact — Brittney sums up the older part of a long chat.
 *
 * The chat route refuses a body over 32,000 bytes, and every turn sends the whole
 * chat so far, so a long build session used to stop with "Body exceeds size limit"
 * (measured 2026-09-29). The client (lib/brittney/historyCompaction.ts) sends the
 * older messages here before a request would pass the cap, gets back a summary,
 * and sends that in their place.
 *
 * Body: { messages: Array<{ role: 'user' | 'assistant', content: string }> }
 * 200 { summary, model } · 400 bad body · 401 signed out · 429 rate · 503 no model.
 *
 * It uses the same model Brittney answers with, including the paid fallback within
 * its daily ceiling, and a paid summary is added to the day's paid total. It does
 * not count as a message against the person's daily limit: it is part of a turn
 * that was already counted.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limiter';
import { resolveBrittneyProviderAsync } from '@/lib/brittney/provider';
import {
  paidFallbackOpen,
  recordPaidAnswer,
  UNREPORTED_ROUND_COST_USD,
} from '@/lib/brittney/dailyUsage';
import { cleanSummary, summaryPrompt } from '@/lib/brittney/historyCompaction';
import { readJsonBody } from '../../_lib/body-size';

export const maxDuration = 120;

/** The older part of a chat that was just under the chat cap, plus an earlier summary. */
const MAX_BODY_BYTES = 64_000;
const MAX_COMPACTS_PER_MIN = 10;

export async function POST(request: NextRequest) {
  const auth = await requireAuthOrApiKey(request);
  if (auth instanceof NextResponse) return auth;
  const userId = (auth as { user?: { id?: string } }).user?.id ?? '';

  const limit = rateLimit(
    request,
    { max: MAX_COMPACTS_PER_MIN, label: 'Rate limit exceeded' },
    'brittney-compact'
  );
  if (!limit.ok) return limit.response;

  const parsed = await readJsonBody<{ messages?: Array<{ role?: unknown; content?: unknown }> }>(
    request,
    { maxBytes: MAX_BODY_BYTES }
  );
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error === 'payload_too_large' ? 'Body exceeds size limit' : 'Invalid JSON body' },
      { status: parsed.status }
    );
  }
  const messages = (parsed.body.messages ?? []).filter(
    (m): m is { role: 'user' | 'assistant'; content: string } =>
      (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 0
  );
  if (messages.length === 0) {
    return NextResponse.json({ error: 'No messages to summarize' }, { status: 400 });
  }
  const transcript = messages
    .map((m) => `${m.role === 'user' ? 'Person' : 'Brittney'}: ${m.content}`)
    .join('\n\n');

  let resolved: Awaited<ReturnType<typeof resolveBrittneyProviderAsync>>;
  try {
    const paidFallback = process.env.BRITTNEY_PAID_FALLBACK ? await paidFallbackOpen() : false;
    resolved = await resolveBrittneyProviderAsync(undefined, { paidFallback });
  } catch (err) {
    const notice = (err as { notice?: unknown } | null)?.notice;
    return NextResponse.json(
      {
        error: 'No model can write the summary right now',
        ...(typeof notice === 'string' && notice ? { notice } : {}),
      },
      { status: 503 }
    );
  }

  let paidCostUsd = 0;
  try {
    const reply = await resolved.provider.complete(
      { messages: [{ role: 'user', content: summaryPrompt(transcript) }], maxTokens: 1500, temperature: 0.2 },
      resolved.model
    );
    if (resolved.paid) paidCostUsd = reply.usage?.costUsd ?? UNREPORTED_ROUND_COST_USD;
    const summary = cleanSummary(reply.content);
    if (!summary) {
      return NextResponse.json({ error: 'The model returned an empty summary' }, { status: 502 });
    }
    return NextResponse.json({ summary, model: resolved.model });
  } catch (err) {
    if (resolved.paid) paidCostUsd = UNREPORTED_ROUND_COST_USD;
    console.error('[brittney/compact] summary failed:', err);
    return NextResponse.json({ error: 'Summary failed' }, { status: 502 });
  } finally {
    if (resolved.paid && paidCostUsd > 0) await recordPaidAnswer(userId || 'unknown', paidCostUsd);
  }
}
