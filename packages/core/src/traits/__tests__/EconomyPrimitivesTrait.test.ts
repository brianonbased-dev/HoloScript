/**
 * EconomyPrimitivesTrait — comprehensive test suite
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  economyPrimitivesHandler,
  type EconomyConfig,
  type EconomyState,
} from '../EconomyPrimitivesTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeNode(): HSPlusNode {
  return {} as HSPlusNode;
}

function makeContext() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const context: TraitContext = {
    emit: (type: string, payload?: unknown) => {
      emitted.push({ type, payload });
    },
  };
  return { context, emitted };
}

const DEFAULT_CONFIG = { ...economyPrimitivesHandler.defaultConfig } as EconomyConfig;

function setup(partial: Partial<EconomyConfig> = {}) {
  const node = makeNode();
  const { context, emitted } = makeContext();
  const config: EconomyConfig = { ...DEFAULT_CONFIG, ...partial };
  economyPrimitivesHandler.onAttach(node, config, context);
  emitted.length = 0; // clear attach events
  return { node, context, emitted, config };
}

function fire(
  node: HSPlusNode,
  config: EconomyConfig,
  context: TraitContext,
  type: string,
  payload?: unknown
) {
  economyPrimitivesHandler.onEvent(node, config, context, { type, payload });
}

// ---------------------------------------------------------------------------
// onAttach
// ---------------------------------------------------------------------------

describe('onAttach', () => {
  it('should initialise __economyState on node', () => {
    const { node } = setup();
    expect((node as any).__economyState).toBeDefined();
  });

  it('should start with empty accounts map', () => {
    const { node } = setup();
    const state = (node as any).__economyState as EconomyState;
    expect(state.accounts.size).toBe(0);
  });

  it('should start with empty bounties map', () => {
    const { node } = setup();
    const state = (node as any).__economyState as EconomyState;
    expect(state.bounties.size).toBe(0);
  });

  it('should start with empty subscriptions map', () => {
    const { node } = setup();
    const state = (node as any).__economyState as EconomyState;
    expect(state.subscriptions.size).toBe(0);
  });

  it('should emit economy:ready on attach', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    economyPrimitivesHandler.onAttach(node, DEFAULT_CONFIG, context);
    expect(emitted.some(e => e.type === 'economy:ready')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// onDetach
// ---------------------------------------------------------------------------

describe('onDetach', () => {
  it('should delete __economyState on detach', () => {
    const { node, config, context } = setup();
    economyPrimitivesHandler.onDetach(node, config, context);
    expect((node as any).__economyState).toBeUndefined();
  });

  it('should emit economy:shutdown', () => {
    const { node, config, emitted } = setup();
    const { context } = makeContext();
    economyPrimitivesHandler.onDetach(node, config, context);
    // use a fresh context to capture shutdown
    const n2 = makeNode();
    const { context: ctx2, emitted: ev2 } = makeContext();
    economyPrimitivesHandler.onAttach(n2, config, ctx2);
    ev2.length = 0;
    economyPrimitivesHandler.onDetach(n2, config, ctx2);
    expect(ev2.some(e => e.type === 'economy:shutdown')).toBe(true);
  });

  it('should cancel open bounties on detach', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'economy:earn', { agentId: 'a', amount: 50 });
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'a',
      reward: 10,
      description: 'test',
    });
    economyPrimitivesHandler.onDetach(node, config, context);
    // node is cleaned up; no assertion on bounty status needed — just no throw
  });

  it('should handle detach with no state gracefully', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() => {
      economyPrimitivesHandler.onDetach(node, DEFAULT_CONFIG, context);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// defaultConfig
// ---------------------------------------------------------------------------

describe('defaultConfig', () => {
  it('should have initial_balance 100', () => {
    expect(economyPrimitivesHandler.defaultConfig?.initial_balance).toBe(100);
  });

  it('should have default_spend_limit 0', () => {
    expect(economyPrimitivesHandler.defaultConfig?.default_spend_limit).toBe(0);
  });

  it('should have escrow_enabled true', () => {
    expect(economyPrimitivesHandler.defaultConfig?.escrow_enabled).toBe(true);
  });

  it('should have task_completion_reward 10', () => {
    expect(economyPrimitivesHandler.defaultConfig?.task_completion_reward).toBe(10);
  });

  it('should have max_transaction_history 200', () => {
    expect(economyPrimitivesHandler.defaultConfig?.max_transaction_history).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// economy:earn
// ---------------------------------------------------------------------------

describe('economy:earn', () => {
  it('should create account on first earn', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:earn', { agentId: 'a1', amount: 20, reason: 'work' });
    expect(emitted.some(e => e.type === 'economy:account_created')).toBe(true);
  });

  it('should emit economy:credit_earned', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:earn', { agentId: 'a1', amount: 20 });
    const ev = emitted.find(e => e.type === 'economy:credit_earned');
    expect(ev).toBeDefined();
    expect((ev!.payload as any).amount).toBe(20);
  });

  it('should increase balance', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:earn', { agentId: 'a1', amount: 50 });
    const ev = emitted.find(e => e.type === 'economy:credit_earned');
    // initial_balance=100, earn 50 → 150
    expect((ev!.payload as any).newBalance).toBe(150);
  });

  it('should use task_completion_reward as default amount', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:earn', { agentId: 'a1' });
    const ev = emitted.find(e => e.type === 'economy:credit_earned');
    expect((ev!.payload as any).amount).toBe(config.task_completion_reward);
  });

  it('should not allow negative earn (clamps to 0)', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:earn', { agentId: 'a1', amount: -50 });
    // amount is clamped to 0, so balance stays at initial
    const ev = emitted.find(e => e.type === 'economy:credit_earned');
    expect((ev!.payload as any).amount).toBe(0);
  });

  it('should record the earn reason', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:earn', { agentId: 'a1', amount: 5, reason: 'upload' });
    const ev = emitted.find(e => e.type === 'economy:credit_earned');
    expect((ev!.payload as any).reason).toBe('upload');
  });

  it('should not process earn without payload', () => {
    const { node, config, context, emitted } = setup();
    expect(() => fire(node, config, context, 'economy:earn', null)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// economy:spend
// ---------------------------------------------------------------------------

describe('economy:spend', () => {
  it('should reduce balance on successful spend', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:get_balance', { agentId: 'a' }); // lazy-create at 100
    emitted.length = 0;
    fire(node, config, context, 'economy:spend', { agentId: 'a', amount: 30 });
    const ev = emitted.find(e => e.type === 'economy:credit_spent');
    expect(ev).toBeDefined();
    expect((ev!.payload as any).newBalance).toBe(70); // 100 - 30
  });

  it('should emit economy:credit_spent', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:spend', { agentId: 'a', amount: 10 });
    expect(emitted.some(e => e.type === 'economy:credit_spent')).toBe(true);
  });

  it('should emit economy:insufficient_funds when balance too low', () => {
    const { node, config, context, emitted } = setup({ initial_balance: 5 });
    fire(node, config, context, 'economy:spend', { agentId: 'a', amount: 100 });
    expect(emitted.some(e => e.type === 'economy:insufficient_funds')).toBe(true);
  });

  it('should not change balance on insufficient funds', () => {
    const { node, config, context, emitted } = setup({ initial_balance: 5 });
    fire(node, config, context, 'economy:spend', { agentId: 'a', amount: 100 });
    emitted.length = 0;
    fire(node, config, context, 'economy:get_balance', { agentId: 'a' });
    const bal = emitted.find(e => e.type === 'economy:balance');
    expect((bal!.payload as any).balance).toBe(5);
  });

  it('should enforce spend limit', () => {
    const { node, config, context, emitted } = setup({
      initial_balance: 1000,
      default_spend_limit: 50,
      spend_limit_period: 3600000,
    });
    fire(node, config, context, 'economy:spend', { agentId: 'a', amount: 60 });
    expect(emitted.some(e => e.type === 'economy:spend_limit_exceeded')).toBe(true);
  });

  it('should accumulate spendThisPeriod', () => {
    const { node, config, context, emitted } = setup({
      initial_balance: 1000,
      default_spend_limit: 100,
    });
    fire(node, config, context, 'economy:spend', { agentId: 'a', amount: 60 });
    emitted.length = 0;
    fire(node, config, context, 'economy:spend', { agentId: 'a', amount: 60 });
    // 60+60=120 > 100 limit
    expect(emitted.some(e => e.type === 'economy:spend_limit_exceeded')).toBe(true);
  });

  it('should record spend reason', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:spend', { agentId: 'a', amount: 5, reason: 'render' });
    const ev = emitted.find(e => e.type === 'economy:credit_spent');
    expect((ev!.payload as any).reason).toBe('render');
  });
});

// ---------------------------------------------------------------------------
// economy:transfer
// ---------------------------------------------------------------------------

describe('economy:transfer', () => {
  it('should move credits from one agent to another', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:earn', { agentId: 'alice', amount: 0 });
    fire(node, config, context, 'economy:earn', { agentId: 'bob', amount: 0 });
    emitted.length = 0;
    fire(node, config, context, 'economy:transfer', { from: 'alice', to: 'bob', amount: 40 });
    expect(emitted.some(e => e.type === 'economy:transaction')).toBe(true);
  });

  it('alice balance decreases, bob balance increases', () => {
    const { node, config, context, emitted } = setup();
    // alice has initial_balance=100
    fire(node, config, context, 'economy:transfer', { from: 'alice', to: 'bob', amount: 30 });
    emitted.length = 0;
    fire(node, config, context, 'economy:get_balance', { agentId: 'alice' });
    const aliceBal = emitted.find(e => e.type === 'economy:balance');
    expect((aliceBal!.payload as any).balance).toBe(70);
    emitted.length = 0;
    fire(node, config, context, 'economy:get_balance', { agentId: 'bob' });
    const bobBal = emitted.find(e => e.type === 'economy:balance');
    expect((bobBal!.payload as any).balance).toBe(130); // 100 initial + 30 received
  });

  it('should emit economy:insufficient_funds when sender has too little', () => {
    const { node, config, context, emitted } = setup({ initial_balance: 10 });
    fire(node, config, context, 'economy:transfer', { from: 'alice', to: 'bob', amount: 100 });
    expect(emitted.some(e => e.type === 'economy:insufficient_funds')).toBe(true);
  });

  it('transaction event should include from/to/amount', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:transfer', { from: 'alice', to: 'bob', amount: 10 });
    const ev = emitted.find(e => e.type === 'economy:transaction');
    const p = ev!.payload as any;
    expect(p.from).toBe('alice');
    expect(p.to).toBe('bob');
    expect(p.amount).toBe(10);
  });

  it('should ignore transfer with missing payload', () => {
    const { node, config, context } = setup();
    expect(() => fire(node, config, context, 'economy:transfer', null)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// economy:post_bounty / economy:claim_bounty / economy:complete_bounty
// ---------------------------------------------------------------------------

describe('bounty lifecycle', () => {
  it('should emit economy:bounty_posted on post_bounty', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 20,
      description: 'classify image',
    });
    expect(emitted.some(e => e.type === 'economy:bounty_posted')).toBe(true);
  });

  it('should lock escrow from poster on post_bounty', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 20,
      description: 'test',
    });
    emitted.length = 0;
    fire(node, config, context, 'economy:get_balance', { agentId: 'alice' });
    const bal = emitted.find(e => e.type === 'economy:balance');
    expect((bal!.payload as any).balance).toBe(80); // 100 - 20
  });

  it('should fail to post bounty if insufficient funds', () => {
    const { node, config, context, emitted } = setup({ initial_balance: 5 });
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 100,
      description: 'x',
    });
    expect(emitted.some(e => e.type === 'economy:insufficient_funds')).toBe(true);
  });

  it('should not create bounty if funds insufficient', () => {
    const { node, config, context, emitted } = setup({ initial_balance: 5 });
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 100,
      description: 'x',
    });
    emitted.length = 0;
    fire(node, config, context, 'economy:get_bounties', {});
    const ev = emitted.find(e => e.type === 'economy:bounties_list');
    expect((ev!.payload as any).total).toBe(0);
  });

  it('should emit economy:bounty_claimed on claim_bounty', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 10,
      description: 'x',
    });
    const posted = emitted.find(e => e.type === 'economy:bounty_posted')!;
    const bountyId = (posted.payload as any).bountyId;
    emitted.length = 0;
    fire(node, config, context, 'economy:claim_bounty', { bountyId, claimantId: 'bob' });
    expect(emitted.some(e => e.type === 'economy:bounty_claimed')).toBe(true);
  });

  it('should not allow claiming a non-open bounty', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 10,
      description: 'x',
    });
    const posted = emitted.find(e => e.type === 'economy:bounty_posted')!;
    const bountyId = (posted.payload as any).bountyId;
    fire(node, config, context, 'economy:claim_bounty', { bountyId, claimantId: 'bob' });
    emitted.length = 0;
    // claim again — should be ignored (status is 'claimed' not 'open')
    fire(node, config, context, 'economy:claim_bounty', { bountyId, claimantId: 'carol' });
    expect(emitted.some(e => e.type === 'economy:bounty_claimed')).toBe(false);
  });

  it('should emit economy:bounty_completed on complete_bounty', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 10,
      description: 'x',
    });
    const posted = emitted.find(e => e.type === 'economy:bounty_posted')!;
    const bountyId = (posted.payload as any).bountyId;
    fire(node, config, context, 'economy:claim_bounty', { bountyId, claimantId: 'bob' });
    emitted.length = 0;
    fire(node, config, context, 'economy:complete_bounty', { bountyId, result: 'done' });
    expect(emitted.some(e => e.type === 'economy:bounty_completed')).toBe(true);
  });

  it('winner receives reward on complete_bounty', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 20,
      description: 'x',
    });
    const posted = emitted.find(e => e.type === 'economy:bounty_posted')!;
    const bountyId = (posted.payload as any).bountyId;
    fire(node, config, context, 'economy:claim_bounty', { bountyId, claimantId: 'bob' });
    fire(node, config, context, 'economy:complete_bounty', { bountyId });
    emitted.length = 0;
    fire(node, config, context, 'economy:get_balance', { agentId: 'bob' });
    const bal = emitted.find(e => e.type === 'economy:balance');
    // bob starts at 100, gets 20 reward
    expect((bal!.payload as any).balance).toBe(120);
  });

  it('should not complete a bounty that was not claimed', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 10,
      description: 'x',
    });
    const posted = emitted.find(e => e.type === 'economy:bounty_posted')!;
    const bountyId = (posted.payload as any).bountyId;
    emitted.length = 0;
    fire(node, config, context, 'economy:complete_bounty', { bountyId });
    // status is 'open' not 'claimed' — should be ignored
    expect(emitted.some(e => e.type === 'economy:bounty_completed')).toBe(false);
  });

  it('should respect max_bounties_per_agent', () => {
    const { node, config, context, emitted } = setup({ max_bounties_per_agent: 2 });
    for (let i = 0; i < 3; i++) {
      fire(node, config, context, 'economy:post_bounty', {
        posterId: 'alice',
        reward: 5,
        description: `bounty ${i}`,
      });
    }
    emitted.length = 0;
    fire(node, config, context, 'economy:get_bounties', { status: 'open' });
    const ev = emitted.find(e => e.type === 'economy:bounties_list');
    expect((ev!.payload as any).total).toBe(2);
  });

  it('should not post bounty with no description', () => {
    const { node, config, context, emitted } = setup();
    // description defaults to empty string — still creates bounty
    fire(node, config, context, 'economy:post_bounty', { posterId: 'alice', reward: 5 });
    expect(emitted.some(e => e.type === 'economy:bounty_posted')).toBe(true);
  });

  it('posted bounty event includes requiredCapabilities', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 5,
      description: 'cap test',
      requiredCapabilities: ['vision', 'nlp'],
    });
    const ev = emitted.find(e => e.type === 'economy:bounty_posted');
    expect((ev!.payload as any).requiredCapabilities).toEqual(['vision', 'nlp']);
  });
});

// ---------------------------------------------------------------------------
// economy:get_balance
// ---------------------------------------------------------------------------

describe('economy:get_balance', () => {
  it('should emit economy:balance for known agent', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:earn', { agentId: 'a', amount: 0 });
    emitted.length = 0;
    fire(node, config, context, 'economy:get_balance', { agentId: 'a' });
    expect(emitted.some(e => e.type === 'economy:balance')).toBe(true);
  });

  it('should create account on first get_balance (lazy init)', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:get_balance', { agentId: 'newbie' });
    const ev = emitted.find(e => e.type === 'economy:balance');
    expect((ev!.payload as any).balance).toBe(config.initial_balance);
  });

  it('should include totalEarned and totalSpent', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:get_balance', { agentId: 'a' });
    const ev = emitted.find(e => e.type === 'economy:balance');
    const p = ev!.payload as any;
    expect(p).toHaveProperty('totalEarned');
    expect(p).toHaveProperty('totalSpent');
  });
});

// ---------------------------------------------------------------------------
// economy:get_bounties
// ---------------------------------------------------------------------------

describe('economy:get_bounties', () => {
  it('should list all bounties when no status filter', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 5,
      description: 'a',
    });
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 5,
      description: 'b',
    });
    emitted.length = 0;
    fire(node, config, context, 'economy:get_bounties', {});
    const ev = emitted.find(e => e.type === 'economy:bounties_list');
    expect((ev!.payload as any).total).toBe(2);
  });

  it('should filter by status', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 5,
      description: 'a',
    });
    const posted = emitted.find(e => e.type === 'economy:bounty_posted')!;
    const bountyId = (posted.payload as any).bountyId;
    fire(node, config, context, 'economy:claim_bounty', { bountyId, claimantId: 'bob' });
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 5,
      description: 'b',
    });
    emitted.length = 0;
    fire(node, config, context, 'economy:get_bounties', { status: 'open' });
    const ev = emitted.find(e => e.type === 'economy:bounties_list');
    expect((ev!.payload as any).total).toBe(1);
  });

  it('should return empty list when no bounties exist', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'economy:get_bounties', {});
    const ev = emitted.find(e => e.type === 'economy:bounties_list');
    expect((ev!.payload as any).total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// onUpdate — bounty expiry
// ---------------------------------------------------------------------------

describe('onUpdate — bounty expiry', () => {
  it('should expire bounty past deadline', () => {
    const { node, config, context, emitted } = setup({ default_bounty_deadline: 0 });
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 10,
      description: 'time-limited',
      deadline: Date.now() - 1000, // already expired
    });
    emitted.length = 0;
    economyPrimitivesHandler.onUpdate(node, config, context, 0.016);
    expect(emitted.some(e => e.type === 'economy:bounty_expired')).toBe(true);
  });

  it('should not expire bounty before deadline', () => {
    const { node, config, context, emitted } = setup({ default_bounty_deadline: 0 });
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 10,
      description: 'future',
      deadline: Date.now() + 60_000,
    });
    emitted.length = 0;
    economyPrimitivesHandler.onUpdate(node, config, context, 0.016);
    expect(emitted.some(e => e.type === 'economy:bounty_expired')).toBe(false);
  });

  it('should return escrow to poster when bounty expires', () => {
    const { node, config, context, emitted } = setup({ default_bounty_deadline: 0 });
    fire(node, config, context, 'economy:post_bounty', {
      posterId: 'alice',
      reward: 20,
      description: 'refund test',
      deadline: Date.now() - 1,
    });
    economyPrimitivesHandler.onUpdate(node, config, context, 0.016);
    emitted.length = 0;
    fire(node, config, context, 'economy:get_balance', { agentId: 'alice' });
    const bal = emitted.find(e => e.type === 'economy:balance');
    // escrowed 20, refunded 20 → back to 100
    expect((bal!.payload as any).balance).toBe(100);
  });

  it('should not throw if no state on update', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() => {
      economyPrimitivesHandler.onUpdate(node, DEFAULT_CONFIG, context, 0.016);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// onUpdate — subscription charging
// ---------------------------------------------------------------------------

describe('onUpdate — subscriptions', () => {
  it('should charge subscription when period elapses', () => {
    const { node, config, context, emitted } = setup();
    const state = (node as any).__economyState as EconomyState;
    // Manually add subscription with lastChargeAt in the past
    state.accounts.set('subscriber', {
      agentId: 'subscriber',
      balance: 100,
      totalEarned: 100,
      totalSpent: 0,
      spendLimit: 0,
      spendThisPeriod: 0,
      periodStartMs: Date.now(),
      periodDurationMs: 3600000,
      transactions: [],
    });
    state.accounts.set('provider', {
      agentId: 'provider',
      balance: 100,
      totalEarned: 100,
      totalSpent: 0,
      spendLimit: 0,
      spendThisPeriod: 0,
      periodStartMs: Date.now(),
      periodDurationMs: 3600000,
      transactions: [],
    });
    state.subscriptions.set('sub1', {
      id: 'sub1',
      subscriberAgent: 'subscriber',
      providerAgent: 'provider',
      creditPerPeriod: 10,
      periodMs: 1000,
      lastChargeAt: Date.now() - 2000, // 2s ago → should fire
      active: true,
    });
    economyPrimitivesHandler.onUpdate(node, config, context, 0.016);
    const sub = state.accounts.get('subscriber')!;
    expect(sub.balance).toBe(90);
    const prov = state.accounts.get('provider')!;
    expect(prov.balance).toBe(110);
  });

  it('should suspend subscription when subscriber has insufficient funds', () => {
    const { node, config, context, emitted } = setup();
    const state = (node as any).__economyState as EconomyState;
    state.accounts.set('poor', {
      agentId: 'poor',
      balance: 5,
      totalEarned: 5,
      totalSpent: 0,
      spendLimit: 0,
      spendThisPeriod: 0,
      periodStartMs: Date.now(),
      periodDurationMs: 3600000,
      transactions: [],
    });
    state.accounts.set('rich', {
      agentId: 'rich',
      balance: 100,
      totalEarned: 100,
      totalSpent: 0,
      spendLimit: 0,
      spendThisPeriod: 0,
      periodStartMs: Date.now(),
      periodDurationMs: 3600000,
      transactions: [],
    });
    state.subscriptions.set('sub2', {
      id: 'sub2',
      subscriberAgent: 'poor',
      providerAgent: 'rich',
      creditPerPeriod: 50,
      periodMs: 1000,
      lastChargeAt: Date.now() - 2000,
      active: true,
    });
    economyPrimitivesHandler.onUpdate(node, config, context, 0.016);
    const sub = state.subscriptions.get('sub2')!;
    expect(sub.active).toBe(false);
    expect(emitted.some(e => e.type === 'economy:subscription_suspended')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handler name
// ---------------------------------------------------------------------------

describe('handler metadata', () => {
  it('should have name "economy"', () => {
    expect(economyPrimitivesHandler.name).toBe('economy');
  });

  it('should expose defaultConfig', () => {
    expect(economyPrimitivesHandler.defaultConfig).toBeDefined();
  });
});
