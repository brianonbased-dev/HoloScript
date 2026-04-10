/**
 * ZoraCoinsTrait v3.2 Production Tests
 *
 * Comprehensive test suite for the Zora Coins integration trait.
 * Covers wallet connection, minting lifecycle, bonding curves,
 * collections, royalties, referrals, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { zoraCoinsHandler } from '../ZoraCoinsTrait';

// =============================================================================
// MOCKS
// =============================================================================

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock viem — these must exist before the module tries to import them
vi.mock('viem', () => ({
  parseEther: (val: string) => BigInt(Math.floor(parseFloat(val) * 1e18)),
  formatEther: (val: bigint) => (Number(val) / 1e18).toString(),
}));

vi.mock('@zoralabs/protocol-deployments', () => ({
  zoraCreator1155ImplABI: [],
}));

vi.mock('../../web3/WalletConnection', () => ({
  WalletConnection: class MockWallet {
    connect = vi.fn();
    isConnected = () => true;
    getAddress = () => '0xCreator123';
    getPublicClient = () => ({
      getTransactionReceipt: vi.fn(),
      simulateContract: vi.fn(),
      readContract: vi.fn(),
    });
    getWalletClient = () => ({
      writeContract: vi.fn(() => '0xtxhash123'),
    });
  },
}));

vi.mock('../../web3/GasEstimator', () => ({
  GasEstimator: class MockGasEstimator {
    static estimateMintGas = vi.fn();
    static formatEstimate = vi.fn();
    static checkSufficientBalance = vi.fn();
    static formatCost = vi.fn();
  },
}));

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'node-1') {
  return { id } as any;
}

function makeConfig(overrides: Partial<Parameters<typeof zoraCoinsHandler.onAttach>[1]> = {}) {
  return { ...zoraCoinsHandler.defaultConfig, ...overrides };
}

function makeContext() {
  return { emit: vi.fn() };
}

/**
 * Attach the trait and wait for the async Zora connection to complete.
 * We resolve the fetch mock before attach so the internal connect finishes promptly.
 */
async function attachConnected(
  node: any,
  config: ReturnType<typeof makeConfig>,
  ctx: ReturnType<typeof makeContext>,
  coinsData: any[] = [],
  extraResp: Record<string, any> = {}
) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        coins: coinsData,
        collections: [],
        totalRoyalties: '0',
        rewardsBalance: '0',
        ...extraResp,
      }),
  });

  zoraCoinsHandler.onAttach(node, config, ctx);

  // The connection is async — wait for it via polling
  await vi.waitFor(
    () => {
      const state = (node as any).__zoraCoinsState;
      if (!state.isConnected) throw new Error('not yet');
    },
    { timeout: 2000, interval: 50 }
  );
}

/**
 * Attach trait WITHOUT triggering the async Zora connect
 * (creator_wallet is empty so connectToZora is not called).
 * Then manually set connected state for tests that need it.
 */
function attachLocal(node: any, ctx: ReturnType<typeof makeContext>) {
  const localConfig = makeConfig({ creator_wallet: '' });
  zoraCoinsHandler.onAttach(node, localConfig, ctx);
  return localConfig;
}

