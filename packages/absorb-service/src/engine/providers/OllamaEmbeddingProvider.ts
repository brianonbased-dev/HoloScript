/**
 * Ollama Embedding Provider
 *
 * Extracted from the original EmbeddingIndex implementation.
 * Preserved for backward compatibility — works identically to the previous
 * hardcoded Ollama calls.
 *
 * Requires a running Ollama instance with the embedding model pulled:
 *   ollama pull nomic-embed-text
 */

import type { EmbeddingProvider } from './EmbeddingProvider';

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'ollama';

  private readonly url: string;
  private readonly model: string;

  /**
   * @param url   - Base URL of the running Ollama instance.
   *                Defaults to `'http://localhost:11434'`.
   * @param model - Name of the embedding model to use.
   *                Defaults to `'nomic-embed-text'`. Run `ollama pull <model>` first.
   */
  constructor(url = 'http://localhost:11434', model = 'nomic-embed-text') {
    this.url = url;
    this.model = model;
  }

  /**
   * Call Ollama `/api/embeddings` for each text.
   *
   * Processes one text at a time — the Ollama endpoint accepts a single prompt
   * per request. The returned vector dimension depends on the chosen model
   * (e.g. `nomic-embed-text` → 768).
   *
   * @param texts - One or more strings to embed.
   * @returns A `Promise` resolving to one embedding vector per input text.
   * @throws If the Ollama instance is unreachable or returns a non-2xx response.
   */
  async getEmbeddings(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      const response = await fetch(`${this.url}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });

      if (!response.ok) {
        throw new Error(`Ollama Embeddings API error: ${response.statusText}`);
      }

      const data = await response.json();
      results.push(data.embedding as number[]);
    }

    return results;
  }
}
