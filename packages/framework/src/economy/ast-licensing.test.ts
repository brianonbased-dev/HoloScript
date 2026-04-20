/**
 * Tests for X402 AST Asset Licensing (task _zoje).
 *
 * Coverage:
 *   - License schema validation (defaults, rejection of garbage)
 *   - Content hash determinism (CRLF + BOM normalisation)
 *   - extractASTLicense across @license / @asset / @credit shapes
 *   - createLicensedASTAsset round-trip via @holoscript/core parser
 *   - verifyASTAssetManifest (hash mismatch + signature path)
 *   - ASTLicenseGate: free pass, 402 challenge, payment settlement, cache,
 *     subscription window, revoke
 *   - ASTLicenseRegistry: dedupe, lookup, list
 *   - Error: unparsable source, missing license, malformed inputs
 */

import { describe, it, expect } from 'vitest';
import {
  LICENSE_KINDS,
  astAssetLicenseSchema,
  hashASTSource,
  canonicalManifestBytes,
  extractASTLicense,
  createLicensedASTAsset,
  verifyASTAssetManifest,
  ASTLicenseGate,
  ASTLicenseRegistry,
  type ASTAssetLicense,
  type ASTAssetManifest,
} from './ast-licensing';
import { X402Facilitator, X402_VERSION, type X402PaymentPayload } from './x402-facilitator';

// =============================================================================
// FIXTURES
// =============================================================================

const RECIPIENT = '0x4242424242424242424242424242424242424242';
const PAYER = '0x1111111111111111111111111111111111111111';
const AUTHOR = '0xfeedfacefeedfacefeedfacefeedfacefeedface';

function fixtureLicense(overrides: Partial<ASTAssetLicense> = {}): ASTAssetLicense {
  return astAssetLicenseSchema.parse({
    licenseId: 'lic-01',
    kind: 'commercial',
    priceUSDC: 0.05,
    chain: 'base',
    recipient: RECIPIENT,
    terms: 'You may use this AST asset for one project. No redistribution.',
    ...overrides,
  });
}

function buildSignedPayment(opts: {
  amountBaseUnits: string;
  to: string;
  from?: string;
  nonce?: string;
}): X402PaymentPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    x402Version: X402_VERSION,
    scheme: 'exact',
    network: 'base',
    payload: {
      signature: '0x' + 'ab'.repeat(65),
      authorization: {
        from: opts.from ?? PAYER,
        to: opts.to,
        value: opts.amountBaseUnits,
        validAfter: String(now - 60),
        validBefore: String(now + 600),
        nonce: opts.nonce ?? `nonce-${Math.random().toString(36).slice(2)}-${now}`,
      },
    },
  };
}

const SOURCE_WITH_LICENSE_DIRECTIVE = `
@license(
  licenseId: "doc-cube-v1",
  kind: "commercial",
  priceUSDC: 0.10,
  chain: "base",
  recipient: "${RECIPIENT}",
  terms: "Single-project commercial use; attribution required."
)
object Cube {
  position: [0, 1, 0]
}
`.trim();

const SOURCE_WITH_CREDIT_TRAIT = `
@credit(price: 0.05, chain: "base", recipient: "${RECIPIENT}", description: "Premium scene")
object PremiumScene {
  position: [0, 0, 0]
}
`.trim();

const SOURCE_WITHOUT_LICENSE = `
object Cube {
  position: [0, 1, 0]
}
`.trim();

// =============================================================================
// SCHEMA
// =============================================================================

