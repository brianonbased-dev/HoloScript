import { NextResponse } from 'next/server';
import { extractUserKeys, getApiKey, resolveProviderLabel, type UserKeys } from '@/lib/byok';
import { rateLimit } from '@/lib/rateLimit';

const MAX_REQUESTS_PER_MIN = 60;

/**
 * POST /api/autocomplete
 *
 * Body: { prefix: string, suffix?: string, maxTokens?: number }
 * Returns: { completion: string }
 *
 * Cloud-first autocomplete. Tries OpenRouter, Anthropic, OpenAI in order.
 * Falls back to Ollama if configured, then returns empty completion gracefully.
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

type Provider = { name: string; call: (prefix: string, suffix: string, maxTokens: number) => Promise<string | null> };

function getProviders(userKeys: UserKeys): Provider[] {
  const providers: Provider[] = [];

  const openrouterKey = getApiKey(userKeys, 'openrouter');
  const anthropicKey = getApiKey(userKeys, 'anthropic');
  const openaiKey = getApiKey(userKeys, 'openai');

  if (openrouterKey) {
    providers.push({
      name: 'openrouter',
      call: async (prefix, suffix, maxTokens) => {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openrouterKey}`,
          },
          body: JSON.stringify({
            model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4',
            messages: [{ role: 'user', content: buildChatPrompt(prefix, suffix) }],
            max_tokens: maxTokens,
            temperature: 0.1,
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trimEnd() || null;
      },
    });
  }

  if (anthropicKey) {
    providers.push({
      name: 'anthropic',
      call: async (prefix, suffix, maxTokens) => {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
            max_tokens: maxTokens,
            messages: [{ role: 'user', content: buildChatPrompt(prefix, suffix) }],
            temperature: 0.1,
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.content?.[0]?.text?.trimEnd() || null;
      },
    });
  }

  if (openaiKey) {
    providers.push({
      name: 'openai',
      call: async (prefix, suffix, maxTokens) => {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4.1',
            messages: [{ role: 'user', content: buildChatPrompt(prefix, suffix) }],
            max_tokens: maxTokens,
            temperature: 0.1,
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trimEnd() || null;
      },
    });
  }

  // Ollama as optional local fallback
  if (process.env.OLLAMA_URL) {
    const ollamaBase = process.env.OLLAMA_URL;
    const model = process.env.OLLAMA_AUTOCOMPLETE_MODEL ?? 'codellama:7b-code';
    providers.push({
      name: 'ollama',
      call: async (prefix, suffix, maxTokens) => {
        const res = await fetch(`${ollamaBase}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt: buildFIMPrompt(prefix, suffix),
            stream: false,
            options: { num_predict: maxTokens, temperature: 0.1, stop: ['\n\n', '}', ')'] },
          }),
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { response?: string };
        return data.response?.trimEnd() || null;
      },
    });
  }

  return providers;
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const limit = rateLimit(ip, MAX_REQUESTS_PER_MIN);
  if (!limit.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded', retryAfter: limit.retryAfter }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(limit.retryAfter || 60),
        'X-RateLimit-Limit': String(MAX_REQUESTS_PER_MIN),
        'X-RateLimit-Remaining': '0',
      },
    });
  }

  const userKeys = extractUserKeys(request);
  const providerLabel = resolveProviderLabel(userKeys);

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

  const providers = getProviders(userKeys);

  for (const provider of providers) {
    try {
      const result = await provider.call(prefix, suffix, maxTokens);
      if (result) {
        return NextResponse.json(
          { completion: result, provider: provider.name },
          { headers: { 'x-llm-provider': providerLabel, 'X-RateLimit-Limit': String(MAX_REQUESTS_PER_MIN), 'X-RateLimit-Remaining': String(limit.remaining) } }
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
      warning: 'No AI provider configured. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in .env, or provide x-openrouter-key / x-anthropic-key / x-openai-key headers',
    },
    { headers: { 'x-llm-provider': 'none', 'X-RateLimit-Limit': String(MAX_REQUESTS_PER_MIN), 'X-RateLimit-Remaining': String(limit.remaining) } }
  );
}
