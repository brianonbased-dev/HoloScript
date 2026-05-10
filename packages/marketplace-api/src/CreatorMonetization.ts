/**
 * @fileoverview Creator Monetization & Zora Integration
 * @module @holoscript/marketplace-api
 *
 * Film3D Creator Monetization Service
 *
 * Enable artists and creators to monetize their Hololand content (VRR twins, VR
 * worlds, AR quests, 3D assets) via Zora Protocol - a decentralized NFT marketplace
 * with creator-first economics (permanent royalties, no platform fees).
 *
 * @version 1.0.0
 */

import type { Address, Hex } from 'viem';
import { formatEther } from 'viem';
import { zoraCreator1155ImplABI } from '@zoralabs/protocol-deployments';
import { IPFSService } from '@holoscript/core/storage';
import type {
  FallbackProvider as CoreIPFSFallbackProvider,
  IPFSFile as CoreIPFSFile,
} from '@holoscript/core/storage';

/**
 * Viem's strict contract call types don't align perfectly with the Zora 1155
 * ABI. We cast contract call params through `unknown` to the expected
 * parameter type, preserving type-safety for everything we control.
 */
import { WalletConnection } from './web3/WalletConnection';
import { GasEstimator } from './web3/GasEstimator';
import type {
  CreatorMonetizationOptions,
  NFTMetadata,
  MintNFTOptions,
  MintResult,
  Collection,
  CreatorStats,
  RevenueBreakdown,
  VRRTwinData,
  IPFSUploadResult,
  IPFSUploadRecord,
  IPFSProvider,
  ZoraCreatorResponse,
  PricingEstimate,
  TransactionStatus,
  Network,
} from './types/Film3DTypes';
import {
  CreatorMonetizationError,
  InsufficientBalanceError,
  IPFSUploadError,
  ZoraAPIError,
} from './types/Film3DTypes';

// =============================================================================
// CONSTANTS
// =============================================================================

const ZORA_API_BASE = 'https://api.zora.co/v1';
const ZORA_MAINNET_URL = 'https://zora.co/collect';

/**
 * Default revenue sharing: 80% artist, 10% platform, 10% AI
 */
const DEFAULT_REVENUE_SHARING = {
  artist: 80,
  platform: 10,
  aiAgent: 10,
};

/**
 * Chain ID mapping
 */
const _CHAIN_IDS: Record<Network, number> = {
  base: 8453,
  'base-testnet': 84531,
  ethereum: 1,
  zora: 7777777,
};

/**
 * Zora mint fee per token (0.000777 ETH)
 */
const _ZORA_MINT_FEE = '0.000777';

// =============================================================================
// MAIN CLASS
// =============================================================================

/**
 * CreatorMonetization Service
 *
 * Provides comprehensive NFT minting and monetization capabilities
 * for Hololand creators using Zora Protocol.
 *
 * Features:
 * - NFT minting (ERC-721, ERC-1155)
 * - Collection management
 * - Revenue sharing (80/10/10 split)
 * - Creator analytics
 * - IPFS integration
 * - Automatic metadata generation
 *
 * @example
 * ```typescript
 * const creator = new CreatorMonetization({
 *   network: 'base',
 *   creatorAddress: '0x123...',
 *   revenueSharing: { artist: 80, platform: 10, aiAgent: 10 }
 * });
 *
 * const nft = await creator.mintNFT({
 *   type: 'vrr_twin',
 *   contentId: 'phoenix_downtown',
 *   metadata: { ... },
 *   pricing: { model: 'fixed', price: 0.05 },
 *   royalty: 10
 * });
 * ```
 */
export class CreatorMonetization {
  private options: CreatorMonetizationOptions;
  private wallet: WalletConnection;
  private isInitialized: boolean = false;
  private readonly ipfsUploadRecords: IPFSUploadRecord[] = [];

  /**
   * Create a new CreatorMonetization instance
   *
   * @param options - Configuration options
   */
  constructor(options: CreatorMonetizationOptions) {
    this.options = {
      ...options,
      revenueSharing: options.revenueSharing || DEFAULT_REVENUE_SHARING,
      ipfsProvider: options.ipfsProvider || 'pinata',
    };

    // Initialize wallet connection
    const chainType = this.getChainType(options.network);
    this.wallet = new WalletConnection({ chain: chainType });

    // Connect wallet if creator address provided
    if (options.creatorAddress) {
      this.wallet.connect(options.creatorAddress).then(() => {
        this.isInitialized = true;
      });
    }
  }

