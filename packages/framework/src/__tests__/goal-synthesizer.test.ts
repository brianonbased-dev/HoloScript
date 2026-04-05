import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoalSynthesizer, GENERIC_GOALS, DOMAIN_GOALS } from '../protocol/goal-synthesizer';
import type { GoalContext, SynthesizedGoal } from '../protocol/goal-synthesizer';
import type { KnowledgeStore, StoredEntry } from '../knowledge/knowledge-store';

// ── Helpers ──

function mockKnowledgeStore(entries: Partial<StoredEntry>[] = []): KnowledgeStore {
  return {
    search: vi.fn().mockReturnValue(entries),
  } as unknown as KnowledgeStore;
}

function mockLLMConfig() {
  return {
    provider: 'anthropic' as const,
    model: 'claude-sonnet-4',
    apiKey: 'test-key',
  };
}

// ── Tests ──

describe('GoalSynthesizer', () => {
  describe('constructor', () => {
    it('creates without options (no LLM, no knowledge)', () => {
      const gs = new GoalSynthesizer();
      expect(gs).toBeDefined();
    });

    it('creates with LLM and knowledge store', () => {
      const gs = new GoalSynthesizer({
        llm: mockLLMConfig(),
        knowledge: mockKnowledgeStore(),
      });
      expect(gs).toBeDefined();
    });
  });

  describe('synthesize (backward-compatible sync API)', () => {
    it('returns a valid Goal with defaults', () => {
      const gs = new GoalSynthesizer();
      const goal = gs.synthesize();
      expect(goal).toHaveProperty('id');
      expect(goal).toHaveProperty('description');
      expect(goal).toHaveProperty('category');
      expect(goal).toHaveProperty('priority');
      expect(goal).toHaveProperty('estimatedComplexity');
      expect(goal).toHaveProperty('generatedAt');
      expect(goal).toHaveProperty('source');
      expect(goal.id).toMatch(/^GOAL-/);
      expect(goal.source).toBe('autonomous-boredom');
    });

    it('respects custom domain', () => {
      const gs = new GoalSynthesizer();
      const goal = gs.synthesize('coding');
      expect(goal.description).toBeTruthy();
    });

    it('respects custom source', () => {
      const gs = new GoalSynthesizer();
      const goal = gs.synthesize('general', 'system-mandate');
      expect(goal.source).toBe('system-mandate');
    });

    it('generates goals with complexity 1-5', () => {
      const gs = new GoalSynthesizer();
      for (let i = 0; i < 20; i++) {
        const goal = gs.synthesize();
        expect(goal.estimatedComplexity).toBeGreaterThanOrEqual(1);
        expect(goal.estimatedComplexity).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('synthesizeMultiple (async, context-aware)', () => {
    it('returns requested number of goals via heuristic', async () => {
      const gs = new GoalSynthesizer();
      const context: GoalContext = { domain: 'coding' };
      const goals = await gs.synthesizeMultiple(context, 3);
      expect(goals).toHaveLength(3);
      for (const g of goals) {
        expect(g).toHaveProperty('rationale');
        expect(g).toHaveProperty('relevanceScore');
        expect(g.relevanceScore).toBeGreaterThan(0);
        expect(g.relevanceScore).toBeLessThanOrEqual(1);
      }
    });

    it('returns domain-specific goals for coding', async () => {
      const gs = new GoalSynthesizer();
      const goals = await gs.synthesizeMultiple({ domain: 'coding' }, 5);
      expect(goals.length).toBeGreaterThan(0);
      expect(goals.length).toBeLessThanOrEqual(5);
    });

    it('returns domain-specific goals for security', async () => {
      const gs = new GoalSynthesizer();
      const goals = await gs.synthesizeMultiple({ domain: 'security' }, 3);
      expect(goals).toHaveLength(3);
    });

    it('returns domain-specific goals for research', async () => {
      const gs = new GoalSynthesizer();
      const goals = await gs.synthesizeMultiple({ domain: 'research' }, 3);
      expect(goals).toHaveLength(3);
    });

    it('falls back to generic goals for unknown domains', async () => {
      const gs = new GoalSynthesizer();
      const goals = await gs.synthesizeMultiple({ domain: 'quantum-knitting' }, 2);
      expect(goals).toHaveLength(2);
      // Should still produce valid goals
      for (const g of goals) {
        expect(g.description).toBeTruthy();
      }
    });

    it('uses knowledge store gotchas to derive goals', async () => {
      const store = mockKnowledgeStore([
        {
          id: 'G.TEST.001',
          type: 'gotcha',
          content: 'Memory leak in WebSocket reconnection handler',
          domain: 'coding',
          confidence: 0.9,
          source: 'test',
          queryCount: 0,
          reuseCount: 0,
          createdAt: new Date().toISOString(),
          authorAgent: 'test-agent',
        },
      ]);
      const gs = new GoalSynthesizer({ knowledge: store });
      const goals = await gs.synthesizeMultiple({ domain: 'coding' }, 3);
      expect(goals.length).toBeGreaterThan(0);
      // Knowledge store should have been queried
      expect(store.search).toHaveBeenCalledWith('coding', 5);
    });

    it('filters out recently completed tasks', async () => {
      const gs = new GoalSynthesizer();
      const completed = GENERIC_GOALS.slice(0, 4);
      const goals = await gs.synthesizeMultiple({
        domain: 'general',
        recentCompletedTasks: completed,
      }, 3);
      // None of the returned goals should match completed tasks
      for (const g of goals) {
        expect(completed.map(c => c.toLowerCase())).not.toContain(g.description.toLowerCase());
      }
    });

    it('first goal has highest relevance score', async () => {
      const gs = new GoalSynthesizer();
      const goals = await gs.synthesizeMultiple({ domain: 'coding' }, 3);
      if (goals.length >= 2) {
        expect(goals[0].relevanceScore).toBeGreaterThanOrEqual(goals[1].relevanceScore);
      }
    });

    it('includes rationale for each goal', async () => {
      const gs = new GoalSynthesizer();
      const goals = await gs.synthesizeMultiple({ domain: 'coding' }, 2);
      for (const g of goals) {
        expect(g.rationale).toBeTruthy();
        expect(typeof g.rationale).toBe('string');
      }
    });
  });

  describe('LLM-based synthesis', () => {
    it('falls back to heuristic when LLM call fails', async () => {
      // Mock callLLM to throw
      vi.doMock('../llm/llm-adapter', () => ({
        callLLM: vi.fn().mockRejectedValue(new Error('API key invalid')),
      }));

      const gs = new GoalSynthesizer({
        llm: mockLLMConfig(),
      });

      const goals = await gs.synthesizeMultiple({ domain: 'coding' }, 2);
      // Should still return goals via heuristic fallback
      expect(goals.length).toBeGreaterThan(0);
    });
  });

  describe('knowledge-derived goals', () => {
    it('marks knowledge-derived goals with knowledge-gap category', async () => {
      const store = mockKnowledgeStore([
        {
          id: 'G.SEC.001',
          type: 'gotcha',
          content: 'SQL injection in search endpoint',
          domain: 'security',
          confidence: 0.95,
          source: 'audit',
          queryCount: 0,
          reuseCount: 0,
          createdAt: new Date().toISOString(),
          authorAgent: 'scanner',
        },
      ]);

      const gs = new GoalSynthesizer({ knowledge: store });
      // Request enough goals to ensure the knowledge-derived one is included
      const goals = await gs.synthesizeMultiple({ domain: 'security' }, 15);

      const knowledgeGapGoals = goals.filter(g => g.category === 'knowledge-gap');
      // At least one goal should be derived from the gotcha
      expect(knowledgeGapGoals.length).toBeGreaterThanOrEqual(1);
      const derived = knowledgeGapGoals[0];
      expect(derived.description).toContain('SQL injection');
      expect(derived.rationale).toContain('knowledge store');
    });
  });

  describe('exported constants', () => {
    it('GENERIC_GOALS is a non-empty array of strings', () => {
      expect(Array.isArray(GENERIC_GOALS)).toBe(true);
      expect(GENERIC_GOALS.length).toBeGreaterThan(0);
      for (const g of GENERIC_GOALS) {
        expect(typeof g).toBe('string');
      }
    });

    it('DOMAIN_GOALS has expected domains', () => {
      expect(DOMAIN_GOALS).toHaveProperty('coding');
      expect(DOMAIN_GOALS).toHaveProperty('research');
      expect(DOMAIN_GOALS).toHaveProperty('security');
      expect(DOMAIN_GOALS).toHaveProperty('reviewer');
    });
  });
});
