/**
 * Tests for LLMProviderManager
 *
 * Covers:
 * - Constructor and default strategy detection
 * - Provider registration and listing
 * - Provider ordering (primary + fallback)
 * - Strategy auto-detection priority
 * - Completion routing
 * - Fallback on failure
 * - Error for unregistered provider
 */

import { describe, it, expect, vi } from 'vitest';
import { LLMProviderManager } from './provider-manager';
import type { ILLMProvider, LLMProviderName } from './types';

function createMockProvider(name: string, shouldFail = false): ILLMProvider {
  return {
    name: name as LLMProviderName,
    async complete(req) {
      if (shouldFail) throw new Error(`${name} failed`);
      return { text: `response from ${name}`, provider: name as LLMProviderName, tokensUsed: 10, latencyMs: 50 };
    },
    async generateHoloScript(req) {
      if (shouldFail) throw new Error(`${name} failed`);
      return { code: `// from ${name}`, provider: name as LLMProviderName, tokensUsed: 20, latencyMs: 100 };
    },
    async healthCheck() {
      return { ok: !shouldFail, latencyMs: 10 };
    },
  } as ILLMProvider;
}

describe('LLMProviderManager', () => {
  describe('constructor', () => {
    it('creates with explicit strategy', () => {
      const manager = new LLMProviderManager({
        providers: { mock: createMockProvider('mock') } as any,
        strategy: { primary: 'mock' },
      });
      expect(manager.getRegisteredProviders()).toContain('mock');
    });

    it('auto-detects strategy from registered providers', () => {
      const manager = new LLMProviderManager({
        providers: { mock: createMockProvider('mock') } as any,
      });
      expect(manager.getRegisteredProviders()).toContain('mock');
    });
  });

  describe('getRegisteredProviders', () => {
    it('lists all registered providers', () => {
      const manager = new LLMProviderManager({
        providers: {
          mock: createMockProvider('mock'),
          openai: createMockProvider('openai'),
        } as any,
        strategy: { primary: 'mock', fallback: 'openai' },
      });
      const providers = manager.getRegisteredProviders();
      expect(providers).toContain('mock');
      expect(providers).toContain('openai');
    });

    it('excludes undefined providers', () => {
      const manager = new LLMProviderManager({
        providers: {
          mock: createMockProvider('mock'),
          openai: undefined,
        } as any,
        strategy: { primary: 'mock' },
      });
      expect(manager.getRegisteredProviders()).not.toContain('openai');
    });
  });

  describe('getProvider', () => {
    it('returns registered provider', () => {
      const mock = createMockProvider('mock');
      const manager = new LLMProviderManager({
        providers: { mock } as any,
        strategy: { primary: 'mock' },
      });
      expect(manager.getProvider('mock')).toBe(mock);
    });

    it('returns undefined for unregistered', () => {
      const manager = new LLMProviderManager({
        providers: { mock: createMockProvider('mock') } as any,
        strategy: { primary: 'mock' },
      });
      expect(manager.getProvider('openai')).toBeUndefined();
    });
  });

  describe('complete', () => {
    it('routes to primary provider', async () => {
      const manager = new LLMProviderManager({
        providers: { mock: createMockProvider('mock') } as any,
        strategy: { primary: 'mock' },
      });
      const result = await manager.complete({ prompt: 'hello', maxTokens: 100 });
      expect(result.text).toContain('mock');
    });

    it('routes to specified provider', async () => {
      const manager = new LLMProviderManager({
        providers: {
          mock: createMockProvider('mock'),
          openai: createMockProvider('openai'),
        } as any,
        strategy: { primary: 'mock' },
      });
      const result = await manager.complete({ prompt: 'hello', maxTokens: 100 }, 'openai');
      expect(result.text).toContain('openai');
    });

    it('throws for unregistered provider', async () => {
      const manager = new LLMProviderManager({
        providers: { mock: createMockProvider('mock') } as any,
        strategy: { primary: 'mock' },
      });
      await expect(manager.complete({ prompt: 'hello', maxTokens: 100 }, 'nonexistent' as any))
        .rejects.toThrow(/not registered/);
    });
  });

  describe('generateHoloScript', () => {
    it('uses primary provider', async () => {
      const manager = new LLMProviderManager({
        providers: { mock: createMockProvider('mock') } as any,
        strategy: { primary: 'mock' },
      });
      const result = await manager.generateHoloScript({ prompt: 'forest scene' });
      expect(result.code).toContain('mock');
      expect(result.attemptedProviders).toContain('mock');
    });

    it('falls back on primary failure', async () => {
      const manager = new LLMProviderManager({
        providers: {
          mock: createMockProvider('mock', true), // fails
          openai: createMockProvider('openai'),   // succeeds
        } as any,
        strategy: { primary: 'mock', fallback: 'openai' },
      });
      const result = await manager.generateHoloScript({ prompt: 'test' });
      expect(result.code).toContain('openai');
      expect(result.attemptedProviders).toEqual(['mock', 'openai']);
    });

    it('throws when all providers fail', async () => {
      const manager = new LLMProviderManager({
        providers: {
          mock: createMockProvider('mock', true),
          openai: createMockProvider('openai', true),
        } as any,
        strategy: { primary: 'mock', fallback: 'openai' },
      });
      await expect(manager.generateHoloScript({ prompt: 'test' }))
        .rejects.toThrow(/All providers failed/);
    });
  });

  describe('healthCheckAll', () => {
    it('checks all providers', async () => {
      const manager = new LLMProviderManager({
        providers: {
          mock: createMockProvider('mock'),
          openai: createMockProvider('openai'),
        } as any,
        strategy: { primary: 'mock' },
      });
      const results = await manager.healthCheckAll();
      expect(results.mock).toBeDefined();
      expect(results.mock.ok).toBe(true);
    });
  });
});