  // ===========================================================================
  // CORE NFT MINTING
  // ===========================================================================

  /**
   * Mint an NFT on Zora Protocol
   *
   * This method:
   * 1. Uploads metadata to IPFS
   * 2. Estimates gas costs
   * 3. Checks wallet balance
   * 4. Executes mint transaction
   * 5. Returns mint result with transaction details
   *
   * @param options - Mint configuration
   * @returns Mint result with token ID, contract address, and tx hash
   * @throws {InsufficientBalanceError} If wallet lacks funds
   * @throws {IPFSUploadError} If metadata upload fails
   * @throws {CreatorMonetizationError} If minting fails
   *
   * @example
   * ```typescript
   * const result = await creator.mintNFT({
   *   type: 'vrr_twin',
   *   contentId: 'phoenix_downtown',
   *   metadata: {
   *     name: 'Phoenix Downtown VRR Twin',
   *     description: '1:1 digital twin',
   *     image: 'ipfs://Qm...',
   *     attributes: [...]
   *   },
   *   pricing: { model: 'fixed', price: 0.05 },
   *   royalty: 10
   * });
   * ```
   */
  async mintNFT(options: MintNFTOptions): Promise<MintResult> {
    this.ensureInitialized();

    try {
      // Step 1: Upload metadata to IPFS
      const metadataUri = await this.uploadMetadataToIPFS(options.metadata);

      // Step 2: Determine contract address
      const contractAddress = options.collectionAddress || this.getDefaultCollectionAddress();

      // Step 3: Prepare mint parameters
      const quantity = BigInt(options.maxSupply || 1);
      const tokenId = BigInt(0); // Token ID 0 for new tokens on Zora 1155
      const minterAddress = this.wallet.getAddress()!;
      const mintReferral = this.options.creatorAddress;

      // Step 4: Estimate gas costs
      const publicClient = this.wallet.getPublicClient();
      const gasEstimate = await GasEstimator.estimateMintGas(
        publicClient,
        contractAddress,
        quantity
      );

      // Step 5: Check wallet balance
      const balanceCheck = await GasEstimator.checkSufficientBalance(
        publicClient,
        minterAddress,
        gasEstimate
      );

      if (!balanceCheck.sufficient) {
        throw new InsufficientBalanceError(
          GasEstimator.formatCost(balanceCheck.required),
          GasEstimator.formatCost(balanceCheck.balance),
          GasEstimator.formatCost(balanceCheck.shortfall!)
        );
      }

      // Step 6: Execute mint transaction
      const walletClient = this.wallet.getWalletClient();

      // Simulate transaction first
      // Zora ABI types diverge from viem's strict generics; use ZoraContractCall
      await publicClient.simulateContract({
        address: contractAddress,
        abi: zoraCreator1155ImplABI,
        functionName: 'mint',
        args: [
          minterAddress,
          tokenId,
          quantity,
          '0x' as Hex, // minterArguments (empty)
          mintReferral,
        ],
        value: gasEstimate.mintFee,
        account: walletClient.account,
        gas: gasEstimate.gasLimit,
        maxFeePerGas: gasEstimate.maxFeePerGas,
        maxPriorityFeePerGas: gasEstimate.maxPriorityFeePerGas,
      } as unknown as Parameters<typeof publicClient.simulateContract>[0]);

      // Execute transaction
      const txHash = await walletClient.writeContract({
        address: contractAddress,
        abi: zoraCreator1155ImplABI,
        functionName: 'mint',
        args: [minterAddress, tokenId, quantity, '0x' as Hex, mintReferral],
        value: gasEstimate.mintFee,
        gas: gasEstimate.gasLimit,
        maxFeePerGas: gasEstimate.maxFeePerGas,
        maxPriorityFeePerGas: gasEstimate.maxPriorityFeePerGas,
      } as unknown as Parameters<typeof walletClient.writeContract>[0]);

      // Step 7: Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      });

      if (receipt.status === 'reverted') {
        throw new CreatorMonetizationError(
          `Transaction reverted: ${txHash}`,
          'TRANSACTION_REVERTED',
          { txHash }
        );
      }

      // Step 8: Extract token ID from logs
      let mintedTokenId = '0';
      const mintLog = receipt.logs.find((log) => {
        // Zora Minted event signature
        return (
          log.topics[0] === '0x30385c845b448a36257a6a1716e6ad2e1bc2cbe333cde1e69fe849ad6511adfe'
        );
      });

      if (mintLog && mintLog.topics[2]) {
        mintedTokenId = BigInt(mintLog.topics[2]).toString();
      }

      // Step 9: Generate Zora URL
      const chainName = this.getChainName(this.options.network);
      const zoraUrl = `${ZORA_MAINNET_URL}/${chainName}:${contractAddress}/${mintedTokenId}`;

      // Step 10: Return result
      return {
        tokenId: mintedTokenId,
        contractAddress,
        txHash,
        blockNumber: Number(receipt.blockNumber),
        zoraUrl,
        metadataUri,
        gasUsed: receipt.gasUsed.toString(),
        totalCost: formatEther(gasEstimate.totalCost),
      };
    } catch (error: unknown) {
      if (error instanceof CreatorMonetizationError) {
        throw error;
      }

      throw new CreatorMonetizationError(
        `Failed to mint NFT: ${error instanceof Error ? error.message : String(error)}`,
        'MINT_FAILED',
        {
          originalError: error,
        }
      );
    }
  }

