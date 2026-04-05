/**
 * InvisibleWallet — Framework stub for zero-friction wallet abstraction.
 *
 * The canonical implementation lives in @holoscript/marketplace-api.
 * This stub provides the type-compatible interface for framework consumers
 * who don't need the full viem/blockchain dependency.
 *
 * For full blockchain operations, use:
 *   import { InvisibleWallet } from '@holoscript/marketplace-api';
 *
 * FW-0.6 — Moved wallet interface into framework.
 *
 * @module economy/InvisibleWallet
 */

// =============================================================================
// TYPES (compatible with marketplace-api's InvisibleWallet)
// =============================================================================

export type HexAddress = `0x${string}`;

export interface InvisibleWalletConfig {
  /** Use testnet instead of mainnet */
  testnet?: boolean;
  /** Custom RPC URL */
  rpcUrl?: string;
}

export interface WalletInfo {
  address: HexAddress;
  chainId: number;
  isTestnet: boolean;
}

// =============================================================================
// INVISIBLE WALLET STUB
// =============================================================================

/**
 * Lightweight InvisibleWallet for framework consumers.
 *
 * Provides address management and config without blockchain dependencies.
 * For signing transactions, use the full implementation from marketplace-api.
 */
export class InvisibleWalletStub {
  private address: HexAddress;
  private chainId: number;
  private isTestnet: boolean;

  constructor(address: HexAddress, config: InvisibleWalletConfig = {}) {
    this.address = address;
    this.isTestnet = config.testnet ?? false;
    this.chainId = this.isTestnet ? 84531 : 8453; // Base Goerli / Base Mainnet
  }

  /**
   * Create from an address string (no private key needed for read-only).
   */
  static fromAddress(address: string, config: InvisibleWalletConfig = {}): InvisibleWalletStub {
    const hex = address.startsWith('0x') ? address : `0x${address}`;
    return new InvisibleWalletStub(hex as HexAddress, config);
  }

  /** Get the wallet address */
  getAddress(): HexAddress {
    return this.address;
  }

  /** Get chain ID */
  getChainId(): number {
    return this.chainId;
  }

  /** Get wallet info */
  getInfo(): WalletInfo {
    return {
      address: this.address,
      chainId: this.chainId,
      isTestnet: this.isTestnet,
    };
  }
}
