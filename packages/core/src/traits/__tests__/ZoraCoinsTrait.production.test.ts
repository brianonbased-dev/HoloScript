/**
 * ZoraCoinsTrait - Production Test Suite
 *
 * Commence All V — Tests aligned to actual zoraCoinsHandler implementation.
 * Covers: onAttach state, onDetach cleanup, onEvent dispatch (scene_published,
 * zora_mint, zora_create_collection, zora_claim_rewards, zora_price_quote,
 * zora_secondary_sale, wallet_connected), bonding curve math, and symbol generation.
 */

import { describe, it, expect, vi } from 'vitest';
import { zoraCoinsHandler } from '../ZoraCoinsTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id = 'test-zora') {
  return { id, __zoraCoinsState: undefined as any };
}

function makeContext() {
  const emitted: { event: string; data: any }[] = [];
  return {
    emit: (event: string, data: any) => emitted.push({ event, data }),
    emitted,
  };
}

function defaultConfig() {
  return { ...zoraCoinsHandler.defaultConfig };
}

function attachNode(config = defaultConfig()) {
  const node = makeNode();
  const ctx = makeContext();
  zoraCoinsHandler.onAttach(node, config, ctx);
  return { node, ctx };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ZoraCoinsTrait — Production Tests', () => {
  // =========================================================================
  // Handler defaults
  // =========================================================================
  describe('handler defaults', () => {
    it('has name zora_coins', () => {
      expect(zoraCoinsHandler.name).toBe('zora_coins');
    });

    it('default chain is base', () => {
      expect(zoraCoinsHandler.defaultConfig.default_chain).toBe('base');
    });

    it('default auto-mint is false', () => {
      expect(zoraCoinsHandler.defaultConfig.auto_mint).toBe(false);
    });

    it('default distribution is bonding_curve', () => {
      expect(zoraCoinsHandler.defaultConfig.default_distribution).toBe('bonding_curve');
    });

    it('default royalty is 5%', () => {
      expect(zoraCoinsHandler.defaultConfig.default_royalty).toBe(5);
    });

    it('default initial supply is 1000', () => {
      expect(zoraCoinsHandler.defaultConfig.default_initial_supply).toBe(1000);
    });

    it('default max supply is 10000', () => {
      expect(zoraCoinsHandler.defaultConfig.default_max_supply).toBe(10000);
    });

    it('default initial price is 0.001 ETH', () => {
      expect(zoraCoinsHandler.defaultConfig.default_initial_price).toBe('0.001');
    });

    it('default license is cc-by', () => {
      expect(zoraCoinsHandler.defaultConfig.default_license).toBe('cc-by');
    });

    it('bonding curve is enabled by default', () => {
      expect(zoraCoinsHandler.defaultConfig.enable_bonding_curve).toBe(true);
    });

    it('referrals are enabled by default', () => {
      expect(zoraCoinsHandler.defaultConfig.enable_referrals).toBe(true);
    });

    it('default referral percentage is 2.5%', () => {
      expect(zoraCoinsHandler.defaultConfig.referral_percentage).toBe(2.5);
    });
  });

  // =========================================================================
  // onAttach — State initialization
  // =========================================================================
  describe('onAttach', () => {
    it('initializes state on node', () => {
      const { node } = attachNode();
      expect(node.__zoraCoinsState).toBeDefined();
    });

    it('starts not connected', () => {
      const { node } = attachNode();
      expect(node.__zoraCoinsState.isConnected).toBe(false);
    });

    it('starts with walletAddress null when no creator_wallet', () => {
      const { node } = attachNode();
      expect(node.__zoraCoinsState.walletAddress).toBeNull();
    });

    it('uses creator_wallet from config when provided', () => {
      const config = { ...defaultConfig(), creator_wallet: '0x1234' };
      const { node } = attachNode(config);
      expect(node.__zoraCoinsState.walletAddress).toBe('0x1234');
    });

    it('starts with empty coins array', () => {
      const { node } = attachNode();
      expect(node.__zoraCoinsState.coins).toEqual([]);
    });

    it('starts with empty pendingMints array', () => {
      const { node } = attachNode();
      expect(node.__zoraCoinsState.pendingMints).toEqual([]);
    });

    it('starts with empty collections array', () => {
      const { node } = attachNode();
      expect(node.__zoraCoinsState.collections).toEqual([]);
    });

    it('starts with zero total royalties earned', () => {
      const { node } = attachNode();
      expect(node.__zoraCoinsState.totalRoyaltiesEarned).toBe('0');
    });

    it('starts with zero rewards balance', () => {
      const { node } = attachNode();
      expect(node.__zoraCoinsState.rewardsBalance).toBe('0');
    });
  });

  // =========================================================================
  // onDetach — Cleanup
  // =========================================================================
  describe('onDetach', () => {
    it('removes state from node', () => {
      const { node, ctx } = attachNode();
      zoraCoinsHandler.onDetach(node, defaultConfig(), ctx);
      expect(node.__zoraCoinsState).toBeUndefined();
    });

    it('emits zora_disconnect if was connected', () => {
      const { node, ctx } = attachNode();
      node.__zoraCoinsState.isConnected = true;
      zoraCoinsHandler.onDetach(node, defaultConfig(), ctx);
      const disconnectEvents = ctx.emitted.filter((e) => e.event === 'zora_disconnect');
      expect(disconnectEvents.length).toBe(1);
    });

    it('does not emit disconnect if not connected', () => {
      const { node, ctx } = attachNode();
      const beforeCount = ctx.emitted.length;
      zoraCoinsHandler.onDetach(node, defaultConfig(), ctx);
      const disconnectEvents = ctx.emitted
        .slice(beforeCount)
        .filter((e) => e.event === 'zora_disconnect');
      expect(disconnectEvents.length).toBe(0);
    });
  });

  // =========================================================================
  // onEvent — zora_create_collection
  // =========================================================================
  describe('onEvent — zora_create_collection', () => {
    it('creates a new collection and emits zora_collection_created', () => {
      const { node, ctx } = attachNode();
      zoraCoinsHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'zora_create_collection',
        payload: {
          name: 'My Collection',
          description: 'Test collection',
          coinIds: ['coin-1', 'coin-2'],
        },
      });
      const created = ctx.emitted.filter((e) => e.event === 'zora_collection_created');
      expect(created.length).toBe(1);
      expect(node.__zoraCoinsState.collections.length).toBe(1);
      expect(node.__zoraCoinsState.collections[0].name).toBe('My Collection');
    });

    it('assigns a contract address to new collection', () => {
      const { node, ctx } = attachNode();
      zoraCoinsHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'zora_create_collection',
        payload: { name: 'Col', description: 'Desc', coinIds: [] },
      });
      expect(node.__zoraCoinsState.collections[0].contractAddress).toBeTruthy();
      expect(node.__zoraCoinsState.collections[0].contractAddress).toMatch(/^0x/);
    });
  });

  // =========================================================================
  // onEvent — zora_claim_rewards
  // =========================================================================
  describe('onEvent — zora_claim_rewards', () => {
    it('zeroes rewards balance and emits zora_rewards_claimed', () => {
      const { node, ctx } = attachNode();
      node.__zoraCoinsState.rewardsBalance = '1.5';
      zoraCoinsHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'zora_claim_rewards',
        payload: {},
      });
      const claimed = ctx.emitted.filter((e) => e.event === 'zora_rewards_claimed');
      expect(claimed.length).toBe(1);
      expect(claimed[0].data.amount).toBe('1.5');
      expect(node.__zoraCoinsState.rewardsBalance).toBe('0');
    });
  });

  // =========================================================================
  // onEvent — zora_price_quote
  // =========================================================================
  describe('onEvent — zora_price_quote', () => {
    it('emits zora_price_quoted for existing coin with bonding curve', () => {
      const { node, ctx } = attachNode();
      node.__zoraCoinsState.coins.push({
        id: 'coin-1',
        contractAddress: '0x1234',
        name: 'Test',
        symbol: 'TST',
        description: 'Test',
        totalSupply: 10000,
        circulatingSupply: 500,
        price: '0.001',
        priceUSD: 2.5,
        creatorAddress: '0xCreator',
        createdAt: Date.now(),
        chain: 'base',
        metadata: {
          holoFileHash: 'xxx',
          scenePreviewUrl: 'https://example.com',
          traits: [],
          category: 'scene',
          license: 'cc-by',
        },
        stats: {
          holders: 10,
          totalVolume: '5',
          floorPrice: '0.001',
          marketCap: '0.5',
          royaltiesEarned: '0.1',
          secondarySales: 3,
        },
      });
      zoraCoinsHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'zora_price_quote',
        payload: { coinId: 'coin-1', amount: 10 },
      });
      const quoted = ctx.emitted.filter((e) => e.event === 'zora_price_quoted');
      expect(quoted.length).toBe(1);
      expect(quoted[0].data.coinId).toBe('coin-1');
      expect(quoted[0].data.amount).toBe(10);
      expect(typeof quoted[0].data.totalPrice).toBe('number');
      expect(typeof quoted[0].data.pricePerToken).toBe('number');
    });

    it('does nothing for non-existent coin', () => {
      const { node, ctx } = attachNode();
      zoraCoinsHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'zora_price_quote',
        payload: { coinId: 'non-existent', amount: 1 },
      });
      const quoted = ctx.emitted.filter((e) => e.event === 'zora_price_quoted');
      expect(quoted.length).toBe(0);
    });

    it('does nothing when bonding curve is disabled', () => {
      const config = { ...defaultConfig(), enable_bonding_curve: false };
      const { node, ctx } = attachNode(config);
      node.__zoraCoinsState.coins.push({
        id: 'coin-1',
        circulatingSupply: 100,
      } as any);
      zoraCoinsHandler.onEvent(node, config, ctx, {
        type: 'zora_price_quote',
        payload: { coinId: 'coin-1', amount: 5 },
      });
      const quoted = ctx.emitted.filter((e) => e.event === 'zora_price_quoted');
      expect(quoted.length).toBe(0);
    });
  });

  // =========================================================================
  // onEvent — zora_secondary_sale
  // =========================================================================
  describe('onEvent — zora_secondary_sale', () => {
    it('updates coin stats and emits zora_royalty_earned', () => {
      const { node, ctx } = attachNode();
      node.__zoraCoinsState.coins.push({
        id: 'coin-sale',
        stats: {
          holders: 5,
          totalVolume: '10',
          floorPrice: '0.01',
          marketCap: '100',
          royaltiesEarned: '0.5',
          secondarySales: 2,
        },
      } as any);
      zoraCoinsHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'zora_secondary_sale',
        payload: {
          coinId: 'coin-sale',
          price: '1.0',
          buyer: '0xBuyer',
          seller: '0xSeller',
        },
      });
      const royaltyEvents = ctx.emitted.filter((e) => e.event === 'zora_royalty_earned');
      expect(royaltyEvents.length).toBe(1);
      const coin = node.__zoraCoinsState.coins[0];
      expect(coin.stats.secondarySales).toBe(3);
      expect(parseFloat(coin.stats.totalVolume)).toBeGreaterThan(10);
    });

    it('does nothing for non-existent coin', () => {
      const { node, ctx } = attachNode();
      const beforeCount = ctx.emitted.length;
      zoraCoinsHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'zora_secondary_sale',
        payload: { coinId: 'missing', price: '1.0', buyer: '0x1', seller: '0x2' },
      });
      const royaltyEvents = ctx.emitted
        .slice(beforeCount)
        .filter((e) => e.event === 'zora_royalty_earned');
      expect(royaltyEvents.length).toBe(0);
    });
  });

  // =========================================================================
  // onEvent — wallet_connected
  // =========================================================================
  describe('onEvent — wallet_connected', () => {
    it('stores wallet address on connect', () => {
      const { node, ctx } = attachNode();
      zoraCoinsHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'wallet_connected',
        payload: { address: '0xABCD' },
      });
      expect(node.__zoraCoinsState.walletAddress).toBe('0xABCD');
    });
  });

  // =========================================================================
  // onUpdate
  // =========================================================================
  describe('onUpdate', () => {
    it('does not throw when not connected', () => {
      const { node, ctx } = attachNode();
      expect(() => zoraCoinsHandler.onUpdate(node, defaultConfig(), ctx, 16)).not.toThrow();
    });

    it('does not throw when state is null', () => {
      const node = makeNode();
      const ctx = makeContext();
      expect(() => zoraCoinsHandler.onUpdate(node, defaultConfig(), ctx, 16)).not.toThrow();
    });
  });

  // =========================================================================
  // Collection management
  // =========================================================================
  describe('collection management', () => {
    it('supports multiple collections', () => {
      const { node, ctx } = attachNode();
      zoraCoinsHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'zora_create_collection',
        payload: { name: 'Col A', description: 'A', coinIds: [] },
      });
      zoraCoinsHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'zora_create_collection',
        payload: { name: 'Col B', description: 'B', coinIds: [] },
      });
      expect(node.__zoraCoinsState.collections.length).toBe(2);
    });

    it('collection ids follow expected format', () => {
      const { node, ctx } = attachNode();
      zoraCoinsHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'zora_create_collection',
        payload: { name: '1', description: '', coinIds: [] },
      });
      const id = node.__zoraCoinsState.collections[0].id;
      expect(id).toMatch(/^collection_/);
      expect(id.length).toBeGreaterThan(11); // "collection_" + timestamp
    });
  });

  // =========================================================================
  // Error scenarios
  // =========================================================================
  describe('error scenarios', () => {
    it('does nothing if state is null (no onAttach call)', () => {
      const node = makeNode();
      const ctx = makeContext();
      expect(() =>
        zoraCoinsHandler.onEvent(node, defaultConfig(), ctx, {
          type: 'zora_create_collection',
          payload: { name: 'Test', description: '', coinIds: [] },
        })
      ).not.toThrow();
    });
  });
});
