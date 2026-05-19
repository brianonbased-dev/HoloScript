import { describe, expect, it } from 'vitest';
import {
  HOLOSHELL_PACKAGE_MUTATION_RECEIPT_VERSION,
  PACKAGE_MUTATION_KINDS,
  PACKAGE_MUTATION_STATUSES,
  PACKAGE_PERMISSION_ENVELOPES,
  PACKAGE_MANAGERS,
  isSupportedPackageMutationKind,
  isSupportedPackageMutationStatus,
  isSupportedPackagePermissionEnvelope,
  isSupportedPackageManagerKind,
  validateHoloShellPackageMutationReceipt,
  cloneHoloShellPackageMutationReceipt,
  type HoloShellPackageMutationReceipt,
} from '../holoshell-package-mutation-receipt';

const validReceipt: HoloShellPackageMutationReceipt = {
  schemaVersion: HOLOSHELL_PACKAGE_MUTATION_RECEIPT_VERSION,
  id: 'package-custody-valid',
  workflow: 'install-update-tool-custody',
  generatedAt: '2026-05-19T12:00:00.000Z',
  startedAt: '2026-05-19T12:00:00.000Z',
  endedAt: '2026-05-19T12:00:00.000Z',
  mutationKind: 'upgrade',
  status: 'approval_required',
  permissionEnvelope: 'break_glass',
  candidate: {
    packageId: 'BlenderFoundation.Blender',
    packageName: 'Blender',
    manager: 'winget',
    source: 'winget',
    publisher: 'Blender Foundation',
    currentVersion: '5.0.1',
    availableVersion: '5.1.1',
    installerUrl: 'https://download.blender.org/release/',
    installerHash: 'fixture-installer-hash-not-captured-live',
    installerHashAlgorithm: 'sha256',
  },
  preflight: {
    adminRequired: true,
    adminSession: false,
    diskStatus: 'unknown',
    networkStatus: 'unknown',
    processConflictStatus: 'unknown',
    packageManagerAvailable: true,
  },
  approval: {
    approvalId: 'pkg-approval-001',
    approvalRequired: true,
    approvalCaptured: false,
    requiresFreshUserGesture: true,
    approvedCommandPreview: 'winget upgrade --id BlenderFoundation.Blender --accept-source-agreements',
    rollbackLimits: [
      'Package manager rollback behavior is provider-specific.',
      'Admin prompts cannot be replayed silently.',
      'Launch/version verification is required after mutation.',
    ],
    expiresAt: '2026-05-19T12:10:00.000Z',
  },
  verification: {
    binaryPath: 'C:/Program Files/Blender Foundation/Blender/blender.exe',
    versionCommand: 'blender.exe --version',
    versionCommandPassed: false,
    launchVerified: false,
    verifiedVersion: '5.1.1',
  },
  mutationPerformed: false,
  replayKey: 'sha256:package-mutation-replay',
  hash: 'receipt-hash',
  hashAlgorithm: 'sha256',
  sourceAnchors: {
    source: 'apps/holoshell/source/holoshell-package-custody.hsplus',
    adapter: 'scripts/holoshell-package-custody.mjs',
    upstreamValidator: 'packages/framework/src/board/holoshell-package-mutation-receipt.ts',
    priorEvidence: '.bench-logs/holoshell-human-os-frontier/2026-05-19/install-update-safe-wrapper-evidence-pack.md',
  },
  summary: {
    status: 'approval_required',
    packageId: 'BlenderFoundation.Blender',
    packageName: 'Blender',
    manager: 'winget',
    source: 'winget',
    fromVersion: '5.0.1',
    toVersion: '5.1.1',
    permissionEnvelope: 'break_glass',
    approvalRequired: true,
    approvalId: 'pkg-approval-001',
    executionAllowed: false,
    mutationPerformed: false,
    adminRequired: true,
    adminSession: false,
    packageManagerAvailable: true,
    rollbackLimitCount: 3,
    launchVerified: false,
  },
  output: {
    latestPath: '.tmp/holoshell/package-custody-latest.json',
    jsPath: '.tmp/holoshell/package-custody-latest.js',
    receiptDir: '.tmp/holoshell/package-custody-receipts',
  },
  verificationCommands: [{ command: 'node scripts/holoshell-package-custody.mjs --self-test' }],
  provenance: [
    'experiments/holoshell-human-os-frontier/install-update-safe-wrapper-policy.hsplus',
    'experiments/holoshell-human-os-frontier/install-update-safe-wrapper-pipeline.hs',
  ],
  metadata: {
    deterministic: true,
    wrapperMode: 'approval_packet_only',
    liveMutationExecutionSupported: false,
    commandPreview: 'winget upgrade --id BlenderFoundation.Blender --accept-source-agreements',
    host: { platform: 'win32' },
  },
};

