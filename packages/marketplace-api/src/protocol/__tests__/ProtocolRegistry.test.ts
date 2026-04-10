import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProtocolRegistry,
  createProtocolRegistry,
  ProtocolRegistryError,
} from '../ProtocolRegistry';
import {
  PROTOCOL_CONSTANTS,
  ethToWei,
  weiToEth,
  calculateRevenueDistribution,
} from '@holoscript/core';
import type { ImportChainNode } from '@holoscript/core';

// =============================================================================
// Mock fetch for server-side registry calls
// =============================================================================

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// =============================================================================
// Test provenance fixtures
// =============================================================================

const MOCK_PROVENANCE = {
  hash: 'abc123def456789012345678901234567890123456789012345678901234abcd',
  author: 'brian',
  created: '2026-03-27T00:00:00Z',
  license: 'cc_by' as const,
  version: 1,
  publishMode: 'original' as const,
  imports: [] as Array<{ path: string; hash?: string; author?: string }>,
};

const MOCK_REMIX_PROVENANCE = {
  ...MOCK_PROVENANCE,
  publishMode: 'remix' as const,
  imports: [{ path: '@maria/warrior', hash: 'maria-hash-abc', author: 'maria' }],
};

const MOCK_SOURCE = 'scene test { object cube { position: [0,0,0] } }';

// =============================================================================
// Constructor
// =============================================================================

describe('ProtocolRegistry — constructor', () => {
  it('creates with default config', () => {
    const registry = new ProtocolRegistry();
    expect(registry.getRegistryUrl()).toBe(PROTOCOL_CONSTANTS.REGISTRY_BASE_URL);
    expect(registry.isOnChainEnabled()).toBe(false);
  });

  it('creates with custom registry URL', () => {
    const registry = new ProtocolRegistry({
      registryUrl: 'https://custom.example.com',
    });
    expect(registry.getRegistryUrl()).toBe('https://custom.example.com');
  });

  it('factory function works', () => {
    const registry = createProtocolRegistry({ testnet: true });
    expect(registry).toBeInstanceOf(ProtocolRegistry);
  });
});

// =============================================================================
// previewRevenue — pure calculation, no network
// =============================================================================

describe('ProtocolRegistry — previewRevenue', () => {
  const registry = new ProtocolRegistry();

  it('calculates revenue for original (no imports)', () => {
    const dist = registry.previewRevenue('0.01', '@brian', []);

    expect(dist.totalPrice).toBe(ethToWei('0.01'));
    expect(dist.flows).toHaveLength(2); // platform + creator

    const platform = dist.flows.find((f) => f.reason === 'platform')!;
    const creator = dist.flows.find((f) => f.reason === 'creator')!;

    expect(platform.bps).toBe(250);
    expect(creator.recipient).toBe('@brian');
  });

  it('calculates revenue with imports', () => {
    const imports: ImportChainNode[] = [
      { contentHash: 'abc', author: '@maria', depth: 1, children: [] },
    ];

    const dist = registry.previewRevenue('0.01', '@brian', imports);

    const royalty = dist.flows.find((f) => f.reason === 'import_royalty')!;
    expect(royalty.recipient).toBe('@maria');
    expect(royalty.bps).toBe(500); // 5%
  });

  it('calculates revenue with referral', () => {
    const dist = registry.previewRevenue('0.01', '@brian', [], {
      referrer: '@curator',
    });

    const referral = dist.flows.find((f) => f.reason === 'referral')!;
    expect(referral.recipient).toBe('@curator');
    expect(referral.bps).toBe(200); // 2%
  });

  it('returns empty flows for zero price', () => {
    const dist = registry.previewRevenue('0', '@brian', []);
    expect(dist.flows).toHaveLength(0);
  });

  it('all flows sum to total price', () => {
    const imports: ImportChainNode[] = [
      {
        contentHash: 'a',
        author: '@a',
        depth: 1,
        children: [{ contentHash: 'b', author: '@b', depth: 2, children: [] }],
      },
    ];

    const dist = registry.previewRevenue('0.05', '@creator', imports, {
      referrer: '@ref',
    });

    const total = dist.flows.reduce((s, f) => s + f.amount, 0n);
    expect(total).toBe(ethToWei('0.05'));
  });
});

// =============================================================================
// getCollectUrl
// =============================================================================

describe('ProtocolRegistry — getCollectUrl', () => {
  it('returns correct URL', () => {
    const registry = new ProtocolRegistry({
      registryUrl: 'https://holoscript.net',
    });
    const url = registry.getCollectUrl('abc123');
    expect(url).toBe('https://holoscript.net/collect/abc123');
  });
});

// =============================================================================
// getRecord — server-side lookup
// =============================================================================

describe('ProtocolRegistry — getRecord', () => {
  const registry = new ProtocolRegistry({
    registryUrl: 'https://test.holoscript.net',
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns record when found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        contentHash: 'abc',
        author: '0x1234',
        importHashes: [],
        license: 'cc_by',
        publishMode: 'original',
        timestamp: 1234567890,
        metadataURI: 'https://test.holoscript.net/metadata/abc',
        price: '10000000000000000', // 0.01 ETH as string
        referralBps: 200,
      }),
    });

    const record = await registry.getRecord('abc');

    expect(record).not.toBeNull();
    expect(record!.contentHash).toBe('abc');
    expect(record!.price).toBe(10000000000000000n);
    expect(record!.license).toBe('cc_by');
  });

  it('returns null for 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const record = await registry.getRecord('nonexistent');
    expect(record).toBeNull();
  });

  it('throws on server error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(registry.getRecord('abc')).rejects.toThrow(ProtocolRegistryError);
  });
});

