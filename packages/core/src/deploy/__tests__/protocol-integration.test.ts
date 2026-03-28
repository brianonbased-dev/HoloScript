/**
 * Protocol Integration Tests
 *
 * End-to-end scenarios testing the HoloScript Publishing Protocol:
 * provenance → license check → revenue calculation → publish flow.
 */

import { describe, it, expect } from 'vitest';
import {
  computeContentHash,
  classifyPublishMode,
  extractImports,
  generateProvenance,
} from '../provenance';
import { checkLicenseCompatibility } from '../license-checker';
import type { ImportedLicense } from '../license-checker';
import {
  calculateRevenueDistribution,
  resolveImportChain,
  formatRevenueDistribution,
  ethToWei,
  weiToEth,
} from '../revenue-splitter';
import { PROTOCOL_CONSTANTS } from '../protocol-types';
import type { ImportChainNode, RevenueFlow } from '../protocol-types';

// =============================================================================
// Scenario 1: Publish original → collect → verify revenue
// =============================================================================

describe('E2E: Publish original composition', () => {
  const source = `
    scene MyOriginal {
      object Cube { position: [0, 1, 0] }
      object Sphere { position: [2, 0, 0] }
    }
  `;

  it('generates valid provenance for original work', () => {
    const ast = { imports: [], body: [{ type: 'scene' }] };
    const prov = generateProvenance(source, ast, {
      author: '@brian',
      license: 'cc_by',
    });

    expect(prov.publishMode).toBe('original');
    expect(prov.hash).toHaveLength(64);
    expect(prov.author).toBe('@brian');
    expect(prov.license).toBe('cc_by');
    expect(prov.imports).toHaveLength(0);
  });

  it('revenue flows correctly for original at 0.01 ETH', () => {
    const price = ethToWei('0.01');
    const dist = calculateRevenueDistribution(price, '@brian', []);

    expect(dist.flows).toHaveLength(2); // platform + creator
    const platform = dist.flows.find(f => f.reason === 'platform')!;
    const creator = dist.flows.find(f => f.reason === 'creator')!;

    // Platform gets 2.5%
    expect(platform.bps).toBe(PROTOCOL_CONSTANTS.PLATFORM_FEE_BPS);
    // Creator gets 97.5%
    expect(creator.recipient).toBe('@brian');
    expect(creator.amount).toBe(price - platform.amount);

    // Total = price
    const total = dist.flows.reduce((s, f) => s + f.amount, 0n);
    expect(total).toBe(price);
  });
});

// =============================================================================
// Scenario 2: Publish remix → collect → verify upstream royalties
// =============================================================================

describe('E2E: Publish remix with upstream royalties', () => {
  const originalSource = 'scene Original { object Warrior {} }';
  const remixSource = `
    import { Warrior } from "@brian/warrior"
    scene MyRemix {
      object Warrior { position: [0, 0, 0] }
      object Shield { position: [1, 0, 0] }
    }
  `;

  it('classifies remix correctly', () => {
    const ast = {
      imports: [{ path: '@brian/warrior' }],
      body: [{ type: 'scene' }, { type: 'ObjectDeclaration' }],
    };
    expect(classifyPublishMode(ast)).toBe('remix');
  });

  it('extracts imports from remix', () => {
    const ast = {
      imports: [{ path: '@brian/warrior', hash: 'abc123', author: '@brian' }],
    };
    const imports = extractImports(ast);
    expect(imports).toHaveLength(1);
    expect(imports[0].path).toBe('@brian/warrior');
    expect(imports[0].hash).toBe('abc123');
  });

  it('distributes 5% to import author on collect', () => {
    const price = ethToWei('0.01');
    const imports: ImportChainNode[] = [
      { contentHash: 'abc123', author: '@brian', depth: 1, children: [] },
    ];

    const dist = calculateRevenueDistribution(price, '@maria', imports);

    const platform = dist.flows.find(f => f.reason === 'platform')!;
    const royalty = dist.flows.find(f => f.reason === 'import_royalty')!;
    const creator = dist.flows.find(f => f.reason === 'creator')!;

    expect(platform.bps).toBe(250); // 2.5%
    expect(royalty.recipient).toBe('@brian');
    expect(royalty.bps).toBe(500); // 5%
    expect(creator.recipient).toBe('@maria');

    // Creator gets remainder: 100% - 2.5% - 5% = 92.5%
    const total = dist.flows.reduce((s, f) => s + f.amount, 0n);
    expect(total).toBe(price);
  });
});