function setConnectedState(node: any, coins: any[] = []) {
  const state = (node as any).__zoraCoinsState;
  state.isConnected = true;
  state.coins = coins;
  state.wallet = {
    connect: vi.fn(),
    isConnected: () => true,
    getAddress: () => '0xCreator123',
    getPublicClient: () => ({
      getTransactionReceipt: vi.fn(),
      simulateContract: vi.fn(),
    }),
    getWalletClient: () => ({
      writeContract: vi.fn(() => '0xtxhash123'),
    }),
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('ZoraCoinsTrait — v3.2 Production', () => {
  let node: any;
  let config: ReturnType<typeof makeConfig>;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig({ creator_wallet: '0xCreator123' });
    ctx = makeContext();
  });

  afterEach(() => {
    delete (node as any).__zoraCoinsState;
  });

  // ======== CONSTRUCTION & DEFAULTS ========

  describe('construction & defaults', () => {
    it('initializes state on attach without wallet', () => {
      const localConfig = attachLocal(node, ctx);
      const state = (node as any).__zoraCoinsState;

      expect(state).toBeDefined();
      expect(state.isConnected).toBe(false);
      expect(state.walletAddress).toBeNull();
      expect(state.coins).toEqual([]);
      expect(state.pendingMints).toEqual([]);
      expect(state.collections).toEqual([]);
      expect(state.rewardsBalance).toBe('0');
    });

    it('stores creator_wallet as walletAddress', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ coins: [], collections: [] }),
      });
      zoraCoinsHandler.onAttach(node, config, ctx);
      expect((node as any).__zoraCoinsState.walletAddress).toBe('0xCreator123');
    });

    it('has sensible default config values', () => {
      const d = zoraCoinsHandler.defaultConfig;
      expect(d.default_chain).toBe('base');
      expect(d.auto_mint).toBe(false);
      expect(d.default_distribution).toBe('bonding_curve');
      expect(d.default_royalty).toBe(5);
      expect(d.default_initial_supply).toBe(1000);
      expect(d.default_max_supply).toBe(10000);
      expect(d.default_initial_price).toBe('0.001');
      expect(d.default_license).toBe('cc-by');
      expect(d.enable_bonding_curve).toBe(true);
      expect(d.bonding_curve_factor).toBe(0.5);
      expect(d.enable_referrals).toBe(true);
      expect(d.referral_percentage).toBe(2.5);
      expect(d.webhook_url).toBe('');
    });

    it('handler name is zora_coins', () => {
      expect(zoraCoinsHandler.name).toBe('zora_coins');
    });

    it('calls fetch to connect when creator_wallet is set', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ coins: [], collections: [] }),
      });
      zoraCoinsHandler.onAttach(node, config, ctx);
      // connectToZora is async — wait for fetch to be called
      await vi.waitFor(
        () => {
          if (mockFetch.mock.calls.length < 1) throw new Error('not yet');
        },
        { timeout: 2000 }
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not call fetch when creator_wallet is empty', () => {
      attachLocal(node, ctx);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ======== ASYNC CONNECTION ========

  describe('async connection', () => {
    it('connects and populates coins on success', async () => {
      await attachConnected(node, config, ctx, [{ id: 'c1', name: 'Coin1' }], {
        totalRoyalties: '2.5',
        rewardsBalance: '0.25',
      });

      const state = (node as any).__zoraCoinsState;
      expect(state.isConnected).toBe(true);
      expect(state.coins).toHaveLength(1);
      expect(state.totalRoyaltiesEarned).toBe('2.5');
      expect(state.rewardsBalance).toBe('0.25');
    });

    it('emits zora_connected after successful connection', async () => {
      await attachConnected(node, config, ctx);
      expect(ctx.emit).toHaveBeenCalledWith(
        'zora_connected',
        expect.objectContaining({ node, coinsCount: 0 })
      );
    });

    it('emits zora_error on connection failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      zoraCoinsHandler.onAttach(node, config, ctx);

      await vi.waitFor(
        () => {
          expect(ctx.emit).toHaveBeenCalledWith(
            'zora_error',
            expect.objectContaining({ error: 'Failed to connect to Zora' })
          );
        },
        { timeout: 2000 }
      );
    });
  });

  // ======== DETACH ========

  describe('detach', () => {
    it('emits zora_disconnect and clears state when connected', async () => {
      await attachConnected(node, config, ctx);
      zoraCoinsHandler.onDetach!(node, config, ctx);

      expect(ctx.emit).toHaveBeenCalledWith('zora_disconnect', expect.objectContaining({ node }));
      expect((node as any).__zoraCoinsState).toBeUndefined();
    });

    it('clears state without emit when not connected', () => {
      const lc = attachLocal(node, ctx);
      zoraCoinsHandler.onDetach!(node, lc, ctx);
      expect((node as any).__zoraCoinsState).toBeUndefined();
      expect(ctx.emit).not.toHaveBeenCalledWith('zora_disconnect', expect.anything());
    });
  });

  // ======== MANUAL MINTING ========

  describe('manual minting', () => {
    it('emits zora_mint_started on zora_mint event', () => {
      const lc = attachLocal(node, ctx);
      setConnectedState(node);

      zoraCoinsHandler.onEvent!(node, lc, ctx, {
        type: 'zora_mint',
        payload: {
          name: 'My Scene',
          holoFileHash: 'hash123',
          scenePreviewUrl: 'https://preview.example.com/scene.png',
        },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'zora_mint_started',
        expect.objectContaining({
          pendingMint: expect.objectContaining({
            status: expect.stringMatching(/pending|minting/),
            config: expect.objectContaining({ name: 'My Scene' }),
          }),
        })
      );
    });

    it('generates symbol from single word name (first 4 chars)', () => {
      const lc = attachLocal(node, ctx);
      setConnectedState(node);

      zoraCoinsHandler.onEvent!(node, lc, ctx, {
        type: 'zora_mint',
        payload: {
          name: 'Metaverse',
          holoFileHash: 'h',
          scenePreviewUrl: 'u',
        },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'zora_mint_started',
        expect.objectContaining({
          pendingMint: expect.objectContaining({
            config: expect.objectContaining({ symbol: 'META' }),
          }),
        })
      );
    });

    it('generates acronym symbol from multi-word name', () => {
      const lc = attachLocal(node, ctx);
      setConnectedState(node);

      zoraCoinsHandler.onEvent!(node, lc, ctx, {
        type: 'zora_mint',
        payload: {
          name: 'My Cool Scene',
          holoFileHash: 'h',
          scenePreviewUrl: 'u',
        },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'zora_mint_started',
        expect.objectContaining({
          pendingMint: expect.objectContaining({
            config: expect.objectContaining({ symbol: 'MCS' }),
          }),
        })
      );
    });

    it('uses custom symbol when provided', () => {
      const lc = attachLocal(node, ctx);
      setConnectedState(node);

      zoraCoinsHandler.onEvent!(node, lc, ctx, {
        type: 'zora_mint',
        payload: {
          name: 'Scene',
          symbol: 'CUSTOM',
          holoFileHash: 'h',
          scenePreviewUrl: 'u',
        },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'zora_mint_started',
        expect.objectContaining({
          pendingMint: expect.objectContaining({
            config: expect.objectContaining({ symbol: 'CUSTOM' }),
          }),
        })
      );
    });

    it('applies default config values to mint config', () => {
      const lc = attachLocal(node, ctx);
      setConnectedState(node);

      zoraCoinsHandler.onEvent!(node, lc, ctx, {
        type: 'zora_mint',
        payload: { name: 'X', holoFileHash: 'h', scenePreviewUrl: 'u' },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'zora_mint_started',
        expect.objectContaining({
          pendingMint: expect.objectContaining({
            config: expect.objectContaining({
              initialSupply: 1000,
              maxSupply: 10000,
              distribution: 'bonding_curve',
              initialPrice: '0.001',
              royaltyPercentage: 5,
              license: 'cc-by',
            }),
          }),
        })
      );
    });

    it('supports custom config overrides in mint payload', () => {
      const lc = attachLocal(node, ctx);
      setConnectedState(node);

      zoraCoinsHandler.onEvent!(node, lc, ctx, {
        type: 'zora_mint',
        payload: {
          name: 'CustomMint',
          holoFileHash: 'h',
          scenePreviewUrl: 'u',
          category: 'avatar',
          customConfig: { initialSupply: 500, royaltyPercentage: 10 },
        },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'zora_mint_started',
        expect.objectContaining({
          pendingMint: expect.objectContaining({
            config: expect.objectContaining({
              category: 'avatar',
              initialSupply: 500,
              royaltyPercentage: 10,
            }),
          }),
        })
      );
    });
  });

  // ======== AUTO-MINT ========

  describe('auto-mint on scene publish', () => {
    it('auto-mints when auto_mint is true and scene_published fires', () => {
      const autoConfig = makeConfig({ creator_wallet: '', auto_mint: true });
      zoraCoinsHandler.onAttach(node, autoConfig, ctx);
      setConnectedState(node);

      zoraCoinsHandler.onEvent!(node, autoConfig, ctx, {
        type: 'scene_published',
        payload: {
          holoFileHash: 'scene_hash',
          sceneName: 'My Published Scene',
          scenePreviewUrl: 'https://example.com/preview.png',
          traits: ['@grabbable', '@throwable'],
        },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'zora_mint_started',
        expect.objectContaining({
          pendingMint: expect.objectContaining({
            config: expect.objectContaining({
              name: 'My Published Scene',
              category: 'scene',
            }),
          }),
        })
      );
    });

    it('does NOT auto-mint when auto_mint is false', () => {
      const noAutoConfig = makeConfig({ creator_wallet: '', auto_mint: false });
      zoraCoinsHandler.onAttach(node, noAutoConfig, ctx);

      zoraCoinsHandler.onEvent!(node, noAutoConfig, ctx, {
        type: 'scene_published',
        payload: {
          holoFileHash: 'h',
          sceneName: 'Test',
          scenePreviewUrl: 'u',
          traits: [],
        },
      });

      expect(ctx.emit).not.toHaveBeenCalledWith('zora_mint_started', expect.anything());
    });
  });

  // ======== BONDING CURVE PRICING ========

  describe('bonding curve pricing', () => {
    it('emits zora_price_quoted for known coin with bonding curve enabled', () => {
      const lc = attachLocal(node, ctx);
      setConnectedState(node, [{ id: 'coin_bc', circulatingSupply: 100 }]);

      const bcConfig = makeConfig({
        creator_wallet: '',
        enable_bonding_curve: true,
        bonding_curve_factor: 0.5,
      });

      zoraCoinsHandler.onEvent!(node, bcConfig, ctx, {
        type: 'zora_price_quote',
        payload: { coinId: 'coin_bc', amount: 10 },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'zora_price_quoted',
        expect.objectContaining({
          node,
          coinId: 'coin_bc',
          amount: 10,
          totalPrice: expect.any(Number),
          pricePerToken: expect.any(Number),
        })
      );
    });

    it('does NOT emit price quote when bonding curve disabled', () => {
      const lc = attachLocal(node, ctx);
      setConnectedState(node, [{ id: 'coin_x', circulatingSupply: 50 }]);

      const noBcConfig = makeConfig({ creator_wallet: '', enable_bonding_curve: false });

      zoraCoinsHandler.onEvent!(node, noBcConfig, ctx, {
        type: 'zora_price_quote',
        payload: { coinId: 'coin_x', amount: 5 },
      });

      expect(ctx.emit).not.toHaveBeenCalledWith('zora_price_quoted', expect.anything());
    });

    it('does NOT emit price quote for unknown coin ID', () => {
      const lc = attachLocal(node, ctx);
      setConnectedState(node, []);

      zoraCoinsHandler.onEvent!(node, config, ctx, {
        type: 'zora_price_quote',
        payload: { coinId: 'nonexistent', amount: 1 },
      });

      expect(ctx.emit).not.toHaveBeenCalledWith('zora_price_quoted', expect.anything());
    });
  });

  // ======== COLLECTIONS ========

  describe('collections', () => {
    it('creates a collection and stores it in state', () => {
      const lc = attachLocal(node, ctx);

      zoraCoinsHandler.onEvent!(node, lc, ctx, {
        type: 'zora_create_collection',
        payload: {
          name: 'My Collection',
          description: 'A test collection',
          coinIds: ['c1', 'c2'],
        },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'zora_collection_created',
        expect.objectContaining({
          node,
          collection: expect.objectContaining({
            name: 'My Collection',
            coins: ['c1', 'c2'],
          }),
        })
      );

      const state = (node as any).__zoraCoinsState;
      expect(state.collections).toHaveLength(1);
    });
  });

  // ======== SECONDARY SALES & ROYALTIES ========

  describe('secondary sales & royalties', () => {
    it('tracks royalties on secondary sale (5% default)', () => {
      const lc = attachLocal(node, ctx);
      setConnectedState(node, [
        {
          id: 'coin_r',
          stats: { secondarySales: 0, totalVolume: '0', royaltiesEarned: '0' },
        },
      ]);

      const royaltyConfig = makeConfig({
        creator_wallet: '',
        default_royalty: 5,
        enable_referrals: true,
        referral_percentage: 2.5,
      });

      zoraCoinsHandler.onEvent!(node, royaltyConfig, ctx, {
        type: 'zora_secondary_sale',
        payload: { coinId: 'coin_r', price: '1.0', buyer: '0xB', seller: '0xS' },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'zora_royalty_earned',
        expect.objectContaining({
          coinId: 'coin_r',
          salePrice: '1.0',
          royaltyAmount: '0.05',
          referralAmount: '0.025',
        })
      );

      const state = (node as any).__zoraCoinsState;
      expect(state.totalRoyaltiesEarned).toBe('0.05');
    });

    it('reports zero referral when referrals disabled', () => {
      const lc = attachLocal(node, ctx);
      setConnectedState(node, [
        {
          id: 'coin_nr',
          stats: { secondarySales: 0, totalVolume: '0', royaltiesEarned: '0' },
        },
      ]);

      const noRefConfig = makeConfig({
        creator_wallet: '',
        enable_referrals: false,
        default_royalty: 5,
      });

      zoraCoinsHandler.onEvent!(node, noRefConfig, ctx, {
        type: 'zora_secondary_sale',
        payload: { coinId: 'coin_nr', price: '2.0', buyer: '0xB', seller: '0xS' },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'zora_royalty_earned',
        expect.objectContaining({ referralAmount: '0' })
      );
    });

    it('increments secondary sales counter', () => {
      const lc = attachLocal(node, ctx);
      setConnectedState(node, [
        {
          id: 'coin_cnt',
          stats: { secondarySales: 2, totalVolume: '5.0', royaltiesEarned: '0.2' },
        },
      ]);

      zoraCoinsHandler.onEvent!(node, config, ctx, {
        type: 'zora_secondary_sale',
        payload: { coinId: 'coin_cnt', price: '1.0', buyer: '0xB', seller: '0xS' },
      });

      const state = (node as any).__zoraCoinsState;
      const coin = state.coins.find((c: any) => c.id === 'coin_cnt');
      expect(coin.stats.secondarySales).toBe(3);
    });

    it('ignores sale for unknown coin', () => {
      const lc = attachLocal(node, ctx);
      setConnectedState(node, []);

      zoraCoinsHandler.onEvent!(node, config, ctx, {
        type: 'zora_secondary_sale',
        payload: { coinId: 'nope', price: '1.0', buyer: '0xB', seller: '0xS' },
      });

      expect(ctx.emit).not.toHaveBeenCalledWith('zora_royalty_earned', expect.anything());
    });
  });

  // ======== REWARDS ========

  describe('rewards', () => {
    it('claims rewards and resets balance to zero', () => {
      const lc = attachLocal(node, ctx);
      const state = (node as any).__zoraCoinsState;
      state.rewardsBalance = '3.14';

      zoraCoinsHandler.onEvent!(node, config, ctx, {
        type: 'zora_claim_rewards',
        payload: {},
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'zora_rewards_claimed',
        expect.objectContaining({ amount: '3.14', wallet: '0xCreator123' })
      );
      expect(state.rewardsBalance).toBe('0');
    });
  });

  // ======== WALLET CONNECTION EVENT ========

  describe('wallet connection via event', () => {
    it('updates walletAddress on wallet_connected event', () => {
      const lc = attachLocal(node, ctx);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ coins: [], collections: [] }),
      });

      zoraCoinsHandler.onEvent!(node, lc, ctx, {
        type: 'wallet_connected',
        payload: { address: '0xNewWallet' },
      });

      const state = (node as any).__zoraCoinsState;
      expect(state.walletAddress).toBe('0xNewWallet');
    });
  });

  // ======== UPDATE & LIFECYCLE ========

  describe('update lifecycle', () => {
    it('skips update when not connected', () => {
      attachLocal(node, ctx);
      // Should not throw
      zoraCoinsHandler.onUpdate!(node, config, ctx, 16);
    });

    it('does not throw when no state', () => {
      zoraCoinsHandler.onUpdate!(makeNode(), config, ctx, 16);
    });
  });

  // ======== EDGE CASES ========

  describe('edge cases', () => {
    it('ignores all events when state is uninitialized', () => {
      const bareNode = makeNode('bare');
      zoraCoinsHandler.onEvent!(bareNode, config, ctx, {
        type: 'zora_mint',
        payload: { name: 'X', holoFileHash: 'h', scenePreviewUrl: 'u' },
      });
      // Should not throw or emit
      expect(ctx.emit).not.toHaveBeenCalled();
    });
  });
});
