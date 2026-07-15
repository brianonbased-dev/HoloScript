/**
 * @fileoverview Agent Wallet Registry
 * @module @holoscript/core
 *
 * PURPOSE:
 * Bridges autonomous agents spawned via uaa2-service with Base L2 wallets.
 * Allows agents to securely hold funds and autonomously purchase logic traits
 * on the HoloScript marketplace. Signing is delegated to a Web3Connector
 * implementation (see @holoscript/marketplace-api for the viem-based connector).
 */

export interface AgentWallet {
  agentId: string;
  walletAddress: string;
  networkId: number; // e.g. 8453 for Base
  balanceThreshold: number; // minimum balance before requesting auto-refill
  /** Active wallet rail. Undefined means spend authorization is disabled. */
  dailySpendLimitUsd?: number;
  spentTodayUsd: number;
  spendDateUtc: string;
}

export interface WalletSpendAuthorization {
  amountUsd: number;
  spentTodayUsd: number;
  remainingUsd: number;
  authorityRoute: 'autonomous';
}

export class ActiveRailCapExceededError extends Error {
  readonly authorityRoute = 'joseph-exact-four' as const;

  constructor(
    readonly attemptedUsd: number,
    readonly spentTodayUsd: number,
    readonly activeRailCapUsd: number
  ) {
    super(
      `[AgentWalletRegistry] Active wallet rail exceeded: ` +
        `${spentTodayUsd} + ${attemptedUsd} > ${activeRailCapUsd} USD; ` +
        `route=joseph-exact-four`
    );
    this.name = 'ActiveRailCapExceededError';
  }
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
    networkId: number = 8453,
    dailySpendLimitUsd?: number
  ): AgentWallet {
    if (
      dailySpendLimitUsd !== undefined &&
      (!Number.isFinite(dailySpendLimitUsd) || dailySpendLimitUsd <= 0)
    ) {
      throw new Error('[AgentWalletRegistry] dailySpendLimitUsd must be a positive number');
    }
    const wallet: AgentWallet = {
      agentId,
      walletAddress,
      networkId,
      balanceThreshold: 0.001, // 0.001 ETH
      dailySpendLimitUsd,
      spentTodayUsd: 0,
      spendDateUtc: todayUtc(),
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
  public async authorizeTransaction(
    agentId: string,
    payload: unknown,
    amountUsd?: number
  ): Promise<string> {
    const wallet = this.getWallet(agentId);
    if (!wallet) {
      throw new Error(`[AgentWalletRegistry] No wallet registered for agent ${agentId}`);
    }

    if (amountUsd !== undefined) {
      this.authorizeSpend(agentId, amountUsd);
    }

    // In production, this proxies into a Web3Connector for secure signing.
    // Simulating signature generation:
    const mockHash = '0x' + Buffer.from(JSON.stringify(payload)).toString('hex').slice(0, 64);
    return mockHash;
  }

  /**
   * Reserve spend against the configured active wallet rail. This is local
   * enforcement: over-cap attempts are denied and classified as exact-four;
   * no generic approval flag can bypass the cap.
   */
  public authorizeSpend(agentId: string, amountUsd: number): WalletSpendAuthorization {
    const wallet = this.getWallet(agentId);
    if (!wallet) {
      throw new Error(`[AgentWalletRegistry] No wallet registered for agent ${agentId}`);
    }
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      throw new Error('[AgentWalletRegistry] amountUsd must be a positive number');
    }
    if (wallet.dailySpendLimitUsd === undefined) {
      throw new Error(
        '[AgentWalletRegistry] Spend authorization disabled: no active wallet rail configured'
      );
    }

    const today = todayUtc();
    if (wallet.spendDateUtc !== today) {
      wallet.spendDateUtc = today;
      wallet.spentTodayUsd = 0;
    }

    const projected = wallet.spentTodayUsd + amountUsd;
    if (projected > wallet.dailySpendLimitUsd) {
      throw new ActiveRailCapExceededError(
        amountUsd,
        wallet.spentTodayUsd,
        wallet.dailySpendLimitUsd
      );
    }

    wallet.spentTodayUsd = projected;
    return {
      amountUsd,
      spentTodayUsd: projected,
      remainingUsd: wallet.dailySpendLimitUsd - projected,
      authorityRoute: 'autonomous',
    };
  }
}

export function getAgentWalletRegistry(): AgentWalletRegistry {
  return AgentWalletRegistry.getInstance();
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
