import { describe, it, expect, beforeEach } from 'vitest';
import { blackboardHandler } from '../BlackboardTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('BlackboardTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('bb-node');
    ctx = createMockContext();
    attachTrait(blackboardHandler, node, { group_id: 'squad_alpha' }, ctx);
  });

  // ===========================================================================
  // Lifecycle
  // ===========================================================================
  describe('lifecycle', () => {
    it('initializes state on attach', () => {
      const state = (node as any).__blackboardState;
      expect(state).toBeDefined();
      expect(state.beliefs).toBeInstanceOf(Map);
      expect(state.proposals).toBeInstanceOf(Map);
      expect(state.groupId).toBe('squad_alpha');
    });

    it('emits blackboard_initialized', () => {
      expect(getEventCount(ctx, 'blackboard_initialized')).toBe(1);
    });

    it('cleans up on detach', () => {
      blackboardHandler.onDetach?.(node as any, blackboardHandler.defaultConfig, ctx as any);
      expect((node as any).__blackboardState).toBeUndefined();
    });
  });

  // ===========================================================================
  // Beliefs
  // ===========================================================================
  describe('beliefs', () => {
    it('posts a belief', () => {
      sendEvent(blackboardHandler, node, {}, ctx, {
        type: 'blackboard_post_belief',
        key: 'enemy_spotted',
        value: { x: 10, z: 20 },
        ttl: 5000,
        authorId: 'scout-1',
      });

      const state = (node as any).__blackboardState;
      expect(state.beliefs.has('enemy_spotted')).toBe(true);
      expect(getEventCount(ctx, 'blackboard_belief_updated')).toBe(1);
    });

    it('reads a belief', () => {
      sendEvent(blackboardHandler, node, {}, ctx, {
        type: 'blackboard_post_belief',
        key: 'ammo_cache',
        value: 50,
        authorId: 'supply',
      });
      ctx.clearEvents();

      sendEvent(blackboardHandler, node, {}, ctx, {
        type: 'blackboard_read_belief',
        key: 'ammo_cache',
        queryId: 'q1',
      });

      const result = getLastEvent(ctx, 'blackboard_belief_result') as any;
      expect(result.found).toBe(true);
      expect(result.value).toBe(50);
    });

    it('returns not-found for missing belief', () => {
      sendEvent(blackboardHandler, node, {}, ctx, {
        type: 'blackboard_read_belief',
        key: 'nonexistent',
        queryId: 'q2',
      });

      const result = getLastEvent(ctx, 'blackboard_belief_result') as any;
      expect(result.found).toBe(false);
    });

    it('overwrites belief with same key', () => {
      sendEvent(blackboardHandler, node, {}, ctx, {
        type: 'blackboard_post_belief',
        key: 'target',
        value: 'A',
        authorId: 'a1',
      });
      sendEvent(blackboardHandler, node, {}, ctx, {
        type: 'blackboard_post_belief',
        key: 'target',
        value: 'B',
        authorId: 'a2',
      });

      const state = (node as any).__blackboardState;
      expect(state.beliefs.get('target').value).toBe('B');
    });
  });

  // ===========================================================================
  // Proposals
  // ===========================================================================
  describe('proposals', () => {
    it('creates a proposal with auto-vote', () => {
      sendEvent(blackboardHandler, node, {}, ctx, {
        type: 'blackboard_propose_action',
        actionType: 'attack',
        payload: { target: 'base' },
        proposerId: 'leader',
        timeout: 3000,
      });

      expect(getEventCount(ctx, 'blackboard_proposal_created')).toBe(1);
      const state = (node as any).__blackboardState;
      const proposals = [...state.proposals.values()];
      expect(proposals.length).toBe(1);
      expect(proposals[0].votes.get('leader')).toBe('accept');
    });

    it('accepts votes on a proposal', () => {
      sendEvent(blackboardHandler, node, {}, ctx, {
        type: 'blackboard_propose_action',
        actionType: 'retreat',
        proposerId: 'p1',
      });

      const state = (node as any).__blackboardState;
      const proposalId = [...state.proposals.keys()][0];

      sendEvent(blackboardHandler, node, {}, ctx, {
        type: 'blackboard_vote',
        proposalId,
        voterId: 'p2',
        vote: 'accept',
      });

      expect(getEventCount(ctx, 'blackboard_vote_cast')).toBe(1);
    });

    it('reaches consensus with 2+ accepts', () => {
      sendEvent(blackboardHandler, node, {}, ctx, {
        type: 'blackboard_propose_action',
        actionType: 'charge',
        proposerId: 'p1',
      });

      const state = (node as any).__blackboardState;
      const proposalId = [...state.proposals.keys()][0];

      // p1 already voted accept (auto-vote), add p2
      sendEvent(blackboardHandler, node, {}, ctx, {
        type: 'blackboard_vote',
        proposalId,
        voterId: 'p2',
        vote: 'accept',
      });

      expect(getEventCount(ctx, 'blackboard_consensus_reached')).toBe(1);
      const proposal = state.proposals.get(proposalId);
      expect(proposal.status).toBe('accepted');
    });

    it('does not reach consensus with rejects', () => {
      sendEvent(blackboardHandler, node, {}, ctx, {
        type: 'blackboard_propose_action',
        actionType: 'flee',
        proposerId: 'p1',
      });

      const state = (node as any).__blackboardState;
      const proposalId = [...state.proposals.keys()][0];

      sendEvent(blackboardHandler, node, {}, ctx, {
        type: 'blackboard_vote',
        proposalId,
        voterId: 'p2',
        vote: 'reject',
      });

      expect(getEventCount(ctx, 'blackboard_consensus_reached')).toBe(0);
    });
  });

  // ===========================================================================
  // Cleanup (onUpdate)
  // ===========================================================================
  describe('cleanup', () => {
    it('removes expired beliefs', () => {
      const state = (node as any).__blackboardState;
      state.beliefs.set('old', {
        id: 'old_1',
        key: 'old',
        value: 'stale',
        authorId: 'x',
        timestamp: Date.now() - 10000,
        ttl: 1000,
      });

      updateTrait(blackboardHandler, node, {}, ctx, 1);
      expect(state.beliefs.has('old')).toBe(false);
      expect(getEventCount(ctx, 'blackboard_belief_expired')).toBe(1);
    });

    it('rejects expired proposals', () => {
      const state = (node as any).__blackboardState;
      state.proposals.set('expired', {
        id: 'expired',
        actionType: 'test',
        payload: {},
        proposerId: 'x',
        votes: new Map(),
        status: 'pending',
        expiresAt: Date.now() - 1000,
      });

      updateTrait(blackboardHandler, node, {}, ctx, 1);
      expect(state.proposals.has('expired')).toBe(false);
      expect(getEventCount(ctx, 'blackboard_proposal_expired')).toBe(1);
    });
  });
});
