import { NextResponse } from 'next/server';
import { checkHostedOllama } from '@holoscript/llm-provider';

/**
 * POST /api/autocomplete
 *
 * Body: { prefix: string, suffix?: string, maxTokens?: number }
 * Returns: { completion: string }
 *
 * Calls Ollama (or any OpenAI-compatible endpoint) with a HoloScript fill-in-the-middle prompt.
 * Falls back gracefully when Ollama is unavailable.
 */

const OLLAMA_BASE = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const MODEL = process.env.OLLAMA_AUTOCOMPLETE_MODEL ?? 'codellama:7b-code';

interface CompletionRequest {
  prefix?: string;
  suffix?: string;
  maxTokens?: number;
}

function buildPrompt(prefix: string, suffix: string) {
  return `<PRE>${prefix}<SUF>${suffix}<MID>`;
}

export async function POST(request: Request) {
  let body: CompletionRequest;
  try {
    body = (await request.json()) as CompletionRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const prefix = body.prefix ?? '';
  const suffix = body.suffix ?? '';
  const maxTokens = Math.min(body.maxTokens ?? 64, 256);

  if (!prefix.trim()) {
    return NextResponse.json({ completion: '' });
  }

  // Editor text is sent here on every keystroke; it must not go to a hosted Ollama unasked.
  const hostedOllama = checkHostedOllama(OLLAMA_BASE, {
    model: MODEL,
    caller: 'studio-api /api/autocomplete',
  });
  if (hostedOllama.refused) {
    return NextResponse.json({
      completion: '',
      warning:
        'Autocomplete is off: OLLAMA_URL is a hosted Ollama (or the model is an Ollama cloud ' +
        'model), and HOLO_ALLOW_HOSTED_OLLAMA is not 1.',
    });
  }

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt: buildPrompt(prefix, suffix),
        stream: false,
        options: {
          num_predict: maxTokens,
          temperature: 0.1,
          stop: ['\n\n', '}', ')'],
        },
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ completion: '', warning: `Ollama error: ${text.slice(0, 100)}` });
    }

    const data = (await res.json()) as { response?: string };
    const completion = (data.response ?? '').trimEnd();
    return NextResponse.json({ completion });
  } catch (err) {
    // Ollama unavailable — return empty completion (editor degrades gracefully)
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ completion: '', warning: `Autocomplete unavailable: ${msg}` });
  }
}
