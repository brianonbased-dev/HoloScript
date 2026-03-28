import { describe, it, expect } from 'vitest';
import {
  calculateRevenueDistribution,
  resolveImportChain,
  formatRevenueDistribution,
  ethToWei,
  weiToEth,
} from '../revenue-splitter';
import type { ImportChainNode } from '../protocol-types';
import { PROTOCOL_CONSTANTS } from '../protocol-types';

// =============================================================================
// ethToWei / weiToEth helpers
// =============================================================================

describe('ethToWei', () => {
  it('converts whole ETH', () => {
    expect(ethToWei('1')).toBe(10n ** 18n);
  });

  it('converts fractional ETH', () => {
    expect(ethToWei('0.01')).toBe(10n ** 16n);
  });

  it('converts zero', () => {
    expect(ethToWei('0')).toBe(0n);
  });

  it('handles many decimals', () => {
    expect(ethToWei('0.000777')).toBe(777_000_000_000_000n);
  });
});

describe('weiToEth', () => {
  it('converts 1 ETH', () => {
    expect(weiToEth(10n ** 18n)).toBe('1.0');
  });

  it('converts 0.01 ETH', () => {
    expect(weiToEth(10n ** 16n)).toBe('0.01');
  });

  it('converts zero', () => {
    expect(weiToEth(0n)).toBe('0.0');
  });
});

// =============================================================================
// calculateRevenueDistribution — no imports (original)
// =============================================================================

describe('calculateRevenueDistribution — original (no imports)', () => {
  const price = ethToWei('0.01'); // 10^16 wei

  it('gives creator 97.5% after platform fee', () => {
    const dist = calculateRevenueDistribution(price, '@brian', []);

    expect(dist.totalPrice).toBe(price);
    expect(dist.flows).toHaveLength(2); // platform + creator

    const platform = dist.flows.find(f => f.reason === 'platform')!;
    const creator = dist.flows.find(f => f.reason === 'creator')!;

    expect(platform.amount).toBe(price * 250n / 10000n); // 2.5%
    expect(creator.amount).toBe(price - platform.amount); // 97.5%
    expect(creator.recipient).toBe('@brian');
  });

  it('returns empty flows for zero price', () => {
    const dist = calculateRevenueDistribution(0n, '@brian', []);
    expect(dist.flows).toHaveLength(0);
    expect(dist.totalPrice).toBe(0n);
  });
});

// =============================================================================
// calculateRevenueDistribution — single import
// =============================================================================

describe('calculateRevenueDistribution — single import', () => {
  const price = ethToWei('0.01');
  const imports: ImportChainNode[] = [
    { contentHash: 'abc123', author: '@maria', depth: 1, children: [] },
  ];

  it('gives 5% to import author, 2.5% to platform, rest to creator', () => {
    const dist = calculateRevenueDistribution(price, '@brian', imports);

    const platform = dist.flows.find(f => f.reason === 'platform')!;
    const importRoyalty = dist.flows.find(f => f.reason === 'import_royalty')!;
    const creator = dist.flows.find(f => f.reason === 'creator')!;

    expect(platform.amount).toBe(price * 250n / 10000n); // 2.5%
    expect(importRoyalty.amount).toBe(price * 500n / 10000n); // 5%
    expect(importRoyalty.recipient).toBe('@maria');
    expect(importRoyalty.depth).toBe(1);
    expect(creator.recipient).toBe('@brian');

    // Total should equal price
    const totalDistributed = dist.flows.reduce((sum, f) => sum + f.amount, 0n);
    expect(totalDistributed).toBe(price);
  });
});

// =============================================================================
// calculateRevenueDistribution — referral
// =============================================================================

describe('calculateRevenueDistribution — with referrer', () => {
  const price = ethToWei('0.01');

  it('deducts 2% referral from creator share', () => {
    const dist = calculateRevenueDistribution(price, '@brian', [], {
      referrer: '@curator',
    });

    const referral = dist.flows.find(f => f.reason === 'referral')!;
    const creator = dist.flows.find(f => f.reason === 'creator')!;

    expect(referral.amount).toBe(price * 200n / 10000n); // 2%
    expect(referral.recipient).toBe('@curator');

    // Creator gets 97.5% - 2% = 95.5%
    const platform = dist.flows.find(f => f.reason === 'platform')!;
    expect(creator.amount).toBe(price - platform.amount - referral.amount);
  });
});

// =============================================================================
// calculateRevenueDistribution — 2-level chain
// =============================================================================

describe('calculateRevenueDistribution — 2-level import chain', () => {
  const price = ethToWei('0.01');
  const imports: ImportChainNode[] = [
    {
      contentHash: 'userB-hash', author: '@userB', depth: 1,
      children: [
        { contentHash: 'brian-hash', author: '@brian', depth: 2, children: [] },
      ],
    },
  ];

  it('distributes 5% to L1 and 5% to L2', () => {
    const dist = calculateRevenueDistribution(price, '@userC', imports);

    const l1 = dist.flows.find(f => f.reason === 'import_royalty' && f.depth === 1)!;
    const l2 = dist.flows.find(f => f.reason === 'import_royalty' && f.depth === 2)!;
    const creator = dist.flows.find(f => f.reason === 'creator')!;

    expect(l1.recipient).toBe('@userB');
    expect(l1.amount).toBe(price * 500n / 10000n); // 5%
    expect(l2.recipient).toBe('@brian');
    expect(l2.amount).toBe(price * 500n / 10000n); // 5%
    expect(creator.recipient).toBe('@userC');

    // Total = price
    const total = dist.flows.reduce((sum, f) => sum + f.amount, 0n);
    expect(total).toBe(price);
  });
});

