/**
 * Tests for the capability-aware provider router (Lane 3 Phase 4b).
 *
 * Pure-function semantics — no I/O. All tests use synthetic capability
 * manifests so the algorithm is testable in isolation from the actual
 * adapter declarations.
 *
 * G.GOLD.013 false-case discipline: every "expected behavior" test has
 * a paired "must NOT" assertion to catch silent regressions.
 */

import { describe, it, expect } from 'vitest';
import type { Capabilities, LLMProviderName } from '@holoscript/llm-provider';
import {
  pickProvider,
  NoEligibleProviderError,
  type RoutingCandidate,
  type BrainRequirements,
} from '../capability-router.js';

// ─── Test fixtures ────────────────────────────────────────────────────

function caps(overrides: Partial<Capabilities>): Capabilities {
  return {
    contextWindow: 0,
    maxOutput: 0,
    streaming: true,
    tools: true,
    vision: false,
    bearerTokenAccess: true,
    ...overrides,
  };
}

const ANTHROPIC_LIKE: RoutingCandidate = {
  name: 'anthropic',
  capabilities: caps({
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    vision: true,
    visibleReasoning: true,
    perLoopBudget: true,
    serverSideCompaction: true,
    promptCaching: true,
    hostedAgenticLoop: true,
  }),
};

const OPENAI_LIKE: RoutingCandidate = {
  name: 'openai',
  capabilities: caps({
    streaming: true,
    tools: true,
    vision: true,
    audioInput: true,
    realtimeVoice: true,
    embeddings: true,
    visibleReasoning: true,
    liveWebSearch: true,
  }),
};

const GROK_LIKE: RoutingCandidate = {
  name: 'xai',
  capabilities: caps({
    streaming: true,
    tools: true,
    liveWebSearch: true, // unique differentiator
  }),
};

const OLLAMA_LIKE: RoutingCandidate = {
  name: 'local-llm',
  capabilities: caps({
    streaming: true,
    tools: false,
    vision: false,
    local: true,
    zeroMarginalInference: true,
    bearerTokenAccess: false,
  }),
};

const ALL_CANDIDATES: RoutingCandidate[] = [ANTHROPIC_LIKE, OPENAI_LIKE, GROK_LIKE, OLLAMA_LIKE];

const EMPTY_BRAIN: BrainRequirements = { requires: [], prefers: [], avoids: [] };

// ─── Open routing path (no requires) ──────────────────────────────────

describe('pickProvider — open routing (no requires)', () => {
  it('honors env override regardless of capabilities (today\'s behavior)', () => {
    const decision = pickProvider({
      brain: EMPTY_BRAIN,
      envOverride: 'openai',
      candidates: ALL_CANDIDATES,
    });
    expect(decision.picked).toBe('openai');
    expect(decision.reason).toBe('env-override-no-requirements');
    expect(decision.unsatisfiedRequires).toEqual([]);
    // False case
    expect(decision.reason).not.toBe('capability-best-fit');
  });

  it('picks first candidate by tie-breaker order when env unset', () => {
    const decision = pickProvider({
      brain: EMPTY_BRAIN,
      candidates: ALL_CANDIDATES,
      tieBreakerOrder: ['xai', 'anthropic', 'openai', 'local-llm'],
    });
    expect(decision.picked).toBe('xai');
    expect(decision.reason).toBe('open-routing-default');
  });

  it('falls back to insertion order when no tie-breaker provided', () => {
    const decision = pickProvider({
      brain: EMPTY_BRAIN,
      candidates: [GROK_LIKE, OPENAI_LIKE, ANTHROPIC_LIKE],
    });
    expect(decision.picked).toBe('xai');
  });

  it('matchedPrefers reports prefers satisfied by the env-picked provider', () => {
    const decision = pickProvider({
      brain: { requires: [], prefers: ['vision', 'liveWebSearch'], avoids: [] },
      envOverride: 'openai',
      candidates: ALL_CANDIDATES,
    });
    expect(decision.picked).toBe('openai');
    expect(decision.matchedPrefers.sort()).toEqual(['liveWebSearch', 'vision']);
  });
});

