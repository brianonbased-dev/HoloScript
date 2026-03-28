/**
 * HoloScript Protocol Types & Constants
 *
 * Type definitions for the HoloScript Publishing Protocol —
 * on-chain content registry, collect mechanism, and import-chain
 * revenue distribution. Used by both core CLI and marketplace-api.
 *
 * @module protocol-types
 */

import type { LicenseType, PublishMode, ProvenanceBlock } from './provenance';

// =============================================================================
// ADDRESS TYPE (viem-compatible without importing viem in core)
// =============================================================================

/** Ethereum address (0x-prefixed, 42 chars). Compatible with viem's Address type. */
export type HexAddress = `0x${string}`;

// =============================================================================
// PROTOCOL CONSTANTS
// =============================================================================

export const PROTOCOL_CONSTANTS = {
  /** Platform fee in basis points (2.5%) */
  PLATFORM_FEE_BPS: 250,

  /** Import royalty per level in basis points (5% per level) */
  IMPORT_ROYALTY_BPS: 500,

  /** Maximum import depth for revenue distribution */
  MAX_IMPORT_DEPTH: 3,

  /** Default referral reward in basis points (2%) */
  DEFAULT_REFERRAL_BPS: 200,

  /** Basis points denominator */
  BPS_DENOMINATOR: 10_000,

  /** Zora mint fee per edition (in wei) */
  ZORA_MINT_FEE_WEI: 777_000_000_000_000n, // 0.000777 ETH

  /** Chain configuration */
  CHAIN: {
    id: 8453,
    name: 'base' as const,
    testnet: {
      id: 84532,
      name: 'base-sepolia' as const,
    },
  },

  /** Protocol registry base URL */
  REGISTRY_BASE_URL: 'https://holoscript.net',

  /** Zora 1155 factory address (same on all chains) */
  ZORA_1155_FACTORY: '0x777777C338d93e2C7adf08D102d45CA7CC4Ed021' as const,

  /** Environment variable names */
  ENV: {
    WALLET_KEY: 'HOLOSCRIPT_WALLET_KEY',
    COLLECTION_ADDRESS: 'HOLOSCRIPT_COLLECTION_ADDRESS',
    SERVER_URL: 'HOLOSCRIPT_SERVER_URL',
  },
} as const;

// =============================================================================
// REVENUE FLOW
// =============================================================================

/** Reason for a revenue payment */
export type RevenueReason = 'creator' | 'import_royalty' | 'platform' | 'referral';

/** A single revenue flow — who gets paid, how much, and why */
export interface RevenueFlow {
  /** Recipient identifier (address or @username) */
  recipient: string;
  /** Amount in wei */
  amount: bigint;
  /** Why this payment is being made */
  reason: RevenueReason;
  /** Import depth (1 = direct import, 2 = import's import). Only for import_royalty. */
  depth?: number;
  /** Percentage of total (for display purposes) */
  bps: number;
}

/** Complete revenue distribution for a collect event */
export interface RevenueDistribution {
  /** Total collect price in wei */
  totalPrice: bigint;
  /** All revenue flows */
  flows: RevenueFlow[];
}

// =============================================================================
// IMPORT CHAIN
// =============================================================================

/** A node in the import-chain revenue tree */
export interface ImportChainNode {
  /** SHA-256 content hash of the imported composition */
  contentHash: string;
  /** Author identifier (address or @username) */
  author: string;
  /** Import depth (1 = direct import, 2 = import's import) */
  depth: number;
  /** Nested imports (deeper in the chain) */
  children: ImportChainNode[];
}

// =============================================================================
// PROTOCOL RECORD (ON-CHAIN)
// =============================================================================

