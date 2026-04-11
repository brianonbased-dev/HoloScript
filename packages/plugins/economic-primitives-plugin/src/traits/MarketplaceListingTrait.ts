/** @marketplace_listing Trait — Trait/asset listing for agent marketplace. @trait marketplace_listing */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type ListingStatus = 'draft' | 'active' | 'sold' | 'suspended' | 'expired';
export type PricingModel = 'fixed' | 'auction' | 'subscription' | 'pay_per_use' | 'free';

export interface MarketplaceListingConfig {
  listingId: string;
  title: string;
  description: string;
  sellerAgentId: string;
  assetType: 'trait' | 'composition' | 'dataset' | 'model' | 'service';
  price: number;
  currency: string;
  pricingModel: PricingModel;
  royaltyPercent: number;
  tags: string[];
  licenseType: 'MIT' | 'proprietary' | 'CC-BY' | 'CC-BY-SA' | 'commercial';
}

export interface MarketplaceListingState {
  status: ListingStatus;
  views: number;
  purchases: number;
  revenue: number;
  rating: number;
  reviewCount: number;
}

const defaultConfig: MarketplaceListingConfig = { listingId: '', title: '', description: '', sellerAgentId: '', assetType: 'trait', price: 0, currency: 'USDC', pricingModel: 'fixed', royaltyPercent: 10, tags: [], licenseType: 'MIT' };

export function createMarketplaceListingHandler(): TraitHandler<MarketplaceListingConfig> {
  return { name: 'marketplace_listing', defaultConfig,
    onAttach(n: HSPlusNode, c: MarketplaceListingConfig, ctx: TraitContext) { n.__listingState = { status: 'draft' as ListingStatus, views: 0, purchases: 0, revenue: 0, rating: 0, reviewCount: 0 }; ctx.emit?.('listing:created', { title: c.title, price: c.price }); },
    onDetach(n: HSPlusNode, _c: MarketplaceListingConfig, ctx: TraitContext) { delete n.__listingState; ctx.emit?.('listing:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: MarketplaceListingConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__listingState as MarketplaceListingState | undefined; if (!s) return;
      if (e.type === 'listing:publish') { s.status = 'active'; ctx.emit?.('listing:published', { listingId: c.listingId }); }
      if (e.type === 'listing:purchase') { s.purchases++; s.revenue += c.price; ctx.emit?.('listing:sold', { buyer: e.payload?.buyerAgentId, revenue: s.revenue, royalty: c.price * c.royaltyPercent / 100 }); }
      if (e.type === 'listing:view') { s.views++; }
      if (e.type === 'listing:review') { const rating = (e.payload?.rating as number) ?? 5; s.rating = (s.rating * s.reviewCount + rating) / (s.reviewCount + 1); s.reviewCount++; ctx.emit?.('listing:reviewed', { avgRating: s.rating }); }
    },
  };
}