// ─── Capability-aware path (has requires) ─────────────────────────────

describe('pickProvider — has requires', () => {
  it('env satisfies requires: env wins (env-override-satisfies)', () => {
    const decision = pickProvider({
      brain: { requires: ['vision', 'tools'], prefers: [], avoids: [] },
      envOverride: 'openai',
      candidates: ALL_CANDIDATES,
    });
    expect(decision.picked).toBe('openai');
    expect(decision.reason).toBe('env-override-satisfies');
    expect(decision.unsatisfiedRequires).toEqual([]);
    // False case
    expect(decision.reason).not.toBe('env-override-mismatch');
  });

  it('env does NOT satisfy requires: env still picked (founder override) + mismatch flagged', () => {
    const decision = pickProvider({
      brain: { requires: ['vision', 'audioInput'], prefers: [], avoids: [] },
      envOverride: 'local-llm', // doesn't have vision OR audioInput
      candidates: ALL_CANDIDATES,
    });
    expect(decision.picked).toBe('local-llm');
    expect(decision.reason).toBe('env-override-mismatch');
    expect(decision.unsatisfiedRequires.sort()).toEqual(['audioInput', 'vision']);
    // False case: must NOT silently downgrade requires by picking a satisfying provider
    expect(decision.picked).not.toBe('openai');
  });

  it('env unset + multiple eligible: best-fit by prefers (capability-best-fit)', () => {
    const decision = pickProvider({
      brain: {
        requires: ['streaming', 'tools'],
        prefers: ['perLoopBudget', 'serverSideCompaction', 'hostedAgenticLoop'],
        avoids: [],
      },
      candidates: ALL_CANDIDATES,
    });
    expect(decision.picked).toBe('anthropic'); // matches all 3 prefers
    expect(decision.reason).toBe('capability-best-fit');
    expect(decision.matchedPrefers.sort()).toEqual([
      'hostedAgenticLoop',
      'perLoopBudget',
      'serverSideCompaction',
    ]);
    // False cases
    expect(decision.picked).not.toBe('local-llm'); // tools=false, would be filtered
    expect(decision.unsatisfiedRequires).toEqual([]);
  });

  it('avoids excludes candidates whose capabilities match', () => {
    const decision = pickProvider({
      brain: {
        requires: ['streaming'],
        prefers: [],
        avoids: ['liveWebSearch'], // privacy-sensitive brain
      },
      candidates: ALL_CANDIDATES,
    });
    expect(decision.excludedByAvoids.sort()).toEqual(['openai', 'xai']); // both have liveWebSearch
    expect(['anthropic', 'local-llm']).toContain(decision.picked);
  });

  it('throws NoEligibleProviderError when no candidate satisfies + no env', () => {
    expect(() =>
      pickProvider({
        brain: {
          requires: ['videoGeneration'], // none of our test fixtures have this
          prefers: [],
          avoids: [],
        },
        candidates: ALL_CANDIDATES,
      })
    ).toThrow(NoEligibleProviderError);
  });

  it('NoEligibleProviderError carries diagnostic context', () => {
    try {
      pickProvider({
        brain: {
          requires: ['videoGeneration'],
          prefers: [],
          avoids: ['streaming'], // additionally exclude all the streaming providers
        },
        candidates: ALL_CANDIDATES,
      });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NoEligibleProviderError);
      const err = e as NoEligibleProviderError;
      expect(err.requires).toEqual(['videoGeneration']);
      expect(err.avoids).toEqual(['streaming']);
      expect(err.considered.length).toBe(4);
      // All 4 candidates have streaming=true → all excluded by avoids
      expect(err.excludedByAvoids.length).toBe(4);
    }
  });

  it('numeric capability fields satisfy when > 0', () => {
    // contextWindow / maxOutput are numbers — `requires: ['contextWindow']`
    // should be satisfied by candidates that have contextWindow > 0.
    const decision = pickProvider({
      brain: {
        requires: ['contextWindow'], // anthropic has 1M, others have 0
        prefers: [],
        avoids: [],
      },
      candidates: ALL_CANDIDATES,
    });
    expect(decision.picked).toBe('anthropic');
    // False case: openai/xai/local-llm have contextWindow: 0 → filtered out
    expect(decision.alternatives).not.toContain('openai');
    expect(decision.alternatives).not.toContain('xai');
    expect(decision.alternatives).not.toContain('local-llm');
  });
});

