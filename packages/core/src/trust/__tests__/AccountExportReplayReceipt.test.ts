import { describe, it, expect } from 'vitest';
import {
  AccountExportReplayPayload,
  AccountExportReplayAdapterOptions,
  replayToReceiptInput,
  validateReplayVerification,
  stableReplayHash,
} from '../AccountExportReplayReceipt';
import { validateTrustReceipt } from '../TrustReceipt';
import type { VerificationResult } from '../AccountExportArchiveReceipt';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeValidReplayPayload(
  overrides: Partial<AccountExportReplayPayload> = {},
): AccountExportReplayPayload {
  return {
    workflow: 'browser_account_export',
    provider: 'google_takeout',
    providerLabel: 'Google',
    originalVerificationReceiptId: 'trust_2026-05-18T12-00-00_abc123',
    originalArchiveHash: 'sha256:originalhash',
    originalVerificationResult: 'verified' as VerificationResult,
    trigger: 'integrity_check',
    originalVerificationTimestamp: '2026-05-18T12:00:00Z',
    replayTimestamp: '2026-05-18T14:00:00Z',
    replayDurationMs: 150,
    archiveHashMatch: true,
    fileContentMatch: true,
    filesMatched: 5,
    filesDiffered: 0,
    filesMissing: 0,
    filesExtra: 0,
    sensitivityMatch: true,
    executableMatch: true,
    replayOutcome: 'match',
    replaySummary: 'Replay matches original verification.',
    diffEntries: [],
    warnings: [],
    errors: [],
    sourceFileMutationPerformed: false,
    rawPrivateDataPublished: false,
    privatePathLeakedToPublicReceipt: false,
    ...overrides,
  };
}

function makeValidReplayOptions(
  overrides: Partial<AccountExportReplayAdapterOptions> = {},
): AccountExportReplayAdapterOptions {
  return {
    passportDid: 'did:holoscript:test_actor',
    ...overrides,
  };
}

// ─── Validation Tests ──────────────────────────────────────────────────────────

