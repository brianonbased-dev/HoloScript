/**
 * MemoryConsolidator tests
 *
 * Verifies that:
 * 1. The LLM path (via resolveSovereignProviderAsync) is taken when a provider
 *    is available and produces a non-empty narrative.
 * 2. The rule-based fallback is taken when the resolver throws (provider
 *    unreachable / unconfigured), so compressEpisodes never hard-fails.
 * 3. The >=3-occurrence guard is preserved in both paths.
 * 4. pruneStaleFacts confidence-decay still works (synchronous, unaffected).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryConsolidator, type EpisodicMemory } from './MemoryConsolidator';

// ---------------------------------------------------------------------------
// Module mock — vi.mock hoisting puts this above the import of the module
// under test, so MemoryConsolidator.ts picks up the mock when vitest loads it.
// ---------------------------------------------------------------------------
vi.mock('@holoscript/llm-provider', () => ({
  resolveSovereignProviderAsync: vi.fn(),
}));

// Re-import after vi.mock so we get the mock reference.
import { resolveSovereignProviderAsync } from '@holoscript/llm-provider';

const mockResolve = vi.mocked(resolveSovereignProviderAsync);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEpisodes(
  action: string,
  entity: string,
  count: number,
  successCount: number
): EpisodicMemory[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ep_${action}_${i}`,
    timestamp: Date.now() - (count - i) * 60_000,
    action,
    outcome: i < successCount ? 'success' : 'failure',
    entitiesInvolved: [entity],
  }));
}

// Minimal ILLMProvider mock that only implements `complete`.
function makeMockProvider(content: string) {
  return {
    complete: vi.fn().mockResolvedValue({
      content,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      model: 'mock-model',
      provider: 'mock' as const,
      finishReason: 'stop' as const,
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.resetAllMocks();
});

describe('MemoryConsolidator.compressEpisodes — LLM path', () => {
  it('uses the LLM narrative when the resolver returns a provider', async () => {
    const llmNarrative =
      'Repeated deploy actions on the gateway succeeded when credentials were pre-validated, revealing that auth-order is the critical invariant.';
    const mockProvider = makeMockProvider(llmNarrative);

    mockResolve.mockResolvedValueOnce({
      provider: mockProvider as unknown as Parameters<typeof mockResolve>[0] extends undefined
        ? never
        : Awaited<ReturnType<typeof mockResolve>>['provider'],
      model: 'mock-model',
      maxTokens: 8192,
      providerName: 'anthropic',
    } as Awaited<ReturnType<typeof mockResolve>>);

    // 5 raw episodes: 3 successes in one cluster → >=3 guard passes
    const episodes = [
      ...makeEpisodes('deploy', 'gateway', 3, 3), // cluster A: deploy_gateway
      ...makeEpisodes('scan', 'node', 2, 1),       // cluster B: scan_node — 2 < 3, skipped
    ];

    const { newFacts, prunedEpisodes } = await MemoryConsolidator.compressEpisodes(episodes);

    // Only cluster A (3 episodes) should produce a fact
    expect(newFacts).toHaveLength(1);
    expect(newFacts[0].fact).toBe(llmNarrative);
    expect(newFacts[0].confidence).toBeCloseTo(1.0);
    expect(newFacts[0].sourceEpisodes).toHaveLength(3);
    expect(prunedEpisodes).toHaveLength(3);

    // The resolver must have been called
    expect(mockResolve).toHaveBeenCalledOnce();
    // And the provider's complete must have been called with a prompt containing
    // the action and entity names
    expect(mockProvider.complete).toHaveBeenCalledOnce();
    const [req] = mockProvider.complete.mock.calls[0] as [Parameters<typeof mockProvider.complete>[0]];
    expect(req.messages[0].content).toContain('deploy');
    expect(req.messages[0].content).toContain('gateway');
    expect(req.maxTokens).toBe(80);
  });

  it('prompt contains the arc framing: what happened, why, what was learned', async () => {
    const mockProvider = makeMockProvider('The arc narrative.');
    mockResolve.mockResolvedValueOnce({
      provider: mockProvider as unknown as Awaited<ReturnType<typeof mockResolve>>['provider'],
      model: 'mock',
      maxTokens: 8192,
      providerName: 'anthropic',
    } as Awaited<ReturnType<typeof mockResolve>>);

    const episodes = makeEpisodes('compile', 'engine', 4, 3);
    // pad to 5 so compressEpisodes doesn't short-circuit
    // (all same key, so one cluster of 4)
    const extra: EpisodicMemory = {
      id: 'ep_extra',
      timestamp: Date.now(),
      action: 'compile',
      outcome: 'success',
      entitiesInvolved: ['engine'],
    };
    await MemoryConsolidator.compressEpisodes([...episodes, extra]);

    const [req] = mockProvider.complete.mock.calls[0] as [Parameters<typeof mockProvider.complete>[0]];
    const promptText = req.messages[0].content as string;

    // The prompt must carry the narrative arc framing (match the exact casing in the prompt)
    expect(promptText).toContain('What happened');
    expect(promptText).toContain('Why it matters');
    expect(promptText).toContain('What was learned');
    // Cluster-level metadata must be present
    expect(promptText).toContain('MEMORY.md');
    expect(promptText).toContain('success rate');
  });
});

describe('MemoryConsolidator.compressEpisodes — rule-based fallback', () => {
  it('falls back to rule-based summary when the resolver throws', async () => {
    mockResolve.mockRejectedValueOnce(
      new Error('No LLM provider configured — set HOLO_LLM_SERVICE_URL or ANTHROPIC_API_KEY.')
    );

    const episodes = makeEpisodes('cache_warm', 'redis', 5, 4);
    const { newFacts, prunedEpisodes } = await MemoryConsolidator.compressEpisodes(episodes);

    expect(newFacts).toHaveLength(1);
    // Rule-based output contains the action and entity
    expect(newFacts[0].fact).toContain('cache_warm');
    expect(newFacts[0].fact).toContain('redis');
    // High success rate → effective
    expect(newFacts[0].fact).toContain('effective');
    expect(newFacts[0].confidence).toBeCloseTo(4 / 5);
    expect(prunedEpisodes).toHaveLength(5);
  });

  it('falls back to rule-based summary when provider.complete throws', async () => {
    const mockProvider = {
      complete: vi.fn().mockRejectedValue(new Error('upstream 503')),
    };
    mockResolve.mockResolvedValueOnce({
      provider: mockProvider as unknown as Awaited<ReturnType<typeof mockResolve>>['provider'],
      model: 'mock',
      maxTokens: 4096,
      providerName: 'ollama',
    } as Awaited<ReturnType<typeof mockResolve>>);

    // 3 episodes in the cluster we care about + 2 unrelated (different action/entity)
    // to satisfy the rawEpisodes.length >= 5 short-circuit guard.
    const targetCluster = makeEpisodes('index_rebuild', 'db', 3, 0);
    const filler: EpisodicMemory[] = [
      { id: 'filler_1', timestamp: Date.now(), action: 'ping', outcome: 'success', entitiesInvolved: ['health'] },
      { id: 'filler_2', timestamp: Date.now(), action: 'ping', outcome: 'success', entitiesInvolved: ['health'] },
    ];
    const { newFacts } = await MemoryConsolidator.compressEpisodes([...targetCluster, ...filler]);

    expect(newFacts).toHaveLength(1);
    // Low success rate → high failure risk
    expect(newFacts[0].fact).toContain('high failure risk');
    expect(newFacts[0].confidence).toBe(0);
  });

  it('falls back to rule-based summary when provider returns empty content', async () => {
    const mockProvider = makeMockProvider('  \n  '); // whitespace only
    mockResolve.mockResolvedValueOnce({
      provider: mockProvider as unknown as Awaited<ReturnType<typeof mockResolve>>['provider'],
      model: 'mock',
      maxTokens: 8192,
      providerName: 'anthropic',
    } as Awaited<ReturnType<typeof mockResolve>>);

    const episodes = makeEpisodes('sync', 'peer', 3, 3);
    const extra = makeEpisodes('other', 'node', 2, 2); // below threshold, ignored
    const { newFacts } = await MemoryConsolidator.compressEpisodes([...episodes, ...extra]);

    expect(newFacts).toHaveLength(1);
    // Empty LLM response → rule-based fact
    expect(newFacts[0].fact).toContain('sync');
    expect(newFacts[0].fact).toContain('peer');
  });
});

describe('MemoryConsolidator — >=3-occurrence guard', () => {
  it('skips clusters with fewer than 3 episodes regardless of provider availability', async () => {
    // Resolver should never be called for sub-threshold clusters
    mockResolve.mockResolvedValue({
      provider: makeMockProvider('should not appear') as unknown as Awaited<ReturnType<typeof mockResolve>>['provider'],
      model: 'mock',
      maxTokens: 8192,
      providerName: 'anthropic',
    } as Awaited<ReturnType<typeof mockResolve>>);

    // 5 total but split across 3 clusters, none with >=3
    const episodes: EpisodicMemory[] = [
      ...makeEpisodes('a', 'x', 2, 2), // 2 < 3
      ...makeEpisodes('b', 'y', 2, 1), // 2 < 3
      ...makeEpisodes('c', 'z', 1, 0), // 1 < 3
    ];

    const { newFacts, prunedEpisodes } = await MemoryConsolidator.compressEpisodes(episodes);

    expect(newFacts).toHaveLength(0);
    expect(prunedEpisodes).toHaveLength(0);
    // Resolver should NOT have been called (guard runs before LLM)
    expect(mockResolve).not.toHaveBeenCalled();
  });
});

describe('MemoryConsolidator — short-circuit guard', () => {
  it('returns empty results when rawEpisodes < 5 without touching the LLM', async () => {
    const episodes = makeEpisodes('task', 'agent', 4, 4); // 4 < 5
    const result = await MemoryConsolidator.compressEpisodes(episodes);

    expect(result.newFacts).toHaveLength(0);
    expect(result.prunedEpisodes).toHaveLength(0);
    expect(mockResolve).not.toHaveBeenCalled();
  });
});

describe('MemoryConsolidator.pruneStaleFacts', () => {
  it('decays confidence for stale facts and removes those below 0.3', () => {
    const now = Date.now();
    const stale: Parameters<typeof MemoryConsolidator.pruneStaleFacts>[0] = [
      {
        id: 'f1',
        fact: 'stale low-confidence fact',
        confidence: 0.31,
        sourceEpisodes: ['e1'],
        lastAccessed: now - 48 * 60 * 60 * 1000, // 48h ago → deep decay
        accessCount: 1,
      },
      {
        id: 'f2',
        fact: 'fresh high-confidence fact',
        confidence: 0.95,
        sourceEpisodes: ['e2'],
        lastAccessed: now - 30 * 60 * 1000, // 30 min ago → no decay
        accessCount: 5,
      },
    ];

    const pruned = MemoryConsolidator.pruneStaleFacts(stale, 100);

    // f1 should be dropped after 48h of decay (0.31 * 0.95^48 ≈ 0.028, below 0.3)
    expect(pruned.map((f) => f.id)).not.toContain('f1');
    // f2 survives
    expect(pruned.map((f) => f.id)).toContain('f2');
    expect(pruned[0].confidence).toBeGreaterThan(0.9);
  });
});