// ─── Tie-breaker behavior ─────────────────────────────────────────────

describe('pickProvider — tie-breaker order', () => {
  it('respects tieBreakerOrder when prefers counts are equal', () => {
    // Both have 1 matching prefer (vision). Tie-breaker decides.
    const decision = pickProvider({
      brain: {
        requires: ['vision'],
        prefers: ['streaming'], // both have streaming → tied at 1
        avoids: [],
      },
      candidates: [ANTHROPIC_LIKE, OPENAI_LIKE],
      tieBreakerOrder: ['openai', 'anthropic'],
    });
    expect(decision.picked).toBe('openai'); // first in tie-breaker
  });

  it('tieBreakerOrder also applies in open-routing path', () => {
    const decision = pickProvider({
      brain: EMPTY_BRAIN,
      candidates: [ANTHROPIC_LIKE, OPENAI_LIKE, GROK_LIKE],
      tieBreakerOrder: ['xai', 'openai', 'anthropic'],
    });
    expect(decision.picked).toBe('xai');
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────

describe('pickProvider — edge cases', () => {
  it('empty candidates array throws', () => {
    expect(() =>
      pickProvider({
        brain: EMPTY_BRAIN,
        candidates: [],
      })
    ).toThrow(/no candidates/);
  });

  it('env override naming an unknown provider still picks it (caller validates)', () => {
    // Founder ruling: env is OVERRIDE. If caller passes a name not in
    // candidates, the router still returns it — caller is responsible
    // for making sure the supervisor factory can construct it. The
    // mismatch reason fires because no eligible candidate matches.
    const decision = pickProvider({
      brain: { requires: ['vision'], prefers: [], avoids: [] },
      envOverride: 'unknown-provider' as LLMProviderName,
      candidates: ALL_CANDIDATES,
    });
    expect(decision.picked).toBe('unknown-provider');
    expect(decision.reason).toBe('env-override-mismatch');
  });

  it('avoids in open-routing mode are advisory, not enforcing', () => {
    // Without requires, the brain is permissive; avoids reports excluded
    // candidates but the env still wins (today's backward-compat behavior).
    const decision = pickProvider({
      brain: { requires: [], prefers: [], avoids: ['liveWebSearch'] },
      envOverride: 'openai', // openai has liveWebSearch
      candidates: ALL_CANDIDATES,
    });
    expect(decision.picked).toBe('openai'); // env still wins
    expect(decision.excludedByAvoids).toContain('openai');
  });

  it('alternatives list is sorted by prefers descending', () => {
    const decision = pickProvider({
      brain: {
        requires: ['streaming'],
        prefers: ['perLoopBudget', 'serverSideCompaction', 'liveWebSearch'],
        avoids: [],
      },
      candidates: ALL_CANDIDATES,
    });
    expect(decision.picked).toBe('anthropic'); // 2 prefers (perLoopBudget + serverSideCompaction)
    // openai has 1 (liveWebSearch), xai has 1 (liveWebSearch), local-llm has 0
    // alternatives should be ranked: openai/xai (1) before local-llm (0)
    const last = decision.alternatives[decision.alternatives.length - 1];
    expect(last).toBe('local-llm');
  });
});
