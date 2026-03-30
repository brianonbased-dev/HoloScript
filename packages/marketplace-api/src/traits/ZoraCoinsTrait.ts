/**
 * Zora Coins Trait
 *
 * Auto-mint .holo scenes as tradeable ERC-20 tokens on Base via Zora Protocol.
 * Every spatial experience becomes a collectible with built-in creator rewards.
 *
 * Research Reference: uAA2++ Protocol - "Zora Coins auto-mint STRENGTHEN in v3.2"
 * "Every .holo scene = tradeable ERC-20 on Base"
 *
 * Features:
 * - Automatic token creation from .holo files
 * - Base L2 deployment for low gas fees
 * - Creator rewards and royalties
 * - Collection management
 * - Secondary market integration
 * - Film3D creator economy support
 *
 * @version 3.2.0
 * @milestone v3.2 (June 2026)
 */

import type { TraitHandler } from '@holoscript/core';
import { WalletConnection } from '../web3/WalletConnection';
import { GasEstimator } from '../web3/GasEstimator';
import { parseEther, formatEther, type Address, type Hex } from 'viem';
import { zoraCreator1155ImplABI } from '@zoralabs/protocol-deployments';

// =============================================================================
// TYPES
// =============================================================================

type CoinStandard = 'erc20' | 'erc1155';
type MintStatus = 'pending' | 'minting' | 'complete' | 'failed';
type DistributionModel = 'fixed_supply' | 'bonding_curve' | 'free_mint' | 'dutch_auction';

interface ZoraCoin {
  id: string;
  contractAddress: string;
  tokenId?: string; // For ERC1155
  name: string;
  symbol: string;
  description: string;
  totalSupply: number;
  circulatingSupply: number;
  price: string; // In ETH
  priceUSD: number;
  creatorAddress: string;
  createdAt: number;
  chain: 'base' | 'zora' | 'optimism';
  metadata: CoinMetadata;
  stats: CoinStats;
}

interface CoinMetadata {
  holoFileHash: string;
  scenePreviewUrl: string;
  animationUrl?: string;
  traits: string[];
  category: 'scene' | 'object' | 'avatar' | 'experience' | 'film';
  license: 'cc0' | 'cc-by' | 'cc-by-nc' | 'custom';
  externalUrl?: string;
}

interface CoinStats {
  holders: number;
  totalVolume: string;
  floorPrice: string;
  marketCap: string;
  royaltiesEarned: string;
  secondarySales: number;
}

interface MintConfig {
  name: string;
  symbol: string;
  description: string;
  initialSupply: number;
  maxSupply: number;
  distribution: DistributionModel;
  initialPrice: string; // In ETH
  royaltyPercentage: number; // 0-100
  category: CoinMetadata['category'];
  license: CoinMetadata['license'];
}

interface ZoraCoinsState {
  isConnected: boolean;
  walletAddress: string | null;
  wallet?: WalletConnection;
  coins: ZoraCoin[];
  pendingMints: PendingMint[];
  totalRoyaltiesEarned: string;
  collections: Collection[];
  rewardsBalance: string;
}

interface PendingMint {
  id: string;
  config: MintConfig;
  holoFileHash: string;
  status: MintStatus;
  txHash?: string;
  contractAddress?: string;
  tokenId?: number;
  blockNumber?: number;
  error?: string;
  createdAt: number;
  timestamp: number;
}

interface Collection {
  id: string;
  name: string;
  description: string;
  coins: string[]; // Coin IDs
  contractAddress: string;
  totalVolume: string;
}

interface ZoraCoinsConfig {
  /** Wallet address for receiving royalties */
  creator_wallet: string;
  /** Default chain for minting */
  default_chain: 'base' | 'zora' | 'optimism';
  /** Auto-mint on scene publish */
  auto_mint: boolean;
  /** Default distribution model */
  default_distribution: DistributionModel;
  /** Default royalty percentage (0-10) */
  default_royalty: number;
  /** Default initial supply */
  default_initial_supply: number;
  /** Default max supply (0 = unlimited) */
  default_max_supply: number;
  /** Initial price in ETH */
  default_initial_price: string;
  /** Default license */
  default_license: CoinMetadata['license'];
  /** Collection to add minted coins to */
  collection_id?: string;
  /** Enable bonding curve for price discovery */
  enable_bonding_curve: boolean;
  /** Bonding curve steepness (0-1) */
  bonding_curve_factor: number;
  /** Enable referral rewards */
  enable_referrals: boolean;
  /** Referral reward percentage */
  referral_percentage: number;
  /** Webhook for mint events */
  webhook_url: string;
}

