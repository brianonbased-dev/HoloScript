import { describe, it, expect, vi, beforeEach } from 'vitest';
import { traitMarketplaceHandler } from '../HolomeshMarketplaceTrait';
import type { TraitMarketplaceConfig } from '../HolomeshMarketplaceTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(): any {
  return {};
}

function makeContext() {
  return { emit: vi.fn() };
}

function makeConfig(overrides: Partial<TraitMarketplaceConfig> = {}): TraitMarketplaceConfig {
  return {
    ...traitMarketplaceHandler.defaultConfig!,
    ...overrides,
  };
}

function attach(node: any, config: TraitMarketplaceConfig, ctx: any) {
  traitMarketplaceHandler.onAttach!(node, config, ctx);
}

function fire(node: any, config: TraitMarketplaceConfig, ctx: any, event: any) {
  traitMarketplaceHandler.onEvent!(node, config, ctx, event);
}

function update(node: any, config: TraitMarketplaceConfig, ctx: any, delta = 0) {
  traitMarketplaceHandler.onUpdate!(node, config, ctx, delta);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HolomeshMarketplaceTrait', () => {
  let node: any;
  let ctx: ReturnType<typeof makeContext>;
  let config: TraitMarketplaceConfig;

  beforeEach(() => {
    node = makeNode();
    ctx = makeContext();
    config = makeConfig();
    attach(node, config, ctx);
  });

  // ─── Lifecycle ───

  it('initializes state on attach', () => {
    expect(node.__traitMarketplaceState).toBeDefined();
    expect(node.__traitMarketplaceState.listings).toEqual([]);
    expect(node.__traitMarketplaceState.purchases).toEqual([]);
    expect(node.__traitMarketplaceState.reviews).toEqual([]);
  });

  it('cleans up state on detach', () => {
    traitMarketplaceHandler.onDetach!(node, config, ctx);
    expect(node.__traitMarketplaceState).toBeUndefined();
  });

  // ─── Listing ───

  it('lists a trait for sale', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller1',
      sellerName: 'Agent Alpha',
      traitName: 'cool_effect',
      displayName: 'Cool Effect',
      description: 'A really cool effect',
      price: 50,
      category: 'visual',
      tags: ['cool', 'effect'],
    });

    const listings = node.__traitMarketplaceState.listings;
    expect(listings).toHaveLength(1);
    expect(listings[0].traitName).toBe('cool_effect');
    expect(listings[0].price).toBe(50);
    expect(listings[0].status).toBe('active');
    expect(listings[0].revenueShares).toHaveLength(2);
    expect(ctx.emit).toHaveBeenCalledWith('trait_market:listed', expect.objectContaining({
      traitName: 'cool_effect',
      price: 50,
      sellerDid: 'did:seller1',
    }));
  });

  it('rejects duplicate listings from same seller', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller1',
      traitName: 'cool_effect',
      price: 50,
    });
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller1',
      traitName: 'cool_effect',
      price: 100,
    });

    expect(node.__traitMarketplaceState.listings).toHaveLength(1);
  });

  it('enforces max listings per agent', () => {
    const limitConfig = makeConfig({ max_listings_per_agent: 2 });
    const n = makeNode();
    attach(n, limitConfig, ctx);

    fire(n, limitConfig, ctx, { type: 'trait_market:list', sellerDid: 'did:s', traitName: 'a', price: 10 });
    fire(n, limitConfig, ctx, { type: 'trait_market:list', sellerDid: 'did:s', traitName: 'b', price: 10 });
    fire(n, limitConfig, ctx, { type: 'trait_market:list', sellerDid: 'did:s', traitName: 'c', price: 10 });

    expect(n.__traitMarketplaceState.listings).toHaveLength(2);
  });

  it('caps price at max_price', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:s',
      traitName: 'expensive',
      price: 999999,
    });

    expect(node.__traitMarketplaceState.listings[0].price).toBe(config.max_price);
  });

  it('lists free traits with price 0', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:s',
      traitName: 'freebie',
      price: 0,
    });

    const listing = node.__traitMarketplaceState.listings[0];
    expect(listing.pricing).toBe('free');
    expect(listing.price).toBe(0);
  });

  it('rejects PWYW when disabled', () => {
    const noPayConfig = makeConfig({ allow_pwyw: false });
    const n = makeNode();
    attach(n, noPayConfig, ctx);

    fire(n, noPayConfig, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:s',
      traitName: 'pwyw_trait',
      price: 10,
      pricing: 'pay_what_you_want',
    });

    expect(n.__traitMarketplaceState.listings).toHaveLength(0);
  });

  // ─── Revenue Shares ───

  it('creates correct revenue shares', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:creator',
      traitName: 'shared_trait',
      price: 100,
    });

    const shares = node.__traitMarketplaceState.listings[0].revenueShares;
    expect(shares).toHaveLength(2);
    const creatorShare = shares.find((s: any) => s.role === 'creator');
    const platformShare = shares.find((s: any) => s.role === 'platform');
    expect(creatorShare.percentage).toBe(95);
    expect(platformShare.percentage).toBe(5);
    expect(creatorShare.percentage + platformShare.percentage).toBe(100);
  });

  // ─── Delist ───

  it('allows seller to delist', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller',
      traitName: 'temp',
      price: 10,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;

    fire(node, config, ctx, {
      type: 'trait_market:delist',
      listingId,
      did: 'did:seller',
    });

    expect(node.__traitMarketplaceState.listings[0].status).toBe('delisted');
    expect(ctx.emit).toHaveBeenCalledWith('trait_market:delisted', { listingId });
  });

  it('blocks non-seller from delisting', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller',
      traitName: 'mine',
      price: 10,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;

    fire(node, config, ctx, {
      type: 'trait_market:delist',
      listingId,
      did: 'did:stranger',
    });

    expect(node.__traitMarketplaceState.listings[0].status).toBe('active');
  });

  // ─── Purchase ───

  it('processes a purchase', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller',
      traitName: 'buyable',
      price: 50,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;

    fire(node, config, ctx, {
      type: 'trait_market:purchase',
      listingId,
      buyerDid: 'did:buyer',
    });

    expect(node.__traitMarketplaceState.purchases).toHaveLength(1);
    expect(node.__traitMarketplaceState.listings[0].soldCount).toBe(1);
    expect(node.__traitMarketplaceState.listings[0].totalRevenue).toBe(50);

    // Should emit economy events
    expect(ctx.emit).toHaveBeenCalledWith('economy:spend', expect.objectContaining({
      agentId: 'did:buyer',
      amount: 50,
    }));
    expect(ctx.emit).toHaveBeenCalledWith('economy:earn', expect.objectContaining({
      agentId: 'did:seller',
    }));
    expect(ctx.emit).toHaveBeenCalledWith('trait_market:purchased', expect.objectContaining({
      buyerDid: 'did:buyer',
      price: 50,
    }));
    // Should trigger showcase:add for buyer
    expect(ctx.emit).toHaveBeenCalledWith('showcase:add', expect.objectContaining({
      traitName: 'buyable',
    }));
  });

  it('prevents buying own listing', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:self',
      traitName: 'mine',
      price: 10,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;

    fire(node, config, ctx, {
      type: 'trait_market:purchase',
      listingId,
      buyerDid: 'did:self',
    });

    expect(node.__traitMarketplaceState.purchases).toHaveLength(0);
  });

  it('handles sold out', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller',
      traitName: 'limited',
      price: 10,
      maxCopies: 1,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;

    fire(node, config, ctx, { type: 'trait_market:purchase', listingId, buyerDid: 'did:b1' });
    fire(node, config, ctx, { type: 'trait_market:purchase', listingId, buyerDid: 'did:b2' });

    expect(node.__traitMarketplaceState.purchases).toHaveLength(1);
    expect(node.__traitMarketplaceState.listings[0].status).toBe('sold_out');
  });

  it('free traits skip economy events', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller',
      traitName: 'freebie',
      price: 0,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;
    ctx.emit.mockClear();

    fire(node, config, ctx, {
      type: 'trait_market:purchase',
      listingId,
      buyerDid: 'did:buyer',
    });

    // Should NOT emit economy events for free trait
    const economyCalls = ctx.emit.mock.calls.filter(
      (c: any[]) => c[0] === 'economy:spend' || c[0] === 'economy:earn',
    );
    expect(economyCalls).toHaveLength(0);
    // But should still record purchase
    expect(node.__traitMarketplaceState.purchases).toHaveLength(1);
  });

  // ─── Price Update ───

  it('allows seller to update price', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller',
      traitName: 'repriced',
      price: 50,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;

    fire(node, config, ctx, {
      type: 'trait_market:update_price',
      listingId,
      did: 'did:seller',
      price: 75,
    });

    expect(node.__traitMarketplaceState.listings[0].price).toBe(75);
    expect(ctx.emit).toHaveBeenCalledWith('trait_market:price_updated', {
      listingId,
      oldPrice: 50,
      newPrice: 75,
    });
  });

  it('blocks non-seller from updating price', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller',
      traitName: 'locked',
      price: 50,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;

    fire(node, config, ctx, {
      type: 'trait_market:update_price',
      listingId,
      did: 'did:hacker',
      price: 0,
    });

    expect(node.__traitMarketplaceState.listings[0].price).toBe(50);
  });

  // ─── Reviews ───

  it('allows purchaser to review', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller',
      traitName: 'reviewed',
      price: 10,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;

    fire(node, config, ctx, {
      type: 'trait_market:purchase',
      listingId,
      buyerDid: 'did:buyer',
    });

    fire(node, config, ctx, {
      type: 'trait_market:review',
      listingId,
      reviewerDid: 'did:buyer',
      reviewerName: 'Buyer',
      rating: 5,
      comment: 'Amazing!',
    });

    expect(node.__traitMarketplaceState.reviews).toHaveLength(1);
    expect(node.__traitMarketplaceState.listings[0].rating).toBe(5);
    expect(node.__traitMarketplaceState.listings[0].reviewCount).toBe(1);
  });

  it('blocks review from non-purchaser', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller',
      traitName: 'blocked_review',
      price: 10,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;

    fire(node, config, ctx, {
      type: 'trait_market:review',
      listingId,
      reviewerDid: 'did:random',
      rating: 1,
    });

    expect(node.__traitMarketplaceState.reviews).toHaveLength(0);
  });

  it('blocks duplicate reviews', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller',
      traitName: 'dup_review',
      price: 10,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;
    fire(node, config, ctx, { type: 'trait_market:purchase', listingId, buyerDid: 'did:buyer' });

    fire(node, config, ctx, { type: 'trait_market:review', listingId, reviewerDid: 'did:buyer', rating: 5 });
    fire(node, config, ctx, { type: 'trait_market:review', listingId, reviewerDid: 'did:buyer', rating: 1 });

    expect(node.__traitMarketplaceState.reviews).toHaveLength(1);
    expect(node.__traitMarketplaceState.listings[0].rating).toBe(5);
  });

  it('computes running average rating', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller',
      traitName: 'multi_review',
      price: 10,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;

    fire(node, config, ctx, { type: 'trait_market:purchase', listingId, buyerDid: 'did:b1' });
    fire(node, config, ctx, { type: 'trait_market:purchase', listingId, buyerDid: 'did:b2' });
    fire(node, config, ctx, { type: 'trait_market:review', listingId, reviewerDid: 'did:b1', rating: 4 });
    fire(node, config, ctx, { type: 'trait_market:review', listingId, reviewerDid: 'did:b2', rating: 2 });

    expect(node.__traitMarketplaceState.listings[0].rating).toBe(3);
  });

  it('rejects out of range ratings', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:s',
      traitName: 'bad_rating',
      price: 10,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;
    fire(node, config, ctx, { type: 'trait_market:purchase', listingId, buyerDid: 'did:b' });

    fire(node, config, ctx, { type: 'trait_market:review', listingId, reviewerDid: 'did:b', rating: 0 });
    expect(node.__traitMarketplaceState.reviews).toHaveLength(0);

    fire(node, config, ctx, { type: 'trait_market:review', listingId, reviewerDid: 'did:b', rating: 6 });
    expect(node.__traitMarketplaceState.reviews).toHaveLength(0);
  });

  // ─── Search ───

  it('searches listings by query', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:s',
      traitName: 'particle_effect',
      displayName: 'Particle Effect',
      price: 25,
      tags: ['particles', 'vfx'],
    });
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:s',
      traitName: 'audio_loop',
      displayName: 'Audio Loop',
      price: 10,
      tags: ['audio'],
    });

    fire(node, config, ctx, {
      type: 'trait_market:search',
      query: 'particle',
    });

    const resultCall = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'trait_market:results');
    expect(resultCall).toBeDefined();
    expect(resultCall![1].listings).toHaveLength(1);
    expect(resultCall![1].listings[0].traitName).toBe('particle_effect');
  });

  it('filters search by category', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:s',
      traitName: 'viz_a',
      price: 10,
      category: 'visual',
    });
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:s',
      traitName: 'aud_a',
      price: 10,
      category: 'audio',
    });

    fire(node, config, ctx, {
      type: 'trait_market:search',
      category: 'audio',
    });

    const resultCall = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'trait_market:results');
    expect(resultCall![1].listings).toHaveLength(1);
    expect(resultCall![1].listings[0].traitName).toBe('aud_a');
  });

  // ─── Get / Stats ───

  it('returns listing details', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:s',
      traitName: 'detail_trait',
      price: 30,
      description: 'Detailed description',
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;

    fire(node, config, ctx, { type: 'trait_market:get', listingId });

    const dataCall = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'trait_market:data');
    expect(dataCall).toBeDefined();
    expect(dataCall![1].listing.traitName).toBe('detail_trait');
    expect(dataCall![1].listing.price).toBe(30);
  });

  it('returns seller stats', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:seller',
      traitName: 'stat_trait',
      price: 20,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;
    fire(node, config, ctx, { type: 'trait_market:purchase', listingId, buyerDid: 'did:b' });

    fire(node, config, ctx, { type: 'trait_market:seller_stats', did: 'did:seller' });

    const statsCall = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'trait_market:seller_data');
    expect(statsCall).toBeDefined();
    expect(statsCall![1].totalSold).toBe(1);
    expect(statsCall![1].totalRevenue).toBe(20);
    expect(statsCall![1].activeListings).toBe(1);
  });

  it('returns buyer purchase history', () => {
    fire(node, config, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:s',
      traitName: 'history_trait',
      price: 15,
    });
    const listingId = node.__traitMarketplaceState.listings[0].id;
    fire(node, config, ctx, { type: 'trait_market:purchase', listingId, buyerDid: 'did:buyer' });

    fire(node, config, ctx, { type: 'trait_market:buyer_history', did: 'did:buyer' });

    const histCall = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'trait_market:buyer_data');
    expect(histCall).toBeDefined();
    expect(histCall![1].totalPurchases).toBe(1);
    expect(histCall![1].totalSpent).toBe(15);
  });

  // ─── Auto-delist ───

  it('auto-delists expired listings on update', () => {
    const expiryConfig = makeConfig({ auto_delist_days: 1 });
    const n = makeNode();
    attach(n, expiryConfig, ctx);

    fire(n, expiryConfig, ctx, {
      type: 'trait_market:list',
      sellerDid: 'did:s',
      traitName: 'old_listing',
      price: 10,
    });

    // Manually backdated
    n.__traitMarketplaceState.listings[0].createdAt = Date.now() - 2 * 86400_000;
    update(n, expiryConfig, ctx, 1);

    expect(n.__traitMarketplaceState.listings[0].status).toBe('delisted');
  });
});
