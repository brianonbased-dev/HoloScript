import { describe, expect, it } from 'vitest';
import {
  cloneHoloShellAccountExportReceiptPack,
  isSupportedAccountExportProvider,
  isSupportedProviderExportWaitState,
  type AccountExportApprovalReceipt,
  type BrowserAccountBoundaryReceipt,
  type HoloShellAccountExportReceiptPack,
  type LocalDownloadQuarantineReceipt,
  validateAccountExportApprovalReceipt,
  validateBrowserAccountBoundaryReceipt,
  validateHoloShellAccountExportReceiptPack,
  validateLocalDownloadQuarantineReceipt,
  validateProviderExportWaitReceipt,
} from '../holoshell-account-export-receipts';

function makeBoundary(
  overrides: Partial<BrowserAccountBoundaryReceipt> = {}
): BrowserAccountBoundaryReceipt {
  return {
    id: 'boundary-001',
    provider: 'google',
    redactedAccountLabel: 'j***@example.com',
    scopes: ['takeout_export'],
    browserProfile: 'holoshell-named-account-profile',
    browserSession: 'credential_bearing_ephemeral_review',
    cookiePolicy: 'profile_cookies_visible_to_browser_only',
    screenshotPolicy: 'local_only_redacted_or_manual_witness',
    credentialAdjacent: true,
    credentialExtrusionAllowed: false,
    accountMutationAllowedWithoutApproval: false,
    publicReceiptMayContainAbsolutePath: false,
    ...overrides,
  };
}

function makeApproval(
  overrides: Partial<AccountExportApprovalReceipt> = {}
): AccountExportApprovalReceipt {
  return {
    id: 'approval-001',
    nonce: 'nonce-001',
    provider: 'google',
    exportKind: 'takeout',
    exportFormat: 'zip',
    destinationFolder: '.tmp/holoshell/account-exports/google-takeout',
    requiresFreshUserGesture: true,
    executionAllowed: false,
    credentialExtrusionAllowed: false,
    commandPreview: 'node scripts/holoshell-action-executor.mjs --action open_url --approval-nonce [nonce-bound]',
    ...overrides,
  };
}

function makeQuarantine(
  overrides: Partial<LocalDownloadQuarantineReceipt> = {}
): LocalDownloadQuarantineReceipt {
  return {
    id: 'quarantine-001',
    provider: 'google',
    exportKind: 'takeout',
    importMode: 'preview_only',
    fileCount: 1,
    archiveHash: 'sha256:account-export-archive',
    archiveHashAlgorithm: 'sha256',
    publicRelativePaths: ['exports/google/takeout.zip'],
    privateAbsolutePathReceipt: 'private-path-receipt-001',
    downloadedArchiveExecuted: false,
    downloadedFilesExecutable: false,
    rawPrivateDataPublished: false,
    sourceFileMutationPerformed: false,
    ...overrides,
  };
}

