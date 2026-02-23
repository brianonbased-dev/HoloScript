/**
 * MarketplaceTrait Production Tests
 *
 * In-world marketplace for buying, selling, and auctioning assets.
 * Tests listing lifecycle, bidding, purchase, error conditions, and query.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { marketplaceHandler } from '../MarketplaceTrait';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(): any { return {}; }
function makeCtx() { const emit = vi.fn(); return { emit }; }

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    platform: 'opensea' as const,
    listing_enabled: true,
    buy_enabled: true,
    currency: 'ETH' as const,
    royalty_percentage: 2.5,
    royalty_recipient: '0xROYALTY',
    auction_support: true,
    min_price: 0,
    custom_api: '',
    ...overrides,
  };
}

function attach(overrides: Record<string, unknown> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const cfg = makeConfig(overrides);
  marketplaceHandler.onAttach!(node, cfg as any, ctx as any);
  return { node, ctx, cfg };
}

function st(node: any) { return (node as any).__marketplaceState; }

function fire(node: any, cfg: any, ctx: any, event: Record<string, unknown>) {
  marketplaceHandler.onEvent!(node, cfg, ctx as any, event);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MarketplaceTrait — Production', () => {

  beforeEach(() => vi.clearAllMocks());

  // ─── defaultConfig ──────────────────────────────────────────────────

  it('has name marketplace', () => {
    expect(marketplaceHandler.name).toBe('marketplace');
  });

  it('defaultConfig platform is opensea', () => {
    expect(marketplaceHandler.defaultConfig.platform).toBe('opensea');
  });

  it('defaultConfig listing_enabled is false', () => {
    expect(marketplaceHandler.defaultConfig.listing_enabled).toBe(false);
  });

  it('defaultConfig buy_enabled is true', () => {
    expect(marketplaceHandler.defaultConfig.buy_enabled).toBe(true);
  });

  it('defaultConfig royalty_percentage is 2.5', () => {
    expect(marketplaceHandler.defaultConfig.royalty_percentage).toBe(2.5);
  });

  // ─── onAttach ───────────────────────────────────────────────────────

  it('creates initial state on attach', () => {
    const { node } = attach();
    const s = st(node);
    expect(s.isListed).toBe(false);
    expect(s.currentPrice).toBe(0);
    expect(s.listingId).toBeNull();
    expect(s.status).toBe('unlisted');
    expect(s.highestBid).toBe(0);
    expect(s.bidCount).toBe(0);
    expect(s.auctionEndTime).toBeNull();
    expect(s.ownerAddress).toBeNull();
  });

  it('emits marketplace_connect on attach', () => {
    const { ctx } = attach();
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_connect', expect.objectContaining({
      platform: 'opensea',
    }));
  });

  // ─── onDetach ───────────────────────────────────────────────────────

  it('emits marketplace_disconnect and removes state on detach', () => {
    const { node, ctx, cfg } = attach();
    marketplaceHandler.onDetach!(node, cfg as any, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_disconnect', expect.objectContaining({ node }));
    expect(st(node)).toBeUndefined();
  });

  // ─── onUpdate: auction expiry ────────────────────────────────────────

  it('onUpdate emits marketplace_auction_ended when auction time passes', () => {
    const { node, ctx, cfg } = attach();
    const s = st(node);
    s.status = 'auction_active';
    s.auctionEndTime = Date.now() - 1; // already expired
    s.highestBid = 5;
    s.bidCount = 3;
    marketplaceHandler.onUpdate!(node, cfg as any, ctx as any, 0);
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_auction_ended', expect.objectContaining({
      winningBid: 5,
    }));
    expect(s.status).toBe('auction_ended');
  });

  it('onUpdate does NOT fire when auction not yet ended', () => {
    const { node, ctx, cfg } = attach();
    const s = st(node);
    s.status = 'auction_active';
    s.auctionEndTime = Date.now() + 100000;
    ctx.emit.mockClear();
    marketplaceHandler.onUpdate!(node, cfg as any, ctx as any, 0);
    expect(ctx.emit).not.toHaveBeenCalledWith('marketplace_auction_ended', expect.anything());
  });

  // ─── onEvent: list ──────────────────────────────────────────────────

  it('marketplace_list sets price and emits marketplace_create_listing', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, { type: 'marketplace_list', price: 1.5 });
    expect(st(node).currentPrice).toBe(1.5);
    expect(st(node).status).toBe('listed');
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_create_listing', expect.objectContaining({
      price: 1.5,
      royaltyPercentage: 2.5,
    }));
  });

  it('marketplace_list rejects price below min_price', () => {
    const { node, ctx, cfg } = attach({ min_price: 5 });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_list', price: 1 });
    expect(ctx.emit).toHaveBeenCalledWith('on_marketplace_error', expect.objectContaining({
      error: expect.stringContaining('minimum'),
    }));
    expect(st(node).status).toBe('unlisted');
  });

  it('marketplace_list ignored when listing_enabled is false', () => {
    const { node, ctx, cfg } = attach({ listing_enabled: false });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_list', price: 1 });
    expect(ctx.emit).not.toHaveBeenCalledWith('marketplace_create_listing', expect.anything());
  });

  // ─── onEvent: listing_created ────────────────────────────────────────

  it('marketplace_listing_created sets listingId and isListed', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, { type: 'marketplace_list', price: 2 });
    fire(node, cfg, ctx, { type: 'marketplace_listing_created', listingId: 'L123' });
    expect(st(node).listingId).toBe('L123');
    expect(st(node).isListed).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('on_listed', expect.objectContaining({
      listingId: 'L123',
    }));
  });

  // ─── onEvent: unlist ────────────────────────────────────────────────

  it('marketplace_unlist cancels listing and resets state', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, { type: 'marketplace_list', price: 2 });
    fire(node, cfg, ctx, { type: 'marketplace_listing_created', listingId: 'L1' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_unlist' });
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_cancel_listing', expect.anything());
    expect(st(node).isListed).toBe(false);
    expect(st(node).status).toBe('unlisted');
    expect(st(node).listingId).toBeNull();
  });

  // ─── onEvent: buy ───────────────────────────────────────────────────

  it('marketplace_buy emits marketplace_execute_purchase when listed', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, { type: 'marketplace_list', price: 3 });
    fire(node, cfg, ctx, { type: 'marketplace_listing_created', listingId: 'L2' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_buy', buyerAddress: '0xBUYER', paymentProof: 'proof' });
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_execute_purchase', expect.objectContaining({
      buyerAddress: '0xBUYER',
    }));
  });

  it('marketplace_buy ignored when not listed', () => {
    const { node, ctx, cfg } = attach();
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_buy', buyerAddress: '0xBUYER', paymentProof: 'p' });
    expect(ctx.emit).not.toHaveBeenCalledWith('marketplace_execute_purchase', expect.anything());
  });

  it('marketplace_buy ignored when buy_enabled is false', () => {
    const { node, ctx, cfg } = attach({ buy_enabled: false });
    const s = st(node);
    s.isListed = true;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_buy', buyerAddress: '0xB', paymentProof: 'p' });
    expect(ctx.emit).not.toHaveBeenCalledWith('marketplace_execute_purchase', expect.anything());
  });

  // ─── onEvent: purchase_complete ─────────────────────────────────────

  it('marketplace_purchase_complete sets sold status and owner', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, { type: 'marketplace_purchase_complete', buyerAddress: '0xNEW' });
    expect(st(node).status).toBe('sold');
    expect(st(node).ownerAddress).toBe('0xNEW');
    expect(ctx.emit).toHaveBeenCalledWith('on_purchase_complete', expect.objectContaining({
      buyer: '0xNEW',
    }));
  });

  // ─── onEvent: auction ────────────────────────────────────────────────

  it('marketplace_start_auction sets auction state when auction_support=true', () => {
    const { node, ctx, cfg } = attach({ auction_support: true });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_start_auction', startingPrice: 0.5, duration: 3600000 });
    const s = st(node);
    expect(s.status).toBe('auction_active');
    expect(s.currentPrice).toBe(0.5);
    expect(s.auctionEndTime).toBeGreaterThan(Date.now());
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_create_auction', expect.anything());
  });

  it('marketplace_start_auction ignored when auction_support=false', () => {
    const { node, ctx, cfg } = attach({ auction_support: false });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_start_auction', startingPrice: 1, duration: 1000 });
    expect(st(node).status).not.toBe('auction_active');
  });

  it('marketplace_place_bid increments bidCount for higher bid', () => {
    const { node, ctx, cfg } = attach({ auction_support: true });
    fire(node, cfg, ctx, { type: 'marketplace_start_auction', startingPrice: 1, duration: 999999 });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_place_bid', amount: 2, bidderAddress: '0xBIDDER' });
    const s = st(node);
    expect(s.highestBid).toBe(2);
    expect(s.bidCount).toBe(1);
    expect(ctx.emit).toHaveBeenCalledWith('on_bid_received', expect.objectContaining({
      amount: 2,
      bidCount: 1,
    }));
  });

  it('marketplace_place_bid ignored for lower-or-equal bid', () => {
    const { node, ctx, cfg } = attach({ auction_support: true });
    fire(node, cfg, ctx, { type: 'marketplace_start_auction', startingPrice: 5, duration: 999999 });
    st(node).highestBid = 5;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_place_bid', amount: 3, bidderAddress: '0xLOW' });
    expect(st(node).bidCount).toBe(0);
  });

  // ─── onEvent: query ──────────────────────────────────────────────────

  it('marketplace_query emits marketplace_info with full state', () => {
    const { node, ctx, cfg } = attach();
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_query', queryId: 'Q1' });
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_info', expect.objectContaining({
      queryId: 'Q1',
      isListed: false,
      status: 'unlisted',
    }));
  });

  // ─── onEvent: update_price ──────────────────────────────────────────

  it('marketplace_update_price updates currentPrice', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, { type: 'marketplace_update_price', price: 10 });
    expect(st(node).currentPrice).toBe(10);
  });

  it('marketplace_update_price emits marketplace_update_listing when listed', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, { type: 'marketplace_list', price: 1 });
    fire(node, cfg, ctx, { type: 'marketplace_listing_created', listingId: 'L3' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_update_price', price: 7 });
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_update_listing', expect.objectContaining({
      price: 7,
    }));
  });

  // ─── Unknown event ───────────────────────────────────────────────────

  it('unknown event type is silently ignored', () => {
    const { node, ctx, cfg } = attach();
    expect(() => fire(node, cfg, ctx, { type: 'completely_unknown' })).not.toThrow();
  });
});