// =============================================================================
// calculateRevenueDistribution — 3-level chain (max depth)
// =============================================================================

describe('calculateRevenueDistribution — 3-level chain', () => {
  const price = ethToWei('0.1');
  const imports: ImportChainNode[] = [
    {
      contentHash: 'l1-hash', author: '@l1', depth: 1,
      children: [
        {
          contentHash: 'l2-hash', author: '@l2', depth: 2,
          children: [
            { contentHash: 'l3-hash', author: '@l3', depth: 3, children: [] },
          ],
        },
      ],
    },
  ];

  it('distributes 5% to each of 3 levels', () => {
    const dist = calculateRevenueDistribution(price, '@creator', imports);

    const royalties = dist.flows.filter(f => f.reason === 'import_royalty');
    expect(royalties).toHaveLength(3);

    const depths = royalties.map(r => r.depth);
    expect(depths).toContain(1);
    expect(depths).toContain(2);
    expect(depths).toContain(3);

    // Each gets 5% of 0.1 ETH = 0.005 ETH
    for (const r of royalties) {
      expect(r.amount).toBe(price * 500n / 10000n);
    }

    // Creator: 100% - 2.5% platform - 15% import = 82.5%
    const creator = dist.flows.find(f => f.reason === 'creator')!;
    const expectedCreator = price - (price * 250n / 10000n) - 3n * (price * 500n / 10000n);
    expect(creator.amount).toBe(expectedCreator);
  });
});

// =============================================================================
// calculateRevenueDistribution — depth 4+ excluded
// =============================================================================

describe('calculateRevenueDistribution — beyond max depth', () => {
  const price = ethToWei('0.01');
  const imports: ImportChainNode[] = [
    {
      contentHash: 'l1', author: '@l1', depth: 1,
      children: [{
        contentHash: 'l2', author: '@l2', depth: 2,
        children: [{
          contentHash: 'l3', author: '@l3', depth: 3,
          children: [{
            contentHash: 'l4', author: '@l4', depth: 4, children: [],
          }],
        }],
      }],
    },
  ];

  it('ignores imports beyond depth 3', () => {
    const dist = calculateRevenueDistribution(price, '@creator', imports);
    const royalties = dist.flows.filter(f => f.reason === 'import_royalty');

    expect(royalties).toHaveLength(3); // L1, L2, L3 only
    expect(royalties.find(r => r.depth === 4)).toBeUndefined();
  });
});

// =============================================================================
// calculateRevenueDistribution — multiple imports same level
// =============================================================================

describe('calculateRevenueDistribution — multiple imports at same level', () => {
  const price = ethToWei('0.01');
  const imports: ImportChainNode[] = [
    { contentHash: 'a', author: '@alice', depth: 1, children: [] },
    { contentHash: 'b', author: '@bob', depth: 1, children: [] },
  ];

  it('splits level royalty equally among imports', () => {
    const dist = calculateRevenueDistribution(price, '@creator', imports);
    const royalties = dist.flows.filter(f => f.reason === 'import_royalty');

    expect(royalties).toHaveLength(2);

    // 5% of price split between 2 = 2.5% each
    const levelRoyalty = price * 500n / 10000n;
    const perImport = levelRoyalty / 2n;

    // One gets dust (remainder), both should sum to levelRoyalty
    const totalRoyalty = royalties.reduce((sum, r) => sum + r.amount, 0n);
    expect(totalRoyalty).toBe(levelRoyalty);

    // Each is close to half
    for (const r of royalties) {
      expect(r.amount).toBeGreaterThanOrEqual(perImport);
    }
  });
});

// =============================================================================
// calculateRevenueDistribution — self-import (creator = import author)
// =============================================================================

describe('calculateRevenueDistribution — self-import', () => {
  const price = ethToWei('0.01');
  const imports: ImportChainNode[] = [
    { contentHash: 'self-hash', author: '@brian', depth: 1, children: [] },
  ];

  it('still distributes import royalty (both go to same person)', () => {
    const dist = calculateRevenueDistribution(price, '@brian', imports);

    const royalty = dist.flows.find(f => f.reason === 'import_royalty')!;
    const creator = dist.flows.find(f => f.reason === 'creator')!;

    expect(royalty.recipient).toBe('@brian');
    expect(creator.recipient).toBe('@brian');

    // Brian gets royalty + creator share = effectively 97.5%
    const brianTotal = royalty.amount + creator.amount;
    const platformFee = dist.flows.find(f => f.reason === 'platform')!.amount;
    expect(brianTotal + platformFee).toBe(price);
  });
});

