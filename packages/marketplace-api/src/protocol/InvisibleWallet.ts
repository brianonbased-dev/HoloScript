/**
 * Invisible Wallet Abstraction
 *
 * Zero-friction wallet for HoloScript Protocol operations.
 * Users never need to interact with blockchain directly.
 *
 * Three initialization paths:
 * 1. Environment variable (HOLOSCRIPT_WALLET_KEY) — simplest
 * 2. Encrypted keystore file (~/.holoscript/wallet.json) — persistent
 * 3. Coinbase AgentKit MPC wallet — autonomous agents
 *
 * @module protocol/InvisibleWallet
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Transport,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseGoerli } from 'viem/chains';
import { WalletConnection } from '../web3/WalletConnection.js';
import type { HexAddress } from '@holoscript/core';

// =============================================================================
// TYPES
// =============================================================================

export interface InvisibleWalletConfig {
  /** Use testnet instead of mainnet */
  testnet?: boolean;
  /** Custom RPC URL */
  rpcUrl?: string;
}

// =============================================================================
// ERROR
// =============================================================================

export class InvisibleWalletError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'InvisibleWalletError';
  }
}

// =============================================================================
// INVISIBLE WALLET
// =============================================================================

/**
 * @deprecated Use `InvisibleWalletStub` from `@holoscript/framework` for lightweight wallet operations,
 * or continue using this class only when full blockchain signing (viem) is needed.
 */
export class InvisibleWallet {
  private publicClient: PublicClient;
  private walletClient: WalletClient<Transport, Chain>;
  private address: HexAddress;
  private chain: Chain;

  private constructor(
    publicClient: PublicClient,
    walletClient: WalletClient<Transport, Chain>,
    address: HexAddress,
    chain: Chain
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.address = address;
    this.chain = chain;
  }

  // ===========================================================================
  // FACTORY: Environment Variable
  // ===========================================================================

  /**
   * Create wallet from HOLOSCRIPT_WALLET_KEY environment variable.
   * Simplest path — suitable for CLI and CI/CD.
   *
   * @throws InvisibleWalletError if env var not set
   */
  static fromEnvironment(config: InvisibleWalletConfig = {}): InvisibleWallet {
    const key = process.env.HOLOSCRIPT_WALLET_KEY;
    if (!key) {
      throw new InvisibleWalletError(
        'HOLOSCRIPT_WALLET_KEY environment variable not set. ' +
          'Set it to a hex private key (0x...) or use InvisibleWallet.fromKeystore().',
        'NO_ENV_KEY'
      );
    }

    return InvisibleWallet.fromPrivateKey(key, config);
  }

  // ===========================================================================
  // FACTORY: Private Key (shared implementation)
  // ===========================================================================

  /**
   * Create wallet from a hex private key string.
   * Used internally by fromEnvironment and fromKeystore.
   */
  static fromPrivateKey(privateKey: string, config: InvisibleWalletConfig = {}): InvisibleWallet {
    const normalizedKey = privateKey.startsWith('0x')
      ? (privateKey as `0x${string}`)
      : (`0x${privateKey}` as `0x${string}`);

    const account = privateKeyToAccount(normalizedKey);
    const chain = config.testnet ? baseGoerli : base;
    const rpcUrl = config.rpcUrl || InvisibleWallet.getDefaultRpcUrl(config.testnet);

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    return new InvisibleWallet(publicClient, walletClient, account.address as HexAddress, chain);
  }

  // ===========================================================================
  // FACTORY: Encrypted Keystore
  // ===========================================================================