// =============================================================================
// Scenario 3: 3-level import chain → all levels get paid
// =============================================================================

describe('E2E: 3-level deep import chain', () => {
  const price = ethToWei('0.1');

  // A imports B, B imports C — when someone collects A, all three get paid
  const imports: ImportChainNode[] = [
    {
      contentHash: 'b-hash', author: '@userB', depth: 1,
      children: [
        {
          contentHash: 'c-hash', author: '@userC', depth: 2,
          children: [
            { contentHash: 'd-hash', author: '@userD', depth: 3, children: [] },
          ],
        },
      ],
    },
  ];

  it('pays all 3 import levels + platform + creator', () => {
    const dist = calculateRevenueDistribution(price, '@userA', imports);

    const royalties = dist.flows.filter(f => f.reason === 'import_royalty');
    expect(royalties).toHaveLength(3);

    // Each level gets 5%
    for (const r of royalties) {
      expect(r.amount).toBe(price * 500n / 10000n);
    }

    // Creator gets 100% - 2.5% platform - 15% imports = 82.5%
    const creator = dist.flows.find(f => f.reason === 'creator')!;
    expect(creator.recipient).toBe('@userA');
    const expectedCreator = price - (price * 250n / 10000n) - 3n * (price * 500n / 10000n);
    expect(creator.amount).toBe(expectedCreator);

    // Total = price
    const total = dist.flows.reduce((s, f) => s + f.amount, 0n);
    expect(total).toBe(price);
  });

  it('depth 4+ is excluded from revenue', () => {
    const deepImports: ImportChainNode[] = [
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

    const dist = calculateRevenueDistribution(price, '@creator', deepImports);
    const royalties = dist.flows.filter(f => f.reason === 'import_royalty');
    expect(royalties).toHaveLength(3); // L1, L2, L3 only
    expect(royalties.find(r => r.depth === 4)).toBeUndefined();
  });
});

// =============================================================================
// Scenario 4: Free collect (price=0) → no revenue
// =============================================================================

describe('E2E: Free collect', () => {
  it('produces no revenue flows for zero price', () => {
    const dist = calculateRevenueDistribution(0n, '@brian', []);
    expect(dist.flows).toHaveLength(0);
    expect(dist.totalPrice).toBe(0n);
  });

  it('produces no revenue even with imports', () => {
    const imports: ImportChainNode[] = [
      { contentHash: 'abc', author: '@maria', depth: 1, children: [] },
    ];
    const dist = calculateRevenueDistribution(0n, '@brian', imports);
    expect(dist.flows).toHaveLength(0);
  });

  it('formats as free', () => {
    const dist = calculateRevenueDistribution(0n, '@brian', []);
    const lines = formatRevenueDistribution(dist);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Free');
  });
});

// =============================================================================
// Scenario 5: License compatibility blocks publish
// =============================================================================

describe('E2E: License enforcement', () => {
  it('blocks importing exclusive content', () => {
    const imports: ImportedLicense[] = [
      { path: '@protected/model', license: 'exclusive' },
    ];
    const result = checkLicenseCompatibility('free', imports);
    expect(result.compatible).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('forces cc_by_sa on composition using share-alike content', () => {
    const imports: ImportedLicense[] = [
      { path: '@open/lib', license: 'cc_by_sa' },
    ];
    const result = checkLicenseCompatibility('free', imports);
    expect(result.compatible).toBe(true);
    expect(result.forcedLicense).toBe('cc_by_sa');
  });

  it('blocks incompatible cc_by_sa + cc_by_nc mix', () => {
    const imports: ImportedLicense[] = [
      { path: '@share-alike/a', license: 'cc_by_sa' },
      { path: '@noncommercial/b', license: 'cc_by_nc' },
    ];
    const result = checkLicenseCompatibility('free', imports);
    expect(result.compatible).toBe(false);
  });
});

// =============================================================================
// Scenario 6: Referral reward flows correctly
// =============================================================================

describe('E2E: Referral rewards', () => {
  const price = ethToWei('0.01');

  it('referrer gets 2% from creator share', () => {
    const dist = calculateRevenueDistribution(price, '@creator', [], {
      referrer: '@curator',
    });

    const referral = dist.flows.find(f => f.reason === 'referral')!;
    expect(referral.recipient).toBe('@curator');
    expect(referral.bps).toBe(PROTOCOL_CONSTANTS.DEFAULT_REFERRAL_BPS); // 200 = 2%

    // Total still equals price
    const total = dist.flows.reduce((s, f) => s + f.amount, 0n);
    expect(total).toBe(price);
  });

  it('referral + import royalties all sum to price', () => {
    const imports: ImportChainNode[] = [
      { contentHash: 'a', author: '@a', depth: 1, children: [] },
    ];

    const dist = calculateRevenueDistribution(price, '@creator', imports, {
      referrer: '@ref',
    });

    const total = dist.flows.reduce((s, f) => s + f.amount, 0n);
    expect(total).toBe(price);

    // All 4 flow types present
    const reasons = dist.flows.map(f => f.reason);
    expect(reasons).toContain('platform');
    expect(reasons).toContain('import_royalty');
    expect(reasons).toContain('referral');
    expect(reasons).toContain('creator');
  });
});

// =============================================================================
// Scenario 7: Content hash determinism
// =============================================================================

describe('E2E: Content hash integrity', () => {
  it('same source always produces same hash', () => {
    const source = 'scene Test { object Cube { position: [0,0,0] } }';
    const h1 = computeContentHash(source);
    const h2 = computeContentHash(source);
    expect(h1).toBe(h2);
  });

  it('different source produces different hash', () => {
    const h1 = computeContentHash('scene A {}');
    const h2 = computeContentHash('scene B {}');
    expect(h1).not.toBe(h2);
  });

  it('CRLF normalization ensures cross-platform consistency', () => {
    const hCRLF = computeContentHash('line1\r\nline2');
    const hLF = computeContentHash('line1\nline2');
    expect(hCRLF).toBe(hLF);
  });

  it('hash is embedded in provenance', () => {
    const source = 'scene HashTest { object X {} }';
    const prov = generateProvenance(source, { imports: [], body: [] }, {
      author: 'test',
      license: 'free',
    });
    expect(prov.hash).toBe(computeContentHash(source));
  });
});

// =============================================================================
// Scenario 8: Protocol constants are consistent
// =============================================================================

describe('E2E: Protocol constants', () => {
  it('platform fee is 2.5% (250 bps)', () => {
    expect(PROTOCOL_CONSTANTS.PLATFORM_FEE_BPS).toBe(250);
  });

  it('import royalty is 5% per level (500 bps)', () => {
    expect(PROTOCOL_CONSTANTS.IMPORT_ROYALTY_BPS).toBe(500);
  });

  it('max import depth is 3', () => {
    expect(PROTOCOL_CONSTANTS.MAX_IMPORT_DEPTH).toBe(3);
  });

  it('referral is 2% (200 bps)', () => {
    expect(PROTOCOL_CONSTANTS.DEFAULT_REFERRAL_BPS).toBe(200);
  });

  it('chain is Base (8453)', () => {
    expect(PROTOCOL_CONSTANTS.CHAIN.id).toBe(8453);
  });

  it('Zora mint fee is 0.000777 ETH', () => {
    expect(PROTOCOL_CONSTANTS.ZORA_MINT_FEE_WEI).toBe(ethToWei('0.000777'));
  });
});

// =============================================================================
// Scenario 9: Import chain resolution
// =============================================================================

describe('E2E: Import chain resolution', () => {
  it('resolves a 2-level import chain', async () => {
    const imports = [
      { hash: 'b-hash', author: '@b', path: '@b/remix' },
    ];

    const resolver = async (hash: string) => {
      if (hash === 'b-hash') return { importHashes: ['a-hash'], author: '@b' };
      if (hash === 'a-hash') return { importHashes: [], author: '@a' };
      return null;
    };

    const chain = await resolveImportChain(imports, resolver);
    expect(chain).toHaveLength(1);
    expect(chain[0].author).toBe('@b');
    expect(chain[0].depth).toBe(1);
    expect(chain[0].children).toHaveLength(1);
    expect(chain[0].children[0].author).toBe('@a');
    expect(chain[0].children[0].depth).toBe(2);
  });

  it('resolved chain feeds into revenue calculator', async () => {
    const chain: ImportChainNode[] = [
      {
        contentHash: 'b-hash', author: '@b', depth: 1,
        children: [
          { contentHash: 'a-hash', author: '@a', depth: 2, children: [] },
        ],
      },
    ];

    const price = ethToWei('0.05');
    const dist = calculateRevenueDistribution(price, '@c', chain);

    const royalties = dist.flows.filter(f => f.reason === 'import_royalty');
    expect(royalties).toHaveLength(2);
    expect(royalties.find(r => r.recipient === '@b')).toBeDefined();
    expect(royalties.find(r => r.recipient === '@a')).toBeDefined();

    const total = dist.flows.reduce((s, f) => s + f.amount, 0n);
    expect(total).toBe(price);
  });
});

// =============================================================================
// Scenario 10: Full publish flow simulation
// =============================================================================

describe('E2E: Full publish flow', () => {
  it('original → provenance → license check → revenue preview', () => {
    const source = 'scene Gallery { object Painting { texture: "art.png" } }';
    const ast = { imports: [], body: [{ type: 'scene' }] };

    // Step 1: Generate provenance
    const prov = generateProvenance(source, ast, {
      author: '@artist',
      license: 'cc_by',
    });
    expect(prov.publishMode).toBe('original');

    // Step 2: License check (no imports = always compatible)
    const licenseResult = checkLicenseCompatibility('cc_by', []);
    expect(licenseResult.compatible).toBe(true);

    // Step 3: Revenue preview
    const price = ethToWei('0.02');
    const dist = calculateRevenueDistribution(price, '@artist', []);

    expect(dist.totalPrice).toBe(price);
    const creator = dist.flows.find(f => f.reason === 'creator')!;
    expect(creator.recipient).toBe('@artist');

    // Step 4: Format for display
    const lines = formatRevenueDistribution(dist);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some(l => l.includes('@artist'))).toBe(true);
    expect(lines.some(l => l.includes('platform'))).toBe(true);
  });

  it('remix → provenance → license check → revenue with upstream', () => {
    const source = `
      import { Model } from "@alice/robot"
      scene Remix { object Model { scale: 2 } }
    `;
    const ast = {
      imports: [{ path: '@alice/robot', hash: 'robot-hash', author: '@alice' }],
      body: [{ type: 'scene' }],
    };

    // Step 1: Provenance
    const prov = generateProvenance(source, ast, {
      author: '@bob',
      license: 'cc_by',
    });
    expect(prov.publishMode).toBe('remix');

    // Step 2: License check
    const licenseResult = checkLicenseCompatibility('cc_by', [
      { path: '@alice/robot', license: 'cc_by' },
    ]);
    expect(licenseResult.compatible).toBe(true);

    // Step 3: Revenue with upstream
    const price = ethToWei('0.01');
    const importChain: ImportChainNode[] = [
      { contentHash: 'robot-hash', author: '@alice', depth: 1, children: [] },
    ];

    const dist = calculateRevenueDistribution(price, '@bob', importChain);
    const aliceRoyalty = dist.flows.find(f => f.reason === 'import_royalty')!;
    expect(aliceRoyalty.recipient).toBe('@alice');
    expect(aliceRoyalty.bps).toBe(500); // 5%

    const bobCreator = dist.flows.find(f => f.reason === 'creator')!;
    expect(bobCreator.recipient).toBe('@bob');

    // Total = price
    const total = dist.flows.reduce((s, f) => s + f.amount, 0n);
    expect(total).toBe(price);
  });
});
