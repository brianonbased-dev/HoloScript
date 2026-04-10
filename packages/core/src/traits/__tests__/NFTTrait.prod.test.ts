/**
 * NFTTrait Production Tests
 *
 * Comprehensive coverage for ownership verification, metadata loading,
 * transfer lifecycle, owner checking, periodic re-verification, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nftHandler } from '../NFTTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'nft-node-1') {
  return { id } as any;
}

function makeConfig(overrides: Partial<Parameters<typeof nftHandler.onAttach>[1]> = {}) {
  return { ...nftHandler.defaultConfig, ...overrides };
}

function makeContext() {
  return { emit: vi.fn() };
}

function getState(node: any) {
  return (node as any).__nftState;
}

// =============================================================================
// TESTS
// =============================================================================

describe('NFTTrait — Production', () => {
  let node: any;
  let config: ReturnType<typeof makeConfig>;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
  });

  afterEach(() => {
    delete (node as any).__nftState;
  });

  // ======== CONSTRUCTION & DEFAULTS ========

  describe('construction & defaults', () => {
    it('initializes empty state on attach', () => {
      nftHandler.onAttach(node, config, ctx);
      const s = getState(node);
      expect(s.isVerified).toBe(false);
      expect(s.isLoading).toBe(false);
      expect(s.ownerAddress).toBeNull();
      expect(s.metadata).toBeNull();
      expect(s.tokenStandard).toBeNull();
      expect(s.lastVerificationTime).toBe(0);
    });

    it('has sensible default config', () => {
      const d = nftHandler.defaultConfig;
      expect(d.chain).toBe('ethereum');
      expect(d.contract_address).toBe('');
      expect(d.token_id).toBe('');
      expect(d.display_ownership).toBe(false);
      expect(d.transfer_enabled).toBe(false);
      expect(d.verification_interval).toBe(0);
    });

    it('handler name is nft', () => {
      expect(nftHandler.name).toBe('nft');
    });

    it('auto-verifies and loads metadata when contract + token provided', () => {
      const cfg = makeConfig({
        contract_address: '0xABC',
        token_id: '42',
        metadata_uri: 'https://meta.io/42',
      });
      nftHandler.onAttach(node, cfg, ctx);

      expect(ctx.emit).toHaveBeenCalledWith(
        'nft_verify_ownership',
        expect.objectContaining({
          node,
          chain: 'ethereum',
          contractAddress: '0xABC',
          tokenId: '42',
        })
      );
      expect(ctx.emit).toHaveBeenCalledWith(
        'nft_load_metadata',
        expect.objectContaining({
          node,
          uri: 'https://meta.io/42',
        })
      );
    });

    it('does NOT auto-verify when contract_address is empty', () => {
      nftHandler.onAttach(node, config, ctx);
      expect(ctx.emit).not.toHaveBeenCalledWith('nft_verify_ownership', expect.anything());
    });

    it('fetches metadata from contract when no URI provided', () => {
      const cfg = makeConfig({ contract_address: '0xABC', token_id: '42' });
      nftHandler.onAttach(node, cfg, ctx);

      expect(ctx.emit).toHaveBeenCalledWith(
        'nft_fetch_metadata_uri',
        expect.objectContaining({
          node,
          chain: 'ethereum',
          contractAddress: '0xABC',
          tokenId: '42',
        })
      );
    });
  });

  // ======== DETACH ========

  describe('detach', () => {
    it('clears state on detach', () => {
      nftHandler.onAttach(node, config, ctx);
      expect(getState(node)).toBeDefined();
      nftHandler.onDetach!(node, config, ctx);
      expect(getState(node)).toBeUndefined();
    });
  });

  // ======== OWNERSHIP VERIFICATION ========

  describe('ownership verification', () => {
    it('sets verified state on nft_ownership_verified', () => {
      nftHandler.onAttach(node, config, ctx);

      nftHandler.onEvent!(node, config, ctx, {
        type: 'nft_ownership_verified',
        ownerAddress: '0xOwner123',
        standard: 'ERC721',
      });

      const s = getState(node);
      expect(s.isVerified).toBe(true);
      expect(s.isLoading).toBe(false);
      expect(s.ownerAddress).toBe('0xOwner123');
      expect(s.tokenStandard).toBe('ERC721');
      expect(s.lastVerificationTime).toBeGreaterThan(0);
    });

    it('emits on_nft_verified', () => {
      nftHandler.onAttach(node, config, ctx);
      ctx.emit.mockClear();

      nftHandler.onEvent!(node, config, ctx, {
        type: 'nft_ownership_verified',
        ownerAddress: '0xOwner',
        standard: 'ERC1155',
      });

      expect(ctx.emit).toHaveBeenCalledWith('on_nft_verified', {
        node,
        owner: '0xOwner',
        standard: 'ERC1155',
      });
    });

    it('displays badge when display_ownership is true', () => {
      const cfg = makeConfig({ display_ownership: true });
      nftHandler.onAttach(node, cfg, ctx);
      ctx.emit.mockClear();

      nftHandler.onEvent!(node, cfg, ctx, {
        type: 'nft_ownership_verified',
        ownerAddress: '0xBadge',
        standard: 'ERC721',
      });

      expect(ctx.emit).toHaveBeenCalledWith('nft_display_badge', {
        node,
        owner: '0xBadge',
      });
    });

    it('does NOT display badge when display_ownership is false', () => {
      nftHandler.onAttach(node, config, ctx);
      ctx.emit.mockClear();

      nftHandler.onEvent!(node, config, ctx, {
        type: 'nft_ownership_verified',
        ownerAddress: '0xNoBadge',
        standard: 'ERC721',
      });

      expect(ctx.emit).not.toHaveBeenCalledWith('nft_display_badge', expect.anything());
    });

    it('handles verification failure', () => {
      nftHandler.onAttach(node, config, ctx);
      const s = getState(node);
      s.isLoading = true;
      ctx.emit.mockClear();

      nftHandler.onEvent!(node, config, ctx, {
        type: 'nft_verification_failed',
        error: 'Contract not found',
      });

      expect(s.isLoading).toBe(false);
      expect(s.isVerified).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('on_nft_error', {
        node,
        error: 'Contract not found',
      });
    });

    it('re-verifies on nft_verify event', () => {
      const cfg = makeConfig({
        contract_address: '0xC',
        token_id: '1',
        rpc_endpoint: 'https://rpc.io',
      });
      nftHandler.onAttach(node, cfg, ctx);
      ctx.emit.mockClear();

      nftHandler.onEvent!(node, cfg, ctx, { type: 'nft_verify' });

      expect(ctx.emit).toHaveBeenCalledWith(
        'nft_verify_ownership',
        expect.objectContaining({
          contractAddress: '0xC',
          tokenId: '1',
          rpcEndpoint: 'https://rpc.io',
        })
      );
    });
  });

  // ======== METADATA ========

  describe('metadata loading', () => {
    it('stores metadata on nft_metadata_loaded', () => {
      nftHandler.onAttach(node, config, ctx);
      ctx.emit.mockClear();

      const metadata = {
        name: 'Cool NFT',
        description: 'A rare item',
        image: 'https://img.io/1.png',
        attributes: [{ trait_type: 'Color', value: 'Blue' }],
      };

      nftHandler.onEvent!(node, config, ctx, {
        type: 'nft_metadata_loaded',
        metadata,
      });

      const s = getState(node);
      expect(s.metadata).toEqual(metadata);
      expect(ctx.emit).toHaveBeenCalledWith('on_nft_metadata', { node, metadata });
    });

    it('refreshes metadata on nft_refresh_metadata with URI', () => {
      const cfg = makeConfig({ metadata_uri: 'https://meta.io/1' });
      nftHandler.onAttach(node, cfg, ctx);
      ctx.emit.mockClear();

      nftHandler.onEvent!(node, cfg, ctx, { type: 'nft_refresh_metadata' });

      expect(ctx.emit).toHaveBeenCalledWith('nft_load_metadata', {
        node,
        uri: 'https://meta.io/1',
      });
    });

    it('fetches metadata URI from contract when no URI configured', () => {
      const cfg = makeConfig({ contract_address: '0xD', token_id: '5' });
      nftHandler.onAttach(node, cfg, ctx);
      ctx.emit.mockClear();

      nftHandler.onEvent!(node, cfg, ctx, { type: 'nft_refresh_metadata' });

      expect(ctx.emit).toHaveBeenCalledWith(
        'nft_fetch_metadata_uri',
        expect.objectContaining({
          contractAddress: '0xD',
          tokenId: '5',
        })
      );
    });
  });

  // ======== TRANSFER ========

  describe('transfer lifecycle', () => {
    it('initiates transfer when enabled', () => {
      const cfg = makeConfig({
        transfer_enabled: true,
        chain: 'base',
        contract_address: '0xT',
        token_id: '7',
      });
      nftHandler.onAttach(node, cfg, ctx);
      const s = getState(node);
      s.ownerAddress = '0xSeller';
      ctx.emit.mockClear();

      nftHandler.onEvent!(node, cfg, ctx, {
        type: 'nft_transfer',
        toAddress: '0xBuyer',
      });

      expect(ctx.emit).toHaveBeenCalledWith('nft_initiate_transfer', {
        node,
        chain: 'base',
        contract: '0xT',
        tokenId: '7',
        from: '0xSeller',
        to: '0xBuyer',
      });
    });

    it('uses explicit fromAddress over state owner', () => {
      const cfg = makeConfig({ transfer_enabled: true, contract_address: '0xT', token_id: '1' });
      nftHandler.onAttach(node, cfg, ctx);
      getState(node).ownerAddress = '0xStateOwner';
      ctx.emit.mockClear();

      nftHandler.onEvent!(node, cfg, ctx, {
        type: 'nft_transfer',
        fromAddress: '0xExplicitFrom',
        toAddress: '0xBuyer',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'nft_initiate_transfer',
        expect.objectContaining({
          from: '0xExplicitFrom',
        })
      );
    });

    it('rejects transfer when disabled', () => {
      const cfg = makeConfig({ transfer_enabled: false });
      nftHandler.onAttach(node, cfg, ctx);
      ctx.emit.mockClear();

      nftHandler.onEvent!(node, cfg, ctx, {
        type: 'nft_transfer',
        toAddress: '0xBuyer',
      });

      expect(ctx.emit).toHaveBeenCalledWith('on_nft_error', {
        node,
        error: 'Transfers not enabled',
      });
      expect(ctx.emit).not.toHaveBeenCalledWith('nft_initiate_transfer', expect.anything());
    });

    it('updates owner on transfer complete', () => {
      nftHandler.onAttach(node, config, ctx);
      const s = getState(node);
      s.ownerAddress = '0xOldOwner';
      ctx.emit.mockClear();

      nftHandler.onEvent!(node, config, ctx, {
        type: 'nft_transfer_complete',
        newOwner: '0xNewOwner',
        txHash: '0xhash123',
      });

      expect(s.ownerAddress).toBe('0xNewOwner');
      expect(ctx.emit).toHaveBeenCalledWith('on_nft_transferred', {
        node,
        from: '0xOldOwner',
        to: '0xNewOwner',
        transactionHash: '0xhash123',
      });
    });
  });

  // ======== OWNER CHECK ========

  describe('owner check', () => {
    it('returns true for matching owner (case-insensitive)', () => {
      nftHandler.onAttach(node, config, ctx);
      getState(node).ownerAddress = '0xAbCdEf';
      ctx.emit.mockClear();

      nftHandler.onEvent!(node, config, ctx, {
        type: 'nft_check_owner',
        address: '0xABCDEF',
      });

      expect(ctx.emit).toHaveBeenCalledWith('nft_owner_check_result', {
        node,
        address: '0xABCDEF',
        isOwner: true,
        currentOwner: '0xAbCdEf',
      });
    });

    it('returns false for non-matching address', () => {
      nftHandler.onAttach(node, config, ctx);
      getState(node).ownerAddress = '0xOwner';
      ctx.emit.mockClear();

      nftHandler.onEvent!(node, config, ctx, {
        type: 'nft_check_owner',
        address: '0xStranger',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'nft_owner_check_result',
        expect.objectContaining({
          isOwner: false,
        })
      );
    });
  });

  // ======== QUERY ========

  describe('query', () => {
    it('responds with full state on nft_query', () => {
      const cfg = makeConfig({ chain: 'polygon', contract_address: '0xQ', token_id: '99' });
      nftHandler.onAttach(node, cfg, ctx);
      const s = getState(node);
      s.isVerified = true;
      s.ownerAddress = '0xOwner';
      s.tokenStandard = 'ERC721';
      s.metadata = { name: 'Test', description: '', image: '', attributes: [] };
      ctx.emit.mockClear();

      nftHandler.onEvent!(node, cfg, ctx, {
        type: 'nft_query',
        queryId: 'q1',
      });

      expect(ctx.emit).toHaveBeenCalledWith('nft_info', {
        queryId: 'q1',
        node,
        isVerified: true,
        ownerAddress: '0xOwner',
        metadata: s.metadata,
        tokenStandard: 'ERC721',
        chain: 'polygon',
        contract: '0xQ',
        tokenId: '99',
      });
    });
  });

  // ======== PERIODIC RE-VERIFICATION ========

  describe('periodic re-verification', () => {
    it('triggers re-verify when interval elapsed', () => {
      const cfg = makeConfig({
        verification_interval: 1000,
        contract_address: '0xR',
        token_id: '1',
      });
      nftHandler.onAttach(node, cfg, ctx);
      const s = getState(node);
      s.isVerified = true;
      s.lastVerificationTime = Date.now() - 2000; // 2s ago
      ctx.emit.mockClear();

      nftHandler.onUpdate!(node, cfg, ctx, 16);

      expect(ctx.emit).toHaveBeenCalledWith(
        'nft_verify_ownership',
        expect.objectContaining({
          contractAddress: '0xR',
        })
      );
    });

    it('does NOT re-verify before interval', () => {
      const cfg = makeConfig({
        verification_interval: 5000,
        contract_address: '0xR',
        token_id: '1',
      });
      nftHandler.onAttach(node, cfg, ctx);
      const s = getState(node);
      s.isVerified = true;
      s.lastVerificationTime = Date.now(); // just now
      ctx.emit.mockClear();

      nftHandler.onUpdate!(node, cfg, ctx, 16);

      expect(ctx.emit).not.toHaveBeenCalled();
    });

    it('does NOT re-verify when interval is 0', () => {
      nftHandler.onAttach(node, config, ctx);
      getState(node).isVerified = true;
      ctx.emit.mockClear();

      nftHandler.onUpdate!(node, config, ctx, 16);

      expect(ctx.emit).not.toHaveBeenCalled();
    });
  });

  // ======== EDGE CASES ========

  describe('edge cases', () => {
    it('ignores events when state is uninitialized', () => {
      const bare = makeNode('bare');
      nftHandler.onEvent!(bare, config, ctx, {
        type: 'nft_ownership_verified',
        ownerAddress: '0x',
        standard: 'ERC721',
      });
      expect(ctx.emit).not.toHaveBeenCalled();
    });

    it('skips update when no state', () => {
      const bare = makeNode('bare');
      nftHandler.onUpdate!(bare, config, ctx, 16);
      // No crash
    });

    it('handles SPL token standard', () => {
      nftHandler.onAttach(node, config, ctx);
      nftHandler.onEvent!(node, config, ctx, {
        type: 'nft_ownership_verified',
        ownerAddress: 'SolAddr123',
        standard: 'SPL',
      });

      expect(getState(node).tokenStandard).toBe('SPL');
    });
  });
});
