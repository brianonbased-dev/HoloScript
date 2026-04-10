/**
 * @fileoverview Film3D Creator Monetization Type Definitions
 * @module @holoscript/marketplace-api/types
 *
 * Type definitions for the Film3D creator economy on Zora Protocol.
 * Supports NFT minting, royalties, and revenue sharing for VRR twins,
 * VR worlds, AR experiences, and other spatial content.
 *
 * @version 1.0.0
 */

import type { Address } from 'viem';

// =============================================================================
// NETWORK & CHAIN TYPES
// =============================================================================

export type Network = 'base' | 'ethereum' | 'zora' | 'base-testnet';
export type ContentCategory = 'vrr_twin' | 'vr_world' | 'ar_experience' | 'quest_pack' | '3d_asset';
export type PricingModel = 'fixed' | 'dutch_auction' | 'english_auction' | 'free';
export type IPFSProvider = 'pinata' | 'nft.storage' | 'infura';
export type License = 'cc0' | 'cc-by' | 'cc-by-nc' | 'custom';

// =============================================================================
// CREATOR MONETIZATION OPTIONS
// =============================================================================

/**
 * Configuration options for CreatorMonetization service
 */
export interface CreatorMonetizationOptions {
  /** Network to deploy NFTs on */
  network: Network;

  /** Zora API key (optional - for analytics) */
  zoraApiKey?: string;

  /** Creator's wallet address for receiving payments */
  creatorAddress: Address;

  /** Revenue sharing configuration */
  revenueSharing?: {
    /** Artist percentage (0-100) */
    artist: number;
    /** Platform percentage (0-100) */
    platform: number;
    /** AI agent percentage (0-100, optional) */
    aiAgent?: number;
  };

  /** IPFS storage provider */
  ipfsProvider?: IPFSProvider;

  /** IPFS API key */
  ipfsApiKey?: string;

  /** Private key for wallet (optional - for autonomous minting) */
  privateKey?: string;
}

// =============================================================================
// NFT METADATA (ERC-721/1155 STANDARD)
// =============================================================================

/**
 * NFT metadata following OpenSea/ERC-721 standard
 */
export interface NFTMetadata {
  /** NFT name */
  name: string;

  /** NFT description */
  description: string;

  /** Image URI (IPFS preferred: ipfs://Qm...) */
  image: string;

  /** Animation/video URL (optional) */
  animation_url?: string;

  /** External URL (e.g., Hololand website) */
  external_url?: string;

  /** NFT attributes/traits */
  attributes: Array<{
    trait_type: string;
    value: string | number;
    display_type?: 'number' | 'boost_percentage' | 'boost_number' | 'date';
  }>;

  /** Extended properties for Hololand content */
  properties?: {
    /** Content category */
    category: ContentCategory;
    /** Hololand layer */
    layer: 'ar' | 'vrr' | 'vr';
    /** Geographic location (optional) */
    location?: string;
    /** Associated business ID (optional) */
    business_id?: string;
    /** VRR twin file hash (optional) */
    vrr_hash?: string;
    /** Creator wallet address */
    creator?: Address;
  };

  /** Background color (hex without #) */
  background_color?: string;

  /** YouTube video ID (optional) */
  youtube_url?: string;
}

// =============================================================================
// MINT CONFIGURATION
// =============================================================================

/**
 * Options for minting an NFT
 */
export interface MintNFTOptions {
  /** Content type */
  type: ContentCategory;

  /** Content ID (VRR twin ID, world ID, etc.) */
  contentId: string;

  /** NFT metadata */
  metadata: NFTMetadata;

  /** Pricing configuration */
  pricing: {
    /** Pricing model */
    model: PricingModel;
    /** Fixed price in ETH (for fixed pricing) */
    price?: number;
    /** Payment currency */
    currency?: 'ETH' | 'USDC';
    /** Starting price for Dutch auction */
    startPrice?: number;
    /** Ending price for Dutch auction */
    endPrice?: number;
    /** Auction duration in seconds */
    duration?: number;
  };

  /** Royalty percentage (0-100) */
  royalty: number;

  /** Max supply (default: 1 for 1/1) */
  maxSupply?: number;

  /** Collection address (optional - will use default or create new) */
  collectionAddress?: Address;
}

// =============================================================================
// MINT RESULT
// =============================================================================

/**
 * Result of NFT minting operation
 */
export interface MintResult {
  /** Minted token ID */
  tokenId: string;

  /** Contract address */
  contractAddress: Address;

  /** Transaction hash */
  txHash: string;

  /** Block number */
  blockNumber?: number;

  /** Zora marketplace URL */
  zoraUrl: string;

  /** IPFS metadata URI */
  metadataUri: string;

  /** Gas used */
  gasUsed?: string;

  /** Total cost in ETH */
  totalCost?: string;
}

// =============================================================================
// COLLECTION
// =============================================================================

/**
 * NFT collection information
 */
export interface Collection {
  /** Collection address */
  address: Address;

  /** Collection name */
  name: string;

  /** Collection symbol */
  symbol: string;

  /** Collection description */
  description?: string;

  /** Creator address */
  creator: Address;

  /** Total minted */
  totalMinted: number;

  /** Max supply */
  maxSupply?: number;

  /** Royalty percentage */
  royaltyPercentage: number;

