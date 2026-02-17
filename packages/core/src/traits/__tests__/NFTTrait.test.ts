import { describe, it, expect, beforeEach } from 'vitest';
import { nftHandler } from '../NFTTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount, getLastEvent } from './traitTestHelpers';

describe('NFTTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    chain: 'ethereum' as const,
    contract_address: '0xABC123',
    token_id: '42',
    metadata_uri: 'ipfs://meta',
    display_ownership: false,
    transfer_enabled: true,
    verification_interval: 0,
    rpc_endpoint: 'https://rpc.example.com',
  };

  beforeEach(() => {
    node = createMockNode('nft');
    ctx = createMockContext();
    attachTrait(nftHandler, node, cfg, ctx);
  });

  it('verifies ownership and loads metadata on attach', () => {
    expect(getEventCount(ctx, 'nft_verify_ownership')).toBe(1);
    expect(getEventCount(ctx, 'nft_load_metadata')).toBe(1);
  });

  it('no verify without contract/token', () => {
    const n = createMockNode('n2');
    const c = createMockContext();
    attachTrait(nftHandler, n, { ...cfg, contract_address: '', token_id: '' }, c);
    expect(getEventCount(c, 'nft_verify_ownership')).toBe(0);
  });

  it('ownership verified sets state', () => {
    sendEvent(nftHandler, node, cfg, ctx, {
      type: 'nft_ownership_verified',
      ownerAddress: '0xOwner',
      standard: 'ERC721',
    });
    const s = (node as any).__nftState;
    expect(s.isVerified).toBe(true);
    expect(s.ownerAddress).toBe('0xOwner');
    expect(getEventCount(ctx, 'on_nft_verified')).toBe(1);
  });

  it('verification failed clears state', () => {
    sendEvent(nftHandler, node, cfg, ctx, { type: 'nft_verification_failed', error: 'invalid' });
    expect((node as any).__nftState.isVerified).toBe(false);
    expect(getEventCount(ctx, 'on_nft_error')).toBe(1);
  });

  it('metadata loaded stores metadata', () => {
    sendEvent(nftHandler, node, cfg, ctx, {
      type: 'nft_metadata_loaded',
      metadata: { name: 'Test NFT', description: 'A test', image: 'img.png', attributes: [] },
    });
    expect((node as any).__nftState.metadata.name).toBe('Test NFT');
    expect(getEventCount(ctx, 'on_nft_metadata')).toBe(1);
  });

  it('transfer initiates when enabled', () => {
    sendEvent(nftHandler, node, cfg, ctx, {
      type: 'nft_ownership_verified',
      ownerAddress: '0xOwner',
      standard: 'ERC721',
    });
    sendEvent(nftHandler, node, cfg, ctx, { type: 'nft_transfer', toAddress: '0xNew' });
    expect(getEventCount(ctx, 'nft_initiate_transfer')).toBe(1);
  });

  it('transfer blocked when disabled', () => {
    const n = createMockNode('n3');
    const c = createMockContext();
    attachTrait(nftHandler, n, { ...cfg, transfer_enabled: false }, c);
    sendEvent(nftHandler, n, { ...cfg, transfer_enabled: false }, c, { type: 'nft_transfer', toAddress: '0xNew' });
    expect(getEventCount(c, 'on_nft_error')).toBe(1);
    expect(getEventCount(c, 'nft_initiate_transfer')).toBe(0);
  });

  it('transfer_complete updates owner', () => {
    sendEvent(nftHandler, node, cfg, ctx, {
      type: 'nft_ownership_verified',
      ownerAddress: '0xOwner',
      standard: 'ERC721',
    });
    sendEvent(nftHandler, node, cfg, ctx, {
      type: 'nft_transfer_complete',
      newOwner: '0xNewOwner',
      txHash: '0xTx',
    });
    expect((node as any).__nftState.ownerAddress).toBe('0xNewOwner');
    expect(getEventCount(ctx, 'on_nft_transferred')).toBe(1);
  });

  it('check_owner verifies address', () => {
    sendEvent(nftHandler, node, cfg, ctx, {
      type: 'nft_ownership_verified',
      ownerAddress: '0xOwner',
      standard: 'ERC721',
    });
    sendEvent(nftHandler, node, cfg, ctx, { type: 'nft_check_owner', address: '0xowner' });
    const ev = getLastEvent(ctx, 'nft_owner_check_result') as any;
    expect(ev.isOwner).toBe(true); // Case-insensitive
  });

  it('query emits info', () => {
    sendEvent(nftHandler, node, cfg, ctx, { type: 'nft_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'nft_info')).toBe(1);
  });

  it('detach cleans up', () => {
    nftHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__nftState).toBeUndefined();
  });
});
