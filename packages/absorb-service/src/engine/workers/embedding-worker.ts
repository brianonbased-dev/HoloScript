/**
 * Embedding Worker
 *
 * Parallel worker for generating embeddings via OpenAI/Ollama/Xenova.
 * Processes batches of symbol texts and returns embedding vectors.
 *
 * Phase 9 Extension: Speeds up embedding generation 4-8x by parallelizing
 * API calls across multiple worker threads.
 */

import { parentPort } from 'worker_threads';

interface EmbeddingJob {
  jobId: string;
  texts: string[];
  provider: {
    name: string;
    config: {
      apiKey?: string;
      model?: string;
      ollamaUrl?: string;
      ollamaModel?: string;
      xenovaModel?: string;
    };
  };
}

interface EmbeddingResult {
  jobId: string;
  embeddings?: number[][];
  error?: { message: string };
}

/**
 * Create embedding provider instance in worker context.
 */
async function createProvider(providerConfig: EmbeddingJob['provider']): Promise<any> {
  const { name, config } = providerConfig;

  try {
    switch (name) {
      case 'openai': {
        const { OpenAIEmbeddingProvider } = await import('../providers/OpenAIEmbeddingProvider');
        return new OpenAIEmbeddingProvider(config.apiKey, config.model);
      }
      case 'ollama': {
        const { OllamaEmbeddingProvider } = await import('../providers/OllamaEmbeddingProvider');
        return new OllamaEmbeddingProvider(config.ollamaUrl, config.ollamaModel);
      }
      case 'xenova': {
        const { XenovaEmbeddingProvider } = await import('../providers/XenovaEmbeddingProvider');
        return new XenovaEmbeddingProvider(config.xenovaModel);
      }
      default:
        throw new Error(`Unknown provider: ${name}`);
    }
  } catch (err) {
    throw new Error(
      `Failed to create ${name} provider: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Process embedding job (called from worker pool).
 */
parentPort?.on('message', async (job: EmbeddingJob) => {
  const { jobId, texts, provider: providerConfig } = job;

  try {
    const provider = await createProvider(providerConfig);
    const embeddings = await provider.getEmbeddings(texts);

    parentPort?.postMessage({
      jobId,
      embeddings,
    } as EmbeddingResult);
  } catch (err) {
    parentPort?.postMessage({
      jobId,
      error: {
        message: err instanceof Error ? err.message : String(err),
      },
    } as EmbeddingResult);
  }
});

// Send ready signal
parentPort?.postMessage({ type: 'ready' });
