/**
 * OpenAI Embedding Provider
 *
 * Uses OpenAI's text-embedding-3-small model (1536-dim) via the official SDK.
 *
 * Requires the optional dependency to be installed and an API key:
 *   pnpm add openai --filter @holoscript/core
 *   export OPENAI_API_KEY=sk-...
 *
 * The API key can also be passed directly to the constructor.
 */

import type { EmbeddingProvider } from './EmbeddingProvider';

/** Minimal interface for dynamically-imported OpenAI client */
interface OpenAIClient {
  embeddings: {
    create(params: { model: string; input: string[] }): Promise<{
      data: Array<{ embedding: number[] }>;
    }>;
  };
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';

  private readonly apiKey: string;
  private readonly model: string;
  // Lazily initialised SDK client.
  private clientPromise: Promise<OpenAIClient> | null = null;

  /**
   * @param apiKey - OpenAI API key. Falls back to the `OPENAI_API_KEY` environment
   *                 variable when omitted. Throws at embed-time if neither is set.
   * @param model  - Embedding model name. Defaults to `'text-embedding-3-small'`
   *                 (1536-dim). Use `'text-embedding-3-large'` for 3072-dim.
   */
  constructor(apiKey?: string, model = 'text-embedding-3-small') {
    this.apiKey = apiKey ?? process.env['OPENAI_API_KEY'] ?? '';
    this.model = model;
  }

  /**
   * Embed all texts in a single batched OpenAI API request.
   * Includes retry logic with exponential backoff for rate limit errors.
   *
   * @param texts - One or more strings to embed.
   * @returns A `Promise` resolving to one embedding vector per input text.
   *          Vector length is determined by the chosen model (1536 for default).
   * @throws If the `openai` package is not installed, the API key is missing,
   *         or the OpenAI endpoint returns an error after retries.
   */
  async getEmbeddings(texts: string[]): Promise<number[][]> {
    const client = await this.getClient();
    const maxRetries = 5;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // OpenAI accepts an array of strings in one request — more efficient.
        const response = await client.embeddings.create({
          model: this.model,
          input: texts,
        });

        return response.data.map((d) => d.embedding);
      } catch (error: unknown) {
        lastError = error;

        // Check for rate limit error (429 or specific error codes)
        const errObj = error as Record<string, unknown>;
        const errMsg = error instanceof Error ? error.message : String(error);
        const isRateLimit =
          errObj?.status === 429 ||
          errObj?.code === 'rate_limit_exceeded' ||
          errMsg?.includes('rate limit') ||
          errMsg?.includes('Rate limit');

        if (!isRateLimit || attempt === maxRetries - 1) {
          // Not a rate limit or final attempt - throw immediately
          throw error;
        }

        // Exponential backoff: 2^attempt seconds (2s, 4s, 8s, 16s, 32s)
        const backoffMs = Math.min(32000, Math.pow(2, attempt + 1) * 1000);
        const headers = errObj?.headers as Record<string, string> | undefined;
        const retryAfter = headers?.['retry-after']
          ? parseInt(headers['retry-after']) * 1000
          : backoffMs;

        console.error(
          `[OpenAI] Rate limit hit (attempt ${attempt + 1}/${maxRetries}). ` +
            `Retrying in ${Math.round(retryAfter / 1000)}s...`
        );

        await new Promise((resolve) => setTimeout(resolve, retryAfter));
      }
    }

    throw lastError || new Error('Failed to generate embeddings after retries');
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private getClient(): Promise<OpenAIClient> {
    if (!this.clientPromise) {
      this.clientPromise = this.initClient();
    }
    return this.clientPromise;
  }

  private async initClient(): Promise<OpenAIClient> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamically imported constructor
    let OpenAI: new (opts: { apiKey: string }) => OpenAIClient;

    try {
      const m = await import('openai');
      OpenAI = m.default ?? m.OpenAI;
    } catch {
      throw new Error(
        'OpenAI provider requires the openai package. ' +
          'Install it with:\n' +
          '  pnpm add openai --filter @holoscript/core\n' +
          'or use --provider ollama for local operation.'
      );
    }

    if (!this.apiKey) {
      throw new Error(
        'OpenAI API key is required. ' +
          'Pass it to the constructor or set the OPENAI_API_KEY environment variable.'
      );
    }

    return new OpenAI({ apiKey: this.apiKey });
  }
}
