/**
 * ContributionSynthesizer Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContributionSynthesizer } from '../ContributionSynthesizer';
import type { IHiveContribution, IHiveSession } from '@holoscript/core';

describe('ContributionSynthesizer', () => {
  let synthesizer: ContributionSynthesizer;

  const makeContribution = (
    id: string,
    type: IHiveContribution['type'],
    content: string,
    confidence = 0.8
  ): IHiveContribution => ({
    id,
    agentId: `agent-${id}`,
    timestamp: Date.now(),
    type,
    content,
    confidence,
  });

  const makeSession = (contributions: IHiveContribution[]): IHiveSession => ({
    id: 'test-session',
    topic: 'Test Topic',
    goal: 'Test Goal',
    initiator: 'initiator',
    status: 'active',
    participants: ['initiator', 'agent-1', 'agent-2'],
    contributions,
  });

  beforeEach(() => {
    synthesizer = new ContributionSynthesizer();
  });

  describe('synthesize', () => {
    it('should return empty result for no contributions', () => {
      const session = makeSession([]);
      const result = synthesizer.synthesize(session);

      expect(result.synthesizedContent).toBe('');
      expect(result.sourceContributions).toHaveLength(0);
      expect(result.confidence).toBe(0);
    });

    it('should synthesize ideas using merge method', () => {
      const session = makeSession([
        makeContribution('c1', 'idea', 'Use distributed approach'),
        makeContribution('c2', 'idea', 'Implement caching layer'),
      ]);

      const result = synthesizer.synthesize(session);

      expect(result.synthesizedContent).toContain('Use distributed approach');
      expect(result.synthesizedContent).toContain('Implement caching layer');
      expect(result.sourceContributions).toContain('c1');
      expect(result.sourceContributions).toContain('c2');
    });

    it('should use weighted method for many ideas', () => {
      const session = makeSession([
        makeContribution('c1', 'idea', 'Idea one', 0.9),
        makeContribution('c2', 'idea', 'Idea two', 0.7),
        makeContribution('c3', 'idea', 'Idea three', 0.5),
      ]);

      const result = synthesizer.synthesize(session);

      expect(result.synthesisMethod).toBe('weighted');
      expect(result.synthesizedContent).toContain('Weighted Synthesis');
    });

    it('should use hierarchical method when solutions present', () => {
      const session = makeSession([
        makeContribution('c1', 'solution', 'Final solution', 0.9),
        makeContribution('c2', 'idea', 'Supporting idea', 0.7),
        makeContribution('c3', 'consensus', 'Agreed point', 0.8),
      ]);

      const result = synthesizer.synthesize(session);

      expect(result.synthesisMethod).toBe('hierarchical');
      expect(result.synthesizedContent).toContain('Solutions');
      expect(result.metadata.solutionCount).toBe(1);
    });

    it('should use consensus method when consensus items present', () => {
      synthesizer = new ContributionSynthesizer({ preferSolutions: false });
      const session = makeSession([
        makeContribution('c1', 'consensus', 'We agree on this', 0.9),
        makeContribution('c2', 'idea', 'Related idea', 0.7),
      ]);

      const result = synthesizer.synthesize(session);

      expect(result.synthesisMethod).toBe('consensus');
      expect(result.synthesizedContent).toContain('Collective Consensus');
    });

    it('should filter by confidence threshold', () => {
      synthesizer = new ContributionSynthesizer({ minConfidenceThreshold: 0.6 });
      const session = makeSession([
        makeContribution('c1', 'idea', 'High confidence idea', 0.9),
        makeContribution('c2', 'idea', 'Low confidence idea', 0.3),
      ]);

      const result = synthesizer.synthesize(session);

      expect(result.sourceContributions).toContain('c1');
      expect(result.sourceContributions).not.toContain('c2');
    });

    it('should include critiques when enabled', () => {
      synthesizer = new ContributionSynthesizer({ includeCritiques: true });
      const session = makeSession([
        makeContribution('c1', 'solution', 'Main solution', 0.9),
        makeContribution('c2', 'critique', 'Consider edge cases', 0.8),
      ]);

      const result = synthesizer.synthesize(session);

      expect(result.synthesizedContent).toContain('Considerations');
      expect(result.metadata.critiqueCount).toBe(1);
    });

    it('should compute metadata correctly', () => {
      const session = makeSession([
        makeContribution('c1', 'idea', 'Idea 1', 0.9),
        makeContribution('c2', 'critique', 'Critique 1', 0.7),
        makeContribution('c3', 'solution', 'Solution 1', 0.8),
        makeContribution('c4', 'consensus', 'Consensus 1', 0.85),
      ]);

      const result = synthesizer.synthesize(session);

      expect(result.metadata.totalContributions).toBe(4);
      expect(result.metadata.ideaCount).toBe(1);
      expect(result.metadata.critiqueCount).toBe(1);
      expect(result.metadata.solutionCount).toBe(1);
      expect(result.metadata.consensusCount).toBe(1);
      expect(result.metadata.averageConfidence).toBeCloseTo(0.8125, 2);
    });

    it('should extract key themes', () => {
      const session = makeSession([
        makeContribution('c1', 'idea', 'Use distributed caching for performance', 0.9),
        makeContribution('c2', 'idea', 'Distributed systems need caching', 0.8),
        makeContribution('c3', 'idea', 'Performance is key for distributed apps', 0.7),
      ]);

      const result = synthesizer.synthesize(session);

      expect(result.metadata.keyThemes.length).toBeGreaterThan(0);
      expect(result.metadata.keyThemes).toContain('distributed');
    });

    it('should respect maxSourcesPerSynthesis', () => {
      synthesizer = new ContributionSynthesizer({ maxSourcesPerSynthesis: 2 });
      const session = makeSession([
        makeContribution('c1', 'idea', 'Idea 1', 0.9),
        makeContribution('c2', 'idea', 'Idea 2', 0.8),
        makeContribution('c3', 'idea', 'Idea 3', 0.7),
        makeContribution('c4', 'idea', 'Idea 4', 0.6),
      ]);

      const result = synthesizer.synthesize(session);

      expect(result.sourceContributions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('synthesizeSubset', () => {
    it('should synthesize a subset of contributions', () => {
      const contributions = [
        makeContribution('c1', 'idea', 'Idea one', 0.9),
        makeContribution('c2', 'idea', 'Idea two', 0.8),
      ];

      const result = synthesizer.synthesizeSubset(contributions);

      expect(result.sourceContributions).toHaveLength(2);
    });
  });

  describe('merge', () => {
    it('should merge two contributions', () => {
      const a = makeContribution('c1', 'idea', 'First idea', 0.8);
      const b = makeContribution('c2', 'idea', 'Second idea', 0.9);

      const merged = synthesizer.merge(a, b);

      expect(merged.id).toContain('merged');
      expect(merged.content).toContain('First idea');
      expect(merged.content).toContain('Second idea');
      expect(merged.agentId).toBe('synthesizer');
    });

    it('should take higher type in hierarchy', () => {
      const idea = makeContribution('c1', 'idea', 'An idea', 0.8);
      const solution = makeContribution('c2', 'solution', 'A solution', 0.9);

      const merged = synthesizer.merge(idea, solution);
      expect(merged.type).toBe('solution');
    });

    it('should average and boost confidence', () => {
      const a = makeContribution('c1', 'idea', 'First', 0.6);
      const b = makeContribution('c2', 'idea', 'Second', 0.8);

      const merged = synthesizer.merge(a, b);

      // (0.6 + 0.8) / 2 + 0.05 = 0.75
      expect(merged.confidence).toBeCloseTo(0.75, 2);
    });
  });

  describe('findSimilar', () => {
    it('should find similar contributions', () => {
      const target = makeContribution('t', 'idea', 'Implement distributed caching layer');
      const candidates = [
        makeContribution('c1', 'idea', 'Use distributed cache for performance'),
        makeContribution('c2', 'idea', 'Something completely different about databases'),
        makeContribution('c3', 'idea', 'Caching distributed systems architecture'),
      ];

      const similar = synthesizer.findSimilar(target, candidates, 0.3);

      expect(similar.length).toBeGreaterThanOrEqual(1);
      expect(similar.some((c) => c.id === 'c1' || c.id === 'c3')).toBe(true);
    });

    it('should not include target in results', () => {
      const target = makeContribution('t', 'idea', 'Test content');
      const candidates = [target, makeContribution('c1', 'idea', 'Test content identical')];

      const similar = synthesizer.findSimilar(target, candidates);

      expect(similar.find((c) => c.id === 't')).toBeUndefined();
    });

    it('should return empty array for no matches', () => {
      const target = makeContribution('t', 'idea', 'Alpha beta gamma');
      const candidates = [makeContribution('c1', 'idea', 'Omega theta zeta')];

      const similar = synthesizer.findSimilar(target, candidates, 0.9);

      expect(similar).toHaveLength(0);
    });
  });
});
