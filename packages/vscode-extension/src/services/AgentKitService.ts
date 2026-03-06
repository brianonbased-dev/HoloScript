/**
 * AgentKitService — AI Agent Wallet management via Coinbase AgentKit SDK
 *
 * Provides wallet creation, NFT minting, and blockchain interactions
 * for AI agents on Base L2 network.
 *
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import type {
  AgentWallet,
  NFTMetadata,
  RoyaltyEvent,
} from '../../../core/src/plugins/HololandTypes';

export interface AgentKitConfig {
  enabled: boolean;
  network: 'base' | 'ethereum' | 'base-sepolia';
  defaultGasLimit: number;
  simulationMode: boolean;
}

export class AgentKitService {
  private config: AgentKitConfig;
  private outputChannel: vscode.OutputChannel;
  private wallets: Map<string, AgentWallet> = new Map();
  private royaltyEvents: RoyaltyEvent[] = [];

  constructor(config?: Partial<AgentKitConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      network: config?.network ?? 'base-sepolia',
      defaultGasLimit: config?.defaultGasLimit ?? 21000,
      simulationMode: config?.simulationMode ?? true,
    };
    this.outputChannel = vscode.window.createOutputChannel('AgentKit');
  }

  /**
   * Create a new AI agent wallet
   */
  async createWallet(agentId: string): Promise<AgentWallet> {
    if (!this.config.enabled) {
      throw new Error('AgentKit is disabled');
    }

    // Check if wallet already exists
    if (this.wallets.has(agentId)) {
      this.outputChannel.appendLine(`Wallet already exists for agent: ${agentId}`);
      return this.wallets.get(agentId)!;
    }

    this.outputChannel.appendLine(`Creating wallet for agent: ${agentId}...`);

    const wallet: AgentWallet = {
      id: agentId,
      address: this.generateAddress(),
      network: this.config.network,
      balance: '0',
      nonce: 0,
      createdAt: Date.now(),
    };

    this.wallets.set(agentId, wallet);
    this.outputChannel.appendLine(`✅ Wallet created: ${wallet.address}`);

    vscode.window.showInformationMessage(
      `AgentKit wallet created for ${agentId}: ${wallet.address.slice(0, 10)}...`
    );

    return wallet;
  }

  /**
   * Get wallet by agent ID
   */
  getWallet(agentId: string): AgentWallet | undefined {
    return this.wallets.get(agentId);
  }

  /**
   * Get all wallets
   */
  getAllWallets(): AgentWallet[] {
    return Array.from(this.wallets.values());
  }

  /**
   * Mint an NFT using agent wallet
   */
  async mintNFT(
    agentId: string,
    metadata: NFTMetadata,
    royaltyPercentage?: number
  ): Promise<{ tokenId: string; txHash: string }> {
    const wallet = this.wallets.get(agentId);
    if (!wallet) {
      throw new Error(`No wallet found for agent: ${agentId}`);
    }

    this.outputChannel.appendLine(`Minting NFT for ${agentId}...`);
    this.outputChannel.appendLine(`Metadata: ${metadata.name}`);

    if (this.config.simulationMode) {
      return this.simulateMint(wallet, metadata, royaltyPercentage);
    } else {
      return this.executeMint(wallet, metadata, royaltyPercentage);
    }
  }

  /**
   * Simulate NFT minting (for development)
   */
  private async simulateMint(
    wallet: AgentWallet,
    metadata: NFTMetadata,
    royaltyPercentage?: number
  ): Promise<{ tokenId: string; txHash: string }> {
    // Show minting dialog
    const proceed = await vscode.window.showInformationMessage(
      `Mint NFT:\n${metadata.name}\nRoyalty: ${royaltyPercentage || 10}%`,
      'Confirm',
      'Cancel'
    );

    if (proceed !== 'Confirm') {
      throw new Error('Minting cancelled by user');
    }

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Generate proper 64-character transaction hash
    const generateTxHash = () => {
      let hash = '0x';
      for (let i = 0; i < 64; i++) {
        hash += Math.floor(Math.random() * 16).toString(16);
      }
      return hash;
    };

    const result = {
      tokenId: `token_${Date.now()}`,
      txHash: generateTxHash(),
    };

    this.outputChannel.appendLine(`✅ NFT minted: Token ID ${result.tokenId}`);
    this.outputChannel.appendLine(`   Transaction: ${result.txHash}`);

    vscode.window.showInformationMessage(
      `✅ NFT minted successfully: ${result.tokenId}`
    );

    return result;
  }

  /**
   * Execute real NFT minting via AgentKit SDK
   */
  private async executeMint(
    wallet: AgentWallet,
    metadata: NFTMetadata,
    royaltyPercentage?: number
  ): Promise<{ tokenId: string; txHash: string }> {
    // TODO: Integrate with real AgentKit SDK
    throw new Error(
      'Real NFT minting not yet implemented. Enable simulation mode in settings.'
    );
  }

  /**
   * Get balance for a wallet
   */
  async getBalance(agentId: string): Promise<string> {
    const wallet = this.wallets.get(agentId);
    if (!wallet) {
      throw new Error(`No wallet found for agent: ${agentId}`);
    }

    // In simulation mode, return mock balance
    if (this.config.simulationMode) {
      return '1000000000000000000'; // 1 ETH in wei
    }

    // TODO: Query real balance from blockchain
    return wallet.balance;
  }

  /**
   * Record a royalty event
   */
  recordRoyalty(event: RoyaltyEvent): void {
    this.royaltyEvents.push(event);
    this.outputChannel.appendLine(
      `Royalty received: ${event.amount} wei (${event.percentage}%)`
    );
  }

  /**
   * Get royalty history
   */
  getRoyaltyHistory(tokenId?: string): RoyaltyEvent[] {
    if (tokenId) {
      return this.royaltyEvents.filter((e) => e.tokenId === tokenId);
    }
    return [...this.royaltyEvents];
  }

  /**
   * Get total royalties earned in wei
   */
  getTotalRoyalties(): string {
    return this.royaltyEvents
      .reduce((sum, e) => sum + BigInt(e.amount), BigInt(0))
      .toString();
  }

  /**
   * Generate a mock Ethereum address
   */
  private generateAddress(): string {
    return `0x${Math.random().toString(16).slice(2, 42)}`;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AgentKitConfig>): void {
    this.config = { ...this.config, ...config };
    this.outputChannel.appendLine(
      `Config updated: network=${this.config.network}, simulation=${this.config.simulationMode}`
    );
  }

  /**
   * Get current configuration
   */
  getConfig(): AgentKitConfig {
    return { ...this.config };
  }

  /**
   * Export wallet data
   */
  exportWallets(): string {
    const walletArray = Array.from(this.wallets.values());
    return JSON.stringify(walletArray, null, 2);
  }

  /**
   * Dispose of service resources
   */
  dispose(): void {
    this.wallets.clear();
    this.royaltyEvents = [];
    this.outputChannel.dispose();
  }
}