describe('astAssetLicenseSchema', () => {
  it('accepts a minimal valid license and applies defaults', () => {
    const out = astAssetLicenseSchema.parse({
      licenseId: 'lic-1',
      kind: 'commercial',
      priceUSDC: 0.05,
      chain: 'base',
      recipient: RECIPIENT,
      terms: 'one project use',
    });
    expect(out.expiresAt).toBe(0);
    expect(out.subscriptionPeriodSec).toBe(0);
    expect(out.derivativesAllowed).toBe(false);
    expect(out.attributionRequired).toBe(true);
    expect(out.revision).toBe(1);
  });

  it('rejects unknown kinds', () => {
    const r = astAssetLicenseSchema.safeParse({
      licenseId: 'lic-1',
      kind: 'rainbow-mode',
      priceUSDC: 0.01,
      chain: 'base',
      recipient: RECIPIENT,
      terms: 'x',
    });
    expect(r.success).toBe(false);
  });

  it('rejects negative or extreme prices', () => {
    expect(
      astAssetLicenseSchema.safeParse({
        licenseId: 'lic-1',
        kind: 'commercial',
        priceUSDC: -1,
        chain: 'base',
        recipient: RECIPIENT,
        terms: 'x',
      }).success
    ).toBe(false);
    expect(
      astAssetLicenseSchema.safeParse({
        licenseId: 'lic-1',
        kind: 'commercial',
        priceUSDC: 100_000,
        chain: 'base',
        recipient: RECIPIENT,
        terms: 'x',
      }).success
    ).toBe(false);
  });

  it('rejects non-alphanumeric recipients (catches prototype pollution-y inputs)', () => {
    const r = astAssetLicenseSchema.safeParse({
      licenseId: 'lic-1',
      kind: 'commercial',
      priceUSDC: 0.01,
      chain: 'base',
      recipient: '0x__proto__',
      terms: 'x',
    });
    expect(r.success).toBe(false);
  });

  it('exposes the LICENSE_KINDS tuple for downstream UIs', () => {
    expect(LICENSE_KINDS).toContain('commercial');
    expect(LICENSE_KINDS).toContain('subscription');
    expect(LICENSE_KINDS.length).toBeGreaterThanOrEqual(8);
  });
});

// =============================================================================
// HASHING + CANONICALISATION
// =============================================================================

