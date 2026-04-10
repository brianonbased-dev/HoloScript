/**
 * HoloMesh Marketplace Trait — V6 "Trait Economy"
 *
 * Bridges the MySpace social layer (V5 traits) with the economy system.
 * Agents can list traits for sale, purchase traits from other agents,
 * and earn revenue through a configurable split model.
 *
 * Composes with:
 *  - @economy (EconomyPrimitivesTrait) — credit accounts, escrow, transfers
 *  - @trait_showcase — display inventory in profile/room
 *  - @marketplace_integration — publishing lifecycle, reviews
 *  - @agent_profile — seller identity via DID
 *
 * Events:
 *  trait_market:listed         { listingId, traitName, price, sellerDid }
 *  trait_market:delisted       { listingId }
 *  trait_market:purchased      { listingId, buyerDid, price, revenueShares }
 *  trait_market:price_updated  { listingId, oldPrice, newPrice }
 *  trait_market:review_added   { listingId, reviewerDid, rating }
 *  trait_market:revenue_paid   { sellerDid, amount, listingId }
 *  trait_market:insufficient_funds { buyerDid, required, balance }
 *
 * @version 1.0.0
 * @module holomesh/marketplace-trait
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type TraitPricingModel = 'free' | 'one_time' | 'credits' | 'pay_what_you_want';
export type TraitListingStatus = 'active' | 'sold_out' | 'delisted' | 'suspended';

export interface RevenueShare {
  /** Recipient agent DID */
  did: string;
  /** Label (e.g., "creator", "platform", "referral") */
  role: string;
  /** Percentage (0-100, must sum to 100 across all shares) */
  percentage: number;
}

export interface TraitListing {
  id: string;
  /** Seller DID */
  sellerDid: string;
  /** Seller display name */
  sellerName: string;
  /** Trait name being sold */
  traitName: string;
  /** Display name */
  displayName: string;
  /** Description */
  description: string;
  /** Category */
  category: string;
  /** Pricing model */
  pricing: TraitPricingModel;
  /** Price in credits */
  price: number;
  /** Revenue split configuration */
  revenueShares: RevenueShare[];
  /** Status */
  status: TraitListingStatus;
  /** Max copies (0 = unlimited) */
  maxCopies: number;
  /** Copies sold */
  soldCount: number;
  /** Created timestamp */
  createdAt: number;
  /** Average rating (1-5) */
  rating: number;
  /** Review count */
  reviewCount: number;
  /** Total revenue generated */
  totalRevenue: number;
  /** Tags for discovery */
  tags: string[];
}

export interface TraitPurchase {
  id: string;
  listingId: string;
  buyerDid: string;
  sellerDid: string;
  traitName: string;
  price: number;
  timestamp: number;
}

export interface TraitReview {
  id: string;
  listingId: string;
  reviewerDid: string;
  reviewerName: string;
  rating: number;
  comment: string;
  timestamp: number;
}

export interface TraitMarketplaceConfig {
  /** Platform fee percentage (0-30) */
  platform_fee_percent: number;
  /** Platform DID for fee collection */
  platform_did: string;
  /** Max active listings per agent */
  max_listings_per_agent: number;
  /** Max price in credits */
  max_price: number;
  /** Require minimum rating to list (0 = no requirement) */
  min_seller_reputation: number;
  /** Auto-delist after N days (0 = never) */
  auto_delist_days: number;
  /** Allow pay-what-you-want */
  allow_pwyw: boolean;
  /** Default revenue split (overridden per listing) */
  default_creator_share: number;
}

// =============================================================================
// STATE
// =============================================================================

