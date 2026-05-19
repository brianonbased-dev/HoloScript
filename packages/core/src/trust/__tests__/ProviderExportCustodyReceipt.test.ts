import { describe, it, expect } from 'vitest';
import {
  ProviderExportCustodyPayload,
  ProviderExportCustodyAdapterOptions,
  providerExportToReceiptInput,
  validateProviderExportCustody,
  stableProviderExportHash,
} from '../ProviderExportCustodyReceipt';
import { validateTrustReceipt } from '../TrustReceipt';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeValidPayload(
  overrides: Partial<ProviderExportCustodyPayload> = {},
): ProviderExportCustodyPayload {
  return {
    workflow: 'browser_account_export',
    provider: 'google_takeout',
    phase: 'intent_classification',
    providerLabel: 'Google',
    selectedProducts: ['Gmail', 'Google Photos'],
    deliveryMethod: 'email_link',
    archiveSizeBytes: 0,
    archiveFormat: 'zip',
    waitState: 'not_requested',
    cloudHandoff: false,
    connectedAppAccess: false,
    connectedAppCount: 0,
    managedAccount: false,
    blockers: [],
    browserProfile: 'not_declared',
    credentialAdjacent: false,
    accountMutationPerformed: false,
    sourceFileMutationPerformed: false,
    rawPrivateDataPublished: false,
    privatePathLeakedToPublicReceipt: false,
    fileCount: 0,
    archiveHash: '',
    receiptsCaptured: 1,
    ...overrides,
  };
}

function makeValidOptions(
  overrides: Partial<ProviderExportCustodyAdapterOptions> = {},
): ProviderExportCustodyAdapterOptions {
  return {
    passportDid: 'did:holoscript:test_actor',
    ...overrides,
  };
}

// ─── Validation Tests ─────────────────────────────────────────────────────────

