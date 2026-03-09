/**
 * @fileoverview Agent Wallet Registry
 * @module @holoscript/core
 *
 * PURPOSE:
 * Bridges autonomous agents spawned via uaa2-service with Coinbase AgentKit
 * and Base L2 wallets. Allows agents to securely hold funds and autonomously
 * purchase logic traits on the HoloScript marketplace.
 */

export interface AgentWallet {
  agentId: string;
  walletAddress: string;
  networkId: number; // e.g. 8453 for Base
  balanceThreshold: number; // minimum balance before requesting auto-refill
}

export class AgentWalletRegistry {
  private static instance: AgentWalletRegistry;
  private wallets: Map<string, AgentWallet> = new Map();

  private constructor() {}

  public static getInstance(): AgentWalletRegistry {
    if (!AgentWalletRegistry.instance) {
      AgentWalletRegistry.instance = new AgentWalletRegistry();
    }
    return AgentWalletRegistry.instance;
  }

  /**
   * Registers a new agent wallet mapping
   */
  public registerWallet(
    agentId: string,
    walletAddress: string,
    networkId: number = 8453
  ): AgentWallet {
    const wallet: AgentWallet = {
      agentId,
      walletAddress,
      networkId,
      balanceThreshold: 0.001, // 0.001 ETH
    };
    this.wallets.set(agentId, wallet);
    return wallet;
  }

  /**
   * Retrieves an agent's registered wallet
   */
  public getWallet(agentId: string): AgentWallet | undefined {
    return this.wallets.get(agentId);
  }

  /**
   * Removes an agent's wallet from the registry
   */
  public unregisterWallet(agentId: string): boolean {
    return this.wallets.delete(agentId);
  }

  /**
   * Authorizes an agent transaction using EIP-712 signature fallback
   * (Placeholder for Coinbase AgentKit KMS signing)
   */
  public async authorizeTransaction(agentId: string, payload: any): Promise<string> {
    const wallet = this.getWallet(agentId);
    if (!wallet) {
      throw new Error(`[AgentWalletRegistry] No wallet registered for agent ${agentId}`);
    }

    // In production, this proxies into @coinbase/agentkit for secure signing.
    // Simulating signature generation:
    const mockHash = '0x' + Buffer.from(JSON.stringify(payload)).toString('hex').slice(0, 64);
    return mockHash;
  }
}

export function getAgentWalletRegistry(): AgentWalletRegistry {
  return AgentWalletRegistry.getInstance();
}