interface TraitMarketplaceState {
  listings: TraitListing[];
  purchases: TraitPurchase[];
  reviews: TraitReview[];
  listingCounter: number;
  purchaseCounter: number;
  reviewCounter: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const traitMarketplaceHandler: TraitHandler<TraitMarketplaceConfig> = {
  name: 'trait_marketplace',

  defaultConfig: {
    platform_fee_percent: 5,
    platform_did: 'did:pkh:eip155:84532:0xHoloScriptPlatform',
    max_listings_per_agent: 50,
    max_price: 10000,
    min_seller_reputation: 0,
    auto_delist_days: 0,
    allow_pwyw: true,
    default_creator_share: 95,
  },

  onAttach(node, _config, _context) {
    const state: TraitMarketplaceState = {
      listings: [],
      purchases: [],
      reviews: [],
      listingCounter: 0,
      purchaseCounter: 0,
      reviewCounter: 0,
    };
    node.__traitMarketplaceState = state;
  },

  onDetach(node) {
    delete node.__traitMarketplaceState;
  },

  onUpdate(node, config, _context, _delta) {
    // Auto-delist expired listings
    if (config.auto_delist_days <= 0) return;
    const state = node.__traitMarketplaceState as TraitMarketplaceState | undefined;
    if (!state) return;

    const expiryMs = config.auto_delist_days * 86400_000;
    const now = Date.now();
    for (const listing of state.listings) {
      if (listing.status === 'active' && now - listing.createdAt > expiryMs) {
        listing.status = 'delisted';
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__traitMarketplaceState as TraitMarketplaceState | undefined;
    if (!state) return;

    const ev = event as Record<string, unknown>;

    switch (event.type) {
      // ─── List a trait for sale ───
      case 'trait_market:list': {
        const sellerDid = ev.sellerDid as string;
        const sellerName = (ev.sellerName as string) || sellerDid || 'Unknown';
        const traitName = ev.traitName as string;
        if (!sellerDid || !traitName) break;

        // Check listing limit
        const sellerListings = state.listings.filter(
          (l) => l.sellerDid === sellerDid && l.status === 'active'
        );
        if (sellerListings.length >= config.max_listings_per_agent) break;

        // Check duplicate
        if (
          state.listings.some(
            (l) => l.sellerDid === sellerDid && l.traitName === traitName && l.status === 'active'
          )
        )
          break;

        const price = Math.min(Math.max(0, (ev.price as number) || 0), config.max_price);
        const pricing = (ev.pricing as TraitPricingModel) || (price === 0 ? 'free' : 'one_time');

        if (pricing === 'pay_what_you_want' && !config.allow_pwyw) break;

        // Build revenue shares
        const creatorShare = config.default_creator_share;
        const platformShare = config.platform_fee_percent;
        const revenueShares: RevenueShare[] = [
          { did: sellerDid, role: 'creator', percentage: creatorShare },
          { did: config.platform_did, role: 'platform', percentage: platformShare },
        ];
        // If shares don't sum to 100, give remainder to creator
        const total = revenueShares.reduce((s, r) => s + r.percentage, 0);
        if (total < 100) {
          revenueShares[0].percentage += 100 - total;
        }

        state.listingCounter++;
        const listing: TraitListing = {
          id: `tl-${state.listingCounter}-${Date.now().toString(36)}`,
          sellerDid,
          sellerName,
          traitName,
          displayName: (ev.displayName as string) || traitName,
          description: ((ev.description as string) || '').slice(0, 1000),
          category: (ev.category as string) || 'utility',
          pricing,
          price,
          revenueShares,
          status: 'active',
          maxCopies: (ev.maxCopies as number) || 0,
          soldCount: 0,
          createdAt: Date.now(),
          rating: 0,
          reviewCount: 0,
          totalRevenue: 0,
          tags: (ev.tags as string[]) || [],
        };
        state.listings.push(listing);
        context.emit('trait_market:listed', {
          listingId: listing.id,
          traitName,
          price,
          sellerDid,
        });
        break;
      }

      // ─── Delist ───
      case 'trait_market:delist': {
        const listingId = ev.listingId as string;
        const requesterDid = ev.did as string;
        const listing = state.listings.find((l) => l.id === listingId);
        if (!listing || listing.status !== 'active') break;
        // Only seller or platform can delist
        if (listing.sellerDid !== requesterDid && requesterDid !== config.platform_did) break;
        listing.status = 'delisted';
        context.emit('trait_market:delisted', { listingId });
        break;
      }

      // ─── Purchase a trait ───
      case 'trait_market:purchase': {
        const listingId = ev.listingId as string;
        const buyerDid = ev.buyerDid as string;
        if (!listingId || !buyerDid) break;

        const listing = state.listings.find((l) => l.id === listingId);
        if (!listing || listing.status !== 'active') break;

        // Can't buy own listing
        if (listing.sellerDid === buyerDid) break;

        // Check sold out
        if (listing.maxCopies > 0 && listing.soldCount >= listing.maxCopies) {
          listing.status = 'sold_out';
          break;
        }

        // Determine price (PWYW allows custom amount)
        let finalPrice = listing.price;
        if (listing.pricing === 'pay_what_you_want') {
          finalPrice = Math.max(0, (ev.amount as number) || 0);
        }
        if (listing.pricing === 'free') {
          finalPrice = 0;
        }

        // Request economy to process payment
        // Emit economy:spend + economy:earn events for each revenue share
        if (finalPrice > 0) {
          // First: check buyer has funds (emit event, economy trait handles)
          context.emit('economy:spend', {
            agentId: buyerDid,
            amount: finalPrice,
            reason: `trait_purchase:${listing.traitName}`,
          });

          // Distribute revenue shares
          for (const share of listing.revenueShares) {
            const shareAmount = (finalPrice * share.percentage) / 100;
            if (shareAmount > 0) {
              context.emit('economy:earn', {
                agentId: share.did,
                amount: shareAmount,
                reason: `trait_sale:${listing.traitName}:${share.role}`,
              });
              if (share.role === 'creator') {
                context.emit('trait_market:revenue_paid', {
                  sellerDid: share.did,
                  amount: shareAmount,
                  listingId,
                });
              }
            }
          }
        }

        // Record purchase
        state.purchaseCounter++;
        const purchase: TraitPurchase = {
          id: `tp-${state.purchaseCounter}-${Date.now().toString(36)}`,
          listingId,
          buyerDid,
          sellerDid: listing.sellerDid,
          traitName: listing.traitName,
          price: finalPrice,
          timestamp: Date.now(),
        };
        state.purchases.push(purchase);
        listing.soldCount++;
        listing.totalRevenue += finalPrice;

        // Auto-delist if sold out
        if (listing.maxCopies > 0 && listing.soldCount >= listing.maxCopies) {
          listing.status = 'sold_out';
        }

        context.emit('trait_market:purchased', {
          listingId,
          buyerDid,
          price: finalPrice,
          traitName: listing.traitName,
          sellerDid: listing.sellerDid,
          revenueShares: listing.revenueShares.map((s) => ({
            did: s.did,
            role: s.role,
            amount: (finalPrice * s.percentage) / 100,
          })),
        });

        // Emit showcase event so buyer can display the trait
        context.emit('showcase:add', {
          traitName: listing.traitName,
          displayName: listing.displayName,
          description: listing.description,
          icon: '',
        });
        break;
      }

      // ─── Update price ───
      case 'trait_market:update_price': {
        const listingId = ev.listingId as string;
        const requesterDid = ev.did as string;
        const newPrice = ev.price as number;
        const listing = state.listings.find((l) => l.id === listingId);
        if (!listing || listing.status !== 'active') break;
        if (listing.sellerDid !== requesterDid) break;
        if (typeof newPrice !== 'number' || newPrice < 0 || newPrice > config.max_price) break;

        const oldPrice = listing.price;
        listing.price = newPrice;
        if (newPrice === 0) listing.pricing = 'free';
        context.emit('trait_market:price_updated', { listingId, oldPrice, newPrice });
        break;
      }

      // ─── Submit review ───
      case 'trait_market:review': {
        const listingId = ev.listingId as string;
        const reviewerDid = ev.reviewerDid as string;
        const rating = ev.rating as number;
        if (!listingId || !reviewerDid || typeof rating !== 'number') break;
        if (rating < 1 || rating > 5) break;

        const listing = state.listings.find((l) => l.id === listingId);
        if (!listing) break;

        // Must have purchased to review
        const hasPurchased = state.purchases.some(
          (p) => p.listingId === listingId && p.buyerDid === reviewerDid
        );
        if (!hasPurchased) break;

        // No duplicate reviews
        if (state.reviews.some((r) => r.listingId === listingId && r.reviewerDid === reviewerDid))
          break;

        state.reviewCounter++;
        const review: TraitReview = {
          id: `tr-${state.reviewCounter}-${Date.now().toString(36)}`,
          listingId,
          reviewerDid,
          reviewerName: (ev.reviewerName as string) || reviewerDid,
          rating,
          comment: ((ev.comment as string) || '').slice(0, 500),
          timestamp: Date.now(),
        };
        state.reviews.push(review);

        // Update listing rating (running average)
        const listingReviews = state.reviews.filter((r) => r.listingId === listingId);
        listing.reviewCount = listingReviews.length;
        listing.rating = listingReviews.reduce((s, r) => s + r.rating, 0) / listing.reviewCount;

        context.emit('trait_market:review_added', {
          listingId,
          reviewerDid,
          rating,
        });
        break;
      }

      // ─── Search listings ───
      case 'trait_market:search': {
        const query = ((ev.query as string) || '').toLowerCase();
        const category = ev.category as string | undefined;
        const maxResults = (ev.limit as number) || 20;

        let results = state.listings.filter((l) => l.status === 'active');

        if (query) {
          results = results.filter(
            (l) =>
              l.traitName.toLowerCase().includes(query) ||
              l.displayName.toLowerCase().includes(query) ||
              l.description.toLowerCase().includes(query) ||
              l.tags.some((t) => t.toLowerCase().includes(query))
          );
        }
        if (category) {
          results = results.filter((l) => l.category === category);
        }

        // Sort by rating desc, then by soldCount desc
        results.sort((a, b) => b.rating - a.rating || b.soldCount - a.soldCount);
        results = results.slice(0, maxResults);

        context.emit('trait_market:results', {
          query,
          listings: results.map((l) => ({
            id: l.id,
            traitName: l.traitName,
            displayName: l.displayName,
            sellerName: l.sellerName,
            price: l.price,
            pricing: l.pricing,
            rating: l.rating,
            soldCount: l.soldCount,
            category: l.category,
            tags: l.tags,
          })),
          total: results.length,
        });
        break;
      }

      // ─── Get listing details ───
      case 'trait_market:get': {
        const listingId = ev.listingId as string;
        const listing = state.listings.find((l) => l.id === listingId);
        if (!listing) break;

        const reviews = state.reviews.filter((r) => r.listingId === listingId);
        context.emit('trait_market:data', {
          listing: { ...listing },
          reviews: reviews.map((r) => ({
            reviewerName: r.reviewerName,
            rating: r.rating,
            comment: r.comment,
            timestamp: r.timestamp,
          })),
          purchaseCount: listing.soldCount,
        });
        break;
      }

      // ─── Get seller stats ───
      case 'trait_market:seller_stats': {
        const sellerDid = ev.did as string;
        if (!sellerDid) break;

        const sellerListings = state.listings.filter((l) => l.sellerDid === sellerDid);
        const totalRevenue = sellerListings.reduce((s, l) => s + l.totalRevenue, 0);
        const totalSold = sellerListings.reduce((s, l) => s + l.soldCount, 0);
        const avgRating =
          sellerListings.length > 0
            ? sellerListings.reduce((s, l) => s + l.rating, 0) / sellerListings.length
            : 0;

        context.emit('trait_market:seller_data', {
          sellerDid,
          activeListings: sellerListings.filter((l) => l.status === 'active').length,
          totalListings: sellerListings.length,
          totalSold,
          totalRevenue,
          avgRating,
        });
        break;
      }

      // ─── Get buyer purchase history ───
      case 'trait_market:buyer_history': {
        const buyerDid = ev.did as string;
        if (!buyerDid) break;

        const purchases = state.purchases.filter((p) => p.buyerDid === buyerDid);
        context.emit('trait_market:buyer_data', {
          buyerDid,
          purchases: purchases.map((p) => ({
            traitName: p.traitName,
            price: p.price,
            sellerDid: p.sellerDid,
            timestamp: p.timestamp,
          })),
          totalSpent: purchases.reduce((s, p) => s + p.price, 0),
          totalPurchases: purchases.length,
        });
        break;
      }
    }
  },
};

// =============================================================================
// EXPORTS
// =============================================================================

export const holomeshMarketplaceTraitHandlers = {
  trait_marketplace: traitMarketplaceHandler,
};

export default holomeshMarketplaceTraitHandlers;