  // ===========================================================================
  // COLLECTION MANAGEMENT
  // ===========================================================================

  /**
   * Resolve collection deployment guidance for Zora.
   *
   * Collection deployment is an explicit operator step in this release. Use
   * `packages/marketplace-api/scripts/deploy-protocol-collection.ts` or Zora UI,
   * then pass the resulting address to `mintNFT`.
   *
   * @param name - Collection name
   * @param symbol - Collection symbol (e.g., "HOLO")
   * @param description - Collection description
   * @returns Collection information
   * @throws {CreatorMonetizationError} If collection creation fails
   *
   * @example
   * ```typescript
   * const collection = await creator.createCollection(
   *   'Hololand VRR Twins',
   *   'HVRT',
   *   'Collection of 1:1 digital twins'
   * );
   * ```
   */
  async createCollection(
    _name: string,
    _symbol: string,
    _description?: string
  ): Promise<Collection> {
    this.ensureInitialized();

    throw new CreatorMonetizationError(
      'Collection deployment is external in this release. Run ' +
        'packages/marketplace-api/scripts/deploy-protocol-collection.ts or create a collection at ' +
        'https://zora.co/create, then provide the collection address in mintNFT options.',
      'COLLECTION_DEPLOYMENT_EXTERNAL',
      {
        message:
          'Deploy or create the collection first, then provide its address in mintNFT options',
        script: 'packages/marketplace-api/scripts/deploy-protocol-collection.ts',
        deployScript: 'packages/marketplace-api/scripts/deploy-protocol-collection.ts',
        createUrl: 'https://zora.co/create',
      }
    );
  }

  // ===========================================================================
  // IPFS INTEGRATION
  // ===========================================================================

  /**
   * Upload files to IPFS
   *
   * @param files - Files to upload
   * @returns IPFS upload result with CID and URI
   * @throws {IPFSUploadError} If upload fails
   *
   * @example
   * ```typescript
   * const result = await creator.uploadToIPFS([imageFile, modelFile]);
   * console.log(result.uri); // ipfs://Qm...
   * ```
   */
  async uploadToIPFS(files: File[]): Promise<IPFSUploadResult> {
    if (files.length === 0) {
      throw new IPFSUploadError(
        'At least one file is required for IPFS upload',
        this.getIPFSProvider()
      );
    }

    const ipfsFiles: CoreIPFSFile[] = await Promise.all(
      files.map(async (file, index) => ({
        path: this.normalizeIPFSPath(file.name, index),
        content: Buffer.from(await file.arrayBuffer()),
      }))
    );

    return this.uploadIPFSFiles(ipfsFiles, this.getUploadName(ipfsFiles));
  }

  /**
   * Upload NFT metadata to IPFS
   *
   * Internal method that uploads metadata JSON to IPFS.
   * @param metadata - NFT metadata object
   * @returns IPFS URI (ipfs://...)
   * @private
   */
  private async uploadMetadataToIPFS(metadata: NFTMetadata): Promise<string> {
    const metadataJson = JSON.stringify(metadata, null, 2);
    const result = await this.uploadIPFSFiles(
      [{ path: 'metadata.json', content: metadataJson }],
      `metadata-${this.slugify(metadata.name || 'nft')}`
    );
    return result.uri;
  }

