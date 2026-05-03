export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limiter';
import { checkCredits, deductCredits } from '@/lib/creditGate';
import { requireAuth } from '@/lib/api-auth';
import { corsHeaders } from '../../_lib/cors';
import {
  AnthropicAdapter,
  OpenAIAdapter,
  OpenRouterAdapter,
  LocalLLMAdapter,
} from '@holoscript/llm-provider';

const MAX_REQUESTS_PER_MIN = 10;
// SEC-T03: cap untrusted prompt length before any LLM spend.
const MAX_PROMPT_CHARS = 4000;

/** POST /api/material/generate
 *  Body: { prompt: string; baseColor?: string; model?: string }
 *  Returns: { glsl: string; traits: string; error?: string }
 *
 *  Cloud-first: tries OpenRouter, Anthropic, OpenAI, then Ollama as optional fallback.
 */
export async function POST(req: NextRequest) {
  // SEC-T03: require authenticated session before any paid-LLM call.
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const limit = rateLimit(
    req,
    { max: MAX_REQUESTS_PER_MIN, label: 'Rate limit exceeded' },
    'material-generate'
  );
  if (!limit.ok) {
    return limit.response;
  }

  // Credit gate — must pass before any LLM call
  const gate = await checkCredits(req, 'studio_material');
  if (gate.error) return gate.error;

  let body: { prompt?: string; baseColor?: string; model?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { prompt, baseColor = '#ffffff' } = body;
  if (!prompt) {
    return NextResponse.json({ error: '`prompt` is required' }, { status: 400 });
  }

  if (prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: `prompt exceeds ${MAX_PROMPT_CHARS} chars` },
      { status: 400 }
    );
  }

  const systemPrompt = `You are a GLSL fragment shader expert. Your job is to generate a
complete, self-contained GLSL fragment shader for use in Three.js / WebGL.

Rules:
- Output ONLY two blocks separated by "---TRAITS---":
  1. A valid GLSL fragment shader string (void main(), use gl_FragCoord, vUv, uTime uniforms)
  2. A HoloScript @material trait string (one-liner with key:value pairs)
- Do NOT include markdown fences, explanations, or any text outside these two blocks.
- The shader must compile without errors.
- Use these available uniforms: float uTime, vec2 vUv, vec3 uBaseColor
- Base color is: ${baseColor}

Example output format:
precision mediump float;
uniform float uTime;
uniform vec2 vUv;
uniform vec3 uBaseColor;
void main() {
  float wave = sin(vUv.x * 10.0 + uTime) * 0.5 + 0.5;
  gl_FragColor = vec4(uBaseColor * wave, 1.0);
}
---TRAITS---
@material emissive:"#ff6600" emissiveIntensity:0.8 metalness:0.0 roughness:0.5`;

  const userPrompt = `${systemPrompt}\n\nUser request: ${prompt}`;

  // Try cloud providers in order, then Ollama as optional fallback
  const raw =
    (await tryCloudProviders(systemPrompt, prompt)) ??
    (await tryOllamaFallback(userPrompt, body.model));

  if (!raw) {
    return NextResponse.json(
      {
        error:
          'No AI provider available. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in .env',
      },
      { status: 503 }
    );
  }

  // Split on the separator
  const parts = raw.split('---TRAITS---');
  const glsl = (parts[0] ?? '').trim();
  const traits = (parts[1] ?? '').trim();

  if (!glsl.includes('void main')) {
    return NextResponse.json({ error: 'Model did not return valid GLSL', raw }, { status: 422 });
  }

  // Deduct credits after successful generation (fire-and-forget)
  deductCredits(gate.userId, 'studio_material').catch(() => {});

  return NextResponse.json(
    { glsl, traits, raw },
    {
      headers: {
        'x-llm-provider': 'server',
        'X-RateLimit-Limit': String(MAX_REQUESTS_PER_MIN),
        'X-RateLimit-Remaining': String(limit.remaining),
      },
    }
  );
}

async function tryCloudProviders(systemPrompt: string, prompt: string): Promise<string | null> {
  // B1a: migrated from inline fetch() to @holoscript/llm-provider adapters
  // which inherit withRetry from BaseLLMAdapter — exponential backoff
  // on 429/5xx + Retry-After honoring.
  const openrouterKey = process.env.OPENROUTER_API_KEY || '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  const openaiKey = process.env.OPENAI_API_KEY || '';

  // OpenRouter
  if (openrouterKey) {
    try {
      const adapter = new OpenRouterAdapter({ apiKey: openrouterKey });
      const result = await adapter.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        maxTokens: 512,
        temperature: 0.7,
      });
      if (result.content) return result.content;
    } catch {
      /* try next */
    }
  }

  // Anthropic
  if (anthropicKey) {
    try {
      const model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';
      const isOpus47 = model === 'claude-opus-4-7';
      const adapter = new AnthropicAdapter({ apiKey: anthropicKey, defaultModel: model });
      const result = await adapter.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        maxTokens: 512,
        ...(isOpus47 ? {} : { temperature: 0.7 }),
      });
      if (result.content) return result.content;
    } catch {
      /* try next */
    }
  }

  // OpenAI
  if (openaiKey) {
    try {
      const adapter = new OpenAIAdapter({ apiKey: openaiKey });
      const result = await adapter.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        maxTokens: 512,
        temperature: 0.7,
      });
      if (result.content) return result.content;
    } catch {
      /* try next */
    }
  }

  return null;
}

async function tryOllamaFallback(fullPrompt: string, model?: string): Promise<string | null> {
  const ollamaUrl = process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL;
  if (!ollamaUrl) return null;
  try {
    const adapter = new LocalLLMAdapter({
      baseURL: ollamaUrl,
      defaultModel: model || 'brittney-qwen-v23:latest',
      timeoutMs: 30_000,
    });
    const result = await adapter.complete({
      messages: [{ role: 'user', content: fullPrompt }],
      maxTokens: 512,
      temperature: 0.7,
    });
    return result.content || null;
  } catch {
    return null;
  }
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, {
      methods: 'GET, POST, OPTIONS',
    }),
  });
}