describe('hashASTSource', () => {
  it('is deterministic across CRLF and LF line endings', () => {
    const lf = 'object Cube {\n  position: [0,1,0]\n}\n';
    const crlf = 'object Cube {\r\n  position: [0,1,0]\r\n}\r\n';
    expect(hashASTSource(lf)).toBe(hashASTSource(crlf));
  });

  it('strips a leading BOM before hashing', () => {
    const plain = 'object X {}';
    const bommed = '\ufeff' + plain;
    expect(hashASTSource(plain)).toBe(hashASTSource(bommed));
  });

  it('changes when actual content changes', () => {
    expect(hashASTSource('object A {}')).not.toBe(hashASTSource('object B {}'));
  });

  it('returns a 64-char hex string (SHA-256)', () => {
    const h = hashASTSource('object Cube {}');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('canonicalManifestBytes', () => {
  it('produces identical bytes regardless of license-key insertion order', () => {
    const a = canonicalManifestBytes({
      assetId: 'a',
      contentHash: 'h',
      author: AUTHOR,
      createdAt: 1,
      license: fixtureLicense(),
    });
    const b = canonicalManifestBytes({
      author: AUTHOR,
      contentHash: 'h',
      createdAt: 1,
      assetId: 'a',
      license: fixtureLicense(),
    });
    expect(a).toBe(b);
  });
});

// =============================================================================
// DIRECTIVE EXTRACTION
// =============================================================================

describe('extractASTLicense', () => {
  it('finds a @license directive emitted as a generic-trait fallback', () => {
    // The parser turns @license(...) into { type: 'trait', name: 'license', config: {...} }
    const root = {
      type: 'object',
      directives: [
        {
          type: 'trait',
          name: 'license',
          config: { licenseId: 'lic-1', kind: 'commercial', priceUSDC: 0.05 },
        },
      ],
    } as never;
    const ext = extractASTLicense(root);
    expect(ext?.source).toBe('license-directive');
    expect(ext?.raw.licenseId).toBe('lic-1');
  });

  it('promotes a @credit trait to a derived commercial license', () => {
    const root = {
      type: 'object',
      directives: [
        {
          type: 'trait',
          name: 'credit',
          config: {
            price: 0.07,
            chain: 'base',
            recipient: RECIPIENT,
            description: 'Premium twin',
          },
        },
      ],
    } as never;
    const ext = extractASTLicense(root);
    expect(ext?.source).toBe('credit-trait');
    expect(ext?.raw.priceUSDC).toBe(0.07);
    expect(ext?.raw.recipient).toBe(RECIPIENT);
    expect(ext?.raw.kind).toBe('commercial');
  });

  it('returns null when no license-bearing directive exists', () => {
    const root = {
      type: 'object',
      directives: [{ type: 'trait', name: 'grabbable', config: {} }],
    } as never;
    expect(extractASTLicense(root)).toBeNull();
  });

  it('walks children to find a nested license', () => {
    const root = {
      type: 'object',
      directives: [],
      children: [
        {
          type: 'object',
          directives: [
            {
              type: 'trait',
              name: 'license',
              config: { licenseId: 'nested', kind: 'view-only', priceUSDC: 0 },
            },
          ],
        },
      ],
    } as never;
    const ext = extractASTLicense(root);
    expect(ext?.raw.licenseId).toBe('nested');
  });
});

// =============================================================================
// REGISTRATION ROUND-TRIP
// =============================================================================

describe('createLicensedASTAsset', () => {
  it('parses .hsplus source via @holoscript/core (no regex) and binds metadata', async () => {
    const { asset } = await createLicensedASTAsset({
      source: SOURCE_WITHOUT_LICENSE,
      author: AUTHOR,
      license: fixtureLicense({ licenseId: 'override-1' }),
      createdAt: 1_700_000_000,
    });
    expect(asset.manifest.assetId).toMatch(/^ast_[0-9a-f]{24}$/);
    expect(asset.manifest.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(asset.manifest.license.licenseId).toBe('override-1');
    expect(asset.manifest.author).toBe(AUTHOR);
    expect(asset.source).toBe(SOURCE_WITHOUT_LICENSE);
    expect(asset.astRoot).toBeTruthy();
  });

  it('extracts an in-source @license directive when no override is supplied', async () => {
    const { asset, licenseFromAST } = await createLicensedASTAsset({
      source: SOURCE_WITH_LICENSE_DIRECTIVE,
      author: AUTHOR,
    });
    expect(licenseFromAST).toBe(true);
    expect(asset.manifest.license.licenseId).toBe('doc-cube-v1');
    expect(asset.manifest.license.priceUSDC).toBeCloseTo(0.1);
  });

  it('promotes an @credit trait into a license when no @license directive exists', async () => {
    const { asset, licenseFromAST } = await createLicensedASTAsset({
      source: SOURCE_WITH_CREDIT_TRAIT,
      author: AUTHOR,
    });
    expect(licenseFromAST).toBe(true);
    expect(asset.manifest.license.priceUSDC).toBeCloseTo(0.05);
    expect(asset.manifest.license.recipient).toBe(RECIPIENT);
  });

  it('throws when source is empty', async () => {
    await expect(
      createLicensedASTAsset({ source: '', author: AUTHOR, license: fixtureLicense() })
    ).rejects.toThrow(/non-empty/);
  });

  it('throws when author is missing or too short', async () => {
    await expect(
      createLicensedASTAsset({
        source: SOURCE_WITHOUT_LICENSE,
        author: '',
        license: fixtureLicense(),
      })
    ).rejects.toThrow(/author wallet address/);
  });

  it('invokes the optional signer with deterministic canonical bytes', async () => {
    const calls: string[] = [];
    const { asset } = await createLicensedASTAsset({
      source: SOURCE_WITHOUT_LICENSE,
      author: AUTHOR,
      license: fixtureLicense(),
      signer: async (bytes) => {
        calls.push(bytes);
        return '0xsig-of-' + bytes.length;
      },
    });
    expect(calls).toHaveLength(1);
    expect(asset.manifest.signature).toMatch(/^0xsig-of-/);
  });
});

// =============================================================================
// MANIFEST VERIFICATION
// =============================================================================

describe('verifyASTAssetManifest', () => {
  it('passes when the source matches the manifest hash', async () => {
    const { asset } = await createLicensedASTAsset({
      source: SOURCE_WITHOUT_LICENSE,
      author: AUTHOR,
      license: fixtureLicense(),
    });
    const r = await verifyASTAssetManifest(asset.manifest, SOURCE_WITHOUT_LICENSE);
    expect(r.ok).toBe(true);
    expect(r.error).toBeNull();
  });

  it('fails when the source has been tampered with', async () => {
    const { asset } = await createLicensedASTAsset({
      source: SOURCE_WITHOUT_LICENSE,
      author: AUTHOR,
      license: fixtureLicense(),
    });
    const r = await verifyASTAssetManifest(
      asset.manifest,
      SOURCE_WITHOUT_LICENSE + '\nobject Sneaky {}'
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Content hash mismatch/);
  });

  it('rejects manifests whose license has been mutated to a bad shape', async () => {
    const { asset } = await createLicensedASTAsset({
      source: SOURCE_WITHOUT_LICENSE,
      author: AUTHOR,
      license: fixtureLicense(),
    });
    const tampered: ASTAssetManifest = {
      ...asset.manifest,
      license: { ...asset.manifest.license, kind: 'rainbow' as never },
    };
    const r = await verifyASTAssetManifest(tampered, SOURCE_WITHOUT_LICENSE);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/License schema invalid/);
  });

  it('runs the optional signature verifier and rejects bad signatures', async () => {
    const { asset } = await createLicensedASTAsset({
      source: SOURCE_WITHOUT_LICENSE,
      author: AUTHOR,
      license: fixtureLicense(),
      signer: async () => '0xsig',
    });
    const fail = await verifyASTAssetManifest(asset.manifest, SOURCE_WITHOUT_LICENSE, async () => false);
    expect(fail.ok).toBe(false);
    expect(fail.error).toMatch(/Signature/);
    const pass = await verifyASTAssetManifest(asset.manifest, SOURCE_WITHOUT_LICENSE, async () => true);
    expect(pass.ok).toBe(true);
  });
});

// =============================================================================
// ASTLicenseGate
// =============================================================================

describe('ASTLicenseGate', () => {
  async function buildAsset(license: Partial<ASTAssetLicense> = {}) {
    const reg = await createLicensedASTAsset({
      source: SOURCE_WITHOUT_LICENSE,
      author: AUTHOR,
      license: fixtureLicense(license),
    });
    return reg.asset;
  }

  it('grants free access when priceUSDC == 0 (view-only)', async () => {
    const asset = await buildAsset({ kind: 'view-only', priceUSDC: 0 });
    const gate = new ASTLicenseGate(asset);
    const r = gate.attemptAccess();
    expect(r.granted).toBe(true);
    if (r.granted) expect(r.mode).toBe('free');
  });

  it('issues a 402 PaymentRequired body for paid licenses', async () => {
    const asset = await buildAsset({ priceUSDC: 0.05 });
    const gate = new ASTLicenseGate(asset);
    const r = gate.attemptAccess();
    expect(r.granted).toBe(false);
    if (!r.granted) {
      expect(r.paymentRequired.x402Version).toBe(1);
      expect(r.paymentRequired.accepts[0].maxAmountRequired).toBe('50000');
      expect(r.paymentRequired.accepts[0].payTo.toLowerCase()).toBe(RECIPIENT.toLowerCase());
      expect(r.requiredAmountBaseUnits).toBe('50000');
      expect(r.resource).toContain(asset.manifest.assetId);
    }
  });

  it('round-trips a payment: 402 then settled then cached', async () => {
    const asset = await buildAsset({ priceUSDC: 0.05 });
    const facilitator = new X402Facilitator({
      recipientAddress: RECIPIENT,
      chain: 'base',
      optimisticExecution: true,
    });
    const gate = new ASTLicenseGate(asset, { facilitator });

    // Step 1: 402 challenge
    const r1 = gate.attemptAccess(PAYER);
    expect(r1.granted).toBe(false);

    // Step 2: build a structurally-valid payment and settle (in-memory micro path)
    const payment = buildSignedPayment({
      amountBaseUnits: gate.getRequiredAmountBaseUnits(),
      to: RECIPIENT,
    });
    const r2 = await gate.submitPayment(payment);
    expect(r2.granted).toBe(true);
    if (r2.granted && r2.mode !== 'free') {
      expect(r2.mode).toBe('settled');
    }

    // Step 3: subsequent attempt is cached
    const r3 = gate.attemptAccess(PAYER);
    expect(r3.granted).toBe(true);
    if (r3.granted) expect(r3.mode).toBe('cached');
    expect(gate.hasCachedAccess(PAYER)).toBe(true);
  });

  it('rejects on facilitator failure (insufficient amount) and stays at 402', async () => {
    const asset = await buildAsset({ priceUSDC: 0.05 });
    const facilitator = new X402Facilitator({
      recipientAddress: RECIPIENT,
      chain: 'base',
    });
    const gate = new ASTLicenseGate(asset, { facilitator });
    const tooLittle = buildSignedPayment({
      amountBaseUnits: '1', // < 50000 required
      to: RECIPIENT,
    });
    const r = await gate.submitPayment(tooLittle);
    expect(r.granted).toBe(false);
  });

  it('respects subscriptionPeriodSec when caching the grant window', async () => {
    const asset = await buildAsset({
      kind: 'subscription',
      priceUSDC: 0.05,
      subscriptionPeriodSec: 60 * 60, // 1h
    });
    const facilitator = new X402Facilitator({ recipientAddress: RECIPIENT, chain: 'base' });
    const gate = new ASTLicenseGate(asset, { facilitator });
    const payment = buildSignedPayment({
      amountBaseUnits: gate.getRequiredAmountBaseUnits(),
      to: RECIPIENT,
    });
    const settled = await gate.submitPayment(payment);
    expect(settled.granted).toBe(true);
    expect(gate.hasCachedAccess(PAYER)).toBe(true);
  });

  it('revoke() drops the cached payer', async () => {
    const asset = await buildAsset({ priceUSDC: 0.05 });
    const facilitator = new X402Facilitator({ recipientAddress: RECIPIENT, chain: 'base' });
    const gate = new ASTLicenseGate(asset, { facilitator });
    const payment = buildSignedPayment({
      amountBaseUnits: gate.getRequiredAmountBaseUnits(),
      to: RECIPIENT,
    });
    await gate.submitPayment(payment);
    expect(gate.hasCachedAccess(PAYER)).toBe(true);
    expect(gate.revoke(PAYER)).toBe(true);
    expect(gate.hasCachedAccess(PAYER)).toBe(false);
  });

  it('releasePayload returns AST + source for a granted asset', async () => {
    const asset = await buildAsset({ kind: 'view-only', priceUSDC: 0 });
    const gate = new ASTLicenseGate(asset);
    const payload = gate.releasePayload();
    expect(payload.source).toBe(SOURCE_WITHOUT_LICENSE);
    expect(payload.manifest.assetId).toBe(asset.manifest.assetId);
    expect(payload.astRoot).toBeTruthy();
  });

  it('exposes stats for downstream observability', async () => {
    const asset = await buildAsset({ priceUSDC: 0.05 });
    const gate = new ASTLicenseGate(asset);
    const stats = gate.getStats();
    expect(stats.cachedPayers).toBe(0);
    expect(stats.priceUSDC).toBeCloseTo(0.05);
    expect(stats.resource).toContain(asset.manifest.assetId);
  });
});

// =============================================================================
// REGISTRY
// =============================================================================

describe('ASTLicenseRegistry', () => {
  it('registers, looks up, and lists assets', async () => {
    const reg = new ASTLicenseRegistry();
    const a = await createLicensedASTAsset({
      source: SOURCE_WITHOUT_LICENSE,
      author: AUTHOR,
      license: fixtureLicense({ licenseId: 'lic-A' }),
      assetId: 'asset-A',
    });
    const b = await createLicensedASTAsset({
      source: 'object Other {}',
      author: AUTHOR,
      license: fixtureLicense({ licenseId: 'lic-B' }),
      assetId: 'asset-B',
    });
    reg.register(a.asset);
    reg.register(b.asset);
    expect(reg.size()).toBe(2);
    expect(reg.list().map((m) => m.assetId).sort()).toEqual(['asset-A', 'asset-B']);
    expect(reg.getAsset('asset-A')?.manifest.license.licenseId).toBe('lic-A');
    expect(reg.getGate('asset-B')).toBeDefined();
  });

  it('rejects duplicate registrations to keep manifests immutable', async () => {
    const reg = new ASTLicenseRegistry();
    const a = await createLicensedASTAsset({
      source: SOURCE_WITHOUT_LICENSE,
      author: AUTHOR,
      license: fixtureLicense(),
      assetId: 'dup',
    });
    reg.register(a.asset);
    expect(() => reg.register(a.asset)).toThrow(/already registered/);
  });

  it('unregister removes both asset and gate', async () => {
    const reg = new ASTLicenseRegistry();
    const a = await createLicensedASTAsset({
      source: SOURCE_WITHOUT_LICENSE,
      author: AUTHOR,
      license: fixtureLicense(),
      assetId: 'temp',
    });
    reg.register(a.asset);
    expect(reg.unregister('temp')).toBe(true);
    expect(reg.getAsset('temp')).toBeUndefined();
    expect(reg.getGate('temp')).toBeUndefined();
  });
});