function makeLegacyPack(
  overrides: Partial<HoloShellAccountExportReceiptPack> = {}
): HoloShellAccountExportReceiptPack {
  return {
    id: 'pack-001',
    plan: {
      id: 'plan-001',
      provider: 'google',
      redactedAccountLabel: 'j***@example.com',
      accountLabelHash: 'account-hash-001',
      selectedProducts: [
        {
          id: 'mail',
          label: 'Mail',
          included: true,
          selectionHash: 'selection-hash-001',
        },
      ],
      deliveryMethod: 'direct_download',
      archiveFormat: 'zip',
      archiveSizeLimitMb: 2048,
      cloudHandoffWarning: false,
      accountMutationAllowed: false,
      requiresFreshUserGesture: true,
      createdAt: '2026-05-18T10:00:00Z',
      warnings: [],
      hash: 'plan-hash-001',
      hashAlgorithm: 'sha256',
    },
    replay: {
      id: 'replay-001',
      workflow: 'browser-account-export',
      provider: 'google',
      status: 'planned',
      planReceiptId: 'plan-001',
      replayKey: 'replay-key-001',
      rollbackNote: 'No provider mutation has run.',
      exportIsNotDeletion: true,
      accountMutationPerformed: false,
      sourceCloudDataMutated: false,
      createdAt: '2026-05-18T10:01:00Z',
      hash: 'replay-hash-001',
      hashAlgorithm: 'sha256',
    },
    status: 'planned',
    hash: 'pack-hash-001',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

describe('HoloShell browser account export receipts', () => {
  it('accepts legacy pack receipts plus the browser boundary, wait, and quarantine adjuncts', () => {
    expect(validateHoloShellAccountExportReceiptPack(makeLegacyPack())).toEqual([]);
    expect(validateBrowserAccountBoundaryReceipt(makeBoundary())).toEqual([]);
    expect(validateAccountExportApprovalReceipt(makeApproval())).toEqual([]);
    expect(validateProviderExportWaitReceipt({
      id: 'wait-001',
      provider: 'google',
      exportKind: 'takeout',
      state: 'provider_waiting',
      providerRequestId: 'provider-export-001',
      requestedAt: '2026-05-18T10:00:00Z',
      mutationPerformed: true,
    })).toEqual([]);
    expect(validateLocalDownloadQuarantineReceipt(makeQuarantine())).toEqual([]);
  });

  it('rejects credential extrusion and missing browser custody policies', () => {
    const receipt = makeBoundary({
      cookiePolicy: '',
      screenshotPolicy: '',
      credentialExtrusionAllowed: true as unknown as false,
      accountMutationAllowedWithoutApproval: true as unknown as false,
      publicReceiptMayContainAbsolutePath: true as unknown as false,
    });

    expect(validateBrowserAccountBoundaryReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'BrowserAccountBoundaryReceipt.cookiePolicy is required.',
        'BrowserAccountBoundaryReceipt.screenshotPolicy is required.',
        'BrowserAccountBoundaryReceipt.credentialExtrusionAllowed must be false.',
        'BrowserAccountBoundaryReceipt.accountMutationAllowedWithoutApproval must be false.',
        'BrowserAccountBoundaryReceipt.publicReceiptMayContainAbsolutePath must be false.',
      ])
    );
  });

  it('rejects public absolute paths in approval previews and destinations', () => {
    const receipt = makeApproval({
      destinationFolder: 'C:/Users/josep/Downloads/Takeout',
      commandPreview: 'node C:/Users/josep/Documents/GitHub/Hololand/scripts/export.mjs',
    });

    expect(validateAccountExportApprovalReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'AccountExportApprovalReceipt.destinationFolder must be redacted or repo-relative, not an absolute path.',
        'AccountExportApprovalReceipt.commandPreview must not expose absolute local paths.',
      ])
    );
  });

  it('rejects quarantine receipts that execute, publish, mutate, or import private data', () => {
    const receipt = makeQuarantine({
      importMode: 'full_import' as unknown as 'preview_only',
      publicRelativePaths: ['/Users/josep/Downloads/takeout.zip'],
      downloadedArchiveExecuted: true as unknown as false,
      downloadedFilesExecutable: true as unknown as false,
      rawPrivateDataPublished: true as unknown as false,
      sourceFileMutationPerformed: true as unknown as false,
    });

    expect(validateLocalDownloadQuarantineReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'LocalDownloadQuarantineReceipt.importMode must be preview_only.',
        'LocalDownloadQuarantineReceipt.publicRelativePaths[] must be redacted or repo-relative, not an absolute path.',
        'LocalDownloadQuarantineReceipt.downloadedArchiveExecuted must be false.',
        'LocalDownloadQuarantineReceipt.downloadedFilesExecutable must be false.',
        'LocalDownloadQuarantineReceipt.rawPrivateDataPublished must be false.',
        'LocalDownloadQuarantineReceipt.sourceFileMutationPerformed must be false.',
      ])
    );
  });

  it('rejects missing provider wait state and archive hash', () => {
    expect(validateProviderExportWaitReceipt({
      id: 'wait-001',
      provider: 'google',
      exportKind: 'takeout',
      state: 'sent_email' as unknown as 'provider_waiting',
      mutationPerformed: true,
    })).toEqual(expect.arrayContaining(['ProviderExportWaitReceipt.state is unsupported: sent_email.']));

    expect(validateLocalDownloadQuarantineReceipt(makeQuarantine({ archiveHash: '' }))).toEqual(
      expect.arrayContaining(['LocalDownloadQuarantineReceipt.archiveHash is required.'])
    );
  });

  it('clones account export packs without retaining mutable references', () => {
    const original = makeLegacyPack();
    const cloned = cloneHoloShellAccountExportReceiptPack(original);

    cloned.plan.selectedProducts[0].label = 'Changed';

    expect(original.plan.selectedProducts[0].label).toBe('Mail');
  });

  it('exposes type guards for routing provider and wait state handling', () => {
    expect(isSupportedAccountExportProvider('google')).toBe(true);
    expect(isSupportedAccountExportProvider('bank')).toBe(false);
    expect(isSupportedProviderExportWaitState('provider_waiting')).toBe(true);
    expect(isSupportedProviderExportWaitState('sent_email')).toBe(false);
  });
});
