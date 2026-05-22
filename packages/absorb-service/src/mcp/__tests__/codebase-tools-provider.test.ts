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

  it('rejects non-native EMBEDDING_PROVIDER overrides', async () => {
    vi.stubEnv('EMBEDDING_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'present-but-ignored');

    await expect(detectBestEmbeddingProvider()).rejects.toThrow(
      /GraphRAG embedding provider must be holoembed/
    );
  });

  it('accepts HoloEmbed as the only explicit provider override', async () => {
    vi.stubEnv('EMBEDDING_PROVIDER', ' HoloEmbed ');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });

  it('maps structural legacy overrides to HoloEmbed', async () => {
    vi.stubEnv('EMBEDDING_PROVIDER', ' Structural ');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });

  it('defaults to HoloEmbed even when external provider credentials exist', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'present-but-not-default');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });

  it('caches the native provider for the session', async () => {
    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');

    vi.stubEnv('EMBEDDING_PROVIDER', 'structural');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });
});
