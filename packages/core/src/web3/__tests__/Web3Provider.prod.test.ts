/**
 * Web3Provider Production Tests
 *
 * Singleton, connect/disconnect, getMyAssets, mint.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Web3Provider } from '../Web3Provider';

describe('Web3Provider — Production', () => {
  let provider: Web3Provider;

  beforeEach(() => {
    // Reset singleton state
    provider = Web3Provider.getInstance();
    provider.isConnected = false;
    provider.walletAddress = null;
  });

  it('getInstance returns singleton', () => {
    const a = Web3Provider.getInstance();
    const b = Web3Provider.getInstance();
    expect(a).toBe(b);
  });

  it('starts disconnected', () => {
    expect(provider.isConnected).toBe(false);
    expect(provider.walletAddress).toBeNull();
    expect(provider.chainId).toBe(8453);
  });

  it('connect sets wallet address', async () => {
    const addr = await provider.connect();
    expect(provider.isConnected).toBe(true);
    expect(addr).toBeTruthy();
    expect(provider.walletAddress).toBe(addr);
  });

  it('disconnect clears state', async () => {
    await provider.connect();
    await provider.disconnect();
    expect(provider.isConnected).toBe(false);
    expect(provider.walletAddress).toBeNull();
  });

  it('getMyAssets returns empty when disconnected', async () => {
    const assets = await provider.getMyAssets();
    expect(assets).toEqual([]);
  });

  it('getMyAssets returns mock NFTs when connected', async () => {
    await provider.connect();
    const assets = await provider.getMyAssets();
    expect(assets.length).toBeGreaterThan(0);
    expect(assets[0]).toHaveProperty('contractAddress');
    expect(assets[0]).toHaveProperty('tokenId');
    expect(assets[0]).toHaveProperty('name');
  });

  it('mint fails when disconnected', async () => {
    await expect(provider.mint({})).rejects.toThrow('Wallet not connected');
  });

  it('mint returns tx hash when connected', async () => {
    await provider.connect();
    const result = await provider.mint({ name: 'TestNFT' });
    expect(result).toHaveProperty('transactionHash');
    expect(result).toHaveProperty('tokenId');
  });
});
