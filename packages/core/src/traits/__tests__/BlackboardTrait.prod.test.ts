/**
 * BlackboardTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { blackboardHandler } from '../BlackboardTrait';

function makeNode() {
  return { id: 'bb_node' };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...blackboardHandler.defaultConfig!, ...cfg };
  blackboardHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}
function postBelief(
  node: any,
  ctx: any,
  config: any,
  key: string,
  value: any,
  ttl = 5000,
  authorId = 'agent1'
) {
  blackboardHandler.onEvent!(node, config, ctx, {
    type: 'blackboard_post_belief',
    key,
    value,
    ttl,
    authorId,
  });
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('blackboardHandler.defaultConfig', () => {
  const d = blackboardHandler.defaultConfig!;
  it('group_id=default_swarm', () => expect(d.group_id).toBe('default_swarm'));
  it('cleanup_interval=1000', () => expect(d.cleanup_interval).toBe(1000));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('blackboardHandler.onAttach', () => {
  it('creates __blackboardState', () => expect(attach().node.__blackboardState).toBeDefined());
  it('beliefs starts empty', () => expect(attach().node.__blackboardState.beliefs.size).toBe(0));
  it('proposals starts empty', () =>
    expect(attach().node.__blackboardState.proposals.size).toBe(0));
  it('groupId set from config', () =>
    expect(attach({ group_id: 'team_alpha' }).node.__blackboardState.groupId).toBe('team_alpha'));
  it('emits blackboard_initialized', () => {
    const { ctx } = attach({ group_id: 'swarm_b' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'blackboard_initialized',
      expect.objectContaining({ groupId: 'swarm_b' })
    );
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('blackboardHandler.onDetach', () => {
  it('removes __blackboardState', () => {
    const { node, config, ctx } = attach();
    blackboardHandler.onDetach!(node, config, ctx);
    expect(node.__blackboardState).toBeUndefined();
  });
});

// ─── onEvent — blackboard_post_belief ────────────────────────────────────────

describe('blackboardHandler.onEvent — blackboard_post_belief', () => {
  it('adds belief to beliefs map', () => {
    const { node, ctx, config } = attach();
    postBelief(node, ctx, config, 'target', { x: 5, y: 2 });
    expect(node.__blackboardState.beliefs.has('target')).toBe(true);
  });
  it('stored belief has correct key and value', () => {
    const { node, ctx, config } = attach();
    postBelief(node, ctx, config, 'enemy_count', 3);
    const e = node.__blackboardState.beliefs.get('enemy_count');
    expect(e.key).toBe('enemy_count');
    expect(e.value).toBe(3);
  });
  it('stores authorId', () => {
    const { node, ctx, config } = attach();
    postBelief(node, ctx, config, 'ammo', 50, 5000, 'sniper');
    expect(node.__blackboardState.beliefs.get('ammo').authorId).toBe('sniper');
  });
  it('defaults authorId to anonymous', () => {
    const { node, ctx, config } = attach();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_post_belief',
      key: 'x',
      value: 1,
    });
    expect(node.__blackboardState.beliefs.get('x').authorId).toBe('anonymous');
  });
  it('stores ttl', () => {
    const { node, ctx, config } = attach();
    postBelief(node, ctx, config, 'flag', true, 3000);
    expect(node.__blackboardState.beliefs.get('flag').ttl).toBe(3000);
  });
  it('defaults ttl to 5000', () => {
    const { node, ctx, config } = attach();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_post_belief',
      key: 'z',
      value: 0,
    });
    expect(node.__blackboardState.beliefs.get('z').ttl).toBe(5000);
  });
  it('overwrites existing belief with same key', () => {
    const { node, ctx, config } = attach();
    postBelief(node, ctx, config, 'hp', 100);
    postBelief(node, ctx, config, 'hp', 50);
    expect(node.__blackboardState.beliefs.get('hp').value).toBe(50);
    expect(node.__blackboardState.beliefs.size).toBe(1);
  });
  it('emits blackboard_belief_updated', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    postBelief(node, ctx, config, 'food', 'apple');
    expect(ctx.emit).toHaveBeenCalledWith(
      'blackboard_belief_updated',
      expect.objectContaining({ key: 'food', value: 'apple' })
    );
  });
});

// ─── onEvent — blackboard_read_belief ────────────────────────────────────────

describe('blackboardHandler.onEvent — blackboard_read_belief', () => {
  it('returns found=true and value for existing key', () => {
    const { node, ctx, config } = attach();
    postBelief(node, ctx, config, 'score', 42);
    ctx.emit.mockClear();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_read_belief',
      key: 'score',
      queryId: 'q1',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'blackboard_belief_result',
      expect.objectContaining({ queryId: 'q1', found: true, value: 42 })
    );
  });
  it('returns found=false for missing key', () => {
    const { node, ctx, config } = attach();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_read_belief',
      key: 'unknown',
      queryId: 'q2',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'blackboard_belief_result',
      expect.objectContaining({ found: false, value: undefined })
    );
  });
  it('passes queryId through', () => {
    const { node, ctx, config } = attach();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_read_belief',
      key: 'x',
      queryId: 'my_query_id',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'blackboard_belief_result')!;
    expect(call[1].queryId).toBe('my_query_id');
  });
});

// ─── onEvent — blackboard_propose_action ─────────────────────────────────────

describe('blackboardHandler.onEvent — blackboard_propose_action', () => {
  it('creates proposal in proposals map', () => {
    const { node, ctx, config } = attach();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_propose_action',
      actionType: 'attack',
      payload: {},
      proposerId: 'agent1',
    });
    expect(node.__blackboardState.proposals.size).toBe(1);
  });
  it('proposal starts as pending', () => {
    const { node, ctx, config } = attach();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_propose_action',
      actionType: 'retreat',
      payload: {},
      proposerId: 'a1',
    });
    const p = [...node.__blackboardState.proposals.values()][0];
    expect(p.status).toBe('pending');
  });
  it('proposer auto-votes accept', () => {
    const { node, ctx, config } = attach();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_propose_action',
      actionType: 'flank',
      payload: {},
      proposerId: 'commander',
    });
    const p = [...node.__blackboardState.proposals.values()][0];
    expect(p.votes.get('commander')).toBe('accept');
  });
  it('stores actionType and payload', () => {
    const { node, ctx, config } = attach();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_propose_action',
      actionType: 'capture',
      payload: { target: 'base' },
      proposerId: 'a1',
    });
    const p = [...node.__blackboardState.proposals.values()][0];
    expect(p.actionType).toBe('capture');
    expect(p.payload).toEqual({ target: 'base' });
  });
  it('defaults proposerId to anonymous', () => {
    const { node, ctx, config } = attach();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_propose_action',
      actionType: 'idle',
      payload: {},
    });
    const p = [...node.__blackboardState.proposals.values()][0];
    expect(p.proposerId).toBe('anonymous');
  });
  it('sets expiresAt using timeout (default 2000ms)', () => {
    const before = Date.now();
    const { node, ctx, config } = attach();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_propose_action',
      actionType: 'x',
      payload: {},
      proposerId: 'a',
    });
    const p = [...node.__blackboardState.proposals.values()][0];
    expect(p.expiresAt).toBeGreaterThanOrEqual(before + 1999);
  });
  it('emits blackboard_proposal_created', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_propose_action',
      actionType: 'move',
      payload: {},
      proposerId: 'a1',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'blackboard_proposal_created',
      expect.objectContaining({ proposal: expect.any(Object) })
    );
  });
});

// ─── onEvent — blackboard_vote ────────────────────────────────────────────────

describe('blackboardHandler.onEvent — blackboard_vote', () => {
  function createProposal(node: any, ctx: any, config: any, proposerId = 'p1') {
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_propose_action',
      actionType: 'march',
      payload: {},
      proposerId,
    });
    return [...node.__blackboardState.proposals.keys()][0];
  }

  it('records vote in proposal.votes', () => {
    const { node, ctx, config } = attach();
    const pId = createProposal(node, ctx, config);
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_vote',
      proposalId: pId,
      voterId: 'voter1',
      vote: 'accept',
    });
    const p = node.__blackboardState.proposals.get(pId);
    expect(p.votes.get('voter1')).toBe('accept');
  });
  it('emits blackboard_vote_cast', () => {
    const { node, ctx, config } = attach();
    const pId = createProposal(node, ctx, config);
    ctx.emit.mockClear();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_vote',
      proposalId: pId,
      voterId: 'v1',
      vote: 'reject',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'blackboard_vote_cast',
      expect.objectContaining({ proposalId: pId, voterId: 'v1', vote: 'reject' })
    );
  });
  it('consensus reached when accepts >= 2', () => {
    const { node, ctx, config } = attach();
    const pId = createProposal(node, ctx, config, 'p1'); // p1 auto-votes accept (1 accept)
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_vote',
      proposalId: pId,
      voterId: 'v1',
      vote: 'accept',
    }); // 2 accepts
    ctx.emit.mockClear();
    // Already at 2 accepts after this vote — check
    const p = node.__blackboardState.proposals.get(pId);
    expect(p.status).toBe('accepted');
  });
  it('emits blackboard_consensus_reached on acceptance', () => {
    const { node, ctx, config } = attach();
    const pId = createProposal(node, ctx, config, 'lead'); // 1 accept
    ctx.emit.mockClear();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_vote',
      proposalId: pId,
      voterId: 'v2',
      vote: 'accept',
    }); // 2 accepts
    expect(ctx.emit).toHaveBeenCalledWith(
      'blackboard_consensus_reached',
      expect.objectContaining({ proposal: expect.any(Object) })
    );
  });
  it('1 accept + 1 reject does NOT reach consensus', () => {
    const { node, ctx, config } = attach();
    const pId = createProposal(node, ctx, config, 'lead'); // 1 accept
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_vote',
      proposalId: pId,
      voterId: 'v2',
      vote: 'reject',
    }); // 1 accept, 1 reject
    const p = node.__blackboardState.proposals.get(pId);
    expect(p.status).toBe('pending');
  });
  it('ignores vote on non-existent proposal', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_vote',
      proposalId: 'prop_unknown',
      voterId: 'v1',
      vote: 'accept',
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('blackboard_vote_cast', expect.anything());
  });
  it('ignores vote on already-accepted proposal', () => {
    const { node, ctx, config } = attach();
    const pId = createProposal(node, ctx, config, 'lead');
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_vote',
      proposalId: pId,
      voterId: 'v2',
      vote: 'accept',
    }); // consensus reached
    ctx.emit.mockClear();
    blackboardHandler.onEvent!(node, config, ctx, {
      type: 'blackboard_vote',
      proposalId: pId,
      voterId: 'v3',
      vote: 'accept',
    }); // should be ignored
    expect(ctx.emit).not.toHaveBeenCalledWith('blackboard_vote_cast', expect.anything());
  });
});

// ─── onUpdate — expired beliefs ───────────────────────────────────────────────

describe('blackboardHandler.onUpdate — cleanup', () => {
  it('removes expired beliefs and emits blackboard_belief_expired', () => {
    const { node, ctx, config } = attach();
    // Post a belief with ttl=0 (already expired)
    const nowMs = Date.now() - 100;
    node.__blackboardState.beliefs.set('old', {
      id: 'old_1',
      key: 'old',
      value: 'x',
      authorId: 'a',
      timestamp: nowMs,
      ttl: 1,
    });
    ctx.emit.mockClear();
    blackboardHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'blackboard_belief_expired',
      expect.objectContaining({ key: 'old' })
    );
    expect(node.__blackboardState.beliefs.has('old')).toBe(false);
  });
  it('keeps non-expired beliefs', () => {
    const { node, ctx, config } = attach();
    postBelief(node, ctx, config, 'fresh', 99, 60000); // 60s ttl
    ctx.emit.mockClear();
    blackboardHandler.onUpdate!(node, config, ctx, 0.016);
    expect(node.__blackboardState.beliefs.has('fresh')).toBe(true);
  });
  it('marks pending proposals as rejected and removes them when expired', () => {
    const { node, ctx, config } = attach();
    const pastTime = Date.now() - 100;
    const proposal: any = {
      id: 'prop_old',
      actionType: 'x',
      payload: {},
      proposerId: 'a',
      votes: new Map(),
      status: 'pending',
      expiresAt: pastTime,
    };
    node.__blackboardState.proposals.set('prop_old', proposal);
    ctx.emit.mockClear();
    blackboardHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'blackboard_proposal_expired',
      expect.objectContaining({ proposalId: 'prop_old' })
    );
    expect(node.__blackboardState.proposals.has('prop_old')).toBe(false);
  });
  it('does not expire accepted proposals', () => {
    const { node, ctx, config } = attach();
    const pastTime = Date.now() - 100;
    const proposal: any = {
      id: 'prop_done',
      actionType: 'x',
      payload: {},
      proposerId: 'a',
      votes: new Map(),
      status: 'accepted',
      expiresAt: pastTime,
    };
    node.__blackboardState.proposals.set('prop_done', proposal);
    ctx.emit.mockClear();
    blackboardHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('blackboard_proposal_expired', expect.anything());
  });
});
