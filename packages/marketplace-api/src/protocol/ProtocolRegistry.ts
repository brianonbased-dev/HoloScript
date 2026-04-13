/**
 * HoloScript Protocol Registry Client
 *
 * On-chain content registry using Zora 1155 on Base L2.
 * Each published composition = a token in the shared HoloScript 1155 collection.
 * Import-chain revenue distribution via protocol-enforced splits.
 *
 * Architecture:
 * - Server-side registry at REGISTRY_BASE_URL is the source of truth
 * - On-chain anchor via Zora 1155 token is optional (requires wallet + collection)
 * - Revenue splits calculated by @holoscript/core revenue-splitter
 * - Zora NFT minting delegated to CreatorMonetization when mintAsNFT is true
 *
 * @module protocol/ProtocolRegistry
 */

import type { Address, Hex } from 'viem';
import { formatEther } from 'viem';
import {
  zoraCreator1155ImplABI,
  zoraCreatorFixedPriceSaleStrategyABI,
  zoraCreatorFixedPriceSaleStrategyAddress,
} from '@zoralabs/protocol-deployments';
import { WalletConnection } from '../web3/WalletConnection.js';
import { GasEstimator } from '../web3/GasEstimator.js';
import {
  PROTOCOL_CONSTANTS,
  type HexAddress,
  type ProtocolRecord,
  type PublishOptions,
  type PublishResult,
  type CollectOptions,
  type CollectResult,
  type RevenueDistribution,
  type RevenueFlow,
  type ImportChainNode,
  type RevenueCalculatorOptions,
} from '@holoscript/core';
import {
  calculateRevenueDistribution,
  resolveImportChain,
  ethToWei,
  weiToEth,
} from '@holoscript/core';
import type { LicenseType, PublishMode, ProvenanceBlock } from '@holoscript/core';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface ProtocolRegistryConfig {
  /** Pre-configured wallet connection (optional — creates one if not provided) */
  wallet?: WalletConnection;
  /** Shared 1155 collection address for on-chain tokens */
  collectionAddress?: HexAddress;
  /** Server-side registry URL (default: PROTOCOL_CONSTANTS.REGISTRY_BASE_URL) */
  registryUrl?: string;
  /** Use testnet instead of mainnet */
  testnet?: boolean;
  /** Platform fee recipient address */
  platformAddress?: HexAddress;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export class ProtocolRegistryError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ProtocolRegistryError';
  }
}

// =============================================================================
// PROTOCOL REGISTRY CLIENT
// =============================================================================

export class ProtocolRegistry {
  private wallet: WalletConnection;
  private collectionAddress?: HexAddress;
  private registryUrl: string;
  private testnet: boolean;
  private platformAddress: HexAddress;

  constructor(config: ProtocolRegistryConfig = {}) {
    this.wallet =
      config.wallet ||
      new WalletConnection({
        chain: config.testnet ? 'base-testnet' : 'base',
      });
    this.collectionAddress =
      config.collectionAddress ||
      (process.env.HOLOSCRIPT_COLLECTION_ADDRESS as HexAddress | undefined);
    this.registryUrl = config.registryUrl || PROTOCOL_CONSTANTS.REGISTRY_BASE_URL;
    this.testnet = config.testnet || false;
    this.platformAddress =
      config.platformAddress || ('0x0000000000000000000000000000000000000000' as HexAddress);
  }

  // ===========================================================================
  // PUBLISH
  // ===========================================================================

