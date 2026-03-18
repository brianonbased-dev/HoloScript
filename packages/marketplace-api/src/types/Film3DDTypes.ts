/**
 * @fileoverview Film3D Creator Monetization Types
 * @module @holoscript/marketplace-api/types/Film3DDTypes
 */

import type { Address } from 'viem';

// ─── Core Types ──────────────────────────────────────────────────────────────

export interface CreatorMonetizationOptions {
  network: Network;
  creatorAddress?: Address;
  revenueSharing?: RevenueBreakdown;
  ipfsProvider?: string;
  ipfsApiKey?: string;
}

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  animation_url?: string;
  external_url?: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
    display_type?: string;
  }>;
  properties?: Record<string, unknown>;
}

export interface MintNFTOptions {
  type: string;
  contentId: string;
  metadata: NFTMetadata;
  pricing: { model: string; price: number };
  royalty: number;
  collectionAddress?: Address;
  maxSupply?: number;
}

export interface MintResult {
  tokenId: string;
  contractAddress: Address;
  txHash: string;
  blockNumber: number;
  zoraUrl: string;
  metadataUri: string;
  gasUsed: string;
  totalCost: string;
}

export interface Collection {
  address: Address;
  name: string;
  symbol: string;
  description?: string;
  creator?: Address;
  totalMinted: number;
  royaltyPercentage: number;
  createdAt: number;
}

export interface CreatorStats {
  totalSales: number;
  royaltiesEarned: number;
  nftsMinted: number;
  floorPrice: number;
  averageSalePrice: number;
  totalViews: number;
  collectors: number;
  collections: number;
  totalVolume: string;
  revenueBreakdown: RevenueBreakdown;
}

export interface RevenueBreakdown {
  artist: number;
  platform: number;
  aiAgent?: number;
}

export interface VRRTwinData {
  id: string;
  name: string;
  description?: string;
  location?: { name: string; latitude?: number; longitude?: number };
  businesses?: Array<{ id: string; name: string; category: string }>;
  syncType?: string;
  traits?: string[];
  previewUrl?: string;
  modelUrl?: string;
  creator?: { address: Address };
}

export interface IPFSUploadResult {
  cid: string;
  uri: string;
}

export interface ZoraCreatorResponse {
  stats?: { totalSales?: number; floorPrice?: string; collectors?: number; totalVolume?: string };
  totalRoyalties?: string;
  coins?: unknown[];
  collections?: unknown[];
}

export interface PricingEstimate {
  mintFee: bigint;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  totalCost: bigint;
}

export interface TransactionStatus {
  hash: string;
  status: 'pending' | 'confirmed' | 'reverted';
  blockNumber?: number;
}

export type Network = 'base' | 'base-testnet' | 'ethereum' | 'zora';

// ─── Error Classes ───────────────────────────────────────────────────────────

export class CreatorMonetizationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'CreatorMonetizationError';
  }
}

export class InsufficientBalanceError extends CreatorMonetizationError {
  constructor(required: string, balance: string, shortfall: string) {
    super(
      `Insufficient balance. Required: ${required}, Balance: ${balance}, Shortfall: ${shortfall}`,
      'INSUFFICIENT_BALANCE'
    );
  }
}

export class IPFSUploadError extends CreatorMonetizationError {
  constructor(message: string, provider: string) {
    super(message, 'IPFS_UPLOAD_ERROR', { provider });
  }
}

export class ZoraAPIError extends CreatorMonetizationError {
  constructor(message: string) {
    super(message, 'ZORA_API_ERROR');
  }
}
