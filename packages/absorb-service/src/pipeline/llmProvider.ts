/**
 * LLM Provider — Concrete implementations for L1/L2 pipeline executors.
 *
 * Fallback chain: OpenRouter → Anthropic → xAI → OpenAI → Ollama (last resort)
 * Auto-detects available provider from environment variables.
 *
 * Each provider's chat() retries transient errors (429, 5xx, network) with
 * exponential backoff before throwing. Non-2xx 4xx responses fail immediately.
 */

import type { LLMProvider } from './layerExecutors';

// ─── Retry / Backoff ───────────────────────────────────────────────────────

interface RetryConfig {
  /** Total HTTP attempts on 429/5xx (including the first). */
  maxAttempts: number;
  /** Base delay in ms; actual delay is 2^attempt * baseDelayMs + jitter. */
  baseDelayMs: number;
  /** Number of retries on network-level errors (thrown from fetch). */
  networkRetries: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 100,
  networkRetries: 1,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attemptIndex: number, baseMs: number): number {
  const expo = Math.pow(2, attemptIndex) * baseMs;
  const jitter = Math.random() * baseMs;
  return expo + jitter;
}

/** Parse a Retry-After header (seconds, or HTTP-date) into ms; null if absent/invalid. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

/**
 * Issue a fetch with retry on 429 / 5xx / network errors. Each attempt gets a
 * fresh AbortSignal.timeout(timeoutMs) so a slow attempt can't poison the whole
 * budget. 4xx (other than 429) returns immediately for the caller to throw.
 */
async function fetchWithRetry(
  url: string,
  init: Omit<RequestInit, 'signal'>,
  timeoutMs: number,
  config: RetryConfig = DEFAULT_RETRY
): Promise<Response> {
  let networkRetriesUsed = 0;
  let httpAttemptsUsed = 0;

  while (true) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (networkRetriesUsed < config.networkRetries) {
        const delay = backoffDelayMs(networkRetriesUsed, config.baseDelayMs);
        networkRetriesUsed++;
        await sleep(delay);
        continue;
      }
      throw err;
    }

    if (res.ok) return res;

    const isRetryable = res.status === 429 || (res.status >= 500 && res.status < 600);
    if (!isRetryable) return res;

    httpAttemptsUsed++;
    if (httpAttemptsUsed >= config.maxAttempts) return res;

    const retryAfter = parseRetryAfter(res.headers?.get?.('retry-after') ?? null);
    const delay = retryAfter ?? backoffDelayMs(httpAttemptsUsed - 1, config.baseDelayMs);
    await res.text().catch(() => '');
    await sleep(delay);
  }
}

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
    const res = await fetchWithRetry(
      'https://api.anthropic.com/v1/messages',
      {
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
      },
      60_000
    );

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
    const res = await fetchWithRetry(
      'https://api.openai.com/v1/chat/completions',
      {
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
      },
      60_000
    );

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
    const res = await fetchWithRetry(
      'https://api.x.ai/v1/chat/completions',
      {
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
      },
      60_000
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`xAI API error ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    return { text };
  }
}

// ─── OpenRouter Provider ───────────────────────────────────────────────────
// OpenAI-compatible API at https://openrouter.ai/api/v1

export class OpenRouterLLMProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'anthropic/claude-sonnet-4') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(params: {
    system: string;
    prompt: string;
    maxTokens: number;
  }): Promise<{ text: string }> {
    const res = await fetchWithRetry(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://holoscript.net',
          'X-Title': 'HoloScript Absorb',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: params.maxTokens,
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content: params.prompt },
          ],
        }),
      },
      60_000
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenRouter API error ${res.status}: ${body.slice(0, 200)}`);
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
    const res = await fetchWithRetry(
      `${this.baseUrl}/api/chat`,
      {
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
      },
      120_000
    );

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
 * Fallback chain: OPENROUTER_API_KEY → ANTHROPIC_API_KEY → XAI_API_KEY → OPENAI_API_KEY → OLLAMA_URL (last resort)
 */
export function createLLMProvider(): LLMProvider {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    const model = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4';
    return new OpenRouterLLMProvider(openRouterKey, model);
  }

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

  // Ollama is last resort — only used if no cloud API keys are set and OLLAMA_URL is configured
  const ollamaUrl = process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL;
  if (!ollamaUrl) {
    throw new Error(
      '[LLMProvider] No AI provider configured. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, or OLLAMA_URL in .env'
    );
  }
  const ollamaModel = process.env.OLLAMA_MODEL ?? process.env.BRITTNEY_MODEL ?? 'llama3.1:8b';
  console.warn(
    '[LLMProvider] No cloud API keys found (OPENROUTER_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY). Falling back to Ollama.'
  );
  return new OllamaLLMProvider(ollamaUrl, ollamaModel);
}

/**
 * Returns which provider would be used, for diagnostics.
 */
export function detectLLMProviderName(): string {
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.XAI_API_KEY) return 'xai';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'ollama';
}
