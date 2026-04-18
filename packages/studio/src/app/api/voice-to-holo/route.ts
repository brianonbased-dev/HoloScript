/**
 * POST /api/voice-to-holo
 *
 * Converts a voice utterance into HoloScript source via Claude Haiku 4.5.
 * Owns the Anthropic API key (which must NEVER reach the browser).
 *
 * Returns a parseable, validated HoloScript source string, or an error body.
 *
 * Design notes:
 *  - prompt caching on the system prompt (ephemeral, 5m TTL) — the prompt is
 *    ~2KB and identical across requests, high hit rate expected.
 *  - one retry on validator/parse failure with the parser error echoed back
 *    to the model. Retry budget is STRICTLY 1 — do not loop.
 *  - latency target: p50 < 600ms, p99 < 1500ms. If you add steps, measure.
 *
 * See:
 *  - research/quest3-iphone-moment/b-voice-intent-grammar.md
 *  - packages/studio/src/lib/voice/prompt.ts   (system prompt + config)
 *  - packages/studio/src/lib/voice/validator.ts (output guardrails)
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  SYSTEM_PROMPT_FRESH,
  SYSTEM_PROMPT_EDIT_SUFFIX,
  RETRY_PROMPT_TEMPLATE,
  MODEL_CONFIG,
} from '../../../lib/voice/prompt';
import { validateHoloOutput, normalizeHoloOutput } from '../../../lib/voice/validator';
import type {
  VoiceToHoloRequest,
  VoiceToHoloResponse,
  VoiceToHoloError,
} from '../../../lib/voice/types';

export const maxDuration = 30;

function makeClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

function buildSystemPrompt(previousComposition: string | undefined): string {
  if (!previousComposition) return SYSTEM_PROMPT_FRESH;
  return (
    SYSTEM_PROMPT_FRESH +
    SYSTEM_PROMPT_EDIT_SUFFIX.replace('{{PREVIOUS}}', previousComposition)
  );
}

async function callModel(
  client: Anthropic,
  system: string,
  user: string,
  model?: string
): Promise<{ text: string; latencyMs: number }> {
  const t0 = Date.now();
  const res = await client.messages.create({
    model: model ?? MODEL_CONFIG.model,
    temperature: MODEL_CONFIG.temperature,
    max_tokens: MODEL_CONFIG.max_tokens,
    stop_sequences: [...MODEL_CONFIG.stop_sequences],
    system: [
      {
        type: 'text',
        text: system,
        // Ephemeral prompt cache: long system prompt, identical across turns
        // within the 5-minute TTL window. Expected hit rate >90%.
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: user }],
  });

  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('');

  return { text, latencyMs: Date.now() - t0 };
}

export async function POST(req: NextRequest): Promise<NextResponse<VoiceToHoloResponse | VoiceToHoloError>> {
  const client = makeClient();
  if (!client) {
    return NextResponse.json(
      { error: { kind: 'llm-request-failed', message: 'ANTHROPIC_API_KEY not set on server' } },
      { status: 503 }
    );
  }

  let body: VoiceToHoloRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { kind: 'llm-request-failed', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  const utterance = (body.utterance ?? '').trim();
  if (!utterance) {
    return NextResponse.json(
      { error: { kind: 'no-transcript', message: 'Empty utterance' } },
      { status: 400 }
    );
  }

  const systemPrompt = buildSystemPrompt(body.previousComposition);

  // Turn 1: produce a candidate
  let attempt: { text: string; latencyMs: number };
  try {
    attempt = await callModel(client, systemPrompt, utterance, body.model);
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          kind: 'llm-request-failed',
          message: err instanceof Error ? err.message : 'Unknown LLM error',
        },
      },
      { status: 502 }
    );
  }

  let source = normalizeHoloOutput(attempt.text);
  let totalLatency = attempt.latencyMs;

  // Fast guardrail: structural/trait/color check
  const check1 = validateHoloOutput(source);
  if (check1.ok) {
    return NextResponse.json({
      holoSource: source,
      modelLatencyMs: totalLatency,
      retried: false,
    });
  }

  // Retry once with the validator's diagnostics as the parser error.
  // This is the only retry — do NOT loop.
  const retryPrompt = RETRY_PROMPT_TEMPLATE(utterance, check1.issues.join('; '));
  let retry: { text: string; latencyMs: number };
  try {
    retry = await callModel(client, systemPrompt, retryPrompt, body.model);
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          kind: 'parse-failed-after-retry',
          message: err instanceof Error ? err.message : 'Retry call failed',
          details: { firstAttemptIssues: check1.issues },
        },
      },
      { status: 502 }
    );
  }

  source = normalizeHoloOutput(retry.text);
  totalLatency += retry.latencyMs;

  const check2 = validateHoloOutput(source);
  if (!check2.ok) {
    return NextResponse.json(
      {
        error: {
          kind: 'parse-failed-after-retry',
          message: `Validation failed after retry: ${check2.issues.join('; ')}`,
          details: {
            firstAttemptIssues: check1.issues,
            retryIssues: check2.issues,
          },
        },
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    holoSource: source,
    modelLatencyMs: totalLatency,
    retried: true,
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
