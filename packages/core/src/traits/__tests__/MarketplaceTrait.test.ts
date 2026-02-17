import { describe, it, expect, beforeEach } from 'vitest';
import { marketplaceHandler } from '../MarketplaceTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount } from './traitTestHelpers';

describe('MarketplaceTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    platform: 'opensea' as const,
    listing_enabled: true,
    buy_enabled: true,
    currency: 'ETH' as const,
    royalty_percentage: 2.5,
    royalty_recipient: '0xRoyalty',
    auction_support: true,
    min_price: 0.01,
    custom_api: '',
  };

  beforeEach(() => {
    node = createMockNode('mp');
    ctx = createMockContext();
    attachTrait(marketplaceHandler, node, cfg, ctx);
  });

  it('connects on attach', () => {
    expect(getEventCount(ctx, 'marketplace_connect')).toBe(1);
    expect((node as any).__marketplaceState.status).toBe('unlisted');
  });

  it('list creates listing', () => {
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_list', price: 1.5 });
    const s = (node as any).__marketplaceState;
    expect(s.currentPrice).toBe(1.5);
    expect(s.status).toBe('listed');
    expect(getEventCount(ctx, 'marketplace_create_listing')).toBe(1);
  });

  it('rejects price below minimum', () => {
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_list', price: 0.001 });
    expect(getEventCount(ctx, 'on_marketplace_error')).toBe(1);
  });

  it('listing_created marks listed', () => {
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_list', price: 1 });
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_listing_created', listingId: 'L1' });
    expect((node as any).__marketplaceState.isListed).toBe(true);
    expect(getEventCount(ctx, 'on_listed')).toBe(1);
  });

  it('unlist cancels listing', () => {
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_list', price: 1 });
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_listing_created', listingId: 'L1' });
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_unlist' });
    expect((node as any).__marketplaceState.isListed).toBe(false);
  });

  it('purchase completes', () => {
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_list', price: 1 });
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_listing_created', listingId: 'L1' });
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_purchase_complete', buyerAddress: '0xBuyer' });
    expect((node as any).__marketplaceState.status).toBe('sold');
    expect(getEventCount(ctx, 'on_purchase_complete')).toBe(1);
  });

  it('auction starts and accepts bids', () => {
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_start_auction', startingPrice: 1, duration: 60000 });
    expect((node as any).__marketplaceState.status).toBe('auction_active');
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_place_bid', amount: 2, bidderAddress: '0xB1' });
    expect((node as any).__marketplaceState.highestBid).toBe(2);
    expect((node as any).__marketplaceState.bidCount).toBe(1);
    expect(getEventCount(ctx, 'on_bid_received')).toBe(1);
  });

  it('ignores lower bids', () => {
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_start_auction', startingPrice: 1, duration: 60000 });
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_place_bid', amount: 5, bidderAddress: '0xB1' });
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_place_bid', amount: 3, bidderAddress: '0xB2' });
    expect((node as any).__marketplaceState.bidCount).toBe(1); // Only first counted
  });

  it('query emits info', () => {
    sendEvent(marketplaceHandler, node, cfg, ctx, { type: 'marketplace_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'marketplace_info')).toBe(1);
  });

  it('detach disconnects', () => {
    marketplaceHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'marketplace_disconnect')).toBe(1);
    expect((node as any).__marketplaceState).toBeUndefined();
  });
});