describe('validateReplayVerification', () => {
  it('accepts a valid replay payload with match outcome', () => {
    const result = validateReplayVerification(makeValidReplayPayload());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing workflow', () => {
    const result = validateReplayVerification(makeValidReplayPayload({ workflow: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing workflow');
  });

  it('rejects missing originalVerificationReceiptId', () => {
    const result = validateReplayVerification(
      makeValidReplayPayload({ originalVerificationReceiptId: '' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing originalVerificationReceiptId');
  });

  it('rejects missing originalArchiveHash', () => {
    const result = validateReplayVerification(
      makeValidReplayPayload({ originalArchiveHash: '' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing originalArchiveHash');
  });

  it('rejects sourceFileMutationPerformed=true', () => {
    const result = validateReplayVerification(
      makeValidReplayPayload({ sourceFileMutationPerformed: true }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('sourceFileMutationPerformed'))).toBe(true);
  });

  it('rejects rawPrivateDataPublished=true', () => {
    const result = validateReplayVerification(
      makeValidReplayPayload({ rawPrivateDataPublished: true }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('rawPrivateDataPublished'))).toBe(true);
  });

  it('rejects privatePathLeakedToPublicReceipt=true', () => {
    const result = validateReplayVerification(
      makeValidReplayPayload({ privatePathLeakedToPublicReceipt: true }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('privatePathLeakedToPublicReceipt'))).toBe(true);
  });

  it('rejects match outcome with non-empty diffEntries', () => {
    const result = validateReplayVerification(
      makeValidReplayPayload({
        replayOutcome: 'match',
        diffEntries: [
          { path: 'a.txt', diffType: 'content_hash_mismatch', originalValue: 'hash1', replayValue: 'hash2' },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('diffEntries'))).toBe(true);
  });

  it('rejects match outcome with filesDiffered > 0', () => {
    const result = validateReplayVerification(
      makeValidReplayPayload({ replayOutcome: 'match', filesDiffered: 2 }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('filesDiffered'))).toBe(true);
  });

  it('accepts mismatch outcome with diff entries', () => {
    const result = validateReplayVerification(
      makeValidReplayPayload({
        replayOutcome: 'mismatch_corrupt',
        archiveHashMatch: false,
        fileContentMatch: false,
        filesDiffered: 1,
        diffEntries: [
          { path: 'a.txt', diffType: 'content_hash_mismatch', originalValue: 'hash1', replayValue: 'hash2' },
        ],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('accepts all replay outcomes', () => {
    const outcomes: AccountExportReplayPayload['replayOutcome'][] = [
      'match',
      'match_with_warnings',
      'mismatch',
      'mismatch_corrupt',
      'mismatch_missing_files',
      'mismatch_sensitivity_drift',
      'mismatch_executable_drift',
      'replay_failed',
    ];
    for (const outcome of outcomes) {
      const overrides: Partial<AccountExportReplayPayload> = { replayOutcome: outcome };
      if (outcome === 'match') {
        // match requires empty diffs and no differed files
        Object.assign(overrides, { filesDiffered: 0, diffEntries: [], fileContentMatch: true, archiveHashMatch: true });
      }
      if (outcome.startsWith('mismatch')) {
        Object.assign(overrides, { fileContentMatch: false, archiveHashMatch: false });
      }
      const result = validateReplayVerification(makeValidReplayPayload(overrides));
      expect(result.valid).toBe(true);
    }
  });

  it('warns about mismatch outcome with hash and content match', () => {
    const result = validateReplayVerification(
      makeValidReplayPayload({
        replayOutcome: 'mismatch_sensitivity_drift',
        archiveHashMatch: true,
        fileContentMatch: true,
      }),
    );
    expect(result.warnings.some((w) => w.includes('mismatch'))).toBe(true);
  });
});

// ─── Adapter Tests ─────────────────────────────────────────────────────────────

describe('replayToReceiptInput', () => {
  it('converts a valid payload to a TrustReceiptInput', () => {
    const payload = makeValidReplayPayload();
    const options = makeValidReplayOptions();
    const input = replayToReceiptInput(payload, options);

    expect(input.schemaVersion).toBe('1.0.0');
    expect(input.actor.passportDid).toBe('did:holoscript:test_actor');
    expect(input.actor.bindings).toHaveLength(3);
    expect(input.actor.bindings![0].value).toBe('google_takeout');
    expect(input.actor.bindings![0].type).toBe('provider_export');
    expect(input.actor.bindings![1].value).toBe('browser_account_export');
    expect(input.actor.bindings![1].type).toBe('workflow');
    expect(input.actor.bindings![2].value).toBe('archive_replay');
    expect(input.actor.bindings![2].type).toBe('verification_phase');
    expect(input.action.name).toBe('account_export_archive_replay');
    expect(input.action.resource).toBe('holoshell/browser_account_export/google_takeout/replay');
    expect(input.action.outcome).toBe('success');
  });

  it('sets outcome=denied for mismatch outcomes', () => {
    const payload = makeValidReplayPayload({
      replayOutcome: 'mismatch_corrupt',
      archiveHashMatch: false,
      fileContentMatch: false,
    });
    const input = replayToReceiptInput(payload, makeValidReplayOptions());
    expect(input.action.outcome).toBe('denied');
  });

  it('sets outcome=failure for replay_failed', () => {
    const payload = makeValidReplayPayload({ replayOutcome: 'replay_failed' });
    const input = replayToReceiptInput(payload, makeValidReplayOptions());
    expect(input.action.outcome).toBe('failure');
  });

  it('sets read_only envelope for match outcomes', () => {
    const input = replayToReceiptInput(
      makeValidReplayPayload({ replayOutcome: 'match' }),
      makeValidReplayOptions(),
    );
    expect(input.permissionEnvelope).toBe('read_only');
  });

  it('sets break_glass envelope for mismatch_corrupt', () => {
    const input = replayToReceiptInput(
      makeValidReplayPayload({ replayOutcome: 'mismatch_corrupt' }),
      makeValidReplayOptions(),
    );
    expect(input.permissionEnvelope).toBe('break_glass');
  });

  it('sets guarded_execute envelope for mismatch_sensitivity_drift', () => {
    const input = replayToReceiptInput(
      makeValidReplayPayload({ replayOutcome: 'mismatch_sensitivity_drift' }),
      makeValidReplayOptions(),
    );
    expect(input.permissionEnvelope).toBe('guarded_execute');
  });

  it('passes parentReceiptIds through links', () => {
    const input = replayToReceiptInput(
      makeValidReplayPayload(),
      makeValidReplayOptions({ parentReceiptIds: ['rec_001', 'rec_002'] }),
    );
    expect(input.links?.parentReceiptIds).toEqual(['rec_001', 'rec_002']);
  });

  it('includes diff entries as witnessRefs', () => {
    const payload = makeValidReplayPayload({
      replayOutcome: 'mismatch_corrupt',
      fileContentMatch: false,
      archiveHashMatch: false,
      diffEntries: [
        { path: 'a.txt', diffType: 'content_hash_mismatch', originalValue: 'hash1', replayValue: 'hash2' },
      ],
    });
    const input = replayToReceiptInput(payload, makeValidReplayOptions());
    expect(input.evidence.witnessRefs).toContain('a.txt:content_hash_mismatch');
  });

  it('produces a receipt that validates against TrustReceipt schema', () => {
    const payload = makeValidReplayPayload({ replayOutcome: 'match' });
    const input = replayToReceiptInput(payload, makeValidReplayOptions());
    const receipt = {
      ...input,
      receiptId: `test_replay_${Date.now()}`,
      storage: { syncState: 'local_only' as const, ...input.storage },
    };
    const result = validateTrustReceipt(receipt);
    expect(result.valid).toBe(true);
    // Verify the layer3OracleRef was set (required for "replay" simulation keyword)
    expect(receipt.algebraicTrust.layer3OracleRef).toBe('archive_replay_verify');
  });
});

// ─── Hash Stability Tests ─────────────────────────────────────────────────────

describe('stableReplayHash', () => {
  it('produces a deterministic hash for the same payload', () => {
    const payload = makeValidReplayPayload();
    const hash1 = stableReplayHash(payload);
    const hash2 = stableReplayHash(payload);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:/);
  });

  it('produces different hashes for different payloads', () => {
    const payload1 = makeValidReplayPayload({ provider: 'google_takeout' });
    const payload2 = makeValidReplayPayload({ provider: 'microsoft_privacy_dashboard' });
    const hash1 = stableReplayHash(payload1);
    const hash2 = stableReplayHash(payload2);
    expect(hash1).not.toBe(hash2);
  });

  it('is key-order independent', () => {
    const payload1 = makeValidReplayPayload({ provider: 'google_takeout', trigger: 'integrity_check' });
    const payload2 = makeValidReplayPayload({ trigger: 'integrity_check', provider: 'google_takeout' });
    expect(stableReplayHash(payload1)).toBe(stableReplayHash(payload2));
  });
});