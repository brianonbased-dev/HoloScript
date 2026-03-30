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

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';

  private readonly apiKey: string;
  private readonly model: string;
  // Lazily initialised SDK client.
  private clientPromise: Promise<any> | null = null;

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
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // OpenAI accepts an array of strings in one request — more efficient.
        const response = await client.embeddings.create({
          model: this.model,
          input: texts,
        });

        return (response.data as Array<{ embedding: number[] }>).map((d) => d.embedding);
      } catch (error: any) {
        lastError = error;

        // Check for rate limit error (429 or specific error codes)
        const isRateLimit =
          error?.status === 429 ||
          error?.code === 'rate_limit_exceeded' ||
          error?.message?.includes('rate limit') ||
          error?.message?.includes('Rate limit');

        if (!isRateLimit || attempt === maxRetries - 1) {
          // Not a rate limit or final attempt - throw immediately
          throw error;
        }

        // Exponential backoff: 2^attempt seconds (2s, 4s, 8s, 16s, 32s)
        const backoffMs = Math.min(32000, Math.pow(2, attempt + 1) * 1000);
        const retryAfter = error?.headers?.['retry-after']
          ? parseInt(error.headers['retry-after']) * 1000
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

  private getClient(): Promise<any> {
    if (!this.clientPromise) {
      this.clientPromise = this.initClient();
    }
    return this.clientPromise;
  }

  private async initClient(): Promise<any> {
    let OpenAI: any;

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
