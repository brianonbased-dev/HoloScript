/**
 * Marketplace Trait
 *
 * In-world marketplace integration for buying, selling, and auctioning assets.
 * Supports multiple platforms and currencies.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type Platform = 'opensea' | 'rarible' | 'blur' | 'magic_eden' | 'custom';
type Currency = 'ETH' | 'MATIC' | 'SOL' | 'USDC' | 'custom';
type ListingStatus = 'unlisted' | 'listed' | 'sold' | 'auction_active' | 'auction_ended';

interface MarketplaceState {
  isListed: boolean;
  currentPrice: number;
  currency: Currency;
  listingId: string | null;
  status: ListingStatus;
  highestBid: number;
  bidCount: number;
  auctionEndTime: number | null;
  ownerAddress: string | null;
}

interface MarketplaceConfig {
  platform: Platform;
  listing_enabled: boolean;
  buy_enabled: boolean;
  currency: Currency;
  royalty_percentage: number;
  royalty_recipient: string;
  auction_support: boolean;
  min_price: number;
  custom_api: string; // For custom platform
}

// =============================================================================
// HANDLER
// =============================================================================

export const marketplaceHandler: TraitHandler<MarketplaceConfig> = {
  name: 'marketplace',

  defaultConfig: {
    platform: 'opensea',
    listing_enabled: false,
    buy_enabled: true,
    currency: 'ETH',
    royalty_percentage: 2.5,
    royalty_recipient: '',
    auction_support: false,
    min_price: 0,
    custom_api: '',
  },

  onAttach(node, config, context) {
    const state: MarketplaceState = {
      isListed: false,
      currentPrice: 0,
      currency: config.currency,
      listingId: null,
      status: 'unlisted',
      highestBid: 0,
      bidCount: 0,
      auctionEndTime: null,
      ownerAddress: null,
    };
    node.__marketplaceState = state;

    // Connect to marketplace
    context.emit?.('marketplace_connect', {
      node,
      platform: config.platform,
      customApi: config.custom_api,
    });
  },

  onDetach(node, config, context) {
    context.emit?.('marketplace_disconnect', { node });
    delete node.__marketplaceState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__marketplaceState as MarketplaceState;
    if (!state) return;

    // Check auction end time
    if (state.status === 'auction_active' && state.auctionEndTime) {
      if (Date.now() >= state.auctionEndTime) {
        state.status = 'auction_ended';

        context.emit?.('marketplace_auction_ended', {
          node,
          winningBid: state.highestBid,
        });

        context.emit?.('on_auction_end', {
          node,
          winningBid: state.highestBid,
          bidCount: state.bidCount,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__marketplaceState as MarketplaceState;
    if (!state) return;

    if (event.type === 'marketplace_list') {
      if (!config.listing_enabled) return;

      const price = event.price as number;
      if (price < config.min_price) {
        context.emit?.('on_marketplace_error', {
          node,
          error: `Price below minimum: ${config.min_price}`,
        });
        return;
      }

      state.currentPrice = price;
      state.status = 'listed';

      context.emit?.('marketplace_create_listing', {
        node,
        platform: config.platform,
        price,
        currency: config.currency,
        royaltyPercentage: config.royalty_percentage,
        royaltyRecipient: config.royalty_recipient,
      });
    } else if (event.type === 'marketplace_listing_created') {
      state.listingId = event.listingId as string;
      state.isListed = true;

      context.emit?.('on_listed', {
        node,
        listingId: state.listingId,
        price: state.currentPrice,
      });
    } else if (event.type === 'marketplace_unlist') {
      if (state.isListed) {
        context.emit?.('marketplace_cancel_listing', {
          node,
          listingId: state.listingId,
        });

        state.isListed = false;
        state.listingId = null;
        state.status = 'unlisted';
      }
    } else if (event.type === 'marketplace_buy') {
      if (!config.buy_enabled) return;
      if (!state.isListed) return;

      const buyerAddress = event.buyerAddress as string;
      const paymentProof = event.paymentProof as string;

      context.emit?.('marketplace_execute_purchase', {
        node,
        listingId: state.listingId,
        buyerAddress,
        paymentProof,
      });
    } else if (event.type === 'marketplace_purchase_complete') {
      state.status = 'sold';
      state.isListed = false;
      state.ownerAddress = event.buyerAddress as string;

      context.emit?.('on_purchase_complete', {
        node,
        price: state.currentPrice,
        buyer: state.ownerAddress,
      });
    } else if (event.type === 'marketplace_start_auction') {
      if (!config.auction_support) return;

      const startingPrice = event.startingPrice as number;
      const duration = event.duration as number; // milliseconds

      state.currentPrice = startingPrice;
      state.status = 'auction_active';
      state.auctionEndTime = Date.now() + duration;
      state.highestBid = 0;
      state.bidCount = 0;

      context.emit?.('marketplace_create_auction', {
        node,
        platform: config.platform,
        startingPrice,
        endTime: state.auctionEndTime,
        currency: config.currency,
      });
    } else if (event.type === 'marketplace_place_bid') {
      if (state.status !== 'auction_active') return;

      const bidAmount = event.amount as number;
      const bidderAddress = event.bidderAddress as string;

      if (bidAmount > state.highestBid) {
        state.highestBid = bidAmount;
        state.bidCount++;

        context.emit?.('marketplace_record_bid', {
          node,
          amount: bidAmount,
          bidder: bidderAddress,
        });

        context.emit?.('on_bid_received', {
          node,
          amount: bidAmount,
          bidder: bidderAddress,
          bidCount: state.bidCount,
        });
      }
    } else if (event.type === 'marketplace_update_price') {
      const newPrice = event.price as number;
      state.currentPrice = newPrice;

      if (state.isListed) {
        context.emit?.('marketplace_update_listing', {
          node,
          listingId: state.listingId,
          price: newPrice,
        });
      }
    } else if (event.type === 'marketplace_query') {
      context.emit?.('marketplace_info', {
        queryId: event.queryId,
        node,
        isListed: state.isListed,
        status: state.status,
        currentPrice: state.currentPrice,
        currency: state.currency,
        highestBid: state.highestBid,
        bidCount: state.bidCount,
        auctionEndTime: state.auctionEndTime,
      });
    }
  },
};

export default marketplaceHandler;
