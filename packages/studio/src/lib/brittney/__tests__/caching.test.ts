import { describe, expect, it } from 'vitest';
import {
  buildBrainCachingPromptBlock,
  buildBrainCachingRecommendation,
  inferBrainCacheCapability,
  inferBrainCachingScope,
} from '../caching';
import { buildContextualPrompt } from '../systemPrompt';

describe('Brittney brain caching guidance', () => {
  it('infers team-board scope from Studio board context', () => {
    expect(inferBrainCachingScope('--- Team Board ---\nTasks:\n- [P3 open] Build cache')).toBe(
      'team-board'
    );
  });

  it('infers per-agent role scope from daemon agent context', () => {
    expect(inferBrainCachingScope('--- Agent Sessions ---\ndj-1: running; mission=review')).toBe(
      'agent-role'
    );
  });

  it('maps selected provider/model to cache capability', () => {
    expect(inferBrainCacheCapability('anthropic', 'claude-opus-4-7')).toBe('provider-prompt-cache');
    expect(inferBrainCacheCapability('cloud', 'brittney-standard')).toBe('service-managed-cache');
    expect(inferBrainCacheCapability('ollama', 'brittney-qwen-v23:latest')).toBe(
      'local-prefix-cache'
    );
    expect(inferBrainCacheCapability('unknown', 'mystery')).toBe('none');
  });

  it('builds a concrete @caching declaration for team-board brains', () => {
    const recommendation = buildBrainCachingRecommendation({
      sceneContext: '--- Team Board ---\nTasks: task cache',
      providerName: 'anthropic',
      model: 'claude-opus-4-7',
    });

    expect(recommendation.scope).toBe('team-board');
    expect(recommendation.stablePrefix).toBe('team-board');
    expect(recommendation.expectedReuseRate).toBeGreaterThan(0.8);
    expect(recommendation.declaration).toContain('@caching');
    expect(recommendation.declaration).toContain('stablePrefix: "team-board"');
    expect(recommendation.declaration).toContain('cacheCapability: "provider-prompt-cache"');
    expect(recommendation.declaration).toContain('cacheUsage: "shared-prefix"');
  });

  it('injects caching guidance into Brittney contextual prompts', () => {
    const prompt = buildContextualPrompt(
      '--- Agent Sessions ---\ndj-1: running; mission=build',
      null,
      false,
      {
        providerName: 'ollama',
        model: 'brittney-qwen-v23:latest',
      }
    );

    expect(prompt).toContain('--- Brittney Brain Caching ---');
    expect(prompt).toContain('auto-generate an @caching declaration');
    expect(prompt).toContain('stablePrefix: "agent-role"');
    expect(prompt).toContain('cacheCapability: "local-prefix-cache"');
    expect(prompt).toContain('cacheUsage: "role-overlay"');
  });

  it('surfaces no-cache providers without hiding the declaration intent', () => {
    const block = buildBrainCachingPromptBlock({
      sceneContext: 'composition "Scene" {}',
      providerName: 'unknown',
      model: 'mystery',
    });

    expect(block).toContain('cacheCapability: "none"');
    expect(block).toContain('does not expose a durable prompt-cache receipt');
  });
});
