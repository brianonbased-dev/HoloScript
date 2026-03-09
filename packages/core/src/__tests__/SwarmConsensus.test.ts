import { describe, it, expect, vi } from 'vitest';
import { blackboardHandler } from '../traits/BlackboardTrait';

describe('Swarm Intelligence (Phase 13)', () => {
  it('should allow agents to post and read beliefs', () => {
    // Agent 1 posts a belief
    const agent1Node = { id: 'agent1', properties: {} };
    const agent1Context = { emit: vi.fn() } as any;
    blackboardHandler.onAttach!(agent1Node as any, blackboardHandler.defaultConfig, agent1Context);

    blackboardHandler.onEvent!(agent1Node as any, blackboardHandler.defaultConfig, agent1Context, {
      type: 'blackboard_post_belief',
      key: 'enemy_location',
      value: { x: 10, y: 20 },
      authorId: 'agent1',
    });

    // Agent 2 reads the belief
    const agent2Node = { id: 'agent2', properties: {} };
    const agent2Context = { emit: vi.fn() } as any;
    // Sharing the SAME state object to simulate shared memory
    (agent2Node as any).__blackboardState = (agent1Node as any).__blackboardState;

    blackboardHandler.onEvent!(agent2Node as any, blackboardHandler.defaultConfig, agent2Context, {
      type: 'blackboard_read_belief',
      key: 'enemy_location',
      queryId: 'q1',
    });

    expect(agent2Context.emit).toHaveBeenCalledWith(
      'blackboard_belief_result',
      expect.objectContaining({
        found: true,
        value: { x: 10, y: 20 },
      })
    );
  });

  it('should reach consensus on a proposal', () => {
    // Shared State
    const sharedState = {
      beliefs: new Map(),
      proposals: new Map(),
      groupId: 'swarm_alpha',
    };

    // Agent 1: Proposes Action
    const agent1Node = { id: 'agent1', properties: {}, __blackboardState: sharedState };
    const agent1Context = { emit: vi.fn() } as any;

    blackboardHandler.onEvent!(agent1Node as any, blackboardHandler.defaultConfig, agent1Context, {
      type: 'blackboard_propose_action',
      actionType: 'attack',
      payload: { targetId: 'enemy_base' },
      proposerId: 'agent1',
    });

    const proposalId = agent1Context.emit.mock.calls.find(
      (c: any) => c[0] === 'blackboard_proposal_created'
    )[1].proposal.id;

    // Agent 2: Votes Yes
    const agent2Node = { id: 'agent2', properties: {}, __blackboardState: sharedState };
    const agent2Context = { emit: vi.fn() } as any;

    blackboardHandler.onEvent!(agent2Node as any, blackboardHandler.defaultConfig, agent2Context, {
      type: 'blackboard_vote',
      proposalId,
      voterId: 'agent2',
      vote: 'accept',
    });

    // Verification: Consensus reached (since we have > 2 accepts logic in trait)
    // Wait... logic was >= 2 accepts. Agent 1 auto-votes yes. Agent 2 votes yes. Total = 2.
    expect(agent2Context.emit).toHaveBeenCalledWith(
      'blackboard_consensus_reached',
      expect.objectContaining({
        proposal: expect.objectContaining({ id: proposalId, status: 'accepted' }),
      })
    );
  });
});
