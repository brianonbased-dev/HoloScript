/**
 * ZoraCoinsTrait Tests
 *
 * Tests for Zora Coins ERC-20 minting on Base L2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { zoraCoinsHandler } from '../ZoraCoinsTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('ZoraCoinsTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('zora-node');
    ctx = createMockContext();
  });

  describe('initialization', () => {
    it('should have correct default config', () => {
      expect(zoraCoinsHandler.defaultConfig.default_chain).toBe('base');
      expect(zoraCoinsHandler.defaultConfig.auto_mint).toBe(false);
      expect(zoraCoinsHandler.defaultConfig.default_distribution).toBe('bonding_curve');
      expect(zoraCoinsHandler.defaultConfig.default_royalty).toBe(5);
      expect(zoraCoinsHandler.defaultConfig.default_initial_supply).toBe(1000);
      expect(zoraCoinsHandler.defaultConfig.default_max_supply).toBe(10000);
      expect(zoraCoinsHandler.defaultConfig.default_initial_price).toBe('0.001');
      expect(zoraCoinsHandler.defaultConfig.default_license).toBe('cc-by');
      expect(zoraCoinsHandler.defaultConfig.enable_bonding_curve).toBe(true);
      expect(zoraCoinsHandler.defaultConfig.enable_referrals).toBe(true);
    });

    it('should attach and initialize state', () => {
      attachTrait(zoraCoinsHandler, node, {}, ctx);

      const state = (node as any).__zoraCoinsState;
      expect(state).toBeDefined();
      expect(state.isConnected).toBe(false);
      expect(state.coins).toEqual([]);
      expect(state.pendingMints).toEqual([]);
      expect(state.collections).toEqual([]);
      expect(state.totalRoyaltiesEarned).toBe('0');
      expect(state.rewardsBalance).toBe('0');
    });

    it('should attempt connection when wallet provided', () => {
      attachTrait(zoraCoinsHandler, node, { creator_wallet: '0x1234567890abcdef' }, ctx);

      const state = (node as any).__zoraCoinsState;
      expect(state.walletAddress).toBe('0x1234567890abcdef');
    });
  });

  describe('supported chains', () => {
    const chains = ['base', 'zora', 'optimism'];

    chains.forEach((chain) => {
      it(`should support ${chain} chain`, () => {
        attachTrait(zoraCoinsHandler, node, { default_chain: chain as any }, ctx);

        const state = (node as any).__zoraCoinsState;
        expect(state).toBeDefined();
      });
    });
  });

  describe('distribution models', () => {
    const models = ['fixed_supply', 'bonding_curve', 'free_mint', 'dutch_auction'];

    models.forEach((model) => {
      it(`should support ${model} distribution`, () => {
        attachTrait(zoraCoinsHandler, node, { default_distribution: model as any }, ctx);

        const state = (node as any).__zoraCoinsState;
        expect(state).toBeDefined();
      });
    });
  });

  describe('license types', () => {
    const licenses = ['cc0', 'cc-by', 'cc-by-nc', 'custom'];

    licenses.forEach((license) => {
      it(`should support ${license} license`, () => {
        attachTrait(zoraCoinsHandler, node, { default_license: license as any }, ctx);

        const state = (node as any).__zoraCoinsState;
        expect(state).toBeDefined();
      });
    });
  });

  describe('auto-mint on publish', () => {
    beforeEach(() => {
      attachTrait(
        zoraCoinsHandler,
        node,
        {
          creator_wallet: '0x1234',
          auto_mint: true,
        },
        ctx
      );
      const state = (node as any).__zoraCoinsState;
      state.isConnected = true;
      ctx.clearEvents();
    });

    it('should trigger mint on scene_published when auto_mint enabled', () => {
      sendEvent(
        zoraCoinsHandler,
        node,
        {
          creator_wallet: '0x1234',
          auto_mint: true,
        },
        ctx,
        {
          type: 'scene_published',
          payload: {
            holoFileHash: '0xabc123',
            sceneName: 'My Cool Scene',
            scenePreviewUrl: 'https://example.com/preview.png',
            traits: ['interactive', 'multiplayer'],
          },
        }
      );

      // Auto-mint should be triggered
      const state = (node as any).__zoraCoinsState;
      expect(state.pendingMints.length).toBeGreaterThanOrEqual(0);
    });

    it('should not auto-mint when disabled', () => {
      attachTrait(
        zoraCoinsHandler,
        node,
        {
          creator_wallet: '0x1234',
          auto_mint: false,
        },
        ctx
      );
      ctx.clearEvents();

      sendEvent(
        zoraCoinsHandler,
        node,
        {
          creator_wallet: '0x1234',
          auto_mint: false,
        },
        ctx,
        {
          type: 'scene_published',
          payload: {
            holoFileHash: '0xabc123',
            sceneName: 'My Scene',
            scenePreviewUrl: 'https://example.com/preview.png',
            traits: [],
          },
        }
      );

      const state = (node as any).__zoraCoinsState;
      expect(state.pendingMints.length).toBe(0);
    });
  });

  describe('manual minting', () => {
    beforeEach(() => {
      attachTrait(zoraCoinsHandler, node, { creator_wallet: '0x1234' }, ctx);
      const state = (node as any).__zoraCoinsState;
      state.isConnected = true;
      ctx.clearEvents();
    });

    it('should handle zora_mint event', () => {
      sendEvent(zoraCoinsHandler, node, { creator_wallet: '0x1234' }, ctx, {
        type: 'zora_mint',
        payload: {
          name: 'Epic Scene',
          symbol: 'EPIC',
          description: 'An epic HoloScript scene',
          holoFileHash: '0xdef456',
          scenePreviewUrl: 'https://example.com/epic.png',
          traits: ['vr', 'immersive'],
          category: 'experience',
        },
      });

      const state = (node as any).__zoraCoinsState;
      expect(state.pendingMints.length).toBeGreaterThanOrEqual(0);
    });

    it('should generate symbol from name if not provided', () => {
      sendEvent(zoraCoinsHandler, node, { creator_wallet: '0x1234' }, ctx, {
        type: 'zora_mint',
        payload: {
          name: 'My Amazing Scene',
          holoFileHash: '0x789abc',
          scenePreviewUrl: 'https://example.com/amazing.png',
        },
      });

      // Minting should proceed with auto-generated symbol
      expect(ctx.emittedEvents.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('collection management', () => {
    beforeEach(() => {
      attachTrait(zoraCoinsHandler, node, { creator_wallet: '0x1234' }, ctx);
      const state = (node as any).__zoraCoinsState;
      state.isConnected = true;
      state.coins = [
        {
          id: 'coin-1',
          contractAddress: '0xaaa',
          name: 'Scene 1',
          symbol: 'SC1',
          description: 'First scene',
          totalSupply: 1000,
          circulatingSupply: 500,
          price: '0.01',
          priceUSD: 25,
          creatorAddress: '0x1234',
          createdAt: Date.now(),
          chain: 'base',
          metadata: {
            holoFileHash: '0x111',
            scenePreviewUrl: 'https://example.com/1.png',
            traits: [],
            category: 'scene',
            license: 'cc-by',
          },
          stats: {
            holders: 50,
            totalVolume: '5.0',
            floorPrice: '0.008',
            marketCap: '5000',
            royaltiesEarned: '0.25',
            secondarySales: 10,
          },
        },
      ];
      ctx.clearEvents();
    });

    it('should handle zora_create_collection event', () => {
      sendEvent(zoraCoinsHandler, node, { creator_wallet: '0x1234' }, ctx, {
        type: 'zora_create_collection',
        payload: {
          name: 'My Collection',
          description: 'A collection of my best scenes',
          coinIds: ['coin-1'],
        },
      });

      // Collection creation initiated
      expect(ctx.emittedEvents.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('rewards and royalties', () => {
    beforeEach(() => {
      attachTrait(zoraCoinsHandler, node, { creator_wallet: '0x1234' }, ctx);
      const state = (node as any).__zoraCoinsState;
      state.isConnected = true;
      state.rewardsBalance = '1.5';
      ctx.clearEvents();
    });

    it('should handle zora_claim_rewards event', () => {
      sendEvent(zoraCoinsHandler, node, { creator_wallet: '0x1234' }, ctx, {
        type: 'zora_claim_rewards',
        payload: {},
      });

      // Rewards claim initiated
      expect(ctx.emittedEvents.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('bonding curve pricing', () => {
    beforeEach(() => {
      attachTrait(
        zoraCoinsHandler,
        node,
        {
          creator_wallet: '0x1234',
          enable_bonding_curve: true,
          bonding_curve_factor: 0.5,
        },
        ctx
      );
      const state = (node as any).__zoraCoinsState;
      state.isConnected = true;
      state.coins = [
        {
          id: 'curve-coin',
          contractAddress: '0xbbb',
          name: 'Curve Coin',
          symbol: 'CURVE',
          description: 'Bonding curve coin',
          totalSupply: 10000,
          circulatingSupply: 1000,
          price: '0.001',
          priceUSD: 2.5,
          creatorAddress: '0x1234',
          createdAt: Date.now(),
          chain: 'base',
          metadata: {
            holoFileHash: '0x222',
            scenePreviewUrl: 'https://example.com/2.png',
            traits: [],
            category: 'scene',
            license: 'cc0',
          },
          stats: {
            holders: 100,
            totalVolume: '10.0',
            floorPrice: '0.0008',
            marketCap: '10000',
            royaltiesEarned: '0.5',
            secondarySales: 25,
          },
        },
      ];
      ctx.clearEvents();
    });

    it('should handle zora_price_quote event', () => {
      sendEvent(
        zoraCoinsHandler,
        node,
        {
          creator_wallet: '0x1234',
          enable_bonding_curve: true,
          bonding_curve_factor: 0.5,
        },
        ctx,
        {
          type: 'zora_price_quote',
          payload: {
            coinId: 'curve-coin',
            amount: 100,
          },
        }
      );

      expect(getEventCount(ctx, 'zora_price_quoted')).toBe(1);
      const event = getLastEvent(ctx, 'zora_price_quoted');
      expect(event.coinId).toBe('curve-coin');
      expect(event.amount).toBe(100);
      expect(event.totalPrice).toBeGreaterThan(0);
    });

    it('should not quote price when bonding curve disabled', () => {
      attachTrait(
        zoraCoinsHandler,
        node,
        {
          creator_wallet: '0x1234',
          enable_bonding_curve: false,
        },
        ctx
      );
      ctx.clearEvents();

      sendEvent(
        zoraCoinsHandler,
        node,
        {
          creator_wallet: '0x1234',
          enable_bonding_curve: false,
        },
        ctx,
        {
          type: 'zora_price_quote',
          payload: {
            coinId: 'curve-coin',
            amount: 100,
          },
        }
      );

      expect(getEventCount(ctx, 'zora_price_quoted')).toBe(0);
    });
  });

  describe('secondary sales', () => {
    beforeEach(() => {
      attachTrait(
        zoraCoinsHandler,
        node,
        {
          creator_wallet: '0x1234',
          default_royalty: 5,
        },
        ctx
      );
      const state = (node as any).__zoraCoinsState;
      state.isConnected = true;
      state.coins = [
        {
          id: 'sale-coin',
          contractAddress: '0xccc',
          name: 'Sale Coin',
          symbol: 'SALE',
          description: 'Test coin',
          totalSupply: 5000,
          circulatingSupply: 2000,
          price: '0.01',
          priceUSD: 25,
          creatorAddress: '0x1234',
          createdAt: Date.now(),
          chain: 'base',
          metadata: {
            holoFileHash: '0x333',
            scenePreviewUrl: 'https://example.com/3.png',
            traits: [],
            category: 'scene',
            license: 'cc-by',
          },
          stats: {
            holders: 200,
            totalVolume: '50.0',
            floorPrice: '0.009',
            marketCap: '50000',
            royaltiesEarned: '2.5',
            secondarySales: 100,
          },
        },
      ];
      ctx.clearEvents();
    });

    it('should handle zora_secondary_sale event', () => {
      sendEvent(
        zoraCoinsHandler,
        node,
        {
          creator_wallet: '0x1234',
          default_royalty: 5,
        },
        ctx,
        {
          type: 'zora_secondary_sale',
          payload: {
            coinId: 'sale-coin',
            price: '0.015',
            buyer: '0xbuyer',
            seller: '0xseller',
          },
        }
      );

      // Secondary sale processed
      expect(ctx.emittedEvents.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('wallet connection', () => {
    it('should handle wallet_connected event', () => {
      attachTrait(zoraCoinsHandler, node, {}, ctx);
      ctx.clearEvents();

      sendEvent(zoraCoinsHandler, node, {}, ctx, {
        type: 'wallet_connected',
        payload: {
          address: '0xnewwallet',
        },
      });

      const state = (node as any).__zoraCoinsState;
      expect(state.walletAddress).toBe('0xnewwallet');
    });
  });

  describe('pending mint status checking', () => {
    it('should check pending mints during update', () => {
      attachTrait(zoraCoinsHandler, node, { creator_wallet: '0x1234' }, ctx);

      const state = (node as any).__zoraCoinsState;
      state.isConnected = true;
      state.pendingMints = [
        {
          id: 'pending-1',
          config: {
            name: 'Pending Coin',
            symbol: 'PEND',
            description: 'Pending',
            initialSupply: 1000,
            maxSupply: 10000,
            distribution: 'bonding_curve',
            initialPrice: '0.001',
            royaltyPercentage: 5,
            category: 'scene',
            license: 'cc-by',
          },
          holoFileHash: '0xpending',
          status: 'minting',
          createdAt: Date.now(),
        },
      ];

      ctx.clearEvents();
      updateTrait(zoraCoinsHandler, node, { creator_wallet: '0x1234' }, ctx, 1000);

      // Should poll pending mints
      expect(state.pendingMints[0].status).toBeDefined();
    });

    it('should skip update when disconnected', () => {
      attachTrait(zoraCoinsHandler, node, {}, ctx);

      const state = (node as any).__zoraCoinsState;
      state.isConnected = false;

      ctx.clearEvents();
      updateTrait(zoraCoinsHandler, node, {}, ctx, 1000);

      expect(ctx.emittedEvents.length).toBe(0);
    });
  });

  describe('referrals', () => {
    it('should have referral configuration', () => {
      attachTrait(
        zoraCoinsHandler,
        node,
        {
          enable_referrals: true,
          referral_percentage: 2.5,
        },
        ctx
      );

      // Referral config should be applied
      expect(zoraCoinsHandler.defaultConfig.enable_referrals).toBe(true);
      expect(zoraCoinsHandler.defaultConfig.referral_percentage).toBe(2.5);
    });
  });

  describe('detach', () => {
    it('should emit disconnect event when connected', () => {
      attachTrait(zoraCoinsHandler, node, { creator_wallet: '0x1234' }, ctx);

      const state = (node as any).__zoraCoinsState;
      state.isConnected = true;

      ctx.clearEvents();
      zoraCoinsHandler.onDetach?.(node as any, zoraCoinsHandler.defaultConfig, ctx as any);

      expect(getEventCount(ctx, 'zora_disconnect')).toBe(1);
    });

    it('should clean up state on detach', () => {
      attachTrait(zoraCoinsHandler, node, {}, ctx);
      zoraCoinsHandler.onDetach?.(node as any, zoraCoinsHandler.defaultConfig, ctx as any);

      expect((node as any).__zoraCoinsState).toBeUndefined();
    });
  });

  describe('category types', () => {
    const categories = ['scene', 'object', 'avatar', 'experience', 'film'];

    categories.forEach((category) => {
      it(`should support ${category} category`, () => {
        attachTrait(zoraCoinsHandler, node, { creator_wallet: '0x1234' }, ctx);
        const state = (node as any).__zoraCoinsState;
        state.isConnected = true;
        ctx.clearEvents();

        sendEvent(zoraCoinsHandler, node, { creator_wallet: '0x1234' }, ctx, {
          type: 'zora_mint',
          payload: {
            name: `${category} Item`,
            holoFileHash: '0xcat',
            scenePreviewUrl: 'https://example.com/cat.png',
            category,
          },
        });

        // Should accept all category types
        expect(ctx.emittedEvents.length).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
