/**
 * Brittney provider resolution tests — D.025 Phase 3
 *
 * Pins the BRITTNEY_PROVIDER env gate behavior:
 *   - explicit anthropic → AnthropicAdapter with correct model/maxTokens
 *   - explicit ollama → LocalLLMAdapter with Ollama host
 *   - auto-detect: ANTHROPIC_API_KEY present → anthropic
 *   - auto-detect: OLLAMA_HOST present → ollama
 *   - neither configured → clear error
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveBrittneyProvider } from '../provider';

describe('resolveBrittneyProvider', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.BRITTNEY_PROVIDER;
    delete process.env.BRITTNEY_MODEL;
    delete process.env.BRITTNEY_MAX_TOKENS;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('resolves anthropic when BRITTNEY_PROVIDER=anthropic and ANTHROPIC_API_KEY set', () => {
    process.env.BRITTNEY_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test-key-123';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('anthropic');
    expect(result.provider.name).toBe('anthropic');
    expect(result.model).toBe('claude-opus-4-7');
    expect(result.maxTokens).toBe(16000);
  });

  it('resolves anthropic with BRITTNEY_MODEL override', () => {
    process.env.BRITTNEY_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test-key-123';
    process.env.BRITTNEY_MODEL = 'claude-sonnet-4-6';
    const result = resolveBrittneyProvider();
    expect(result.model).toBe('claude-sonnet-4-6');
  });

  it('resolves ollama when BRITTNEY_PROVIDER=ollama', () => {
    process.env.BRITTNEY_PROVIDER = 'ollama';
    process.env.OLLAMA_HOST = 'http://host.docker.internal:11434';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('ollama');
    expect(result.provider.name).toBe('local-llm');
    expect(result.model).toBe('brittney-qwen-v23:latest');
    expect(result.maxTokens).toBe(4096);
  });

  it('resolves ollama with BRITTNEY_MODEL and BRITTNEY_MAX_TOKENS overrides', () => {
    process.env.BRITTNEY_PROVIDER = 'ollama';
    process.env.OLLAMA_HOST = 'http://localhost:11434';
    process.env.BRITTNEY_MODEL = 'llama3:8b';
    process.env.BRITTNEY_MAX_TOKENS = '8192';
    const result = resolveBrittneyProvider();
    expect(result.model).toBe('llama3:8b');
    expect(result.maxTokens).toBe(8192);
  });

  it('resolves ollama with default localhost when OLLAMA_HOST not set', () => {
    process.env.BRITTNEY_PROVIDER = 'ollama';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('ollama');
  });

  it('auto-detects anthropic when ANTHROPIC_API_KEY present', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-auto-detect';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('anthropic');
  });

  it('auto-detects ollama when only OLLAMA_HOST present', () => {
    process.env.OLLAMA_HOST = 'http://192.168.1.100:11434';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('ollama');
  });

  it('throws clear error when no provider is configured', () => {
    expect(() => resolveBrittneyProvider()).toThrow(/No Brittney provider configured/);
  });

  it('throws clear error when BRITTNEY_PROVIDER=anthropic but no API key', () => {
    process.env.BRITTNEY_PROVIDER = 'anthropic';
    expect(() => resolveBrittneyProvider()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('prefers anthropic over ollama when both configured (auto-detect)', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.OLLAMA_HOST = 'http://localhost:11434';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('anthropic');
  });

  it('explicit BRITTNEY_PROVIDER=ollama overrides auto-detect even when ANTHROPIC_API_KEY present', () => {
    process.env.BRITTNEY_PROVIDER = 'ollama';
    process.env.ANTHROPIC_API_KEY = 'sk-still-present';
    process.env.OLLAMA_HOST = 'http://localhost:11434';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('ollama');
  });

  it('recognizes OLLAMA_BASE_URL as alternative to OLLAMA_HOST', () => {
    process.env.OLLAMA_BASE_URL = 'http://custom-host:11434';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('ollama');
  });
});