  /** Creation timestamp */
  createdAt: number;
}

// =============================================================================
// CREATOR STATS
// =============================================================================

/**
 * Creator analytics and statistics
 */
export interface CreatorStats {
  /** Total sales in USD */
  totalSales: number;

  /** Royalties earned in USD */
  royaltiesEarned: number;

  /** Number of NFTs minted */
  nftsMinted: number;

  /** Floor price in ETH */
  floorPrice: number;

  /** Average sale price in ETH */
  averageSalePrice: number;

  /** Total views */
  totalViews: number;

  /** Number of unique collectors */
  collectors: number;

  /** Revenue breakdown */
  revenueBreakdown: {
    /** Artist earnings in USD */
    artist: number;
    /** Platform earnings in USD */
    platform: number;
    /** AI agent earnings in USD */
    aiAgent: number;
  };

  /** Collections owned */
  collections: number;

  /** Total volume in ETH */
  totalVolume: string;
}

// =============================================================================
// REVENUE SHARING
// =============================================================================

/**
 * Revenue breakdown for a sale
 */
export interface RevenueBreakdown {
  /** Total sale amount in ETH */
  totalAmount: number;

  /** Artist share in ETH */
  artistShare: number;

  /** Platform share in ETH */
  platformShare: number;

  /** AI agent share in ETH (if applicable) */
  aiAgentShare?: number;

  /** Artist percentage */
  artistPercentage: number;

  /** Platform percentage */
  platformPercentage: number;

  /** AI agent percentage */
  aiAgentPercentage?: number;
}

// =============================================================================
// IPFS UPLOAD
// =============================================================================

/**
 * IPFS upload result
 */
export interface IPFSUploadResult {
  /** Content identifier (CID) */
  cid: string;

  /** Full IPFS URI (ipfs://...) */
  uri: string;

  /** HTTP gateway URL */
  gatewayUrl: string;

  /** Size in bytes */
  size: number;

  /** Upload timestamp */
  uploadedAt: number;
}

// =============================================================================
// VRR TWIN DATA (for metadata generation)
// =============================================================================

/**
 * VRR twin data structure (simplified)
 */
export interface VRRTwinData {
  /** Twin ID */
  id: string;

  /** Twin name */
  name: string;

  /** Description */
  description?: string;

  /** Location information */
  location?: {
    name: string;
    latitude?: number;
    longitude?: number;
    address?: string;
  };

  /** Associated businesses */
  businesses?: Array<{
    id: string;
    name: string;
    category: string;
  }>;

  /** Preview image URL */
  previewUrl?: string;

  /** 3D model URL */
  modelUrl?: string;

  /** Features/traits */
  traits?: string[];

  /** Sync type */
  syncType?: 'real-time' | 'periodic' | 'static';

  /** Creator information */
  creator?: {
    address: Address;
    name?: string;
  };

  /** Creation timestamp */
  createdAt?: number;
}

// =============================================================================
// TRANSACTION STATUS
// =============================================================================

/**
 * Transaction status tracking
 */
export interface TransactionStatus {
  /** Transaction hash */
  txHash: string;

  /** Status */
  status: 'pending' | 'confirmed' | 'failed';

  /** Block number (if confirmed) */
  blockNumber?: number;

  /** Confirmations */
  confirmations?: number;

  /** Error message (if failed) */
  error?: string;

  /** Gas used */
  gasUsed?: string;

  /** Timestamp */
  timestamp: number;
}

// =============================================================================
// ZORA API TYPES
// =============================================================================

/**
 * Zora API response for creator data
 */
export interface ZoraCreatorResponse {
  coins?: any[];
  collections?: any[];
  totalRoyalties?: string;
  rewardsBalance?: string;
  stats?: {
    totalSales: number;
    totalVolume: string;
    floorPrice: string;
    collectors: number;
  };
}

// =============================================================================
// PRICING ESTIMATES
// =============================================================================

/**
 * Gas and pricing estimates
 */
export interface PricingEstimate {
  /** Estimated gas cost in ETH */
  gasCostETH: string;

  /** Estimated gas cost in USD */
  gasCostUSD: number;

  /** Mint fee in ETH (Zora protocol fee: 0.000777 ETH) */
  mintFeeETH: string;

  /** Total cost in ETH */
  totalCostETH: string;

  /** Total cost in USD */
  totalCostUSD: number;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Creator monetization errors
 */
export class CreatorMonetizationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'CreatorMonetizationError';
  }
}

export class InsufficientBalanceError extends CreatorMonetizationError {
  constructor(required: string, available: string, shortfall: string) {
    super(
      `Insufficient balance. Required: ${required}, Available: ${available}, Shortfall: ${shortfall}`,
      'INSUFFICIENT_BALANCE',
      { required, available, shortfall }
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class IPFSUploadError extends CreatorMonetizationError {
  constructor(message: string, provider: IPFSProvider) {
    super(message, 'IPFS_UPLOAD_FAILED', { provider });
    this.name = 'IPFSUploadError';
  }
}

export class ZoraAPIError extends CreatorMonetizationError {
  constructor(message: string, statusCode?: number) {
    super(message, 'ZORA_API_ERROR', { statusCode });
    this.name = 'ZoraAPIError';
  }
}