// =============================================================================
// getByAuthor
// =============================================================================

describe('ProtocolRegistry — getByAuthor', () => {
  const registry = new ProtocolRegistry({
    registryUrl: 'https://test.holoscript.net',
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns array of records', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          contentHash: 'a',
          author: '0x1',
          price: '0',
          importHashes: [],
          license: 'free',
          publishMode: 'original',
          timestamp: 1,
          metadataURI: '',
          referralBps: 200,
        },
        {
          contentHash: 'b',
          author: '0x1',
          price: '100',
          importHashes: [],
          license: 'cc_by',
          publishMode: 'original',
          timestamp: 2,
          metadataURI: '',
          referralBps: 200,
        },
      ],
    });

    const records = await registry.getByAuthor('0x1');
    expect(records).toHaveLength(2);
    expect(records[0].price).toBe(0n);
    expect(records[1].price).toBe(100n);
  });

  it('throws on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    await expect(registry.getByAuthor('0x1')).rejects.toThrow(ProtocolRegistryError);
  });
});

// =============================================================================
// publish — server-side flow (no on-chain)
// =============================================================================

describe('ProtocolRegistry — publish (server-side only)', () => {
  const registry = new ProtocolRegistry({
    registryUrl: 'https://test.holoscript.net',
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('publishes original composition', async () => {
    // Mock metadata storage
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ metadataURI: 'https://test.holoscript.net/metadata/abc' }),
    });
    // Mock registry registration
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sceneId: 'abc123de',
        sceneUrl: 'https://test.holoscript.net/scene/abc123de',
        embedUrl: 'https://test.holoscript.net/embed/abc123de',
      }),
    });

    const result = await registry.publish(MOCK_PROVENANCE, MOCK_SOURCE, {
      price: '0.01',
    });

    expect(result.contentHash).toBe(MOCK_PROVENANCE.hash);
    expect(result.collectUrl).toContain(MOCK_PROVENANCE.hash);
    expect(result.registryUrl).toContain(MOCK_PROVENANCE.hash);
    expect(result.revenuePreview.totalPrice).toBe(ethToWei('0.01'));
    expect(result.zoraResult).toBeUndefined(); // No on-chain
  });

  it('publishes free composition', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ metadataURI: 'uri' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const result = await registry.publish(MOCK_PROVENANCE, MOCK_SOURCE);

    expect(result.revenuePreview.totalPrice).toBe(0n);
    expect(result.revenuePreview.flows).toHaveLength(0);
  });

  it('handles metadata storage failure gracefully', async () => {
    // Metadata storage fails — should use fallback URI
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    // Registry registration
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const result = await registry.publish(MOCK_PROVENANCE, MOCK_SOURCE);
    // Should still succeed — metadata has fallback
    expect(result.contentHash).toBe(MOCK_PROVENANCE.hash);
  });
});

// =============================================================================
// collect — server-side flow
// =============================================================================

describe('ProtocolRegistry — collect (server-side only)', () => {
  const registry = new ProtocolRegistry({
    registryUrl: 'https://test.holoscript.net',
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('collects a free composition', async () => {
    // Mock getRecord
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        contentHash: 'abc',
        author: '0x1',
        importHashes: [],
        license: 'free',
        publishMode: 'original',
        timestamp: 1,
        metadataURI: '',
        price: '0',
        referralBps: 200,
      }),
    });
    // Mock server collect
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ editions: [1] }),
    });

    const result = await registry.collect('abc');

    expect(result.tokenId).toBe('abc');
    expect(result.pricePaid).toBe('0.0');
    expect(result.editions).toEqual([1]);
    expect(result.revenueFlows).toHaveLength(0); // Free = no flows
  });

  it('collects a priced composition with referrer', async () => {
    // Mock getRecord
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        contentHash: 'paid',
        author: '0x1',
        importHashes: [],
        license: 'cc_by',
        publishMode: 'original',
        timestamp: 1,
        metadataURI: '',
        price: '10000000000000000', // 0.01 ETH
        referralBps: 200,
      }),
    });
    // Mock server collect
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ editions: [5] }),
    });

    const result = await registry.collect('paid', {
      referrer: '@curator',
    });

    expect(result.pricePaid).toBe('0.01');
    const referral = result.revenueFlows.find((f) => f.reason === 'referral');
    expect(referral).toBeDefined();
    expect(referral!.recipient).toBe('@curator');
  });

  it('throws NOT_FOUND for missing composition', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(registry.collect('missing')).rejects.toThrow('not found');
  });
});

// =============================================================================
// isOnChainEnabled
// =============================================================================

describe('ProtocolRegistry — isOnChainEnabled', () => {
  it('returns false without collection address', () => {
    const registry = new ProtocolRegistry();
    expect(registry.isOnChainEnabled()).toBe(false);
  });

  it('returns false with collection but no wallet', () => {
    const registry = new ProtocolRegistry({
      collectionAddress: '0x1234567890123456789012345678901234567890' as `0x${string}`,
    });
    // Wallet isn't connected (no account provided)
    expect(registry.isOnChainEnabled()).toBe(false);
  });
});

// =============================================================================
// ProtocolRegistryError
// =============================================================================

describe('ProtocolRegistryError', () => {
  it('has correct name and code', () => {
    const err = new ProtocolRegistryError('test', 'TEST_CODE', { key: 'val' });
    expect(err.name).toBe('ProtocolRegistryError');
    expect(err.code).toBe('TEST_CODE');
    expect(err.details).toEqual({ key: 'val' });
    expect(err.message).toBe('test');
  });
});
