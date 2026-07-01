import { describe, expect, it } from 'vitest';
import {
  HOLOHUB_INSTALL_RECEIPT_VERSION,
  createHoloHubInstallReceipt,
  validateHoloHubInstallReceipt,
  cloneHoloHubInstallReceipt,
  isSupportedHoloHubInstallDecision,
  isSupportedHoloHubInstallPaymentStatus,
  isSupportedHoloHubInstallSignatureStatus,
  type HoloHubInstallReceipt,
} from '../holohub-install-receipt';

const validReceiptInput: Omit<HoloHubInstallReceipt, 'hash' | 'hashAlgorithm'> = {
  schemaVersion: HOLOHUB_INSTALL_RECEIPT_VERSION,
  id: 'holohub_install_fixture',
  generatedAt: '2026-07-01T12:00:00.000Z',
  artifact: {
    kind: 'plugin',
    id: '@test/paid-widget',
    name: 'Paid Widget',
    version: '1.0.0',
    packageUrl: '/api/plugins/%40test%2Fpaid-widget/versions/1.0.0/download',
    shasum: 'a'.repeat(64),
    sizeBytes: 128,
    category: 'ui',
    author: 'testuser',
    license: 'MIT',
  },
  listing: {
    pricingModel: 'paid',
    priceCents: 250,
    currency: 'USD',
    marketplaceUrl: '/plugins/%40test%2Fpaid-widget',
  },
  x402: {
    status: 'verified',
    paymentId: 'pay_001',
    transactionHash: `0x${'1'.repeat(64)}`,
    payerAddress: `0x${'2'.repeat(40)}`,
    amount: 2.5,
    asset: 'USDC',
    network: 'base',
    contentId: '@test/paid-widget',
    verifiedAt: '2026-07-01T12:00:00.000Z',
  },
  signature: {
    status: 'signed',
    trusted: true,
    keyFingerprint: 'abcdef0123456789',
    author: 'testuser',
    signedAt: '2026-07-01T11:55:00.000Z',
    errors: [],
    warnings: [],
  },
  compatibility: {
    targetStudioVersion: '3.40.0',
    targetPlatform: 'web',
    compatible: true,
    warnings: [],
    errors: [],
  },
  dependencies: {
    installDependencies: true,
    resolved: [{ pluginId: '@test/base', version: '1.0.0' }],
    conflicts: [],
  },
  permissions: {
    requested: ['scene:read', 'ui:panel'],
    granted: ['ui:panel'],
    trustLevel: 'sandboxed',
  },
  decision: 'installable',
  installCommand: 'holoscript plugin install @test/paid-widget@1.0.0',
  replayKey: 'holohub:@test/paid-widget:1.0.0:pay_001',
  provenance: [
    'packages/framework/src/economy/holohub-install-receipt.ts',
    'packages/marketplace-api/src/PluginMarketplaceService.ts',
  ],
};

describe('HoloHub install receipt contract', () => {
  it('creates a canonical sha256 receipt hash', () => {
    const receipt = createHoloHubInstallReceipt(validReceiptInput);

    expect(receipt.hashAlgorithm).toBe('sha256');
    expect(receipt.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(validateHoloHubInstallReceipt(receipt)).toEqual([]);
  });

  it('rejects paid installs without verified x402 payment', () => {
    const receipt = createHoloHubInstallReceipt({
      ...validReceiptInput,
      x402: { status: 'required' },
      decision: 'blocked',
    });

    expect(validateHoloHubInstallReceipt(receipt)).toContain(
      'Paid HoloHub installs require a verified x402 receipt.'
    );
  });

  it('rejects installable receipts with unresolved dependency conflicts', () => {
    const receipt = createHoloHubInstallReceipt({
      ...validReceiptInput,
      dependencies: {
        ...validReceiptInput.dependencies,
        conflicts: ['Missing @test/base@^1.0.0'],
      },
    });

    expect(validateHoloHubInstallReceipt(receipt)).toContain(
      'Installable receipts cannot include unresolved dependency conflicts.'
    );
  });

  it('clones mutable arrays without aliasing the receipt', () => {
    const receipt = createHoloHubInstallReceipt(validReceiptInput);
    const clone = cloneHoloHubInstallReceipt(receipt);

    clone.permissions.granted.push('scene:read');

    expect(receipt.permissions.granted).toEqual(['ui:panel']);
    expect(clone.permissions.granted).toEqual(['ui:panel', 'scene:read']);
  });

  it('guards supported receipt enum values', () => {
    expect(isSupportedHoloHubInstallPaymentStatus('verified')).toBe(true);
    expect(isSupportedHoloHubInstallPaymentStatus('ambient')).toBe(false);
    expect(isSupportedHoloHubInstallSignatureStatus('signed')).toBe(true);
    expect(isSupportedHoloHubInstallSignatureStatus('forged')).toBe(false);
    expect(isSupportedHoloHubInstallDecision('installable')).toBe(true);
    expect(isSupportedHoloHubInstallDecision('maybe')).toBe(false);
  });
});