  /**
   * Publish a composition to the HoloScript Protocol.
   *
   * Flow:
   * 1. Store provenance metadata (server-side, IPFS future)
   * 2. Register with server-side registry
   * 3. If wallet connected + collection configured → anchor on-chain via Zora 1155
   * 4. Calculate revenue distribution preview
   * 5. Return protocol record + URLs
   */
  async publish(
    provenance: ProvenanceBlock,
    source: string,
    options: PublishOptions = {}
  ): Promise<PublishResult> {
    try {
      // Step 1: Store metadata
      const metadataURI = await this.storeMetadata(provenance, source);

      // Step 2: Build protocol record
      const price = options.price ? ethToWei(options.price) : 0n;
      const referralBps = options.referralBps ?? PROTOCOL_CONSTANTS.DEFAULT_REFERRAL_BPS;

      const record: ProtocolRecord = {
        contentHash: provenance.hash,
        author: (provenance.author || this.wallet.getAddress()) as HexAddress,
        importHashes: provenance.imports
          .map((i: ProvenanceImport) => i.hash)
          .filter(Boolean) as string[],
        license: provenance.license as LicenseType,
        publishMode: provenance.publishMode as PublishMode,
        timestamp: Date.now(),
        metadataURI,
        price,
        referralBps,
      };

      // Step 3: Register with server-side registry
      const registryResult = await this.registerRecord(record);

      // Step 4: On-chain anchor (optional — requires wallet + collection)
      let tokenId: string | undefined;
      let txHash: string | undefined;
      if (this.collectionAddress && this.wallet.isConnected()) {
        const onChainResult = await this.createOnChainToken(record, options);
        tokenId = onChainResult.tokenId;
        txHash = onChainResult.txHash;
        record.tokenId = tokenId;
        record.txHash = txHash;
      }

      // Step 5: Revenue preview
      const importChain =
        provenance.imports.length > 0 ? await this.buildImportChain(provenance) : [];
      const revenuePreview = calculateRevenueDistribution(price, record.author, importChain, {
        referrer: undefined,
      });

      // Step 6: Build URLs
      const collectUrl = `${this.registryUrl}/collect/${provenance.hash}`;
      const registryRecordUrl = `${this.registryUrl}/protocol/${provenance.hash}`;

      return {
        protocolId: tokenId || provenance.hash,
        contentHash: provenance.hash,
        txHash: txHash || '',
        collectUrl,
        registryUrl: registryRecordUrl,
        sceneId: registryResult.sceneId || provenance.hash.slice(0, 8),
        sceneUrl:
          registryResult.sceneUrl || `${this.registryUrl}/scene/${provenance.hash.slice(0, 8)}`,
        embedUrl:
          registryResult.embedUrl || `${this.registryUrl}/embed/${provenance.hash.slice(0, 8)}`,
        revenuePreview,
        zoraResult:
          tokenId && this.collectionAddress
            ? {
                tokenId,
                txHash: txHash!,
                zoraUrl: this.buildZoraUrl(tokenId),
              }
            : undefined,
      };
    } catch (error: unknown) {
      if (error instanceof ProtocolRegistryError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new ProtocolRegistryError(`Publish failed: ${msg}`, 'PUBLISH_FAILED', {
        originalError: msg,
      });
    }
  }

  // ===========================================================================
  // COLLECT
  // ===========================================================================

  /**
   * Collect (mint an edition of) a published composition.
   *
   * Flow:
   * 1. Fetch protocol record from registry
   * 2. If on-chain token exists → mint via Zora 1155
   * 3. Calculate + return revenue distribution
   */
  async collect(contentHash: string, options: CollectOptions = {}): Promise<CollectResult> {
    try {
      // Step 1: Fetch record
      const record = await this.getRecord(contentHash);
      if (!record) {
        throw new ProtocolRegistryError(`Composition not found: ${contentHash}`, 'NOT_FOUND');
      }

      const quantity = options.quantity || 1;

      // Step 2: Mint on-chain if token exists
      let txHash = '';
      const editions: number[] = [];

      if (record.tokenId && this.collectionAddress && this.wallet.isConnected()) {
        const mintResult = await this.mintEdition(record, quantity, options.referrer);
        txHash = mintResult.txHash;
        editions.push(...mintResult.editions);
      } else {
        // Server-side collect (no on-chain token)
        const serverResult = await this.serverCollect(contentHash, quantity, options.referrer);
        txHash = serverResult.txHash || '';
        editions.push(...(serverResult.editions || [1]));
      }

      // Step 3: Calculate revenue flows
      const importChain = await this.resolveImportChainFromRecord(record);
      const distribution = calculateRevenueDistribution(record.price, record.author, importChain, {
        referrer: options.referrer,
      });

      return {
        tokenId: record.tokenId || contentHash,
        txHash,
        editions,
        pricePaid: weiToEth(record.price * BigInt(quantity)),
        revenueFlows: distribution.flows,
      };
    } catch (error: unknown) {
      if (error instanceof ProtocolRegistryError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new ProtocolRegistryError(`Collect failed: ${msg}`, 'COLLECT_FAILED', {
        originalError: msg,
      });
    }
  }

  // ===========================================================================
  // LOOKUPS
  // ===========================================================================

  /** Get a protocol record by content hash */
  async getRecord(contentHash: string): Promise<ProtocolRecord | null> {
    try {
      const response = await fetch(`${this.registryUrl}/api/protocol/${contentHash}`);
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new ProtocolRegistryError(
          `Registry lookup failed: ${response.status}`,
          'REGISTRY_ERROR'
        );
      }
      const data = (await response.json()) as ProtocolRecord & { price: string };
      // Restore bigint price from string
      return { ...data, price: BigInt(data.price || '0') };
    } catch (error: unknown) {
      if (error instanceof ProtocolRegistryError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new ProtocolRegistryError(`Lookup failed: ${msg}`, 'LOOKUP_FAILED');
    }
  }

  /** Get all publications by an author */
  async getByAuthor(author: string): Promise<ProtocolRecord[]> {
    try {
      const response = await fetch(
        `${this.registryUrl}/api/protocol/author/${encodeURIComponent(author)}`
      );
      if (!response.ok) {
        throw new ProtocolRegistryError(
          `Author lookup failed: ${response.status}`,
          'REGISTRY_ERROR'
        );
      }
      const data = (await response.json()) as Array<ProtocolRecord & { price: string }>;
      return data.map((r) => ({ ...r, price: BigInt(r.price || '0') }));
    } catch (error: unknown) {
      if (error instanceof ProtocolRegistryError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new ProtocolRegistryError(`Author lookup failed: ${msg}`, 'AUTHOR_LOOKUP_FAILED');
    }
  }

  /** Get the collect URL for a published composition */
  getCollectUrl(contentHash: string): string {
    return `${this.registryUrl}/collect/${contentHash}`;
  }

  // ===========================================================================
  // REVENUE PREVIEW
  // ===========================================================================

  /**
   * Preview revenue distribution without publishing.
   * Pure calculation — no network calls needed.
   */
  previewRevenue(
    priceEth: string,
    creator: string,
    importChain: ImportChainNode[],
    options?: RevenueCalculatorOptions
  ): RevenueDistribution {
    const price = ethToWei(priceEth);
    return calculateRevenueDistribution(price, creator, importChain, options);
  }

  // ===========================================================================
  // PRIVATE — METADATA STORAGE
  // ===========================================================================

  /**
   * Store provenance metadata on the registry server.
   * Returns a URI that can be resolved to the full metadata.
   * Future: IPFS upload with server fallback.
   */
  private async storeMetadata(provenance: ProvenanceBlock, source: string): Promise<string> {
    try {
      const response = await fetch(`${this.registryUrl}/api/protocol/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provenance,
          source,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Metadata storage failed: ${response.status}`);
      }

      const result = (await response.json()) as { metadataURI: string };
      return result.metadataURI;
    } catch {
      // Fallback: generate a deterministic URI from content hash
      return `${this.registryUrl}/metadata/${provenance.hash}`;
    }
  }

  // ===========================================================================
  // PRIVATE — SERVER-SIDE REGISTRY
  // ===========================================================================

  private async registerRecord(
    record: ProtocolRecord
  ): Promise<{ sceneId?: string; sceneUrl?: string; embedUrl?: string }> {
    try {
      const response = await fetch(`${this.registryUrl}/api/protocol`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...record,
          price: record.price.toString(), // Serialize bigint
        }),
      });

      if (!response.ok) {
        throw new Error(`Registry registration failed: ${response.status}`);
      }

      return (await response.json()) as { sceneId?: string; sceneUrl?: string; embedUrl?: string };
    } catch {
      // Non-fatal: server registration can be retried
      return {};
    }
  }

  private async serverCollect(
    contentHash: string,
    quantity: number,
    referrer?: string
  ): Promise<{ txHash?: string; editions?: number[] }> {
    try {
      const response = await fetch(`${this.registryUrl}/api/collect/${contentHash}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity, referrer }),
      });

      if (!response.ok) {
        throw new Error(`Server collect failed: ${response.status}`);
      }

      return (await response.json()) as { txHash?: string; editions?: number[] };
    } catch {
      return { editions: Array.from({ length: quantity }, (_, i) => i + 1) };
    }
  }

  // ===========================================================================
  // PRIVATE — ON-CHAIN OPERATIONS
  // ===========================================================================

  /**
   * Create an on-chain token in the shared 1155 collection.
   *
   * Revenue routing: the creator (not the platform) receives all revenue.
   * 1. setupNewTokenWithCreateReferral → Zora create rewards go to creator
   * 2. addPermission → grant fixed-price minter permission to sell
   * 3. callSale → per-token fundsRecipient = creator (primary sales)
   * 4. updateRoyaltiesForToken → royaltyRecipient = creator (secondary sales)
   *
   * The platform wallet pays gas but does NOT receive revenue.
   */
  private async createOnChainToken(
    record: ProtocolRecord,
    _options: PublishOptions
  ): Promise<{ tokenId: string; txHash: string }> {
    if (!this.collectionAddress) {
      throw new ProtocolRegistryError(
        'Collection address required for on-chain publish',
        'NO_COLLECTION'
      );
    }

    const walletClient = this.wallet.getWalletClient();
    const publicClient = this.wallet.getPublicClient();
    const platformAddress = this.wallet.getAddress()!;

    // Resolve creator address — if the author is an 0x address use it directly,
    // otherwise default to the platform wallet (creator can claim later).
    const creatorAddress = (
      record.author.startsWith('0x') ? record.author : platformAddress
    ) as Address;

    // Determine chain for fixed-price minter address lookup
    const chainId = this.testnet
      ? PROTOCOL_CONSTANTS.CHAIN.testnet.id
      : PROTOCOL_CONSTANTS.CHAIN.id;
    const fixedPriceMinter = zoraCreatorFixedPriceSaleStrategyAddress[
      chainId as keyof typeof zoraCreatorFixedPriceSaleStrategyAddress
    ] as Address;

    // Check balance
    const gasEstimate = await GasEstimator.estimateMintGas(
      publicClient,
      this.collectionAddress,
      1n
    );

    const balanceCheck = await GasEstimator.checkSufficientBalance(
      publicClient,
      platformAddress,
      gasEstimate
    );

    if (!balanceCheck.sufficient) {
      throw new ProtocolRegistryError(
        `Insufficient balance: need ${GasEstimator.formatCost(balanceCheck.required)}, have ${GasEstimator.formatCost(balanceCheck.balance)}`,
        'INSUFFICIENT_BALANCE',
        {
          required: formatEther(balanceCheck.required),
          balance: formatEther(balanceCheck.balance),
        }
      );
    }

    // Step 1: Create token with creator as create referral
    // Zora ABI types diverge from viem's strict generics; cast through unknown
    const setupTxHash = await walletClient.writeContract({
      address: this.collectionAddress,
      abi: zoraCreator1155ImplABI,
      functionName: 'setupNewTokenWithCreateReferral',
      args: [
        record.metadataURI || '', // token URI
        BigInt(Number.MAX_SAFE_INTEGER), // maxSupply (unlimited editions)
        creatorAddress, // createReferral → creator gets Zora rewards
      ],
    } as unknown as Parameters<typeof walletClient.writeContract>[0]);

    const setupReceipt = await publicClient.waitForTransactionReceipt({
      hash: setupTxHash,
      confirmations: 1,
    });

    if (setupReceipt.status === 'reverted') {
      throw new ProtocolRegistryError(`Token creation reverted: ${setupTxHash}`, 'TX_REVERTED', {
        txHash: setupTxHash,
      });
    }

    // Extract token ID from UpdatedToken event
    let tokenId = '0';
    const UPDATED_TOKEN_TOPIC =
      '0x5086d1bcea28999da9875111e3592688fbfa821db63214c695ca35f00f5e0e23';
    for (const log of setupReceipt.logs) {
      if (log.topics[0] === UPDATED_TOKEN_TOPIC && log.topics[1]) {
        tokenId = BigInt(log.topics[1]).toString();
        break;
      }
    }

    // Fallback: check TransferSingle (ERC-1155) event for tokenId
    if (tokenId === '0') {
      const TRANSFER_SINGLE = '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62';
      for (const log of setupReceipt.logs) {
        if (log.topics[0] === TRANSFER_SINGLE && log.topics[3]) {
          tokenId = BigInt(log.topics[3]).toString();
          break;
        }
      }
    }

    const tokenIdBig = BigInt(tokenId);

    // Step 2: Grant minter permission to the fixed-price sale strategy
    await walletClient.writeContract({
      address: this.collectionAddress,
      abi: zoraCreator1155ImplABI,
      functionName: 'addPermission',
      args: [
        tokenIdBig,
        fixedPriceMinter,
        4n, // PERMISSION_BIT_MINTER = 2^2 = 4
      ],
    } as unknown as Parameters<typeof walletClient.writeContract>[0]);

    // Step 3: Configure per-token sale — fundsRecipient = CREATOR
    const { encodeFunctionData } = await import('viem');
    const setSaleData = encodeFunctionData({
      abi: zoraCreatorFixedPriceSaleStrategyABI,
      functionName: 'setSale',
      args: [
        tokenIdBig,
        {
          saleStart: 0n, // immediately
          saleEnd: BigInt('18446744073709551615'), // uint64 max (forever)
          maxTokensPerAddress: 0n, // unlimited
          pricePerToken: record.price, // creator's price
          fundsRecipient: creatorAddress, // CREATOR gets primary sale revenue
        },
      ],
    });

    await walletClient.writeContract({
      address: this.collectionAddress,
      abi: zoraCreator1155ImplABI,
      functionName: 'callSale',
      args: [tokenIdBig, fixedPriceMinter, setSaleData],
    } as unknown as Parameters<typeof walletClient.writeContract>[0]);

    // Step 4: Set per-token royalties — royaltyRecipient = CREATOR
    await walletClient.writeContract({
      address: this.collectionAddress,
      abi: zoraCreator1155ImplABI,
      functionName: 'updateRoyaltiesForToken',
      args: [
        tokenIdBig,
        {
          royaltyMintSchedule: 0,
          royaltyBPS: PROTOCOL_CONSTANTS.PLATFORM_FEE_BPS, // 2.5% secondary royalty
          royaltyRecipient: creatorAddress, // CREATOR gets secondary sales
        },
      ],
    } as unknown as Parameters<typeof walletClient.writeContract>[0]);

    return { tokenId, txHash: setupTxHash };
  }

  /**
   * Mint an edition of an existing on-chain token.
   *
   * Uses mintWithRewards so Zora protocol rewards are distributed:
   * - Create referral (creator) gets Zora create reward
   * - Mint referral (referrer) gets Zora mint reward
   * - Primary sale revenue goes to creator via per-token fundsRecipient
   */
  private async mintEdition(
    record: ProtocolRecord,
    quantity: number,
    referrer?: string
  ): Promise<{ txHash: string; editions: number[] }> {
    if (!this.collectionAddress || !record.tokenId) {
      throw new ProtocolRegistryError('On-chain token required for edition minting', 'NO_TOKEN');
    }

    const walletClient = this.wallet.getWalletClient();
    const publicClient = this.wallet.getPublicClient();
    const collectorAddress = this.wallet.getAddress()!;

    const mintReferral = (referrer || collectorAddress) as Address;

    const gasEstimate = await GasEstimator.estimateMintGas(
      publicClient,
      this.collectionAddress,
      BigInt(quantity)
    );

    // Total cost = Zora mint fee + token price * quantity
    const totalValue = gasEstimate.mintFee + record.price * BigInt(quantity);

    const txHash = await walletClient.writeContract({
      address: this.collectionAddress,
      abi: zoraCreator1155ImplABI,
      functionName: 'mintWithRewards',
      args: [
        collectorAddress, // minter (receives the NFT)
        BigInt(record.tokenId), // tokenId
        BigInt(quantity), // quantity
        '0x' as Hex, // minterArguments
        mintReferral, // mintReferral (earns Zora referral reward)
      ],
      value: totalValue,
      gas: gasEstimate.gasLimit,
      maxFeePerGas: gasEstimate.maxFeePerGas,
      maxPriorityFeePerGas: gasEstimate.maxPriorityFeePerGas,
    } as unknown as Parameters<typeof walletClient.writeContract>[0]);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    if (receipt.status === 'reverted') {
      throw new ProtocolRegistryError(`Edition mint reverted: ${txHash}`, 'TX_REVERTED', {
        txHash,
      });
    }

    const currentEdition = record.editionCount || 0;
    const editions = Array.from({ length: quantity }, (_, i) => currentEdition + i + 1);

    return { txHash, editions };
  }

  // ===========================================================================
  // PRIVATE — IMPORT CHAIN RESOLUTION
  // ===========================================================================

  private async buildImportChain(provenance: ProvenanceBlock): Promise<ImportChainNode[]> {
    const imports = provenance.imports.map((imp: ProvenanceImport) => ({
      hash: imp.hash,
      author: imp.author,
      path: imp.path,
    }));

    return resolveImportChain(
      imports,
      async (hash: string) => {
        const record = await this.getRecord(hash);
        if (!record) return null;
        return {
          importHashes: record.importHashes,
          author: record.author,
        };
      },
      PROTOCOL_CONSTANTS.MAX_IMPORT_DEPTH
    );
  }

  private async resolveImportChainFromRecord(record: ProtocolRecord): Promise<ImportChainNode[]> {
    if (!record.importHashes.length) return [];

    const imports = record.importHashes.map((hash) => ({
      hash,
      path: hash,
    }));

    return resolveImportChain(
      imports,
      async (hash: string) => {
        const rec = await this.getRecord(hash);
        if (!rec) return null;
        return {
          importHashes: rec.importHashes,
          author: rec.author,
        };
      },
      PROTOCOL_CONSTANTS.MAX_IMPORT_DEPTH
    );
  }

  // ===========================================================================
  // PRIVATE — URL BUILDERS
  // ===========================================================================

  private buildZoraUrl(tokenId: string): string {
    const chainName = this.testnet ? 'base-goerli' : 'base';
    return `https://zora.co/collect/${chainName}:${this.collectionAddress}/${tokenId}`;
  }

  // ===========================================================================
  // ACCESSORS
  // ===========================================================================

  getWallet(): WalletConnection {
    return this.wallet;
  }

  getRegistryUrl(): string {
    return this.registryUrl;
  }

  isOnChainEnabled(): boolean {
    return !!this.collectionAddress && this.wallet.isConnected();
  }
}

// =============================================================================
// CONVENIENCE FACTORY
// =============================================================================

export function createProtocolRegistry(config?: ProtocolRegistryConfig): ProtocolRegistry {
  return new ProtocolRegistry(config);
}

// =============================================================================
// TYPE RE-EXPORT (ProvenanceImport used internally)
// =============================================================================

interface ProvenanceImport {
  path: string;
  hash?: string;
  author?: string;
}