describe('HoloShell package mutation constants', () => {
  it('covers install/update custody states and package managers', () => {
    expect(PACKAGE_MUTATION_KINDS).toContain('install');
    expect(PACKAGE_MUTATION_KINDS).toContain('upgrade');
    expect(PACKAGE_MUTATION_KINDS).toContain('uninstall');
    expect(PACKAGE_MUTATION_STATUSES).toContain('approval_required');
    expect(PACKAGE_PERMISSION_ENVELOPES).toContain('break_glass');
    expect(PACKAGE_MANAGERS).toContain('winget');
    expect(PACKAGE_MANAGERS).toContain('pnpm');
  });

  it('validates supported values', () => {
    expect(isSupportedPackageMutationKind('upgrade')).toBe(true);
    expect(isSupportedPackageMutationKind('teleport')).toBe(false);
    expect(isSupportedPackageMutationStatus('approval_required')).toBe(true);
    expect(isSupportedPackageMutationStatus('ambient_execute')).toBe(false);
    expect(isSupportedPackagePermissionEnvelope('break_glass')).toBe(true);
    expect(isSupportedPackagePermissionEnvelope('silent_admin')).toBe(false);
    expect(isSupportedPackageManagerKind('winget')).toBe(true);
    expect(isSupportedPackageManagerKind('handwave')).toBe(false);
  });
});

describe('validateHoloShellPackageMutationReceipt', () => {
  it('accepts an approval-only upgrade receipt', () => {
    expect(validateHoloShellPackageMutationReceipt(validReceipt)).toEqual([]);
  });

  it('accepts string verification commands from existing HoloLand receipts', () => {
    const receipt = {
      ...validReceipt,
      verificationCommands: ['node scripts/holoshell-package-custody.mjs --self-test'],
    };
    expect(validateHoloShellPackageMutationReceipt(receipt)).toEqual([]);
  });

  it('rejects mutation receipts outside break_glass', () => {
    const receipt = {
      ...validReceipt,
      permissionEnvelope: 'read_only' as const,
      summary: { ...validReceipt.summary, permissionEnvelope: 'read_only' },
    };
    expect(validateHoloShellPackageMutationReceipt(receipt)).toContain(
      'Package mutation receipts must use the break_glass permission envelope.'
    );
  });

  it('rejects hidden package execution without fresh approval', () => {
    const receipt = {
      ...validReceipt,
      approval: { ...validReceipt.approval, requiresFreshUserGesture: false, approvalRequired: false },
      summary: { ...validReceipt.summary, approvalRequired: false },
    };
    const errors = validateHoloShellPackageMutationReceipt(receipt);
    expect(errors).toEqual(
      expect.arrayContaining([
        'Package mutation receipts must require approval.',
        'Package mutation receipts must require a fresh user gesture.',
      ])
    );
  });

  it('rejects executionAllowed before approval is captured', () => {
    const receipt = {
      ...validReceipt,
      summary: { ...validReceipt.summary, executionAllowed: true },
    };
    expect(validateHoloShellPackageMutationReceipt(receipt)).toContain(
      'PackageMutationSummary.executionAllowed cannot be true before approval is captured.'
    );
  });

  it('rejects installer urls without hashes for mutation receipts', () => {
    const receipt = {
      ...validReceipt,
      candidate: {
        ...validReceipt.candidate,
        installerHash: undefined,
        installerHashAlgorithm: undefined,
      },
    };
    expect(validateHoloShellPackageMutationReceipt(receipt)).toContain(
      'PackageCandidate.installerHash is required when an installerUrl is present for a mutation.'
    );
  });

  it('rejects absolute paths in public output refs', () => {
    const receipt = {
      ...validReceipt,
      output: { ...validReceipt.output!, latestPath: 'C:/Users/private/package-custody.json' },
    };
    expect(validateHoloShellPackageMutationReceipt(receipt)).toContain(
      'PackageMutationOutputRefs.latestPath must be repo-relative or redacted, not an absolute path.'
    );
  });

  it('rejects live mutation execution support until native approval gates exist', () => {
    const receipt = {
      ...validReceipt,
      metadata: { ...validReceipt.metadata, liveMutationExecutionSupported: true },
    };
    expect(validateHoloShellPackageMutationReceipt(receipt)).toContain(
      'PackageMutationMetadata.liveMutationExecutionSupported must be false until native approval gates exist.'
    );
  });

  it('accepts read-only inventory receipts', () => {
    const receipt: HoloShellPackageMutationReceipt = {
      ...validReceipt,
      mutationKind: 'inventory',
      status: 'inventory_only',
      permissionEnvelope: 'read_only',
      approval: {
        ...validReceipt.approval,
        approvalRequired: false,
        requiresFreshUserGesture: false,
        approvedCommandPreview: '',
        rollbackLimits: ['No package mutation is planned.'],
      },
      summary: {
        ...validReceipt.summary,
        status: 'inventory_only',
        permissionEnvelope: 'read_only',
        approvalRequired: false,
        rollbackLimitCount: 1,
      },
    };
    expect(validateHoloShellPackageMutationReceipt(receipt)).toEqual([]);
  });
});

describe('cloneHoloShellPackageMutationReceipt', () => {
  it('deep-copies mutable nested arrays and records', () => {
    const clone = cloneHoloShellPackageMutationReceipt(validReceipt);
    expect(clone).toEqual(validReceipt);
    expect(clone).not.toBe(validReceipt);
    expect(clone.candidate).not.toBe(validReceipt.candidate);
    expect(clone.approval.rollbackLimits).not.toBe(validReceipt.approval.rollbackLimits);
    expect(clone.verificationCommands).not.toBe(validReceipt.verificationCommands);
    expect(clone.provenance).not.toBe(validReceipt.provenance);
    expect(clone.metadata.host).not.toBe(validReceipt.metadata.host);
  });
});
