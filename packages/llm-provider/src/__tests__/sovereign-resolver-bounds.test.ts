/**
 * A caller's per-attempt bound reaches the paid adapters (claude4's review of
 * holo_ask_codebase routing, 2026-10-08). holo_ask_codebase asks for one
 * attempt within 120 s; the anthropic / xai / openai resolvers built their
 * adapters without the bound, so each got the base defaults (3 retries,
 * 300 s) and one question could bill up to four completions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSovereignProvider } from '../sovereign-resolver';

afterEach(() => {
  vi.unstubAllEnvs();
});

function adapterConfig(provider: unknown): { timeoutMs?: number; maxRetries?: number } {
  return (provider as { config: { timeoutMs?: number; maxRetries?: number } }).config;
}

describe('resolver bounds on paid adapters', () => {
  it.each([
    ['anthropic', 'ANTHROPIC_API_KEY'],
    ['xai', 'XAI_API_KEY'],
    ['openai', 'OPENAI_API_KEY'],
  ])('%s carries the caller timeoutMs and maxRetries', (explicit, keyEnv) => {
    vi.stubEnv(keyEnv, 'test-only-not-a-key');
    const resolved = resolveSovereignProvider({ explicit, timeoutMs: 120_000, maxRetries: 0 });
    expect(resolved.providerName).toBe(explicit);
    expect(adapterConfig(resolved.provider)).toMatchObject({ timeoutMs: 120_000, maxRetries: 0 });
  });

  it('keeps each adapter default when the caller names no bound', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-only-not-a-key');
    const resolved = resolveSovereignProvider({ explicit: 'anthropic' });
    expect(adapterConfig(resolved.provider).maxRetries).toBeGreaterThan(0);
  });
});
