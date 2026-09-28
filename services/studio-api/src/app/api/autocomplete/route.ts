import { NextResponse } from 'next/server';
import {
  resolveOwnedLocalProvider,
  type ResolvedSovereignProvider,
} from '@holoscript/llm-provider';

/**
 * POST /api/autocomplete
 *
 * Body: { prefix: string, suffix?: string, maxTokens?: number }
 * Returns: { completion: string }, or { completion: '', warning } when there is none.
 *
 * Asks our own local model server to fill in the HoloScript at the cursor: HoloServe when
 * HOLOSERVE_URL is set, else HoloLlama when HOLOLLAMA_URL is set (D.117: HoloLlama replaced
 * Ollama; OLLAMA_* is ignored here). Both speak chat, so the prompt is a chat request with
 * the code before and after the cursor, not a fill-in-the-middle template. With neither
 * set, or when the server fails or takes longer than 4 s, the completion is empty and the
 * editor carries on without a suggestion.
 */

const CALLER = 'studio-api /api/autocomplete';
const CURSOR = '<cursor>';

const SYSTEM_PROMPT =
  `You complete HoloScript code. Reply with only the text to insert at ${CURSOR}: ` +
  'no explanation, no markdown fences, and do not repeat the code before or after it.';

interface CompletionRequest {
  prefix?: string;
  suffix?: string;
  maxTokens?: number;
}

function buildMessages(prefix: string, suffix: string) {
  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: `Complete the HoloScript at ${CURSOR}.\n\n${prefix}${CURSOR}${suffix}`,
    },
  ];
}

/**
 * Chat models sometimes wrap the insertion in a markdown fence or echo the cursor marker.
 * The fences are stripped one at a time: the blank-line stop can cut off the closing one.
 */
function cleanCompletion(text: string): string {
  return text
    .replace(/^\s*```[\w-]*[ \t]*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .split(CURSOR)
    .join('')
    .trimEnd();
}

function unavailable(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return NextResponse.json({
    completion: '',
    warning: `Autocomplete unavailable: ${msg.slice(0, 200)}`,
  });
}

export async function POST(request: Request) {
  let body: CompletionRequest;
  try {
    body = (await request.json()) as CompletionRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const prefix = typeof body.prefix === 'string' ? body.prefix : '';
  const suffix = typeof body.suffix === 'string' ? body.suffix : '';
  const requested =
    typeof body.maxTokens === 'number' && Number.isFinite(body.maxTokens) ? body.maxTokens : 64;
  const maxTokens = Math.max(1, Math.min(Math.floor(requested), 256));

  if (!prefix.trim()) {
    return NextResponse.json({ completion: '' });
  }

  let local: ResolvedSovereignProvider | null;
  try {
    // One attempt: a retry after a 5xx would outlive the 4 s budget of a keystroke.
    local = resolveOwnedLocalProvider({ caller: CALLER, timeoutMs: 4000, maxRetries: 0 });
  } catch (err) {
    return unavailable(err);
  }
  if (!local) {
    return NextResponse.json({
      completion: '',
      warning:
        'Autocomplete is off: no local model server is configured. Set HOLOLLAMA_URL ' +
        '(HoloLlama) or HOLOSERVE_URL (HoloServe).',
    });
  }

  try {
    const result = await local.provider.complete(
      {
        messages: buildMessages(prefix, suffix),
        maxTokens,
        temperature: 0.1,
        stop: ['\n\n'],
      },
      local.model
    );
    return NextResponse.json({ completion: cleanCompletion(result.content ?? '') });
  } catch (err) {
    // Local model unavailable — return empty completion (editor degrades gracefully)
    return unavailable(err);
  }
}
