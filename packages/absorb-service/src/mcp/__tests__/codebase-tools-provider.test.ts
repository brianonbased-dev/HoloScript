import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectBestEmbeddingProvider,
  resetDetectedEmbeddingProviderForTests,
} from '../codebase-tools';

describe('detectBestEmbeddingProvider', () => {
  beforeEach(() => {
    resetDetectedEmbeddingProviderForTests();
    vi.stubEnv('EMBEDDING_PROVIDER', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('OLLAMA_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetDetectedEmbeddingProviderForTests();
  });

  it('keeps EMBEDDING_PROVIDER as the explicit operator override', async () => {
    vi.stubEnv('EMBEDDING_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'present-but-overridden');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('openai');
  });

  it('defaults to HoloEmbed even when external provider credentials exist', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'present-but-not-default');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });

  it('caches the detected provider for the session', async () => {
    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');

    vi.stubEnv('EMBEDDING_PROVIDER', 'structural');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });
});