/** On-chain record for a published composition */
export interface ProtocolRecord {
  /** SHA-256 content hash (content-addressed identifier) */
  contentHash: string;
  /** Creator's wallet address */
  author: HexAddress;
  /** Content hashes of imported compositions */
  importHashes: string[];
  /** License type */
  license: LicenseType;
  /** Auto-classified publish mode */
  publishMode: PublishMode;
  /** Block timestamp of publication */
  timestamp: number;
  /** URI for full provenance metadata (IPFS or server) */
  metadataURI: string;
  /** Collect price in wei (0 = free) */
  price: bigint;
  /** Creator-set referral reward (basis points) */
  referralBps: number;
  /** On-chain token ID in the 1155 collection */
  tokenId?: string;
  /** Transaction hash of the publish transaction */
  txHash?: string;
  /** Number of editions collected */
  editionCount?: number;
}

// =============================================================================
// PUBLISH OPTIONS & RESULT
// =============================================================================

/** Options for publishing to the protocol */
export interface PublishOptions {
  /** Collect price in ETH (default: '0' = free collect) */
  price?: string;
  /** Custom referral reward in basis points */
  referralBps?: number;
  /** Also mint as Zora NFT (optional add-on) */
  mintAsNFT?: boolean;
  /** Zora collection address for NFT minting */
  zoraCollection?: HexAddress;
  /** Wallet private key or reference (for signing the publish tx) */
  walletKey?: string;
  /** Use testnet instead of mainnet */
  testnet?: boolean;
}

/** Result of a successful protocol publish */
export interface PublishResult {
  /** On-chain token ID */
  protocolId: string;
  /** SHA-256 content hash */
  contentHash: string;
  /** Publish transaction hash */
  txHash: string;
  /** URL where anyone can collect this composition */
  collectUrl: string;
  /** Protocol registry URL */
  registryUrl: string;
  /** CDN scene URLs (from existing deploy) */
  sceneId: string;
  sceneUrl: string;
  embedUrl: string;
  /** Revenue distribution preview */
  revenuePreview: RevenueDistribution;
  /** Zora NFT result (only if mintAsNFT was true) */
  zoraResult?: {
    tokenId: string;
    txHash: string;
    zoraUrl: string;
  };
}

// =============================================================================
// COLLECT OPTIONS & RESULT
// =============================================================================

/** Options for collecting a published composition */
export interface CollectOptions {
  /** Referrer address (earns referral reward) */
  referrer?: string;
  /** Number of editions to collect */
  quantity?: number;
  /** Wallet private key or reference */
  walletKey?: string;
  /** Use testnet */
  testnet?: boolean;
}

/** Result of a successful collect */
export interface CollectResult {
  /** Token ID in the 1155 collection */
  tokenId: string;
  /** Collect transaction hash */
  txHash: string;
  /** Edition number(s) minted */
  editions: number[];
  /** Price paid in ETH */
  pricePaid: string;
  /** How the revenue was distributed */
  revenueFlows: RevenueFlow[];
}

// =============================================================================
// REVENUE CALCULATOR OPTIONS
// =============================================================================

/** Options for revenue distribution calculation */
export interface RevenueCalculatorOptions {
  /** Platform fee in basis points (default: PROTOCOL_CONSTANTS.PLATFORM_FEE_BPS) */
  platformFeeBps?: number;
  /** Import royalty per level in basis points (default: PROTOCOL_CONSTANTS.IMPORT_ROYALTY_BPS) */
  importRoyaltyBps?: number;
  /** Max import depth (default: PROTOCOL_CONSTANTS.MAX_IMPORT_DEPTH) */
  maxImportDepth?: number;
  /** Referral reward in basis points (default: PROTOCOL_CONSTANTS.DEFAULT_REFERRAL_BPS) */
  referralBps?: number;
  /** Referrer address (if collector was referred) */
  referrer?: string;
  /** Platform fee recipient */
  platformAddress?: string;
}

// =============================================================================
// RE-EXPORTS for convenience
// =============================================================================

export type { LicenseType, PublishMode, ProvenanceBlock, ProvenanceImport } from './provenance';