  private async uploadIPFSFiles(
    files: CoreIPFSFile[],
    name: string
  ): Promise<IPFSUploadResult> {
    const provider = this.getIPFSProvider();
    const apiKey = this.getIPFSApiKey(provider);

    if (!apiKey) {
      throw new IPFSUploadError(
        `Missing IPFS API key for ${provider}. Set ipfsApiKey or the provider-specific environment variable before minting.`,
        provider
      );
    }

    try {
      const service = new IPFSService({
        provider,
        apiKey,
        apiSecret: this.getIPFSApiSecret(provider),
        fallbackProviders: this.getIPFSFallbackProviders(),
        gatewayUrl: this.options.ipfsGatewayUrl || process.env.HOLOSCRIPT_IPFS_GATEWAY_URL,
        enableCDN: true,
      });

      const upload = await service.upload({
        name,
        files,
        pin: true,
        metadata: {
          name,
          keyvalues: {
            source: 'creator-monetization',
            network: this.options.network,
            creator: this.options.creatorAddress,
          },
        },
      });

      const result: IPFSUploadResult = {
        cid: upload.cid,
        uri: upload.uri,
        gatewayUrl: upload.gatewayUrl,
        size: upload.size,
        uploadedAt: Date.now(),
      };

      await this.persistIPFSUpload({
        ...result,
        provider,
        name,
        fileCount: files.length,
      });

      return result;
    } catch (error: unknown) {
      if (error instanceof IPFSUploadError) {
        throw error;
      }

      throw new IPFSUploadError(
        `Failed to upload content to ${provider}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        provider
      );
    }
  }

  private getIPFSProvider(): IPFSProvider {
    return this.options.ipfsProvider || 'pinata';
  }

  private getIPFSApiKey(provider: IPFSProvider): string | undefined {
    if (this.options.ipfsApiKey) return this.options.ipfsApiKey;
    if (process.env.HOLOSCRIPT_IPFS_API_KEY) return process.env.HOLOSCRIPT_IPFS_API_KEY;

    switch (provider) {
      case 'pinata':
        return process.env.PINATA_API_KEY;
      case 'nft.storage':
        return process.env.NFT_STORAGE_API_KEY;
      case 'infura':
        return process.env.INFURA_IPFS_PROJECT_ID || process.env.INFURA_IPFS_API_KEY;
      default:
        return undefined;
    }
  }

  private getIPFSApiSecret(provider: IPFSProvider): string | undefined {
    if (this.options.ipfsApiSecret) return this.options.ipfsApiSecret;
    if (process.env.HOLOSCRIPT_IPFS_API_SECRET) return process.env.HOLOSCRIPT_IPFS_API_SECRET;

    switch (provider) {
      case 'pinata':
        return process.env.PINATA_SECRET_API_KEY;
      case 'infura':
        return process.env.INFURA_IPFS_PROJECT_SECRET || process.env.INFURA_IPFS_API_SECRET;
      case 'nft.storage':
      default:
        return undefined;
    }
  }

  private getIPFSFallbackProviders(): CoreIPFSFallbackProvider[] {
    return (this.options.ipfsFallbackProviders || []).map((fallback) => ({
      provider: fallback.provider,
      apiKey: fallback.apiKey,
      apiSecret: fallback.apiSecret,
    }));
  }

  private async persistIPFSUpload(record: IPFSUploadRecord): Promise<void> {
    this.ipfsUploadRecords.push({ ...record });

    if (!this.options.onIPFSUpload) {
      return;
    }

    await this.options.onIPFSUpload({ ...record });
  }

  private normalizeIPFSPath(name: string | undefined, index: number): string {
    const base = (name || `file-${index + 1}`)
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .pop();

    return this.slugify(base || `file-${index + 1}`, true);
  }

  private getUploadName(files: CoreIPFSFile[]): string {
    if (files.length === 1) {
      return this.stripExtension(files[0].path);
    }

    return 'holoscript-upload';
  }

  private stripExtension(path: string): string {
    return path.replace(/\.[^.]+$/, '') || path;
  }

  private slugify(value: string, keepExtension = false): string {
    const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!normalized) {
      return keepExtension ? 'file' : 'upload';
    }

    return keepExtension ? normalized : this.stripExtension(normalized);
  }

  // ===========================================================================
  // METADATA GENERATION
  // ===========================================================================

  /**
   * Generate NFT metadata from VRR twin data
   *
   * Automatically creates OpenSea-compatible metadata from a VRR twin,
   * including name, description, image, and attributes.
   *
   * @param vrrTwin - VRR twin data
   * @returns NFT metadata object
   *
   * @example
   * ```typescript
   * const metadata = await creator.generateMetadata({
   *   id: 'phoenix_downtown',
   *   name: 'Phoenix Downtown',
   *   location: { name: 'Phoenix, AZ', latitude: 33.4484, longitude: -112.0740 },
   *   businesses: [{ id: 'b1', name: 'Coffee Shop', category: 'cafe' }],
   *   traits: ['Real-Time Weather', 'Event Sync']
   * });
   * ```
   */
  async generateMetadata(vrrTwin: VRRTwinData): Promise<NFTMetadata> {
    const attributes: NFTMetadata['attributes'] = [
      { trait_type: 'Layer', value: 'VRR' },
      { trait_type: 'Content Type', value: 'VRR Twin' },
    ];

    // Add location if available
    if (vrrTwin.location) {
      attributes.push({
        trait_type: 'Location',
        value: vrrTwin.location.name,
      });

      if (vrrTwin.location.latitude && vrrTwin.location.longitude) {
        attributes.push({
          trait_type: 'Latitude',
          value: vrrTwin.location.latitude,
          display_type: 'number',
        });
        attributes.push({
          trait_type: 'Longitude',
          value: vrrTwin.location.longitude,
          display_type: 'number',
        });
      }
    }

    // Add business count
    if (vrrTwin.businesses && vrrTwin.businesses.length > 0) {
      attributes.push({
        trait_type: 'Business Count',
        value: vrrTwin.businesses.length,
        display_type: 'number',
      });
    }

    // Add sync type
    if (vrrTwin.syncType) {
      attributes.push({
        trait_type: 'Sync Type',
        value: vrrTwin.syncType,
      });
    }

    // Add custom traits
    if (vrrTwin.traits) {
      vrrTwin.traits.forEach((trait) => {
        attributes.push({
          trait_type: 'Feature',
          value: trait,
        });
      });
    }

    // Generate description
    const description =
      vrrTwin.description ||
      `1:1 digital twin of ${vrrTwin.location?.name || vrrTwin.name}. ` +
        `Created in Hololand with real-time synchronization and interactive experiences.`;

    // Build metadata
    const metadata: NFTMetadata = {
      name: vrrTwin.name,
      description,
      image: vrrTwin.previewUrl || 'ipfs://placeholder',
      animation_url: vrrTwin.modelUrl,
      external_url: `https://hololand.io/vrr/${vrrTwin.id}`,
      attributes,
      properties: {
        category: 'vrr_twin',
        layer: 'vrr',
        location: vrrTwin.location?.name,
        vrr_hash: vrrTwin.id,
        creator: vrrTwin.creator?.address || this.options.creatorAddress,
      },
    };

    return metadata;
  }

  // ===========================================================================
  // ANALYTICS & STATS
  // ===========================================================================

  /**
   * Get creator statistics and analytics
   *
   * Fetches comprehensive analytics for a creator including:
   * - Total sales and royalties
   * - NFT count and collector count
   * - Floor price and average sale price
   * - Revenue breakdown
   *
   * @param creatorAddress - Creator's wallet address
   * @returns Creator statistics
   * @throws {ZoraAPIError} If API request fails
   *
   * @example
   * ```typescript
   * const stats = await creator.getCreatorStats('0x123...');
   * console.log(`Total sales: $${stats.totalSales}`);
   * console.log(`NFTs minted: ${stats.nftsMinted}`);
   * ```
   */
  async getCreatorStats(creatorAddress: Address): Promise<CreatorStats> {
    try {
      // Query Zora API for creator data
      const url = `${ZORA_API_BASE}/creator/${creatorAddress}?chain=${this.options.network}`;
      const response = await this.executeZoraApiCall<ZoraCreatorResponse>(url);

      // Parse and calculate stats
      const stats: CreatorStats = {
        totalSales: parseFloat(response.stats?.totalSales?.toString() || '0'),
        royaltiesEarned: parseFloat(response.totalRoyalties || '0'),
        nftsMinted: response.coins?.length || 0,
        floorPrice: parseFloat(response.stats?.floorPrice || '0'),
        averageSalePrice: 0,
        totalViews: 0, // Not available from Zora API
        collectors: response.stats?.collectors || 0,
        collections: response.collections?.length || 0,
        totalVolume: response.stats?.totalVolume || '0',
        revenueBreakdown: {
          artist: 0,
          platform: 0,
          aiAgent: 0,
        },
      };

      // Calculate average sale price
      if (stats.nftsMinted > 0) {
        stats.averageSalePrice = stats.totalSales / stats.nftsMinted;
      }

      // Calculate revenue breakdown using configured percentages
      const sharing = this.options.revenueSharing!;
      stats.revenueBreakdown = {
        artist: (stats.totalSales * sharing.artist) / 100,
        platform: (stats.totalSales * sharing.platform) / 100,
        aiAgent: sharing.aiAgent ? (stats.totalSales * sharing.aiAgent) / 100 : 0,
      };

      return stats;
    } catch (error: unknown) {
      const status = (error as Record<string, unknown>)?.status as number | undefined;
      throw new ZoraAPIError(
        `Failed to fetch creator stats: ${error instanceof Error ? error.message : String(error)}`,
        status
      );
    }
  }

  // ===========================================================================
  // REVENUE & EARNINGS
  // ===========================================================================

  /**
   * Withdraw creator earnings from Zora Protocol
   *
   * Withdraws accumulated earnings (sales + royalties) to creator wallet.
   *
   * @returns Withdrawal amount and transaction hash
   * @throws {CreatorMonetizationError} If withdrawal fails
   *
   * @example
   * ```typescript
   * const result = await creator.withdrawEarnings();
   * console.log(`Withdrew ${result.amount} ETH`);
   * ```
   */
  async withdrawEarnings(): Promise<{ amount: number; txHash: string }> {
    this.ensureInitialized();

    // Withdrawal via Zora Protocol is planned — use Zora dashboard in the meantime.
    throw new CreatorMonetizationError('Withdrawal not yet implemented', 'NOT_IMPLEMENTED', {
      message: 'Use Zora dashboard to withdraw earnings',
      dashboardUrl: 'https://zora.co/dashboard',
    });

    // Future implementation:
    /*
    const walletClient = this.wallet.getWalletClient();
    const publicClient = this.wallet.getPublicClient();

    // Query total withdrawable amount
    const earnings = await this.getWithdrawableEarnings();

    // Execute withdrawal transaction
    const txHash = await this.executeWithdrawal(earnings);

    return {
      amount: parseFloat(formatEther(earnings)),
      txHash
    };
    */
  }

  /**
   * Calculate revenue sharing breakdown for a sale
   *
   * Splits sale amount according to configured revenue sharing percentages:
   * - Default: 80% artist, 10% platform, 10% AI agent
   *
   * @param saleAmount - Sale amount in ETH
   * @returns Revenue breakdown
   *
   * @example
   * ```typescript
   * const breakdown = await creator.revenueSharing(0.1);
   * console.log(`Artist: ${breakdown.artistShare} ETH`);
   * console.log(`Platform: ${breakdown.platformShare} ETH`);
   * ```
   */
  async revenueSharing(saleAmount: number): Promise<RevenueBreakdown> {
    const sharing = this.options.revenueSharing!;

    const artistShare = (saleAmount * sharing.artist) / 100;
    const platformShare = (saleAmount * sharing.platform) / 100;
    const aiAgentShare = sharing.aiAgent ? (saleAmount * sharing.aiAgent) / 100 : 0;

    return {
      totalAmount: saleAmount,
      artistShare,
      platformShare,
      aiAgentShare,
      artistPercentage: sharing.artist,
      platformPercentage: sharing.platform,
      aiAgentPercentage: sharing.aiAgent,
    };
  }

  // ===========================================================================
  // PRICING ESTIMATES
  // ===========================================================================

  /**
   * Get pricing estimate for minting
   *
   * Calculates gas costs and total minting cost.
   *
   * @param quantity - Number of tokens to mint
   * @param collectionAddress - Collection contract address
   * @returns Pricing estimate
   *
   * @example
   * ```typescript
   * const estimate = await creator.getPricingEstimate(1, '0x123...');
   * console.log(`Total cost: ${estimate.totalCostETH}`);
   * ```
   */
  async getPricingEstimate(
    quantity: number,
    collectionAddress?: Address
  ): Promise<PricingEstimate> {
    const contractAddress = collectionAddress || this.getDefaultCollectionAddress();
    const publicClient = this.wallet.getPublicClient();

    const gasEstimate = await GasEstimator.estimateMintGas(
      publicClient,
      contractAddress,
      BigInt(quantity)
    );

    const formatted = GasEstimator.formatEstimate(gasEstimate);

    return {
      gasCostETH: formatted.totalGasCostETH,
      gasCostUSD: 0, // ETH→USD conversion requires a price oracle (e.g. CoinGecko API)
      mintFeeETH: formatted.mintFeeETH,
      totalCostETH: formatted.totalCostETH,
      totalCostUSD: 0, // ETH→USD conversion requires a price oracle (e.g. CoinGecko API)
    };
  }

  // ===========================================================================
  // TRANSACTION MONITORING
  // ===========================================================================

  /**
   * Get transaction status
   *
   * @param txHash - Transaction hash
   * @returns Transaction status
   */
  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    const publicClient = this.wallet.getPublicClient();

    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash as Hex,
      });

      return {
        txHash,
        status: receipt.status === 'success' ? 'confirmed' : 'failed',
        blockNumber: Number(receipt.blockNumber),
        confirmations: 1,
        gasUsed: receipt.gasUsed.toString(),
        timestamp: Date.now(),
      };
    } catch (_error) {
      // Transaction not yet confirmed
      return {
        txHash,
        status: 'pending',
        timestamp: Date.now(),
      };
    }
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Ensure service is initialized
   * @private
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.wallet.isConnected()) {
      throw new CreatorMonetizationError(
        'CreatorMonetization not initialized. Wallet connection required.',
        'NOT_INITIALIZED'
      );
    }
  }

  /**
   * Get chain type for WalletConnection
   * @private
   */
  private getChainType(network: Network): 'base' | 'base-testnet' {
    return network === 'base' ? 'base' : 'base-testnet';
  }

  /**
   * Get chain name for Zora URLs
   * @private
   */
  private getChainName(network: Network): string {
    const names: Record<Network, string> = {
      base: 'base',
      'base-testnet': 'base-goerli',
      ethereum: 'eth',
      zora: 'zora',
    };
    return names[network];
  }

  /**
   * Get default collection address
   * @private
   */
  private getDefaultCollectionAddress(): Address {
    const envAddress = process.env.HOLOSCRIPT_COLLECTION_ADDRESS;
    if (envAddress) {
      return envAddress as Address;
    }
    throw new CreatorMonetizationError(
      'Collection address required. Set HOLOSCRIPT_COLLECTION_ADDRESS env var, provide collectionAddress in mintNFT options, or deploy via: pnpm tsx scripts/deploy-protocol-collection.ts',
      'COLLECTION_REQUIRED'
    );
  }

  /**
   * Execute Zora API call
   * @private
   */
  private async executeZoraApiCall<T>(url: string): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.options.zoraApiKey) {
      headers['Authorization'] = `Bearer ${this.options.zoraApiKey}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      throw new ZoraAPIError(
        (errorData.message as string) || `Zora API request failed: ${response.status}`,
        response.status
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get wallet connection instance
   */
  getWallet(): WalletConnection {
    return this.wallet;
  }

  /**
   * Get configuration options
   */
  getOptions(): CreatorMonetizationOptions {
    return { ...this.options };
  }

  /**
   * Get CIDs returned by successful IPFS uploads in this service instance.
   */
  getIPFSUploadRecords(): IPFSUploadRecord[] {
    return this.ipfsUploadRecords.map((record) => ({ ...record }));
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.wallet.isConnected();
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default CreatorMonetization;

export {
  // Re-export types
  type CreatorMonetizationOptions,
  type NFTMetadata,
  type MintNFTOptions,
  type MintResult,
  type Collection,
  type CreatorStats,
  type RevenueBreakdown,
  type VRRTwinData,
  type IPFSUploadResult,
  type IPFSUploadRecord,
  type PricingEstimate,
  type TransactionStatus,
  // Re-export errors
  CreatorMonetizationError,
  InsufficientBalanceError,
  IPFSUploadError,
  ZoraAPIError,
};
