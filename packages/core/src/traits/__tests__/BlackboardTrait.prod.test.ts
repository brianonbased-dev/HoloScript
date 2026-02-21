/**
 * BlackboardTrait — Production Tests (TraitHandler)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { blackboardHandler } from '../BlackboardTrait';

type BBConfig = NonNullable<Parameters<typeof blackboardHandler.onAttach>[1]>;

function mkCfg(o: Partial<BBConfig> = {}): BBConfig {
  return { ...blackboardHandler.defaultConfig!, ...o };
}
function mkNode(id = 'bb-node') { return { id } as any; }
function mkCtx() {
  const ctx = { emitted: [] as any[], emit: vi.fn() };
  ctx.emit = vi.fn((type: string, payload: any) => ctx.emitted.push({ type, payload })) as any;
  return ctx;
}
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  blackboardHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────
describe('blackboardHandler — defaultConfig', () => {
  it('group_id = default_swarm', () => expect(blackboardHandler.defaultConfig?.group_id).toBe('default_swarm'));
  it('cleanup_interval = 1000', () => expect(blackboardHandler.defaultConfig?.cleanup_interval).toBe(1000));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────
describe('blackboardHandler — onAttach', () => {
  it('creates __blackboardState', () => {
    const { node } = attach();
    expect((node as any).__blackboardState).toBeDefined();
  });
  it('beliefs is empty Map', () => {
    const { node } = attach();
    expect((node as any).__blackboardState.beliefs.size).toBe(0);
  });
  it('proposals is empty Map', () => {
    const { node } = attach();
    expect((node as any).__blackboardState.proposals.size).toBe(0);
  });
  it('groupId reflects config', () => {
    const { node } = attach(mkCfg({ group_id: 'team_alpha' }));
    expect((node as any).__blackboardState.groupId).toBe('team_alpha');
  });
  it('emits blackboard_initialized', () => {
    const node = mkNode(); const ctx = mkCtx();
    blackboardHandler.onAttach!(node, mkCfg(), ctx as any);
    expect(ctx.emitted.find((e: any) => e.type === 'blackboard_initialized')).toBeDefined();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────
describe('blackboardHandler — onDetach', () => {
  it('removes __blackboardState', () => {
    const { node, ctx, cfg } = attach();
    blackboardHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__blackboardState).toBeUndefined();
  });
});

// ─── onEvent 'blackboard_post_belief' ─────────────────────────────────────────
describe('blackboardHandler — post/read belief', () => {
  it('stores belief in Map', () => {
    const { node, ctx } = attach();
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_post_belief', key: 'enemy_pos', value: { x: 1, y: 0 }, ttl: 5000 } as any);
    expect((node as any).__blackboardState.beliefs.get('enemy_pos')).toBeDefined();
  });
  it('emits blackboard_belief_updated', () => {
    const { node, ctx } = attach();
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_post_belief', key: 'k', value: 42 } as any);
    expect(ctx.emitted.find((e: any) => e.type === 'blackboard_belief_updated')?.payload.value).toBe(42);
  });
  it('overwrites existing key with same key', () => {
    const { node, ctx } = attach();
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_post_belief', key: 'k', value: 1 } as any);
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_post_belief', key: 'k', value: 2 } as any);
    expect((node as any).__blackboardState.beliefs.get('k').value).toBe(2);
  });

  it('read existing belief emits found=true with value', () => {
    const { node, ctx } = attach();
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_post_belief', key: 'hp', value: 80 } as any);
    ctx.emitted.length = 0;
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_read_belief', key: 'hp', queryId: 'q1' } as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'blackboard_belief_result');
    expect(ev?.payload.found).toBe(true);
    expect(ev?.payload.value).toBe(80);
  });

  it('read missing belief emits found=false', () => {
    const { node, ctx } = attach();
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_read_belief', key: 'missing', queryId: 'q2' } as any);
    expect(ctx.emitted.find((e: any) => e.type === 'blackboard_belief_result')?.payload.found).toBe(false);
  });
});

// ─── onEvent 'blackboard_propose_action' ──────────────────────────────────────
describe('blackboardHandler — propose_action', () => {
  it('creates a proposal in pending status', () => {
    const { node, ctx } = attach();
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_propose_action', actionType: 'attack', payload: {}, proposerId: 'agent1', timeout: 5000 } as any);
    const proposals = Array.from((node as any).__blackboardState.proposals.values()) as any[];
    expect(proposals.some((p: any) => p.status === 'pending')).toBe(true);
  });
  it('auto-votes yes by proposer', () => {
    const { node, ctx } = attach();
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_propose_action', actionType: 'move', payload: {}, proposerId: 'agent1' } as any);
    const proposal = (Array.from((node as any).__blackboardState.proposals.values()) as any[])[0];
    expect(proposal.votes.get('agent1')).toBe('accept');
  });
  it('emits blackboard_proposal_created', () => {
    const { node, ctx } = attach();
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_propose_action', actionType: 'move', payload: {} } as any);
    expect(ctx.emitted.find((e: any) => e.type === 'blackboard_proposal_created')).toBeDefined();
  });
});

// ─── onEvent 'blackboard_vote' ────────────────────────────────────────────────
describe('blackboardHandler — vote/consensus', () => {
  function createProposal(node: any, ctx: any) {
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_propose_action', actionType: 'attack', payload: {}, proposerId: 'agent1' } as any);
    const proposal = (Array.from((node as any).__blackboardState.proposals.values()) as any[])[0];
    return proposal.id as string;
  }

  it('records vote', () => {
    const { node, ctx } = attach();
    const propId = createProposal(node, ctx);
    ctx.emitted.length = 0;
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_vote', proposalId: propId, voterId: 'agent2', vote: 'accept' } as any);
    expect(ctx.emitted.find((e: any) => e.type === 'blackboard_vote_cast')).toBeDefined();
  });

  it('emits consensus_reached when accepts >= 2', () => {
    const { node, ctx } = attach();
    const propId = createProposal(node, ctx); // agent1 auto-votes accept
    ctx.emitted.length = 0;
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_vote', proposalId: propId, voterId: 'agent2', vote: 'accept' } as any);
    expect(ctx.emitted.find((e: any) => e.type === 'blackboard_consensus_reached')).toBeDefined();
  });

  it('proposal status = accepted after consensus', () => {
    const { node, ctx } = attach();
    const propId = createProposal(node, ctx);
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_vote', proposalId: propId, voterId: 'agent2', vote: 'accept' } as any);
    const proposal = (node as any).__blackboardState.proposals.get(propId);
    expect(proposal.status).toBe('accepted');
  });
});

// ─── onUpdate cleanup ─────────────────────────────────────────────────────────
describe('blackboardHandler — onUpdate cleanup', () => {
  it('no-op when no state', () => {
    expect(() => blackboardHandler.onUpdate!(mkNode() as any, mkCfg(), mkCtx() as any, 1.0)).not.toThrow();
  });
  it('keeps fresh beliefs', () => {
    const { node, ctx } = attach();
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_post_belief', key: 'fresh', value: 1, ttl: 999999 } as any);
    blackboardHandler.onUpdate!(node, mkCfg(), ctx as any, 0.016);
    expect((node as any).__blackboardState.beliefs.has('fresh')).toBe(true);
  });
  it('removes expired beliefs and emits blackboard_belief_expired', () => {
    const { node, ctx } = attach();
    // Post a belief that expires immediately (ttl=0)
    blackboardHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'blackboard_post_belief', key: 'stale', value: 1, ttl: 0 } as any);
    // Force time past expiry by manually setting old timestamp
    const belief = (node as any).__blackboardState.beliefs.get('stale');
    belief.timestamp = Date.now() - 10000; // 10s in the past, well past ttl=0
    ctx.emitted.length = 0;
    blackboardHandler.onUpdate!(node, mkCfg(), ctx as any, 0.016);
    expect((node as any).__blackboardState.beliefs.has('stale')).toBe(false);
    expect(ctx.emitted.find((e: any) => e.type === 'blackboard_belief_expired')).toBeDefined();
  });
});