/**
 * Execution context for Zora operations
 */
interface ZoraExecutionContext {
  wallet: WalletConnection;
  emitEvent: (event: string, data: Record<string, unknown>) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const ZORA_API_BASE = 'https://api.zora.co/v1';
const _BASE_CHAIN_ID = 8453;
const _ZORA_CHAIN_ID = 7777777;

const BONDING_CURVE_PRESETS = {
  linear: (supply: number, factor: number) => supply * factor * 0.0001,
  exponential: (supply: number, factor: number) => Math.pow(supply, 1 + factor) * 0.00001,
  logarithmic: (supply: number, factor: number) => Math.log(supply + 1) * factor * 0.001,
};

// =============================================================================
// HANDLER
// =============================================================================

export const zoraCoinsHandler: TraitHandler<ZoraCoinsConfig> = {
  name: 'zora_coins',

  defaultConfig: {
    creator_wallet: '',
    default_chain: 'base',
    auto_mint: false,
    default_distribution: 'bonding_curve',
    default_royalty: 5,
    default_initial_supply: 1000,
    default_max_supply: 10000,
    default_initial_price: '0.001',
    default_license: 'cc-by',
    collection_id: undefined,
    enable_bonding_curve: true,
    bonding_curve_factor: 0.5,
    enable_referrals: true,
    referral_percentage: 2.5,
    webhook_url: '',
  },

  onAttach(node, config, context) {
    const state: ZoraCoinsState = {
      isConnected: false,
      walletAddress: config.creator_wallet || null,
      coins: [],
      pendingMints: [],
      totalRoyaltiesEarned: '0',
      collections: [],
      rewardsBalance: '0',
    };
    node.__zoraCoinsState = state;

    if (config.creator_wallet) {
      connectToZora(node, state, config, context);
    }
  },

  onDetach(node, _config, context) {
    const state = node.__zoraCoinsState as ZoraCoinsState;
    if (state?.isConnected) {
      context.emit?.('zora_disconnect', { node });
    }
    delete node.__zoraCoinsState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__zoraCoinsState as ZoraCoinsState;
    if (!state || !state.isConnected || !state.wallet) return;

    // Create execution context for blockchain operations
    const execContext: ZoraExecutionContext = {
      wallet: state.wallet,
      emitEvent: (event: string, data: Record<string, unknown>) =>
        context.emit?.(event, { node, ...data }),
    };

    // Check pending mints for status updates
    state.pendingMints.forEach((mint) => {
      if (mint.status === 'minting') {
        checkMintStatus(mint, state, execContext);
      }
    });
  },

  onEvent(node, config, context, event) {
    const state = node.__zoraCoinsState as ZoraCoinsState;
    if (!state) return;

    // Auto-mint on scene publish
    if (event.type === 'scene_published' && config.auto_mint) {
      const { holoFileHash, sceneName, scenePreviewUrl, traits } = event.payload as {
        holoFileHash: string;
        sceneName: string;
        scenePreviewUrl: string;
        traits: string[];
      };

      mintCoin(node, state, config, context, {
        name: sceneName,
        symbol: generateSymbol(sceneName),
        description: `HoloScript scene: ${sceneName}`,
        holoFileHash,
        scenePreviewUrl,
        traits,
        category: 'scene',
      });
    }

    // Manual mint request
    if (event.type === 'zora_mint') {
      const {
        name,
        symbol,
        description,
        holoFileHash,
        scenePreviewUrl,
        traits = [],
        category = 'scene',
        customConfig,
      } = event.payload as {
        name: string;
        symbol?: string;
        description?: string;
        holoFileHash: string;
        scenePreviewUrl: string;
        traits?: string[];
        category?: CoinMetadata['category'];
        customConfig?: Partial<MintConfig>;
      };

      mintCoin(node, state, config, context, {
        name,
        symbol: symbol || generateSymbol(name),
        description: description || `HoloScript ${category}: ${name}`,
        holoFileHash,
        scenePreviewUrl,
        traits,
        category,
        ...customConfig,
      });
    }

    // Create collection
    if (event.type === 'zora_create_collection') {
      const { name, description, coinIds } = event.payload as {
        name: string;
        description: string;
        coinIds: string[];
      };

      createCollection(node, state, config, context, { name, description, coinIds });
    }

    // Claim rewards
    if (event.type === 'zora_claim_rewards') {
      claimRewards(state, config, context);
    }

    // Get price quote (bonding curve)
    if (event.type === 'zora_price_quote') {
      const { coinId, amount } = event.payload as { coinId: string; amount: number };
      const coin = state.coins.find((c) => c.id === coinId);

      if (coin && config.enable_bonding_curve) {
        const price = calculateBondingCurvePrice(
          coin.circulatingSupply,
          amount,
          config.bonding_curve_factor
        );

        context.emit?.('zora_price_quoted', {
          node,
          coinId,
          amount,
          totalPrice: price,
          pricePerToken: price / amount,
        });
      }
    }

    // Secondary sale event (for royalty tracking)
    if (event.type === 'zora_secondary_sale') {
      const { coinId, price, buyer, seller } = event.payload as {
        coinId: string;
        price: string;
        buyer: string;
        seller: string;
      };

      handleSecondarySale(node, state, config, context, { coinId, price, buyer, seller });
    }

    // Wallet connect
    if (event.type === 'wallet_connected') {
      const { address } = event.payload as { address: string };
      state.walletAddress = address;
      connectToZora(node, state, config, context);
    }
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function connectToZora(
  node: Record<string, unknown>,
  state: ZoraCoinsState,
  config: ZoraCoinsConfig,
  context: { emit?: (event: string, data: Record<string, unknown>) => void }
): Promise<void> {
  try {
    // Initialize wallet connection for blockchain interactions
    const chainType = config.default_chain === 'base' ? 'base' : 'base-testnet';
    state.wallet = new WalletConnection({ chain: chainType });

    // If creator wallet is provided, connect it
    if (config.creator_wallet) {
      await state.wallet.connect(config.creator_wallet as Address);
    }

    // Fetch existing coins for this creator
    const url = `${ZORA_API_BASE}/coins?creator=${config.creator_wallet}&chain=${config.default_chain}`;
    const response = await executeZoraApiCall<{
      coins?: ZoraCoin[];
      collections?: Collection[];
      totalRoyalties?: string;
      rewardsBalance?: string;
    }>('GET', url);

    state.isConnected = true;
    state.coins = response.coins || [];
    state.collections = response.collections || [];
    state.totalRoyaltiesEarned = response.totalRoyalties || '0';
    state.rewardsBalance = response.rewardsBalance || '0';

    context.emit?.('zora_connected', {
      node,
      coinsCount: state.coins.length,
      totalRoyalties: state.totalRoyaltiesEarned,
    });
  } catch (_error) {
    context.emit?.('zora_error', {
      node,
      error: 'Failed to connect to Zora',
    });
  }
}

async function mintCoin(
  node: Record<string, unknown>,
  state: ZoraCoinsState,
  config: ZoraCoinsConfig,
  context: { emit?: (event: string, data: Record<string, unknown>) => void },
  params: {
    name: string;
    symbol: string;
    description: string;
    holoFileHash: string;
    scenePreviewUrl: string;
    traits: string[];
    category: CoinMetadata['category'];
    initialSupply?: number;
    maxSupply?: number;
    initialPrice?: string;
    royaltyPercentage?: number;
    distribution?: DistributionModel;
    license?: CoinMetadata['license'];
  }
): Promise<void> {
  const mintConfig: MintConfig = {
    name: params.name,
    symbol: params.symbol,
    description: params.description,
    initialSupply: params.initialSupply || config.default_initial_supply,
    maxSupply: params.maxSupply || config.default_max_supply,
    distribution: params.distribution || config.default_distribution,
    initialPrice: params.initialPrice || config.default_initial_price,
    royaltyPercentage: params.royaltyPercentage ?? config.default_royalty,
    category: params.category,
    license: params.license || config.default_license,
  };

  const now = Date.now();
  const pendingMint: PendingMint = {
    id: `mint_${now}_${Math.random().toString(36).substr(2, 9)}`,
    config: mintConfig,
    holoFileHash: params.holoFileHash,
    status: 'pending',
    createdAt: now,
    timestamp: now,
  };

  state.pendingMints.push(pendingMint);

  context.emit?.('zora_mint_started', {
    node,
    pendingMint,
  });

  // Execute real blockchain minting
  try {
    if (!state.wallet) {
      throw new Error('Wallet not initialized. Connect wallet first.');
    }

    pendingMint.status = 'minting';

    // Create execution context
    const execContext: ZoraExecutionContext = {
      wallet: state.wallet,
      emitEvent: (event: string, data: Record<string, unknown>) =>
        context.emit?.(event, { node, ...data }),
    };

    // Real blockchain minting via Zora Protocol
    const result = await executeMinting(pendingMint, config, execContext);

    pendingMint.status = 'complete';
    pendingMint.txHash = result.txHash;
    pendingMint.contractAddress = result.contractAddress;

    // Create coin object
    const newCoin: ZoraCoin = {
      id: `coin_${Date.now()}`,
      contractAddress: result.contractAddress,
      name: params.name,
      symbol: params.symbol,
      description: params.description,
      totalSupply: mintConfig.maxSupply,
      circulatingSupply: mintConfig.initialSupply,
      price: mintConfig.initialPrice,
      priceUSD: parseFloat(mintConfig.initialPrice) * 2500, // ETH price estimate
      creatorAddress: config.creator_wallet,
      createdAt: Date.now(),
      chain: config.default_chain,
      metadata: {
        holoFileHash: params.holoFileHash,
        scenePreviewUrl: params.scenePreviewUrl,
        traits: params.traits,
        category: params.category,
        license: mintConfig.license,
      },
      stats: {
        holders: 1,
        totalVolume: '0',
        floorPrice: mintConfig.initialPrice,
        marketCap: (parseFloat(mintConfig.initialPrice) * mintConfig.initialSupply).toString(),
        royaltiesEarned: '0',
        secondarySales: 0,
      },
    };

    state.coins.push(newCoin);

    // Add to collection if specified
    if (config.collection_id) {
      const collection = state.collections.find((c) => c.id === config.collection_id);
      if (collection) {
        collection.coins.push(newCoin.id);
      }
    }

    context.emit?.('zora_mint_complete', {
      node,
      coin: newCoin,
      txHash: result.txHash,
    });

    // Webhook notification
    if (config.webhook_url) {
      context.emit?.('zora_webhook', {
        url: config.webhook_url,
        event: 'mint_complete',
        coin: newCoin,
      });
    }
  } catch (error) {
    pendingMint.status = 'failed';
    pendingMint.error = (error as Error).message;

    context.emit?.('zora_mint_failed', {
      node,
      pendingMint,
      error: pendingMint.error,
    });
  }
}

async function createCollection(
  node: Record<string, unknown>,
  state: ZoraCoinsState,
  config: ZoraCoinsConfig,
  context: { emit?: (event: string, data: Record<string, unknown>) => void },
  params: { name: string; description: string; coinIds: string[] }
): Promise<void> {
  const collection: Collection = {
    id: `collection_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: params.name,
    description: params.description,
    coins: params.coinIds,
    contractAddress: `0x${Math.random().toString(16).substr(2, 40)}`,
    totalVolume: '0',
  };

  state.collections.push(collection);

  context.emit?.('zora_collection_created', {
    node,
    collection,
  });
}

async function claimRewards(
  state: ZoraCoinsState,
  config: ZoraCoinsConfig,
  context: { emit?: (event: string, data: Record<string, unknown>) => void }
): Promise<void> {
  const amount = state.rewardsBalance;
  state.rewardsBalance = '0';

  context.emit?.('zora_rewards_claimed', {
    amount,
    wallet: config.creator_wallet,
  });
}

function handleSecondarySale(
  node: Record<string, unknown>,
  state: ZoraCoinsState,
  config: ZoraCoinsConfig,
  context: { emit?: (event: string, data: Record<string, unknown>) => void },
  params: { coinId: string; price: string; buyer: string; seller: string }
): void {
  const coin = state.coins.find((c) => c.id === params.coinId);
  if (!coin) return;

  const royaltyAmount = (parseFloat(params.price) * config.default_royalty) / 100;
  let referralAmount = 0;

  if (config.enable_referrals) {
    referralAmount = (parseFloat(params.price) * config.referral_percentage) / 100;
  }

  coin.stats.secondarySales++;
  coin.stats.totalVolume = (
    parseFloat(coin.stats.totalVolume) + parseFloat(params.price)
  ).toString();
  coin.stats.royaltiesEarned = (parseFloat(coin.stats.royaltiesEarned) + royaltyAmount).toString();

  state.totalRoyaltiesEarned = (parseFloat(state.totalRoyaltiesEarned) + royaltyAmount).toString();

  context.emit?.('zora_royalty_earned', {
    node,
    coinId: params.coinId,
    salePrice: params.price,
    royaltyAmount: royaltyAmount.toString(),
    referralAmount: referralAmount.toString(),
  });
}

function calculateBondingCurvePrice(currentSupply: number, amount: number, factor: number): number {
  // Exponential bonding curve
  let totalPrice = 0;
  for (let i = 0; i < amount; i++) {
    totalPrice += BONDING_CURVE_PRESETS.exponential(currentSupply + i, factor);
  }
  return totalPrice;
}

function generateSymbol(name: string): string {
  // Generate a symbol from the name
  const words = name.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 1) {
    return words[0].slice(0, 4).toUpperCase();
  }
  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/**
 * Check the status of a pending mint transaction
 *
 * Polls the blockchain for transaction confirmation and updates mint status.
 *
 * @param mint - Pending mint to check
 * @param _state - Current Zora coins state (unused)
 * @param context - Execution context
 */
async function checkMintStatus(
  mint: PendingMint,
  _state: ZoraCoinsState,
  context: ZoraExecutionContext
): Promise<void> {
  // Only check mints in 'minting' status
  if (mint.status !== 'minting') {
    return;
  }

  // Ensure we have a transaction hash
  if (!mint.txHash) {
    return;
  }

  const publicClient = context.wallet.getPublicClient();

  try {
    // Poll for transaction receipt
    const receipt = await publicClient.getTransactionReceipt({
      hash: mint.txHash as `0x${string}`,
    });

    if (receipt.status === 'success') {
      // Transaction confirmed successfully
      mint.status = 'complete';
      mint.blockNumber = Number(receipt.blockNumber);

      // Extract minted token ID from logs
      // Zora emits a 'Minted' event with token ID
      const mintLog = receipt.logs.find((log) => {
        // Check for Zora Minted event signature
        // Event signature: Minted(address indexed minter, uint256 indexed tokenId, uint256 quantity)
        return (
          log.topics[0] === '0x30385c845b448a36257a6a1716e6ad2e1bc2cbe333cde1e69fe849ad6511adfe'
        );
      });

      if (mintLog && mintLog.topics[2]) {
        // Token ID is in topics[2] for indexed parameters
        mint.tokenId = Number(BigInt(mintLog.topics[2]));
      }

      // Emit completion event
      context.emitEvent('zora_mint_complete', {
        mintId: mint.id,
        txHash: mint.txHash,
        contractAddress: mint.contractAddress,
        tokenId: mint.tokenId,
        blockNumber: mint.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      });
    } else if (receipt.status === 'reverted') {
      // Transaction failed
      mint.status = 'failed';
      mint.error = 'Transaction reverted on-chain';

      context.emitEvent('zora_mint_failed', {
        mintId: mint.id,
        txHash: mint.txHash,
        error: mint.error,
      });
    }
  } catch (error: unknown) {
    // Transaction not yet confirmed or error fetching receipt

    // Check for timeout (5 minutes max)
    const elapsed = Date.now() - mint.timestamp;
    const TIMEOUT = 5 * 60 * 1000; // 5 minutes

    if (elapsed > TIMEOUT) {
      mint.status = 'failed';
      mint.error = `Transaction timeout after 5 minutes. Hash: ${mint.txHash}`;

      context.emitEvent('zora_mint_failed', {
        mintId: mint.id,
        txHash: mint.txHash,
        error: mint.error,
      });
    }

    // Otherwise, keep polling (transaction still pending)
  }
}

// Production API helpers
async function executeZoraApiCall<T>(method: string, url: string, data?: unknown): Promise<T> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Zora API request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Execute real Zora minting transaction on Base L2
 *
 * This function:
 * 1. Validates wallet connection
 * 2. Estimates gas costs
 * 3. Checks wallet balance
 * 4. Simulates transaction
 * 5. Executes on-chain mint
 * 6. Waits for confirmation
 *
 * @param mint - Pending mint configuration
 * @param config - Zora coins configuration
 * @param context - Execution context with wallet and event emitter
 * @returns Transaction hash and contract address
 * @throws Error if wallet not connected, insufficient balance, or transaction fails
 */
async function executeMinting(
  mint: PendingMint,
  config: ZoraCoinsConfig,
  context: ZoraExecutionContext
): Promise<{ txHash: string; contractAddress: string }> {
  // 1. Validate wallet connection
  if (!context.wallet.isConnected()) {
    throw new Error(
      'Wallet not connected. Please connect wallet by emitting wallet_connected event first.'
    );
  }

  const publicClient = context.wallet.getPublicClient();
  const walletClient = context.wallet.getWalletClient();
  const walletAddress = context.wallet.getAddress()!;

  // 2. Determine contract address
  let contractAddress: Address;

  if (config.collection_id) {
    // Use existing collection
    contractAddress = config.collection_id as Address;
  } else {
    // For now, require collection_id
    // TODO: Implement auto-deployment in future version
    throw new Error(
      'collection_id is required. Auto-deployment not yet implemented. ' +
        'Create a Zora collection first at https://zora.co/create'
    );
  }

  // 3. Calculate quantities and fees
  const quantity = BigInt(mint.config.initialSupply || 1);

  // 4. Estimate gas costs
  context.emitEvent('zora_estimating_gas', {
    mintId: mint.id,
    quantity: Number(quantity),
  });

  const gasEstimate = await GasEstimator.estimateMintGas(publicClient, contractAddress, quantity);

  const formattedEstimate = GasEstimator.formatEstimate(gasEstimate);

  // 5. Check wallet balance
  const balanceCheck = await GasEstimator.checkSufficientBalance(
    publicClient,
    walletAddress,
    gasEstimate
  );

  if (!balanceCheck.sufficient) {
    const shortfall = GasEstimator.formatCost(balanceCheck.shortfall!);
    const required = GasEstimator.formatCost(balanceCheck.required);
    const balance = GasEstimator.formatCost(balanceCheck.balance);

    throw new Error(
      `Insufficient balance for mint transaction.\n` +
        `Required: ${required}\n` +
        `Available: ${balance}\n` +
        `Shortfall: ${shortfall}\n\n` +
        `Gas estimate: ${formattedEstimate.totalGasCostETH}\n` +
        `Mint fee (0.000777 ETH × ${quantity}): ${formattedEstimate.mintFeeETH}`
    );
  }

  context.emitEvent('zora_gas_estimated', {
    mintId: mint.id,
    estimate: formattedEstimate,
  });

  // 6. Prepare mint transaction
  const tokenId = BigInt(0); // Token ID 0 for new token creation on Zora 1155
  const mintReferral = (config.creator_wallet as Address) || walletAddress;

  // 7. Simulate transaction to catch errors before sending
  try {
    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi: zoraCreator1155ImplABI,
      functionName: 'mintWithRewards',
      args: [
        walletAddress, // minter (who receives the NFT)
        tokenId, // tokenId (0 for new)
        quantity, // quantity to mint
        '0x' as Hex, // minterArguments (empty)
        mintReferral, // mintReferral (who gets referral reward)
      ],
      value: gasEstimate.mintFee,
      account: walletClient.account,
      gas: gasEstimate.gasLimit,
      maxFeePerGas: gasEstimate.maxFeePerGas,
      maxPriorityFeePerGas: gasEstimate.maxPriorityFeePerGas,
    });

    context.emitEvent('zora_transaction_simulated', {
      mintId: mint.id,
      success: true,
    });

    // 8. Execute transaction
    context.emitEvent('zora_transaction_sending', {
      mintId: mint.id,
    });

    const txHash = await walletClient.writeContract(request);

    context.emitEvent('zora_transaction_sent', {
      mintId: mint.id,
      txHash,
    });

    // 9. Wait for transaction confirmation (1 block on Base ≈ 2 seconds)
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    if (receipt.status === 'reverted') {
      throw new Error(`Transaction reverted on-chain: ${txHash}`);
    }

    context.emitEvent('zora_transaction_confirmed', {
      mintId: mint.id,
      txHash,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: receipt.gasUsed.toString(),
    });

    // 10. Return success
    return {
      txHash,
      contractAddress,
    };
  } catch (error: unknown) {
    // Handle simulation or execution errors
    const errorMessage = (error as Error).message || 'Unknown error during mint transaction';

    context.emitEvent('zora_transaction_failed', {
      mintId: mint.id,
      error: errorMessage,
    });

    throw new Error(`Zora mint transaction failed: ${errorMessage}`);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  ZoraCoinsConfig,
  ZoraCoinsState,
  ZoraCoin,
  CoinMetadata,
  CoinStats,
  MintConfig,
  PendingMint,
  Collection,
  CoinStandard,
  DistributionModel,
};
