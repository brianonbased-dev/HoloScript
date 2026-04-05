/**
 * CollectiveIntelligence Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CollectiveIntelligence } from '../CollectiveIntelligence';

describe('CollectiveIntelligence', () => {
  let service: CollectiveIntelligence;

  beforeEach(() => {
    service = new CollectiveIntelligence();
  });

  describe('createSession', () => {
    it('should create a new hive session', () => {
      const session = service.createSession('Problem Solving', 'Find optimal solution', 'agent-1');

      expect(session.id).toBeDefined();
      expect(session.topic).toBe('Problem Solving');
      expect(session.goal).toBe('Find optimal solution');
      expect(session.initiator).toBe('agent-1');
      expect(session.status).toBe('active');
      expect(session.participants).toContain('agent-1');
      expect(session.contributions).toHaveLength(0);
    });

    it('should generate unique session IDs', () => {
      const s1 = service.createSession('Topic 1', 'Goal 1', 'agent-1');
      const s2 = service.createSession('Topic 2', 'Goal 2', 'agent-2');

      expect(s1.id).not.toBe(s2.id);
    });
  });

  describe('join', () => {
    it('should add agent to session', () => {
      const session = service.createSession('Topic', 'Goal', 'initiator');

      service.join(session.id, 'agent-2');

      const updated = service.getSession(session.id);
      expect(updated?.participants).toContain('agent-2');
    });

    it('should not duplicate participants', () => {
      const session = service.createSession('Topic', 'Goal', 'initiator');

      service.join(session.id, 'agent-2');
      service.join(session.id, 'agent-2');

      const updated = service.getSession(session.id);
      expect(updated?.participants.filter((p: any) => p === 'agent-2')).toHaveLength(1);
    });

    it('should throw for non-existent session', () => {
      expect(() => service.join('unknown', 'agent-1')).toThrow('not found');
    });

    it('should throw if session is resolved', () => {
      const session = service.createSession('Topic', 'Goal', 'initiator');
      service.resolve(session.id, 'Final resolution');

      expect(() => service.join(session.id, 'agent-2')).toThrow('resolved');
    });

    it('should enforce max participants', () => {
      service = new CollectiveIntelligence({ maxParticipants: 2 });
      const session = service.createSession('Topic', 'Goal', 'agent-1');
      service.join(session.id, 'agent-2');

      expect(() => service.join(session.id, 'agent-3')).toThrow('full');
    });
  });

  describe('leave', () => {
    it('should remove agent from session', () => {
      const session = service.createSession('Topic', 'Goal', 'initiator');
      service.join(session.id, 'agent-2');

      service.leave(session.id, 'agent-2');

      const updated = service.getSession(session.id);
      expect(updated?.participants).not.toContain('agent-2');
    });

    it('should handle leaving when not a participant', () => {
      const session = service.createSession('Topic', 'Goal', 'initiator');

      // Should not throw
      service.leave(session.id, 'non-participant');
    });
  });

  describe('contribute', () => {
    it('should add contribution to session', () => {
      const session = service.createSession('Topic', 'Goal', 'agent-1');

      const contribution = service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'idea',
        content: 'My brilliant idea',
        confidence: 0.9,
      });

      expect(contribution.id).toBeDefined();
      expect(contribution.timestamp).toBeGreaterThan(0);
      expect(contribution.type).toBe('idea');
      expect(contribution.content).toBe('My brilliant idea');

      const updated = service.getSession(session.id);
      expect(updated?.contributions).toHaveLength(1);
    });

    it('should throw if agent not a participant', () => {
      const session = service.createSession('Topic', 'Goal', 'agent-1');

      expect(() =>
        service.contribute(session.id, {
          agentId: 'outsider',
          type: 'idea',
          content: 'Attempt to contribute',
          confidence: 0.5,
        })
      ).toThrow('not a participant');
    });

    it('should throw if session is not active', () => {
      const session = service.createSession('Topic', 'Goal', 'agent-1');
      service.closeSession(session.id);

      expect(() =>
        service.contribute(session.id, {
          agentId: 'agent-1',
          type: 'idea',
          content: 'Late contribution',
          confidence: 0.5,
        })
      ).toThrow('closed');
    });

    it('should support all contribution types', () => {
      const session = service.createSession('Topic', 'Goal', 'agent-1');

      const idea = service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'idea',
        content: 'Idea',
        confidence: 0.8,
      });
      const critique = service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'critique',
        content: 'Critique',
        confidence: 0.7,
      });
      const consensus = service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'consensus',
        content: 'Consensus',
        confidence: 0.9,
      });
      const solution = service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'solution',
        content: 'Solution',
        confidence: 0.95,
      });

      expect(idea.type).toBe('idea');
      expect(critique.type).toBe('critique');
      expect(consensus.type).toBe('consensus');
      expect(solution.type).toBe('solution');
    });
  });

  describe('vote', () => {
    it('should record votes on contributions', () => {
      const session = service.createSession('Topic', 'Goal', 'agent-1');
      service.join(session.id, 'agent-2');

      const contribution = service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'idea',
        content: 'Vote on this',
        confidence: 0.8,
      });

      service.vote(session.id, contribution.id, 'agent-2', 'support');

      const results = service.getVotingResults(session.id);
      expect(results[0].supportVotes).toBe(1);
    });

    it('should throw if voter is not a participant', () => {
      const session = service.createSession('Topic', 'Goal', 'agent-1');
      const contribution = service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'idea',
        content: 'Content',
        confidence: 0.8,
      });

      expect(() => service.vote(session.id, contribution.id, 'outsider', 'support')).toThrow(
        'not a participant'
      );
    });
  });

  describe('synthesize', () => {
    it('should return empty result with too few contributions', () => {
      service = new CollectiveIntelligence({ synthesisMinContributions: 3 });
      const session = service.createSession('Topic', 'Goal', 'agent-1');

      service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'idea',
        content: 'Single idea',
        confidence: 0.8,
      });

      const result = service.synthesize(session.id);
      expect(result.synthesizedContent).toBe('');
    });

    it('should synthesize contributions', () => {
      service = new CollectiveIntelligence({ synthesisMinContributions: 2 });
      const session = service.createSession('Topic', 'Goal', 'agent-1');

      service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'idea',
        content: 'First idea',
        confidence: 0.8,
      });
      service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'idea',
        content: 'Second idea',
        confidence: 0.9,
      });

      const result = service.synthesize(session.id);
      expect(result.synthesizedContent.length).toBeGreaterThan(0);
      expect(result.metadata.totalContributions).toBe(2);
    });

    it('should throw for non-existent session', () => {
      expect(() => service.synthesize('unknown')).toThrow('not found');
    });
  });

  describe('resolve', () => {
    it('should mark session as resolved', () => {
      const session = service.createSession('Topic', 'Goal', 'agent-1');

      service.resolve(session.id, 'Final decision reached');

      const updated = service.getSession(session.id);
      expect(updated?.status).toBe('resolved');
      expect(updated?.resolution).toBe('Final decision reached');
    });
  });

  describe('getActiveSessions', () => {
    it('should return only active sessions', () => {
      const s1 = service.createSession('Topic 1', 'Goal 1', 'agent-1');
      const s2 = service.createSession('Topic 2', 'Goal 2', 'agent-2');
      service.closeSession(s1.id);

      const active = service.getActiveSessions();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(s2.id);
    });
  });

  describe('getTopContribution', () => {
    it('should return highest voted contribution', () => {
      const session = service.createSession('Topic', 'Goal', 'agent-1');
      service.join(session.id, 'agent-2');
      service.join(session.id, 'agent-3');

      const c1 = service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'idea',
        content: 'Idea 1',
        confidence: 0.8,
      });
      const c2 = service.contribute(session.id, {
        agentId: 'agent-2',
        type: 'idea',
        content: 'Idea 2',
        confidence: 0.9,
      });

      service.vote(session.id, c1.id, 'agent-2', 'support');
      service.vote(session.id, c2.id, 'agent-1', 'support');
      service.vote(session.id, c2.id, 'agent-3', 'support');

      const top = service.getTopContribution(session.id);
      expect(top?.id).toBe(c2.id);
    });
  });

  describe('getSessionStats', () => {
    it('should compute session statistics', () => {
      const session = service.createSession('Topic', 'Goal', 'agent-1');
      service.join(session.id, 'agent-2');

      service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'idea',
        content: 'Idea',
        confidence: 0.8,
      });
      service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'solution',
        content: 'Solution',
        confidence: 0.9,
      });

      const stats = service.getSessionStats(session.id);

      expect(stats?.participantCount).toBe(2);
      expect(stats?.contributionCount).toBe(2);
      expect(stats?.contributionsByType.idea).toBe(1);
      expect(stats?.contributionsByType.solution).toBe(1);
      expect(stats?.averageConfidence).toBeCloseTo(0.85, 2);
    });

    it('should return undefined for non-existent session', () => {
      const stats = service.getSessionStats('unknown');
      expect(stats).toBeUndefined();
    });
  });

  describe('checkForConsensus', () => {
    it('should auto-resolve when consensus reached', () => {
      service = new CollectiveIntelligence({
        autoCloseOnResolution: true,
        votingThreshold: 0.5,
      });
      const session = service.createSession('Topic', 'Goal', 'agent-1');
      service.join(session.id, 'agent-2');
      service.join(session.id, 'agent-3');

      const contribution = service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'solution',
        content: 'The solution',
        confidence: 0.9,
      });

      service.vote(session.id, contribution.id, 'agent-2', 'support');
      service.vote(session.id, contribution.id, 'agent-3', 'support');

      const resolved = service.checkForConsensus(session.id);
      expect(resolved).toBe(true);

      const updated = service.getSession(session.id);
      expect(updated?.status).toBe('resolved');
    });

    it('should not resolve without consensus', () => {
      service = new CollectiveIntelligence({ votingThreshold: 0.8 });
      const session = service.createSession('Topic', 'Goal', 'agent-1');
      service.join(session.id, 'agent-2');
      service.join(session.id, 'agent-3');

      const contribution = service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'idea',
        content: 'Controversial idea',
        confidence: 0.8,
      });

      service.vote(session.id, contribution.id, 'agent-2', 'support');
      service.vote(session.id, contribution.id, 'agent-3', 'oppose');

      const resolved = service.checkForConsensus(session.id);
      expect(resolved).toBe(false);
    });
  });

  describe('getAgentContributions', () => {
    it('should filter contributions by agent', () => {
      const session = service.createSession('Topic', 'Goal', 'agent-1');
      service.join(session.id, 'agent-2');

      service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'idea',
        content: 'A1 idea',
        confidence: 0.8,
      });
      service.contribute(session.id, {
        agentId: 'agent-2',
        type: 'idea',
        content: 'A2 idea',
        confidence: 0.9,
      });
      service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'critique',
        content: 'A1 critique',
        confidence: 0.7,
      });

      const agent1Contribs = service.getAgentContributions(session.id, 'agent-1');
      expect(agent1Contribs).toHaveLength(2);
      expect(agent1Contribs.every((c: any) => c.agentId === 'agent-1')).toBe(true);
    });

    it('should return empty for non-existent session', () => {
      const contribs = service.getAgentContributions('unknown', 'agent-1');
      expect(contribs).toHaveLength(0);
    });
  });

  describe('findSimilarContributions', () => {
    it('should find similar contributions in session', () => {
      const session = service.createSession('Topic', 'Goal', 'agent-1');

      const c1 = service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'idea',
        content: 'distributed caching performance optimization layer',
        confidence: 0.8,
      });

      service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'idea',
        content: 'caching distributed system performance optimization',
        confidence: 0.9,
      });

      service.contribute(session.id, {
        agentId: 'agent-1',
        type: 'idea',
        content: 'database indexing query strategies foreign keys',
        confidence: 0.7,
      });

      const similar = service.findSimilarContributions(session.id, c1.id);

      // Should find at least the similar caching contribution
      expect(similar.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty for non-existent session', () => {
      const similar = service.findSimilarContributions('unknown', 'c1');
      expect(similar).toHaveLength(0);
    });
  });
});
