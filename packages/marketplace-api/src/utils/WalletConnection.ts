/**
 * Wallet Connection Utility
 *
 * Manages blockchain wallet connections for Zora Protocol integration.
 * Provides public and wallet clients for Base L2 chain interactions.
 *
 * @version 3.2.0
 * @milestone v3.2 (June 2026)
 */

import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient, type Chain, type Address, type Transport } from 'viem';
import { base, baseGoerli } from 'viem/chains';

/**
 * Supported chains for Zora Coins deployment
 */
export type SupportedChain = 'base' | 'base-testnet';

/**
 * Wallet connection configuration
 */
export interface WalletConfig {
  chain?: SupportedChain;
  rpcUrl?: string;
  account?: Address;
}

/**
 * Manages wallet connections for blockchain interactions
 */
export class WalletConnection {
  private publicClient: PublicClient;
  private walletClient?: WalletClient<Transport, Chain>;
  private chain: Chain;

  /**
   * Create a new wallet connection
   * @param config - Wallet configuration options
   */
  constructor(config: WalletConfig = {}) {
    // Determine chain
    this.chain = config.chain === 'base-testnet' ? baseGoerli : base;

    // Create public client (read-only access)
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.rpcUrl || this.getDefaultRpcUrl(config.chain || 'base'))
    });

    // Create wallet client if account provided
    if (config.account) {
      this.walletClient = createWalletClient({
        account: config.account,
        chain: this.chain,
        transport: http(config.rpcUrl || this.getDefaultRpcUrl(config.chain || 'base'))
      });
    }
  }

  /**
   * Get default RPC URL for a chain
   */
  private getDefaultRpcUrl(chain: SupportedChain): string {
    // Check environment variables first
    if (chain === 'base' && process.env.BASE_RPC_URL) {
      return process.env.BASE_RPC_URL;
    }
    if (chain === 'base-testnet' && process.env.BASE_TESTNET_RPC_URL) {
      return process.env.BASE_TESTNET_RPC_URL;
    }

    // Fallback to public RPCs
    return chain === 'base-testnet'
      ? 'https://goerli.base.org'
      : 'https://mainnet.base.org';
  }

  /**
   * Connect a wallet for write operations
   * @param account - Ethereum address to connect
   */
  async connect(account: Address): Promise<void> {
    this.walletClient = createWalletClient({
      account,
      chain: this.chain,
      transport: http()
    });
  }

  /**
   * Disconnect the wallet
   */
  disconnect(): void {
    this.walletClient = undefined;
  }

  /**
   * Get public client for read operations
   * @returns Public client instance
   */
  getPublicClient(): PublicClient {
    return this.publicClient;
  }

  /**
   * Get wallet client for write operations
   * @returns Wallet client instance
   * @throws Error if wallet not connected
   */
  getWalletClient(): WalletClient<Transport, Chain> {
    if (!this.walletClient) {
      throw new Error('Wallet not connected. Call connect() first or emit wallet_connected event.');
    }
    return this.walletClient;
  }

  /**
   * Check if wallet is connected
   * @returns True if wallet is connected
   */
  isConnected(): boolean {
    return !!this.walletClient;
  }

  /**
   * Get connected wallet address
   * @returns Wallet address or null if not connected
   */
  getAddress(): Address | null {
    return this.walletClient?.account?.address || null;
  }

  /**
   * Get current chain
   * @returns Current chain configuration
   */
  getChain(): Chain {
    return this.chain;
  }

  /**
   * Get chain ID
   * @returns Chain ID number
   */
  getChainId(): number {
    return this.chain.id;
  }
}

/**
 * Create a wallet connection instance
 * @param config - Wallet configuration
 * @returns Wallet connection instance
 */
export function createWalletConnection(config?: WalletConfig): WalletConnection {
  return new WalletConnection(config);
}