// =============================================================================
// calculateRevenueDistribution — deduplication
// =============================================================================

describe('calculateRevenueDistribution — deduplication', () => {
  const price = ethToWei('0.01');
  // Same import referenced via two paths
  const imports: ImportChainNode[] = [
    { contentHash: 'shared', author: '@shared', depth: 1, children: [] },
    { contentHash: 'shared', author: '@shared', depth: 1, children: [] },
  ];

  it('counts duplicate imports only once', () => {
    const dist = calculateRevenueDistribution(price, '@creator', imports);
    const royalties = dist.flows.filter(f => f.reason === 'import_royalty');

    // Should be 1, not 2
    expect(royalties).toHaveLength(1);
    expect(royalties[0].recipient).toBe('@shared');
  });
});

// =============================================================================
// resolveImportChain
// =============================================================================

describe('resolveImportChain', () => {
  it('resolves single-level imports', async () => {
    const imports = [
      { hash: 'abc', author: '@alice', path: '@alice/model' },
    ];

    const resolver = async () => null; // No deeper records

    const chain = await resolveImportChain(imports, resolver);
    expect(chain).toHaveLength(1);
    expect(chain[0].contentHash).toBe('abc');
    expect(chain[0].author).toBe('@alice');
    expect(chain[0].depth).toBe(1);
    expect(chain[0].children).toHaveLength(0);
  });

  it('resolves nested imports recursively', async () => {
    const imports = [
      { hash: 'b-hash', author: '@b', path: '@b/remix' },
    ];

    const resolver = async (hash: string) => {
      if (hash === 'b-hash') {
        return { importHashes: ['a-hash'], author: '@b' };
      }
      if (hash === 'a-hash') {
        return { importHashes: [], author: '@a' };
      }
      return null;
    };

    const chain = await resolveImportChain(imports, resolver);
    expect(chain).toHaveLength(1);
    expect(chain[0].children).toHaveLength(1);
    expect(chain[0].children[0].contentHash).toBe('a-hash');
    expect(chain[0].children[0].author).toBe('@a');
    expect(chain[0].children[0].depth).toBe(2);
  });

  it('respects maxDepth', async () => {
    const imports = [
      { hash: 'l1', author: '@l1', path: '@l1/x' },
    ];

    const resolver = async (hash: string) => {
      if (hash === 'l1') return { importHashes: ['l2'], author: '@l1' };
      if (hash === 'l2') return { importHashes: ['l3'], author: '@l2' };
      return null;
    };

    const chain = await resolveImportChain(imports, resolver, 1);
    expect(chain).toHaveLength(1);
    // maxDepth=1 means we don't go deeper
    expect(chain[0].children).toHaveLength(0);
  });

  it('skips imports without hashes', async () => {
    const imports = [
      { path: './local-file' }, // No hash
      { hash: 'abc', author: '@a', path: '@a/model' },
    ];

    const chain = await resolveImportChain(imports, async () => null);
    expect(chain).toHaveLength(1);
    expect(chain[0].contentHash).toBe('abc');
  });

  it('deduplicates by hash', async () => {
    const imports = [
      { hash: 'same', author: '@a', path: '@a/x' },
      { hash: 'same', author: '@a', path: '@a/y' },
    ];

    const chain = await resolveImportChain(imports, async () => null);
    expect(chain).toHaveLength(1);
  });
});

// =============================================================================
// formatRevenueDistribution
// =============================================================================

describe('formatRevenueDistribution', () => {
  it('formats zero-price as free', () => {
    const lines = formatRevenueDistribution({ totalPrice: 0n, flows: [] });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Free');
  });

  it('formats flows with percentages', () => {
    const price = ethToWei('0.01');
    const dist = calculateRevenueDistribution(price, '@brian', []);
    const lines = formatRevenueDistribution(dist);

    expect(lines.some(l => l.includes('platform'))).toBe(true);
    expect(lines.some(l => l.includes('@brian'))).toBe(true);
    expect(lines.some(l => l.includes('creator'))).toBe(true);
  });
});

// =============================================================================
// Invariant: all flows always sum to totalPrice
// =============================================================================

describe('revenue invariant — flows sum to price', () => {
  const price = ethToWei('0.123456789');

  it('sums correctly with no imports', () => {
    const dist = calculateRevenueDistribution(price, '@x', []);
    const total = dist.flows.reduce((s, f) => s + f.amount, 0n);
    expect(total).toBe(price);
  });

  it('sums correctly with imports + referral', () => {
    const imports: ImportChainNode[] = [
      {
        contentHash: 'a', author: '@a', depth: 1,
        children: [
          { contentHash: 'b', author: '@b', depth: 2, children: [] },
        ],
      },
      { contentHash: 'c', author: '@c', depth: 1, children: [] },
    ];

    const dist = calculateRevenueDistribution(price, '@creator', imports, {
      referrer: '@ref',
    });

    const total = dist.flows.reduce((s, f) => s + f.amount, 0n);
    expect(total).toBe(price);
  });
});
