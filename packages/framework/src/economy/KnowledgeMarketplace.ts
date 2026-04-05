/**
 * Knowledge Marketplace — Buy, sell, and price knowledge entries via x402 micropayments.
 *
 * Enables agents to monetize their discovered W/P/G entries.
 * Integrates with KnowledgeStore for entry lookup and X402Facilitator for settlement.
 *
 * FW-0.6
 */

import type { StoredEntry } from '../knowledge/knowledge-store';
import type { KnowledgeInsight } from '../types';

// ── Types ──

export type ListingStatus = 'active' | 'sold' | 'delisted';

export interface KnowledgeListing {
  id: string;
  entryId: string;
  seller: string;
  price: number;
  /** Currency: 'USDC' for x402 settlement, 'credits' for in-memory ledger. */
  currency: 'USDC' | 'credits';
  status: ListingStatus;
  createdAt: string;
  /** Entry snapshot for buyer preview (type + domain + truncated content). */
  preview: {
    type: KnowledgeInsight['type'];
    domain: string;
    snippet: string;
  };
}

export interface PurchaseResult {
  success: boolean;
  listingId: string;
  entryId?: string;
  buyer: string;
  price: number;
  error?: string;
}

export interface ListingResult {
  success: boolean;
  listingId: string;
  error?: string;
}

export interface PricingFactors {
  /** Base price per type: wisdom > pattern > gotcha. */
  typeWeights?: Record<KnowledgeInsight['type'], number>;
  /** Multiplier for high-confidence entries (confidence >= 0.8). */
  confidenceMultiplier?: number;
  /** Multiplier for high-reuse entries (reuseCount >= 5). */
  reuseMultiplier?: number;
}

const DEFAULT_TYPE_WEIGHTS: Record<KnowledgeInsight['type'], number> = {
  wisdom: 0.05,
  pattern: 0.03,
  gotcha: 0.02,
};

// ── Marketplace ──

export class KnowledgeMarketplace {
  private listings: Map<string, KnowledgeListing> = new Map();
  private purchases: Map<string, PurchaseResult[]> = new Map(); // buyer -> purchases
  private nextId = 1;
  private pricingFactors: PricingFactors;

  constructor(pricingFactors?: PricingFactors) {
    this.pricingFactors = pricingFactors ?? {};
  }

  /** Estimate the value of a knowledge entry (in USDC). */
  priceKnowledge(entry: StoredEntry): number {
    const weights = this.pricingFactors.typeWeights ?? DEFAULT_TYPE_WEIGHTS;
    let price = weights[entry.type] ?? 0.02;

    // Confidence boost
    if (entry.confidence >= 0.8) {
      price *= (this.pricingFactors.confidenceMultiplier ?? 1.5);
    }

    // Reuse boost — popular entries are worth more
    if (entry.reuseCount >= 5) {
      price *= (this.pricingFactors.reuseMultiplier ?? 2.0);
    }

    // Query frequency boost
    if (entry.queryCount >= 10) {
      price *= 1.25;
    }

    // Round to 4 decimal places
    return Math.round(price * 10_000) / 10_000;
  }

  /** List a knowledge entry for sale. */
  sellKnowledge(entry: StoredEntry, price: number, seller: string, currency: 'USDC' | 'credits' = 'USDC'): ListingResult {
    if (price <= 0) return { success: false, listingId: '', error: 'Price must be positive' };

    // Prevent duplicate listings for same entry
    for (const listing of this.listings.values()) {
      if (listing.entryId === entry.id && listing.status === 'active') {
        return { success: false, listingId: listing.id, error: 'Entry already listed' };
      }
    }

    const id = `listing_${String(this.nextId++).padStart(4, '0')}`;

    const listing: KnowledgeListing = {
      id,
      entryId: entry.id,
      seller,
      price,
      currency,
      status: 'active',
      createdAt: new Date().toISOString(),
      preview: {
        type: entry.type,
        domain: entry.domain,
        snippet: entry.content.slice(0, 100),
      },
    };

    this.listings.set(id, listing);
    return { success: true, listingId: id };
  }

  /** Buy a listed knowledge entry. */
  buyKnowledge(listingId: string, buyer: string): PurchaseResult {
    const listing = this.listings.get(listingId);
    if (!listing) return { success: false, listingId, buyer, price: 0, error: 'Listing not found' };
    if (listing.status !== 'active') return { success: false, listingId, buyer, price: listing.price, error: `Listing is ${listing.status}` };
    if (listing.seller === buyer) return { success: false, listingId, buyer, price: listing.price, error: 'Cannot buy your own listing' };

    listing.status = 'sold';

    const result: PurchaseResult = {
      success: true,
      listingId,
      entryId: listing.entryId,
      buyer,
      price: listing.price,
    };

    // Track purchases per buyer
    const buyerPurchases = this.purchases.get(buyer) ?? [];
    buyerPurchases.push(result);
    this.purchases.set(buyer, buyerPurchases);

    return result;
  }

  /** Get a listing by ID. */
  getListing(listingId: string): KnowledgeListing | undefined {
    return this.listings.get(listingId);
  }

  /** List all active listings. */
  activeListings(): KnowledgeListing[] {
    return Array.from(this.listings.values()).filter(l => l.status === 'active');
  }

  /** Get purchase history for a buyer. */
  purchaseHistory(buyer: string): PurchaseResult[] {
    return this.purchases.get(buyer) ?? [];
  }

  /** Delist an entry (only the seller can delist). */
  delist(listingId: string, seller: string): boolean {
    const listing = this.listings.get(listingId);
    if (!listing || listing.seller !== seller || listing.status !== 'active') return false;
    listing.status = 'delisted';
    return true;
  }

  /** Total revenue for a seller across all sold listings. */
  sellerRevenue(seller: string): number {
    return Array.from(this.listings.values())
      .filter(l => l.seller === seller && l.status === 'sold')
      .reduce((sum, l) => sum + l.price, 0);
  }

  /** Total marketplace volume (all completed sales). */
  totalVolume(): number {
    return Array.from(this.listings.values())
      .filter(l => l.status === 'sold')
      .reduce((sum, l) => sum + l.price, 0);
  }
}