describe('validateProviderExportCustody', () => {
  it('accepts a valid payload with all defaults', () => {
    const result = validateProviderExportCustody(makeValidPayload());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing workflow', () => {
    const result = validateProviderExportCustody(makeValidPayload({ workflow: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing workflow');
  });

  it('rejects missing provider', () => {
    const result = validateProviderExportCustody(makeValidPayload({ provider: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing provider');
  });

  it('rejects missing phase', () => {
    const result = validateProviderExportCustody(makeValidPayload({ phase: '' as never }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing phase');
  });

  it('rejects invalid phase', () => {
    const result = validateProviderExportCustody(makeValidPayload({ phase: 'invalid_phase' as never }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid phase'))).toBe(true);
  });

  it('rejects accountMutationPerformed=true', () => {
    const result = validateProviderExportCustody(makeValidPayload({ accountMutationPerformed: true }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('accountMutationPerformed'))).toBe(true);
  });

  it('rejects sourceFileMutationPerformed=true', () => {
    const result = validateProviderExportCustody(makeValidPayload({ sourceFileMutationPerformed: true }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('sourceFileMutationPerformed'))).toBe(true);
  });

  it('rejects rawPrivateDataPublished=true', () => {
    const result = validateProviderExportCustody(makeValidPayload({ rawPrivateDataPublished: true }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('rawPrivateDataPublished'))).toBe(true);
  });

  it('rejects privatePathLeakedToPublicReceipt=true', () => {
    const result = validateProviderExportCustody(makeValidPayload({ privatePathLeakedToPublicReceipt: true }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('privatePathLeakedToPublicReceipt'))).toBe(true);
  });

  it('rejects managedAccount=true without managedAccountType', () => {
    const result = validateProviderExportCustody(makeValidPayload({ managedAccount: true }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('managedAccountType'))).toBe(true);
  });

  it('accepts managedAccount=true with managedAccountType', () => {
    const result = validateProviderExportCustody(
      makeValidPayload({ managedAccount: true, managedAccountType: 'enterprise' }),
    );
    expect(result.valid).toBe(true);
  });

  it('requires archiveHash for verify_files phase', () => {
    const result = validateProviderExportCustody(
      makeValidPayload({ phase: 'verify_files', archiveHash: '' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('archiveHash'))).toBe(true);
  });

  it('accepts verify_files phase with archiveHash', () => {
    const result = validateProviderExportCustody(
      makeValidPayload({ phase: 'verify_files', archiveHash: 'sha256:abc123' }),
    );
    expect(result.valid).toBe(true);
  });

  it('warns when waitState=expired with no blockers', () => {
    const result = validateProviderExportCustody(
      makeValidPayload({ waitState: 'expired', blockers: [] }),
    );
    expect(result.warnings.some((w) => w.includes('expired'))).toBe(true);
  });

  it('does not warn when waitState=blocked with blockers', () => {
    const result = validateProviderExportCustody(
      makeValidPayload({
        waitState: 'blocked',
        blockers: [{ reason: 'managed_account_restriction' }],
      }),
    );
    expect(result.warnings.some((w) => w.includes('blocker'))).toBe(false);
  });

  it('warns about missing linkExpiry for email_link delivery', () => {
    const result = validateProviderExportCustody(
      makeValidPayload({ deliveryMethod: 'email_link', linkExpiry: undefined }),
    );
    expect(result.warnings.some((w) => w.includes('linkExpiry'))).toBe(true);
  });

  it('does not warn about linkExpiry when provided', () => {
    const result = validateProviderExportCustody(
      makeValidPayload({ deliveryMethod: 'email_link', linkExpiry: '2026-06-01T00:00:00Z' }),
    );
    expect(result.warnings.some((w) => w.includes('linkExpiry'))).toBe(false);
  });

  it('warns about missing cloudHandoffDestination when cloudHandoff=true', () => {
    const result = validateProviderExportCustody(
      makeValidPayload({ cloudHandoff: true }),
    );
    expect(result.warnings.some((w => w.includes('cloudHandoffDestination')))).toBe(true);
  });

  it('accepts cloudHandoff=true with cloudHandoffDestination', () => {
    const result = validateProviderExportCustody(
      makeValidPayload({ cloudHandoff: true, cloudHandoffDestination: 'Google Drive' }),
    );
    expect(result.warnings.some((w => w.includes('cloudHandoffDestination')))).toBe(false);
  });

  it('warns about empty selectedProducts for classification phase', () => {
    const result = validateProviderExportCustody(
      makeValidPayload({ phase: 'intent_classification', selectedProducts: [] }),
    );
    expect(result.warnings.some((w => w.includes('selectedProducts')))).toBe(true);
  });

  it('accepts all valid phases', () => {
    const phases: ProviderExportCustodyPayload['phase'][] = [
      'intent_classification',
      'boundary_check',
      'approval_bundle',
      'provider_wait',
      'download_quarantine',
      'verify_files',
      'preview',
      'task_file',
      'rollback',
    ];
    for (const phase of phases) {
      // verify_files phase requires archiveHash
      const overrides: Partial<ProviderExportCustodyPayload> = { phase };
      if (phase === 'verify_files') {
        overrides.archiveHash = 'sha256:abc123def456';
      }
      const result = validateProviderExportCustody(makeValidPayload(overrides));
      expect(result.valid).toBe(true);
    }
  });

  it('accepts all provider types', () => {
    const providers: ProviderExportCustodyPayload['provider'][] = [
      'google_takeout',
      'microsoft_privacy_dashboard',
      'apple_data_and_privacy',
      'browser_profile_export',
      'meta_access_your_information',
      'x_twitter_archive',
      'generic_provider_export',
    ];
    for (const provider of providers) {
      const result = validateProviderExportCustody(makeValidPayload({ provider }));
      expect(result.valid).toBe(true);
    }
  });

  it('accepts custom provider types (extensible)', () => {
    const result = validateProviderExportCustody(
      makeValidPayload({ provider: 'custom_crm_export' }),
    );
    expect(result.valid).toBe(true);
  });
});

// ─── Adapter Tests ────────────────────────────────────────────────────────────

describe('providerExportToReceiptInput', () => {
  it('converts a valid payload to a TrustReceiptInput', () => {
    const payload = makeValidPayload();
    const options = makeValidOptions();
    const input = providerExportToReceiptInput(payload, options);

    expect(input.schemaVersion).toBe('1.0.0');
    expect(input.actor.passportDid).toBe('did:holoscript:test_actor');
    expect(input.actor.bindings).toHaveLength(2);
    expect(input.actor.bindings![0].value).toBe('google_takeout');
    expect(input.actor.bindings![0].type).toBe('provider_export');
    expect(input.actor.bindings![1].value).toBe('browser_account_export');
    expect(input.actor.bindings![1].type).toBe('workflow');
    expect(input.action.name).toBe('provider_export_intent_classification');
    expect(input.action.resource).toBe('holoshell/browser_account_export/google_takeout');
    expect(input.action.outcome).toBe('success');
    expect(input.permissionEnvelope).toBe('read_only'); // intent_classification = read_only
    expect(input.evidence.hashes).toHaveLength(1);
    expect(input.algebraicTrust.layer1Strategy).toBe('strict_error');
    expect(input.links?.taskId).toBeUndefined();
  });

  it('sets outcome=denied when blockers are present', () => {
    const payload = makeValidPayload({
      blockers: [{ reason: 'managed_account_restriction' }],
    });
    const input = providerExportToReceiptInput(payload, makeValidOptions());
    expect(input.action.outcome).toBe('denied');
  });

  it('sets correct permission envelope per phase', () => {
    const phaseEnvelope: [ProviderExportCustodyPayload['phase'], string][] = [
      ['intent_classification', 'read_only'],
      ['boundary_check', 'guarded_execute'],
      ['approval_bundle', 'guarded_execute'],
      ['provider_wait', 'read_only'],
      ['download_quarantine', 'break_glass'],
      ['verify_files', 'read_only'],
      ['preview', 'guarded_execute'],
      ['task_file', 'guarded_execute'],
      ['rollback', 'break_glass'],
    ];

    for (const [phase, expectedEnvelope] of phaseEnvelope) {
      const input = providerExportToReceiptInput(
        makeValidPayload({ phase }),
        makeValidOptions(),
      );
      expect(input.permissionEnvelope).toBe(expectedEnvelope);
    }
  });

  it('passes taskId and commit through links', () => {
    const input = providerExportToReceiptInput(
      makeValidPayload(),
      makeValidOptions({ taskId: 'task_123', commit: 'abc1234' }),
    );
    expect(input.links?.taskId).toBe('task_123');
    expect(input.links?.commit).toBe('abc1234');
  });

  it('passes parentReceiptIds through links', () => {
    const input = providerExportToReceiptInput(
      makeValidPayload(),
      makeValidOptions({ parentReceiptIds: ['rec_001', 'rec_002'] }),
    );
    expect(input.links?.parentReceiptIds).toEqual(['rec_001', 'rec_002']);
  });

  it('allows permission envelope override', () => {
    const input = providerExportToReceiptInput(
      makeValidPayload({ phase: 'intent_classification' }),
      makeValidOptions({ permissionEnvelope: 'break_glass' }),
    );
    expect(input.permissionEnvelope).toBe('break_glass');
  });

  it('includes archiveHash as commandHash when present', () => {
    const input = providerExportToReceiptInput(
      makeValidPayload({ archiveHash: 'sha256:deadbeef' }),
      makeValidOptions(),
    );
    expect(input.evidence.commandHash).toBe('sha256:deadbeef');
  });

  it('omits commandHash when archiveHash is empty', () => {
    const input = providerExportToReceiptInput(
      makeValidPayload({ archiveHash: '' }),
      makeValidOptions(),
    );
    expect(input.evidence.commandHash).toBeUndefined();
  });

  it('includes blocker reasons as witnessRefs', () => {
    const payload = makeValidPayload({
      blockers: [
        { reason: 'managed_account', evidencePath: '/evidence/1' },
        { reason: 'expired_link', ownerSurface: 'provider-connector' },
      ],
    });
    const input = providerExportToReceiptInput(payload, makeValidOptions());
    expect(input.evidence.witnessRefs).toEqual(['managed_account', 'expired_link']);
  });

  it('produces a receipt that validates against TrustReceipt schema', () => {
    const payload = makeValidPayload({ phase: 'download_quarantine' });
    const input = providerExportToReceiptInput(payload, makeValidOptions());
    // Generate a receipt ID and add storage to make it a complete TrustReceipt
    const receipt = {
      ...input,
      receiptId: `test_rec_${Date.now()}`,
      storage: { syncState: 'local_only' as const, ...input.storage },
    } as any;
    const result = validateTrustReceipt(receipt);
    expect(result.valid).toBe(true);
  });

  it('handles all delivery methods', () => {
    const methods: ProviderExportCustodyPayload['deliveryMethod'][] = [
      'email_link',
      'cloud_drive',
      'browser_download',
      'push_to_service',
      'unknown',
    ];
    for (const deliveryMethod of methods) {
      const input = providerExportToReceiptInput(
        makeValidPayload({ deliveryMethod }),
        makeValidOptions(),
      );
      expect(input).toBeDefined();
    }
  });

  it('handles all wait states', () => {
    const states: ProviderExportCustodyPayload['waitState'][] = [
      'not_requested',
      'requested',
      'provider_waiting',
      'ready_to_download',
      'expired',
      'blocked',
    ];
    for (const waitState of states) {
      const input = providerExportToReceiptInput(
        makeValidPayload({ waitState }),
        makeValidOptions(),
      );
      expect(input).toBeDefined();
    }
  });
});

// ─── Hash Stability Tests ─────────────────────────────────────────────────────

describe('stableProviderExportHash', () => {
  it('produces a deterministic hash for the same payload', () => {
    const payload = makeValidPayload();
    const hash1 = stableProviderExportHash(payload);
    const hash2 = stableProviderExportHash(payload);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:/);
  });

  it('produces different hashes for different payloads', () => {
    const payload1 = makeValidPayload({ provider: 'google_takeout' });
    const payload2 = makeValidPayload({ provider: 'microsoft_privacy_dashboard' });
    const hash1 = stableProviderExportHash(payload1);
    const hash2 = stableProviderExportHash(payload2);
    expect(hash1).not.toBe(hash2);
  });

  it('is key-order independent', () => {
    // Two payloads with the same content but constructed differently should hash the same
    const payload1 = makeValidPayload({ provider: 'google_takeout', phase: 'intent_classification' });
    // Reconstruct the same data via spread to ensure key order doesn't matter
    const payload2 = makeValidPayload({ phase: 'intent_classification', provider: 'google_takeout' });
    const hash1 = stableProviderExportHash(payload1);
    const hash2 = stableProviderExportHash(payload2);
    expect(hash1).toBe(hash2);
  });
});