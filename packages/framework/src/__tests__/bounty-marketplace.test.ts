import { describe, it, expect } from 'vitest';
import { BountyManager } from '../economy/BountyManager';
import { KnowledgeMarketplace } from '../economy/KnowledgeMarketplace';
import { KnowledgeStore } from '../knowledge/knowledge-store';
import type { StoredEntry } from '../knowledge/knowledge-store';
import { defineAgent } from '../define-agent';
import { Team } from '../team';

// ── BountyManager ──

describe('BountyManager', () => {
  it('creates a bounty', () => {
    const mgr = new BountyManager();
    const bounty = mgr.createBounty('task-1', { amount: 5, currency: 'USDC' }, 'alice');
    expect(bounty.id).toMatch(/^bounty_/);
    expect(bounty.taskId).toBe('task-1');
    expect(bounty.status).toBe('open');
    expect(bounty.reward.amount).toBe(5);
  });

  it('rejects zero or negative reward', () => {
    const mgr = new BountyManager();
    expect(() => mgr.createBounty('t1', { amount: 0, currency: 'credits' }, 'a')).toThrow('positive');
    expect(() => mgr.createBounty('t1', { amount: -1, currency: 'credits' }, 'a')).toThrow('positive');
  });

  it('claims an open bounty', () => {
    const mgr = new BountyManager();
    const bounty = mgr.createBounty('task-1', { amount: 1, currency: 'credits' }, 'alice');
    const result = mgr.claimBounty(bounty.id, 'bob');
    expect(result.success).toBe(true);
    expect(mgr.getBounty(bounty.id)?.status).toBe('claimed');
    expect(mgr.getBounty(bounty.id)?.claimedBy).toBe('bob');
  });

  it('rejects claiming a non-open bounty', () => {
    const mgr = new BountyManager();
    const bounty = mgr.createBounty('task-1', { amount: 1, currency: 'credits' }, 'alice');
    mgr.claimBounty(bounty.id, 'bob');
    const result = mgr.claimBounty(bounty.id, 'charlie');
    expect(result.success).toBe(false);
    expect(result.error).toContain('claimed');
  });

  it('rejects claiming an expired bounty', () => {
    const mgr = new BountyManager();
    // Deadline in the past
    const bounty = mgr.createBounty('task-1', { amount: 1, currency: 'credits' }, 'alice', Date.now() - 1000);
    const result = mgr.claimBounty(bounty.id, 'bob');
    expect(result.success).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('completes a claimed bounty with proof', () => {
    const mgr = new BountyManager();
    const bounty = mgr.createBounty('task-1', { amount: 0.05, currency: 'USDC' }, 'alice');
    mgr.claimBounty(bounty.id, 'bob');
    const payout = mgr.completeBounty(bounty.id, { summary: 'Fixed the bug', commitHash: 'abc123' });
    expect(payout.success).toBe(true);
    expect(payout.amount).toBe(0.05);
    expect(payout.settlement).toBe('ledger'); // < 0.10 USDC = ledger
  });

  it('uses on_chain settlement for larger USDC amounts', () => {
    const mgr = new BountyManager();
    const bounty = mgr.createBounty('task-1', { amount: 5, currency: 'USDC' }, 'alice');
    mgr.claimBounty(bounty.id, 'bob');
    const payout = mgr.completeBounty(bounty.id, { summary: 'Shipped feature' });
    expect(payout.settlement).toBe('on_chain');
  });

  it('uses ledger settlement for credits', () => {
    const mgr = new BountyManager();
    const bounty = mgr.createBounty('task-1', { amount: 100, currency: 'credits' }, 'alice');
    mgr.claimBounty(bounty.id, 'bob');
    const payout = mgr.completeBounty(bounty.id, { summary: 'Done' });
    expect(payout.settlement).toBe('ledger');
  });

  it('rejects completion without summary', () => {
    const mgr = new BountyManager();
    const bounty = mgr.createBounty('task-1', { amount: 1, currency: 'credits' }, 'alice');
    mgr.claimBounty(bounty.id, 'bob');
    const payout = mgr.completeBounty(bounty.id, { summary: '' });
    expect(payout.success).toBe(false);
    expect(payout.error).toContain('summary');
  });

  it('lists bounties by status', () => {
    const mgr = new BountyManager();
    mgr.createBounty('t1', { amount: 1, currency: 'credits' }, 'a');
    mgr.createBounty('t2', { amount: 2, currency: 'credits' }, 'a');
    const b3 = mgr.createBounty('t3', { amount: 3, currency: 'credits' }, 'a');
    mgr.claimBounty(b3.id, 'bob');
    expect(mgr.list('open')).toHaveLength(2);
    expect(mgr.list('claimed')).toHaveLength(1);
    expect(mgr.list()).toHaveLength(3);
  });

  it('calculates total open value', () => {
    const mgr = new BountyManager();
    mgr.createBounty('t1', { amount: 5, currency: 'USDC' }, 'a');
    mgr.createBounty('t2', { amount: 3, currency: 'credits' }, 'a');
    mgr.createBounty('t3', { amount: 10, currency: 'USDC' }, 'a');
    expect(mgr.totalOpen('USDC')).toBe(15);
    expect(mgr.totalOpen('credits')).toBe(3);
    expect(mgr.totalOpen()).toBe(18);
  });

  it('expires stale bounties', () => {
    const mgr = new BountyManager();
    mgr.createBounty('t1', { amount: 1, currency: 'credits' }, 'a', Date.now() - 1000);
    mgr.createBounty('t2', { amount: 2, currency: 'credits' }, 'a', Date.now() + 100_000);
    expect(mgr.expireStale()).toBe(1);
    expect(mgr.list('expired')).toHaveLength(1);
    expect(mgr.list('open')).toHaveLength(1);
  });

  it('returns bounties by task', () => {
    const mgr = new BountyManager();
    mgr.createBounty('task-A', { amount: 1, currency: 'credits' }, 'a');
    mgr.createBounty('task-A', { amount: 2, currency: 'credits' }, 'b');
    mgr.createBounty('task-B', { amount: 3, currency: 'credits' }, 'a');
    expect(mgr.byTask('task-A')).toHaveLength(2);
    expect(mgr.byTask('task-B')).toHaveLength(1);
  });
});

// ── KnowledgeMarketplace ──

describe('KnowledgeMarketplace', () => {
  const mockEntry = (overrides?: Partial<StoredEntry>): StoredEntry => ({
    id: 'W.TEST.001',
    type: 'wisdom',
    content: 'Always test before shipping',
    domain: 'engineering',
    confidence: 0.9,
    source: 'experience',
    queryCount: 12,
    reuseCount: 6,
    createdAt: new Date().toISOString(),
    authorAgent: 'alice',
    ...overrides,
  });

  it('prices knowledge based on type, confidence, and reuse', () => {
    const mp = new KnowledgeMarketplace();
    const wisdom = mockEntry(); // high confidence, high reuse, high query
    const price = mp.priceKnowledge(wisdom);
    // wisdom base=0.05, confidence>=0.8 *1.5=0.075, reuse>=5 *2=0.15, query>=10 *1.25=0.1875
    expect(price).toBe(0.1875);
  });

  it('prices gotchas lower than wisdom', () => {
    const mp = new KnowledgeMarketplace();
    const gotcha = mockEntry({ type: 'gotcha', confidence: 0.5, reuseCount: 0, queryCount: 0 });
    const price = mp.priceKnowledge(gotcha);
    expect(price).toBe(0.02); // base gotcha, no multipliers
  });

  it('lists and buys knowledge', () => {
    const mp = new KnowledgeMarketplace();
    const entry = mockEntry();
    const listing = mp.sellKnowledge(entry, 0.10, 'alice');
    expect(listing.success).toBe(true);

    const purchase = mp.buyKnowledge(listing.listingId, 'bob');
    expect(purchase.success).toBe(true);
    expect(purchase.price).toBe(0.10);
    expect(purchase.entryId).toBe('W.TEST.001');
  });

  it('prevents duplicate listings', () => {
    const mp = new KnowledgeMarketplace();
    const entry = mockEntry();
    mp.sellKnowledge(entry, 0.10, 'alice');
    const dup = mp.sellKnowledge(entry, 0.20, 'alice');
    expect(dup.success).toBe(false);
    expect(dup.error).toContain('already listed');
  });

  it('prevents buying your own listing', () => {
    const mp = new KnowledgeMarketplace();
    const entry = mockEntry();
    const listing = mp.sellKnowledge(entry, 0.10, 'alice');
    const purchase = mp.buyKnowledge(listing.listingId, 'alice');
    expect(purchase.success).toBe(false);
    expect(purchase.error).toContain('own listing');
  });

  it('prevents buying a sold listing', () => {
    const mp = new KnowledgeMarketplace();
    const entry = mockEntry();
    const listing = mp.sellKnowledge(entry, 0.10, 'alice');
    mp.buyKnowledge(listing.listingId, 'bob');
    const second = mp.buyKnowledge(listing.listingId, 'charlie');
    expect(second.success).toBe(false);
    expect(second.error).toContain('sold');
  });

  it('rejects zero price', () => {
    const mp = new KnowledgeMarketplace();
    const result = mp.sellKnowledge(mockEntry(), 0, 'alice');
    expect(result.success).toBe(false);
  });

  it('delists an active listing', () => {
    const mp = new KnowledgeMarketplace();
    const entry = mockEntry();
    const listing = mp.sellKnowledge(entry, 0.10, 'alice');
    expect(mp.delist(listing.listingId, 'alice')).toBe(true);
    expect(mp.activeListings()).toHaveLength(0);
  });

  it('only seller can delist', () => {
    const mp = new KnowledgeMarketplace();
    const entry = mockEntry();
    const listing = mp.sellKnowledge(entry, 0.10, 'alice');
    expect(mp.delist(listing.listingId, 'bob')).toBe(false);
  });

  it('tracks seller revenue', () => {
    const mp = new KnowledgeMarketplace();
    const e1 = mockEntry({ id: 'W.TEST.001' });
    const e2 = mockEntry({ id: 'W.TEST.002' });
    const l1 = mp.sellKnowledge(e1, 0.10, 'alice');
    const l2 = mp.sellKnowledge(e2, 0.25, 'alice');
    mp.buyKnowledge(l1.listingId, 'bob');
    mp.buyKnowledge(l2.listingId, 'charlie');
    expect(mp.sellerRevenue('alice')).toBe(0.35);
  });

  it('tracks purchase history', () => {
    const mp = new KnowledgeMarketplace();
    const e1 = mockEntry({ id: 'W.TEST.001' });
    const listing = mp.sellKnowledge(e1, 0.10, 'alice');
    mp.buyKnowledge(listing.listingId, 'bob');
    expect(mp.purchaseHistory('bob')).toHaveLength(1);
    expect(mp.purchaseHistory('charlie')).toHaveLength(0);
  });

  it('reports total volume', () => {
    const mp = new KnowledgeMarketplace();
    const e1 = mockEntry({ id: 'W.TEST.001' });
    const e2 = mockEntry({ id: 'W.TEST.002' });
    const l1 = mp.sellKnowledge(e1, 0.10, 'alice');
    const l2 = mp.sellKnowledge(e2, 0.20, 'bob');
    mp.buyKnowledge(l1.listingId, 'bob');
    mp.buyKnowledge(l2.listingId, 'alice');
    expect(mp.totalVolume()).toBeCloseTo(0.30);
  });
});

// ── KnowledgeStore marketplace integration ──

describe('KnowledgeStore marketplace integration', () => {
  it('prices and lists entries via store', () => {
    const store = new KnowledgeStore({ persist: false });
    const entry = store.publish(
      { type: 'wisdom', content: 'Cache invalidation matters', domain: 'engineering', confidence: 0.9, source: 'test' },
      'alice'
    );
    const price = store.priceEntry(entry.id);
    expect(price).toBeGreaterThan(0);

    const listing = store.listForSale(entry.id, 'alice');
    expect(listing.success).toBe(true);
  });

  it('buys a listed entry and increments reuseCount', () => {
    const store = new KnowledgeStore({ persist: false });
    const entry = store.publish(
      { type: 'pattern', content: 'Use dependency injection', domain: 'architecture', confidence: 0.8, source: 'test' },
      'alice'
    );
    const listing = store.listForSale(entry.id, 'alice', 0.05);
    const { purchase, entry: bought } = store.buyListed(listing.listingId, 'bob');
    expect(purchase.success).toBe(true);
    expect(bought).toBeDefined();
    expect(bought!.reuseCount).toBe(1); // was 0, now 1
  });

  it('returns active listings', () => {
    const store = new KnowledgeStore({ persist: false });
    const e1 = store.publish(
      { type: 'gotcha', content: 'Watch out for NaN', domain: 'js', confidence: 0.7, source: 'test' },
      'alice'
    );
    store.listForSale(e1.id, 'alice');
    expect(store.activeListings()).toHaveLength(1);
  });

  it('returns null price for nonexistent entry', () => {
    const store = new KnowledgeStore({ persist: false });
    expect(store.priceEntry('nonexistent')).toBeNull();
  });

  it('returns error for listing nonexistent entry', () => {
    const store = new KnowledgeStore({ persist: false });
    const result = store.listForSale('nonexistent', 'alice');
    expect(result.success).toBe(false);
  });
});

// ── Team bounty integration ──

describe('Team bounty integration', () => {
  const coder = defineAgent({
    name: 'Coder',
    role: 'coder',
    model: { provider: 'anthropic', model: 'claude-sonnet-4' },
    capabilities: ['code-generation'],
    claimFilter: { roles: ['coder'], maxPriority: 8 },
  });

  function makeTeam(): Team {
    return new Team({ name: 'test-team', agents: [coder] });
  }

  it('creates a bounty for a board task', async () => {
    const team = makeTeam();
    await team.addTasks([{ title: 'Fix bug', description: 'Fix the crash', priority: 3 }]);
    const tasks = team['board']; // access private for test
    const bounty = team.createBounty(tasks[0].id, { amount: 10, currency: 'credits' }, 'owner');
    expect(bounty.status).toBe('open');
    expect(bounty.taskId).toBe(tasks[0].id);
  });

  it('rejects bounty for nonexistent task', () => {
    const team = makeTeam();
    expect(() => team.createBounty('nope', { amount: 1, currency: 'credits' }, 'a')).toThrow('not found');
  });

  it('claims bounty for a team agent', async () => {
    const team = makeTeam();
    await team.addTasks([{ title: 'Ship it', description: 'Deploy', priority: 2 }]);
    const tasks = team['board'];
    const bounty = team.createBounty(tasks[0].id, { amount: 5, currency: 'USDC' }, 'owner');
    const result = team.claimBountyForAgent(bounty.id, 'Coder');
    expect(result.success).toBe(true);
  });

  it('rejects claim from non-team agent', async () => {
    const team = makeTeam();
    await team.addTasks([{ title: 'Task', description: 'Desc', priority: 3 }]);
    const tasks = team['board'];
    const bounty = team.createBounty(tasks[0].id, { amount: 1, currency: 'credits' }, 'owner');
    expect(() => team.claimBountyForAgent(bounty.id, 'stranger')).toThrow('not on team');
  });

  it('completes bounty with proof', async () => {
    const team = makeTeam();
    await team.addTasks([{ title: 'Build', description: 'Build it', priority: 1 }]);
    const tasks = team['board'];
    const bounty = team.createBounty(tasks[0].id, { amount: 2, currency: 'credits' }, 'owner');
    team.claimBountyForAgent(bounty.id, 'Coder');
    const payout = team.completeBountyWithProof(bounty.id, { summary: 'Done', commitHash: 'abc' });
    expect(payout.success).toBe(true);
    expect(payout.amount).toBe(2);
  });

  it('lists bounties', async () => {
    const team = makeTeam();
    await team.addTasks([
      { title: 'A', description: 'a', priority: 3 },
      { title: 'B', description: 'b', priority: 4 },
    ]);
    const tasks = team['board'];
    team.createBounty(tasks[0].id, { amount: 1, currency: 'credits' }, 'owner');
    team.createBounty(tasks[1].id, { amount: 2, currency: 'credits' }, 'owner');
    expect(team.listBounties()).toHaveLength(2);
    expect(team.listBounties('open')).toHaveLength(2);
  });
});
