export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limiter';
import { checkCredits, deductCredits } from '@/lib/creditGate';
import { requireAuth } from '@/lib/api-auth';
import { corsHeaders } from '../_lib/cors';
import {
  AnthropicAdapter,
  OpenAIAdapter,
  OpenRouterAdapter,
  LocalLLMAdapter,
} from '@holoscript/llm-provider';

const MAX_REQUESTS_PER_MIN = 30;
// SEC-T03: cap untrusted prefix/suffix length before any LLM spend.
const MAX_PROMPT_CHARS = 4000;

/**
 * POST /api/autocomplete
 *
 * Body: { prefix: string, suffix?: string, maxTokens?: number }
 * Returns: { completion: string }
 *
 * Cloud-first autocomplete. Tries OpenRouter, Anthropic, OpenAI in order.
 * Falls back to Ollama if configured, then returns empty completion gracefully.
 * Studio pays — uses server-side env keys only.
 */

interface CompletionRequest {
  prefix?: string;
  suffix?: string;
  maxTokens?: number;
}

function buildFIMPrompt(prefix: string, suffix: string) {
  return `<PRE>${prefix}<SUF>${suffix}<MID>`;
}

function buildChatPrompt(prefix: string, suffix: string) {
  return `Complete the following HoloScript code. Return ONLY the completion text, no explanation.\n\nCode before cursor:\n${prefix}\n\nCode after cursor:\n${suffix}\n\nCompletion:`;
}

type Provider = {
  name: string;
  call: (prefix: string, suffix: string, maxTokens: number) => Promise<string | null>;
};

function getProviders(): Provider[] {
  const providers: Provider[] = [];

  const openrouterKey = process.env.OPENROUTER_API_KEY || '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  const openaiKey = process.env.OPENAI_API_KEY || '';

  if (openrouterKey) {
    const adapter = new OpenRouterAdapter({ apiKey: openrouterKey });
    providers.push({
      name: 'openrouter',
      call: async (prefix, suffix, maxTokens) => {
        const result = await adapter.complete({
          messages: [{ role: 'user', content: buildChatPrompt(prefix, suffix) }],
          maxTokens,
          temperature: 0.1,
        });
        return result.content?.trimEnd() || null;
      },
    });
  }

  if (anthropicKey) {
    const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
    const adapter = new AnthropicAdapter({ apiKey: anthropicKey, defaultModel: model });
    providers.push({
      name: 'anthropic',
      call: async (prefix, suffix, maxTokens) => {
        const isOpus47 = model === 'claude-opus-4-7';
        const result = await adapter.complete({
          messages: [{ role: 'user', content: buildChatPrompt(prefix, suffix) }],
          maxTokens,
          ...(isOpus47 ? {} : { temperature: 0.1 }),
        });
        return result.content?.trimEnd() || null;
      },
    });
  }

  if (openaiKey) {
    const adapter = new OpenAIAdapter({ apiKey: openaiKey });
    providers.push({
      name: 'openai',
      call: async (prefix, suffix, maxTokens) => {
        const result = await adapter.complete({
          messages: [{ role: 'user', content: buildChatPrompt(prefix, suffix) }],
          maxTokens,
          temperature: 0.1,
        });
        return result.content?.trimEnd() || null;
      },
    });
  }

  // Ollama as optional local fallback — now via @holoscript/llm-provider LocalLLMAdapter
  if (process.env.OLLAMA_URL) {
    const ollamaBase = process.env.OLLAMA_URL;
    const model = process.env.OLLAMA_AUTOCOMPLETE_MODEL ?? 'codellama:7b-code';
    const adapter = new LocalLLMAdapter({ baseURL: ollamaBase, defaultModel: model, timeoutMs: 4000 });
    providers.push({
      name: 'ollama',
      call: async (prefix, suffix, maxTokens) => {
        const result = await adapter.complete({
          messages: [{ role: 'user', content: buildFIMPrompt(prefix, suffix) }],
          maxTokens,
          temperature: 0.1,
        });
        return result.content?.trimEnd() || null;
      },
    });
  }

  return providers;
}

export async function POST(request: NextRequest) {
  // SEC-T03: require authenticated session before any paid-LLM call.
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const limit = rateLimit(
    request,
    { max: MAX_REQUESTS_PER_MIN, label: 'Rate limit exceeded' },
    'autocomplete'
  );
  if (!limit.ok) {
    return limit.response;
  }

  // Credit gate — must pass before any LLM call
  const gate = await checkCredits(request, 'studio_autocomplete');
  if (gate.error) return gate.error;

  let body: CompletionRequest;
  try {
    body = (await request.json()) as CompletionRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const prefix = body.prefix ?? '';
  const suffix = body.suffix ?? '';
  const maxTokens = Math.min(body.maxTokens ?? 64, 256);

  if (prefix.length > MAX_PROMPT_CHARS || suffix.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: `prefix/suffix exceeds ${MAX_PROMPT_CHARS} chars` },
      { status: 400 }
    );
  }

  if (!prefix.trim()) {
    return NextResponse.json({ completion: '' });
  }

  const providers = getProviders();

  for (const provider of providers) {
    try {
      const result = await provider.call(prefix, suffix, maxTokens);
      if (result) {
        // Deduct credits after successful completion (fire-and-forget)
        deductCredits(gate.userId, 'studio_autocomplete').catch(() => {});
        return NextResponse.json(
          { completion: result, provider: provider.name },
          {
            headers: {
              'x-llm-provider': 'server',
              'X-RateLimit-Limit': String(MAX_REQUESTS_PER_MIN),
              'X-RateLimit-Remaining': String(limit.remaining),
            },
          }
        );
      }
    } catch {
      // Try next provider
    }
  }

  // No provider available — return empty completion (editor degrades gracefully)
  return NextResponse.json(
    {
      completion: '',
      warning:
        'No AI provider configured. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in .env',
    },
    {
      headers: {
        'x-llm-provider': 'none',
        'X-RateLimit-Limit': String(MAX_REQUESTS_PER_MIN),
        'X-RateLimit-Remaining': String(limit.remaining),
      },
    }
  );
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, {
      methods: 'GET, POST, OPTIONS',
    }),
  });
}