  /**
   * Create wallet from an encrypted keystore file.
   * Default path: ~/.holoscript/wallet.json
   *
   * Keystore format: { version: 1, encrypted: <base64>, salt: <hex> }
   * Encryption: AES-256-GCM with PBKDF2-derived key.
   *
   * @throws InvisibleWalletError if file not found or passphrase wrong
   */
  static async fromKeystore(
    path: string,
    passphrase: string,
    config: InvisibleWalletConfig = {}
  ): Promise<InvisibleWallet> {
    try {
      const { readFile } = await import('node:fs/promises');
      const raw = await readFile(path, 'utf-8');
      const keystore = JSON.parse(raw) as KeystoreFile;

      if (keystore.version !== 1) {
        throw new InvisibleWalletError(
          `Unsupported keystore version: ${keystore.version}`,
          'UNSUPPORTED_KEYSTORE'
        );
      }

      const privateKey = await decryptKeystore(keystore, passphrase);
      return InvisibleWallet.fromPrivateKey(privateKey, config);
    } catch (error: unknown) {
      if (error instanceof InvisibleWalletError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new InvisibleWalletError(
        `Failed to load keystore from ${path}: ${msg}`,
        'KEYSTORE_FAILED'
      );
    }
  }

  // ===========================================================================
  // FACTORY: AgentKit (Coinbase MPC)
  // ===========================================================================

  /**
   * Create wallet from Coinbase AgentKit (MPC wallet).
   * Suitable for autonomous agents — no private key on disk.
   *
   * Requires: CDP_API_KEY_NAME, CDP_API_KEY_PRIVATE_KEY env vars.
   *
   * @throws InvisibleWalletError if AgentKit initialization fails
   */
  static async fromAgentKit(config: InvisibleWalletConfig = {}): Promise<InvisibleWallet> {
    try {
      const { AgentWalletService } = await import('@holoscript/marketplace-agentkit');
      const agentWallet = new AgentWalletService();
      const address = await agentWallet.initialize();

      // AgentKit provides its own signing — we create read-only clients
      // and delegate write ops through AgentKit's action providers
      const chain = config.testnet ? baseGoerli : base;
      const rpcUrl = config.rpcUrl || InvisibleWallet.getDefaultRpcUrl(config.testnet);

      const publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl),
      });

      // For AgentKit, we use a "proxy" wallet client that delegates to AgentKit
      // In practice, the ProtocolRegistry should use agentWallet directly
      // This is a compatibility bridge
      const walletClient = createWalletClient({
        account: address as `0x${string}`,
        chain,
        transport: http(rpcUrl),
      });

      return new InvisibleWallet(publicClient, walletClient, address as HexAddress, chain);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new InvisibleWalletError(`AgentKit initialization failed: ${msg}`, 'AGENTKIT_FAILED');
    }
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /** Get the wallet's address */
  getAddress(): HexAddress {
    return this.address;
  }

  /** Get a viem WalletClient for write operations */
  getWalletClient(): WalletClient<Transport, Chain> {
    return this.walletClient;
  }

  /** Get a viem PublicClient for read operations */
  getPublicClient(): PublicClient {
    return this.publicClient;
  }

  /** Get the chain configuration */
  getChain(): Chain {
    return this.chain;
  }

  /** Get chain ID */
  getChainId(): number {
    return this.chain.id;
  }

  /**
   * Convert to a WalletConnection instance for compatibility
   * with existing marketplace-api infrastructure.
   */
  toWalletConnection(): WalletConnection {
    const chainType = this.chain.id === baseGoerli.id ? 'base-testnet' : 'base';
    const connection = new WalletConnection({ chain: chainType });
    // Connect with the same address
    connection.connect(this.address as `0x${string}`);
    return connection;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private static getDefaultRpcUrl(testnet?: boolean): string {
    if (testnet) {
      return process.env.BASE_TESTNET_RPC_URL || 'https://goerli.base.org';
    }
    return process.env.BASE_RPC_URL || 'https://mainnet.base.org';
  }
}

// =============================================================================
// KEYSTORE SUPPORT
// =============================================================================

interface KeystoreFile {
  version: number;
  encrypted: string; // base64-encoded encrypted private key
  salt: string; // hex-encoded salt
  iv: string; // hex-encoded IV
}

/**
 * Decrypt a keystore file using AES-256-GCM with PBKDF2-derived key.
 * Uses Node.js crypto module.
 */
async function decryptKeystore(keystore: KeystoreFile, passphrase: string): Promise<string> {
  const crypto = await import('node:crypto');

  const salt = Buffer.from(keystore.salt, 'hex');
  const iv = Buffer.from(keystore.iv, 'hex');
  const encrypted = Buffer.from(keystore.encrypted, 'base64');

  // Derive key from passphrase using PBKDF2
  const key = crypto.pbkdf2Sync(passphrase, salt, 100_000, 32, 'sha256');

  // The last 16 bytes of encrypted data is the auth tag
  const authTag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return `0x${decrypted.toString('hex')}`;
}

/**
 * Create an encrypted keystore file from a private key.
 * Utility for `holoscript wallet create` CLI command.
 */
export async function createKeystore(
  privateKey: string,
  passphrase: string
): Promise<KeystoreFile> {
  const crypto = await import('node:crypto');

  const normalizedKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM

  // Derive key from passphrase
  const key = crypto.pbkdf2Sync(passphrase, salt, 100_000, 32, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(normalizedKey, 'hex');

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    encrypted: Buffer.concat([ciphertext, authTag]).toString('base64'),
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
  };
}
