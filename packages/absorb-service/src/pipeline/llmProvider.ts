/**
 * LLM Provider — Concrete implementations for L1/L2 pipeline executors.
 *
 * Fallback chain: Anthropic → xAI → OpenAI → Ollama
 * Auto-detects available provider from environment variables.
 */

import type { LLMProvider } from './layerExecutors';

// ─── Anthropic Provider ─────────────────────────────────────────────────────

export class AnthropicLLMProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'claude-sonnet-4-5-20250929') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(params: {
    system: string;
    prompt: string;
    maxTokens: number;
  }): Promise<{ text: string }> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: params.maxTokens,
        system: params.system,
        messages: [{ role: 'user', content: params.prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text =
      data.content
        ?.filter((c: { type: string }) => c.type === 'text')
        .map((c: { text: string }) => c.text)
        .join('') ?? '';

    return { text };
  }
}

// ─── OpenAI Provider ────────────────────────────────────────────────────────

export class OpenAILLMProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(params: {
    system: string;
    prompt: string;
    maxTokens: number;
  }): Promise<{ text: string }> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: params.maxTokens,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.prompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    return { text };
  }
}

// ─── xAI (Grok) Provider ────────────────────────────────────────────────────
// OpenAI-compatible API at https://api.x.ai/v1

export class XAILLMProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'grok-3-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(params: {
    system: string;
    prompt: string;
    maxTokens: number;
  }): Promise<{ text: string }> {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: params.maxTokens,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.prompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`xAI API error ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    return { text };
  }
}

// ─── Ollama Provider ────────────────────────────────────────────────────────

export class OllamaLLMProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl = 'http://localhost:11434', model = 'llama3.1:8b') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
  }

  async chat(params: {
    system: string;
    prompt: string;
    maxTokens: number;
  }): Promise<{ text: string }> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        options: { num_predict: params.maxTokens },
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.prompt },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama API error ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.message?.content ?? '';
    return { text };
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Auto-detect available LLM provider from environment variables.
 * Fallback chain: ANTHROPIC_API_KEY → XAI_API_KEY → OPENAI_API_KEY → OLLAMA_URL
 */
export function createLLMProvider(): LLMProvider {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929';
    return new AnthropicLLMProvider(anthropicKey, model);
  }

  const xaiKey = process.env.XAI_API_KEY;
  if (xaiKey) {
    const model = process.env.XAI_MODEL ?? 'grok-3-mini';
    return new XAILLMProvider(xaiKey, model);
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    return new OpenAILLMProvider(openaiKey, model);
  }

  const ollamaUrl =
    process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL ?? process.env.BRITTNEY_MODEL ?? 'llama3.1:8b';
  return new OllamaLLMProvider(ollamaUrl, ollamaModel);
}

/**
 * Returns which provider would be used, for diagnostics.
 */
export function detectLLMProviderName(): string {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.XAI_API_KEY) return 'xai';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'ollama';
}
