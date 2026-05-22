import { describe, expect, it } from 'vitest';
import {
  cloneAssetShardWorkflowReceipt,
  isSupportedAssetShardKind,
  isSupportedAssetShardStatus,
  type AssetShardImportApprovalReceipt,
  type AssetShardImportReceipt,
  type AssetShardWorkflowReceipt,
  type PlayableShardWitnessReceipt,
  type AssetIntakeReceipt,
  type AssetConversionReceipt,
  type PreviewShardSourceReceipt,
  type AssetShardRollbackContract,
  validateAssetShardImportApprovalReceipt,
  validateAssetShardReceiptBundle,
  validateAssetShardWorkflowReceipt,
  validatePlayableShardWitnessReceipt,
  validateAssetIntakeReceipt,
  validateAssetConversionReceipt,
  validatePreviewShardSourceReceipt,
  validateAssetShardRollbackContract,
  validateAssetShardFullReceiptChain,
  cloneAssetIntakeReceipt,
  cloneAssetConversionReceipt,
  clonePreviewShardSourceReceipt,
  cloneAssetShardRollbackContract,
  redactAssetShardImportCommandPreview,
  isSupportedAssetIntakeKind,
  isSupportedAssetIntakeStatus,
  isSupportedAssetConversionKind,
  isSupportedAssetConversionStatus,
  isSupportedPreviewSourceStatus,
} from '../holoshell-asset-shard-receipts';

function makeWorkflow(
  overrides: Partial<AssetShardWorkflowReceipt> = {}
): AssetShardWorkflowReceipt {
  return {
    schemaVersion: 'hololand.holoshell.asset-shard-workflow.v0.1.0',
    workflowId: 'asset-shard-demo',
    generatedAt: '2026-05-18T08:00:00Z',
    source: {
      assetFolderName: 'demo-assets',
      assetFolderFingerprint: 'folder-fingerprint',
      pathPolicy: 'absolute_path_kept_in_private_receipt_only',
      privacyClass: 'local_private',
    },
    summary: {
      status: 'staged',
      assetCount: 1,
      previewObjectCount: 1,
      blockedAssetCount: 0,
      approvalRequired: true,
      mutationExecuted: false,
    },
    validation: {
      secretLikeAssetGate: 'pass',
      previewSourceValidation: 'pass',
      browserPathRedaction: 'pass',
      sourceMutation: 'none',
      previewSourceHash: 'preview_hash_001',
    },
    shardPlan: {
      shardId: 'shard.demo-assets.001',
      worldName: 'Demo Assets Shard',
      importMode: 'guarded_execute_after_preview',
      assets: [
        {
          id: 'asset.model.001',
          name: 'platform.glb',
          relativePath: 'models/platform.glb',
          kind: 'model',
          sizeBytes: 128,
          hashSha256: 'asset_hash_001',
          hashStatus: 'complete',
          blocked: false,
        },
      ],
    },
    approvals: [
      {
        id: 'asset-shard-import',
        operation: 'import_asset_folder_as_hololand_shard',
        permissionEnvelope: 'guarded_execute',
        status: 'pending_user_approval',
        executionAllowed: false,
      },
    ],
    rollback: {
      sourceAssetsMutated: false,
      generatedTmpPaths: ['.tmp/holoshell/shard-preview.holo'],
    },
    output: {
      latestPath: '.tmp/holoshell/shard-workflow-latest.json',
      previewSourcePath: '.tmp/holoshell/shard-preview.holo',
      privateReceiptPath: '.tmp/holoshell/shard-receipts/private.json',
    },
    ...overrides,
  };
}

function makeApproval(
  overrides: Partial<AssetShardImportApprovalReceipt> = {}
): AssetShardImportApprovalReceipt {
  return {
    schemaVersion: 'hololand.holoshell.asset-shard-import-approval.v0.1.0',
    approvalId: 'asset-shard-import-001',
    nonce: 'nonce-001',
    status: 'approved',
    sourceAnchors: {
      workflowReceipt: '.tmp/holoshell/shard-workflow-latest.json',
      previewSource: '.tmp/holoshell/shard-preview.holo',
      privateReceipt: '.tmp/holoshell/shard-receipts/private.json',
    },
    approval: {
      approvalRequired: true,
      requiresFreshUserGesture: true,
      expiresAt: '2026-05-18T09:00:00Z',
    },
    execution: {
      allowed: true,
      commandPreview: 'node scripts/holoshell-shard-import-approval.mjs --execute',
    },
    witness: {
      workflowHash: 'workflow_hash_001',
      secretsCaptured: false,
      sourceAssetsMutated: false,
    },
    summary: {
      status: 'approved',
      shardId: 'shard.demo-assets.001',
      executionAllowed: true,
      sourceAssetsMutated: false,
      runtimeMutationExecuted: false,
    },
    ...overrides,
  };
}

function makeImportReceipt(
  overrides: Partial<AssetShardImportReceipt> = {}
): AssetShardImportReceipt {
  return {
    schemaVersion: 'hololand.holoshell.asset-shard-import.v0.1.0',
    importId: 'asset-shard-import-run-001',
    approval: {
      approvalId: 'asset-shard-import-001',
      nonceBound: true,
      workflowHash: 'workflow_hash_001',
    },
    summary: {
      status: 'completed',
      shardId: 'shard.demo-assets.001',
      assetCount: 1,
      runtimeMutationExecuted: true,
      sourceAssetsMutated: false,
    },
    output: {
      manifestPath: '.tmp/holoshell/shard-manifest.json',
      shardSourcePath: '.tmp/holoshell/shard-source.holo',
      receiptPath: '.tmp/holoshell/import-receipt.json',
    },
    rollback: {
      sourceAssetsMutated: false,
      generatedTmpPaths: ['.tmp/holoshell/shard-manifest.json'],
    },
    ...overrides,
  };
}

function makeWitness(
  overrides: Partial<PlayableShardWitnessReceipt> = {}
): PlayableShardWitnessReceipt {
  return {
    schemaVersion: 'hololand.holoshell.visual-witness.v0.1.0',
    generatedAt: '2026-05-18T08:05:00Z',
    status: 'pass',
    shardWitness: {
      enabled: true,
      workflowReceipt: '.tmp/holoshell/shard-workflow-latest.json',
      previewSource: '.tmp/holoshell/shard-preview.holo',
      shardId: 'shard.demo-assets.001',
      previewHash: 'preview_hash_001',
      assetCount: 1,
      sourceAssetsMutated: false,
    },
    screenshot: {
      path: '.tmp/holoshell/visual-witness/shard.png',
      sizeBytes: 2048,
      sha256: 'screenshot_hash_001',
    },
    domWitness: {
      path: '.tmp/holoshell/visual-witness/shard.dom.html',
      sha256: 'dom_hash_001',
      missingText: [],
    },
    ...overrides,
  };
}

function makeIntake(
  overrides: Partial<AssetIntakeReceipt> = {}
): AssetIntakeReceipt {
  return {
    schemaVersion: 'hololand.holoshell.asset-intake.v0.1.0',
    intakeId: 'intake-demo-001',
    generatedAt: '2026-05-18T07:30:00Z',
    intakeKind: 'folder_scan',
    source: {
      assetFolderName: 'demo-assets',
      assetFolderFingerprint: 'folder-fingerprint',
      pathPolicy: 'absolute_path_kept_in_private_receipt_only',
      privacyClass: 'local_private',
    },
    summary: {
      status: 'scanned',
      fileCount: 1,
      totalSizeBytes: 128,
      blockedFileCount: 0,
      blockedFileGate: 'pass',
      requiresApproval: true,
    },
    files: [
      {
        id: 'asset.model.001',
        name: 'platform.glb',
        relativePath: 'models/platform.glb',
        kind: 'model',
        sizeBytes: 128,
        hashSha256: 'asset_hash_001',
        blocked: false,
      },
    ],
    intakeNonce: 'intake-nonce-001',
    rollback: {
      sourceAssetsMutated: false,
    },
    ...overrides,
  };
}

function makeConversion(
  overrides: Partial<AssetConversionReceipt> = {}
): AssetConversionReceipt {
  return {
    schemaVersion: 'hololand.holoshell.asset-conversion.v0.1.0',
    conversionId: 'conversion-model-001',
    generatedAt: '2026-05-18T07:45:00Z',
    conversionKind: 'model_to_holo',
    source: {
      sourceFileId: 'asset.model.001',
      sourceFileName: 'platform.glb',
      sourceFileHash: 'asset_hash_001',
      pathPolicy: 'absolute_path_kept_in_private_receipt_only',
    },
    output: {
      outputFileName: 'platform.holo',
      outputFileHash: 'output_hash_001',
      outputPath: '.tmp/holoshell/converted/platform.holo',
    },
    summary: {
      status: 'completed',
      sourceMutated: false,
      conversionDurationMs: 450,
    },
    rollback: {
      sourceAssetsMutated: false,
      generatedTmpPaths: ['.tmp/holoshell/converted/platform.holo'],
    },
    ...overrides,
  };
}

function makePreview(
  overrides: Partial<PreviewShardSourceReceipt> = {}
): PreviewShardSourceReceipt {
  return {
    schemaVersion: 'hololand.holoshell.preview-source.v0.1.0',
    previewId: 'preview-shard-001',
    generatedAt: '2026-05-18T07:55:00Z',
    source: {
      workflowId: 'asset-shard-demo',
      sourceFingerprint: 'folder-fingerprint',
      pathPolicy: 'absolute_path_kept_in_private_receipt_only',
    },
    summary: {
      status: 'generated',
      assetCount: 1,
      previewSourceHash: 'preview_hash_001',
      sourceAssetsMutated: false,
    },
    output: {
      previewSourcePath: '.tmp/holoshell/shard-preview.holo',
      privateReceiptPath: '.tmp/holoshell/shard-receipts/private.json',
    },
    rollback: {
      sourceAssetsMutated: false,
      generatedTmpPaths: ['.tmp/holoshell/shard-preview.holo'],
    },
    ...overrides,
  };
}

function makeRollbackContract(
  overrides: Partial<AssetShardRollbackContract> = {}
): AssetShardRollbackContract {
  return {
    workflowId: 'asset-shard-demo',
    rollbackPoints: [
      {
        step: 'intake',
        sourceAssetsMutated: false,
        tmpPaths: ['.tmp/holoshell/intake'],
        replayKey: 'replay-intake-001',
      },
      {
        step: 'conversion',
        sourceAssetsMutated: false,
        tmpPaths: ['.tmp/holoshell/converted'],
        replayKey: 'replay-conversion-001',
      },
    ],
    replayDeterministic: true,
    sourceIntegrityPreserved: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Existing tests (workflow, approval, import, witness, bundle)
// ---------------------------------------------------------------------------

describe('HoloShell asset shard receipts', () => {
  it('accepts a complete workflow, approval, import, and visual witness bundle', () => {
    expect(validateAssetShardReceiptBundle({
      workflow: makeWorkflow(),
      approval: makeApproval(),
      importReceipt: makeImportReceipt(),
      witness: makeWitness(),
    })).toEqual([]);
  });

  it('rejects absolute public paths in workflow output and asset proxies', () => {
    const receipt = makeWorkflow({
      output: {
        latestPath: '.tmp/holoshell/shard-workflow-latest.json',
        previewSourcePath: 'C:/Users/josep/assets/preview.holo',
        privateReceiptPath: '.tmp/holoshell/shard-receipts/private.json',
      },
      shardPlan: {
        ...makeWorkflow().shardPlan,
        assets: [
          {
            ...makeWorkflow().shardPlan.assets[0],
            relativePath: '/Users/josep/assets/platform.glb',
          },
        ],
      },
    });

    expect(validateAssetShardWorkflowReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'AssetShardWorkflowReceipt.output.previewSourcePath must be repo-relative/redacted, not an absolute path.',
        'AssetShardFileProxy(asset.model.001).relativePath must be repo-relative/redacted, not an absolute path.',
      ])
    );
  });

  it('rejects source mutation, missing preview hash, and pre-human execution', () => {
    const receipt = makeWorkflow({
      summary: {
        ...makeWorkflow().summary,
        mutationExecuted: true as unknown as false,
      },
      validation: {
        ...makeWorkflow().validation,
        previewSourceHash: '',
        sourceMutation: 'mutated' as unknown as 'none',
      },
      approvals: [
        {
          ...makeWorkflow().approvals[0],
          executionAllowed: true,
        },
      ],
    });

    expect(validateAssetShardWorkflowReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'AssetShardWorkflowReceipt.summary.mutationExecuted must be false.',
        'AssetShardWorkflowReceipt.validation.sourceMutation must be none.',
        'AssetShardWorkflowReceipt.validation.previewSourceHash is required.',
        'AssetShardWorkflowReceipt approvals must not be executable before human approval.',
      ])
    );
  });

  it('rejects completed imports without a playable visual witness', () => {
    expect(validateAssetShardReceiptBundle({
      workflow: makeWorkflow(),
      approval: makeApproval(),
      importReceipt: makeImportReceipt(),
    })).toEqual(
      expect.arrayContaining([
        'AssetShardReceiptBundle.witness is required when importReceipt is completed.',
      ])
    );
  });

  it('rejects visual witnesses without screenshot, DOM hash, or visible expected text', () => {
    const receipt = makeWitness({
      screenshot: {
        path: '.tmp/holoshell/visual-witness/shard.png',
        sizeBytes: 0,
        sha256: null,
      },
      domWitness: {
        path: '.tmp/holoshell/visual-witness/shard.dom.html',
        sha256: '',
        missingText: ['Playable Shard Preview'],
      },
    });

    expect(validatePlayableShardWitnessReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'PlayableShardWitnessReceipt.screenshot.sha256 is required.',
        'PlayableShardWitnessReceipt.domWitness.sha256 is required.',
        'PlayableShardWitnessReceipt.domWitness.missingText must be empty.',
      ])
    );
  });

  it('rejects approval command previews that expose absolute local paths', () => {
    const receipt = makeApproval({
      execution: {
        allowed: true,
        commandPreview: 'node C:/Users/josep/Documents/GitHub/Hololand/scripts/import.mjs',
      },
    });

    expect(validateAssetShardImportApprovalReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'AssetShardImportApprovalReceipt.execution.commandPreview must not expose absolute local paths.',
      ])
    );
  });

  it('redacts recorded import approval command paths into artifact aliases', () => {
    const recordedCommand = [
      'node',
      'scripts\\holoshell-shard-import-approval.mjs',
      '--execute',
      '--approval-bundle',
      '../HoloScript/.bench-logs/holoshell-human-os-frontier/2026-05-21/asset-shard-visual-witness/approval-bundles/hsia-mpf9c4k2-32ab2eb8c5.json',
      '--approval-id',
      'hsia-mpf9c4k2-32ab2eb8c5',
      '--approval-nonce',
      '4dc355cf0330807527b6118f520580ec',
      '--confirm',
      'import',
      '--import-dir',
      'C:/Users/josep/Documents/GitHub/HoloScript/.bench-logs/holoshell-human-os-frontier/2026-05-21/asset-shard-visual-witness/imported-shards',
      '--import-output',
      'C:/Users/josep/Documents/GitHub/HoloScript/.bench-logs/holoshell-human-os-frontier/2026-05-21/asset-shard-visual-witness/asset-shard-import.json',
      '--import-js-output',
      'C:/Users/josep/Documents/GitHub/HoloScript/.bench-logs/holoshell-human-os-frontier/2026-05-21/asset-shard-visual-witness/asset-shard-import.js',
    ];
    const commandPreview = redactAssetShardImportCommandPreview(recordedCommand);
    const receipt = makeApproval({
      approvalId: 'hsia-mpf9c4k2-32ab2eb8c5',
      nonce: '4dc355cf0330807527b6118f520580ec',
      status: 'pending_user_approval',
      execution: {
        allowed: true,
        commandPreview,
      },
      summary: {
        ...makeApproval().summary,
        status: 'pending_user_approval',
        shardId: 'shard.sample-assets.8929194721',
      },
      witness: {
        ...makeApproval().witness,
        workflowHash: '283cb60f988b8d089dcad30f3cdcdf48733f9e79440bc41ad5d6f3098158c72e',
      },
    });

    expect(commandPreview).toContain('<artifact:approval-bundle>');
    expect(commandPreview).toContain('<artifact:import-dir>');
    expect(commandPreview).toContain('<artifact:import-receipt>');
    expect(commandPreview).toContain('<artifact:import-bootstrap>');
    expect(commandPreview).not.toContain('C:/Users/josep');
    expect(validateAssetShardImportApprovalReceipt(receipt)).toEqual([]);
  });

  it('redacts unflagged absolute command preview tokens', () => {
    const commandPreview = redactAssetShardImportCommandPreview([
      'node',
      'C:\\Users\\josep\\Documents\\GitHub\\HoloLand\\scripts\\holoshell-shard-import-approval.mjs',
      '--execute',
    ]);

    expect(commandPreview).toBe('node "<absolute-path-redacted>" --execute');
  });

  it('clones workflow receipts without retaining mutable references', () => {
    const original = makeWorkflow();
    const cloned = cloneAssetShardWorkflowReceipt(original);

    cloned.shardPlan.assets[0].name = 'changed.glb';
    cloned.rollback.generatedTmpPaths[0] = 'changed';

    expect(original.shardPlan.assets[0].name).toBe('platform.glb');
    expect(original.rollback.generatedTmpPaths[0]).toBe('.tmp/holoshell/shard-preview.holo');
  });

  it('exposes type guards for shard routing', () => {
    expect(isSupportedAssetShardKind('model')).toBe(true);
    expect(isSupportedAssetShardKind('spreadsheet')).toBe(false);
    expect(isSupportedAssetShardStatus('staged')).toBe(true);
    expect(isSupportedAssetShardStatus('pending')).toBe(false);
  });

  it('accepts a completed import bundle with playable shard visual witness', () => {
    expect(validateAssetShardReceiptBundle({
      workflow: makeWorkflow(),
      approval: makeApproval(),
      importReceipt: makeImportReceipt(),
      witness: makeWitness(),
    })).toEqual([]);
  });

  it('rejects playable shard witnesses with status fail or missing required fields', () => {
    const failReceipt = makeWitness({
      status: 'fail',
      shardWitness: {
        enabled: true,
        workflowReceipt: '.tmp/holoshell/shard-workflow-latest.json',
        previewSource: '.tmp/holoshell/shard-preview.holo',
        shardId: 'shard.demo-assets.001',
        previewHash: '',
        assetCount: 1,
        sourceAssetsMutated: false,
      },
    });

    expect(validatePlayableShardWitnessReceipt(failReceipt)).toEqual(
      expect.arrayContaining([
        'PlayableShardWitnessReceipt.status must be pass before publishing/import completion can be trusted.',
        'PlayableShardWitnessReceipt.shardWitness.previewHash is required.',
      ])
    );
  });
});

// ---------------------------------------------------------------------------
// New gate validations on existing workflow receipt
// ---------------------------------------------------------------------------

describe('AssetShardWorkflowReceipt blocked-file gate and preview source validation', () => {
  it('rejects workflow receipts with missing secretLikeAssetGate (blocked-file gate)', () => {
    const receipt = makeWorkflow({
      validation: {
        ...makeWorkflow().validation,
        secretLikeAssetGate: undefined as unknown as 'pass',
      },
    });

    const errors = validateAssetShardWorkflowReceipt(receipt);
    expect(errors).toEqual(
      expect.arrayContaining([
        'AssetShardWorkflowReceipt.validation.secretLikeAssetGate must be pass or blocked.',
      ])
    );
  });

  it('rejects workflow receipts with invalid secretLikeAssetGate value', () => {
    const receipt = makeWorkflow({
      validation: {
        ...makeWorkflow().validation,
        secretLikeAssetGate: 'unknown' as unknown as 'pass',
      },
    });

    const errors = validateAssetShardWorkflowReceipt(receipt);
    expect(errors).toEqual(
      expect.arrayContaining([
        'AssetShardWorkflowReceipt.validation.secretLikeAssetGate must be pass or blocked.',
      ])
    );
  });

  it('accepts workflow receipts with secretLikeAssetGate = blocked', () => {
    const receipt = makeWorkflow({
      validation: {
        ...makeWorkflow().validation,
        secretLikeAssetGate: 'blocked',
      },
    });

    const errors = validateAssetShardWorkflowReceipt(receipt);
    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('secretLikeAssetGate'),
      ])
    );
  });

  it('rejects workflow receipts with missing previewSourceValidation', () => {
    const receipt = makeWorkflow({
      validation: {
        ...makeWorkflow().validation,
        previewSourceValidation: undefined as unknown as 'pass',
      },
    });

    const errors = validateAssetShardWorkflowReceipt(receipt);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('previewSourceValidation'),
      ])
    );
  });

  it('rejects workflow receipts with invalid previewSourceValidation value', () => {
    const receipt = makeWorkflow({
      validation: {
        ...makeWorkflow().validation,
        previewSourceValidation: 'unknown' as unknown as 'pass',
      },
    });

    const errors = validateAssetShardWorkflowReceipt(receipt);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('previewSourceValidation'),
      ])
    );
  });

  it('accepts workflow receipts with previewSourceValidation = blocked', () => {
    const receipt = makeWorkflow({
      validation: {
        ...makeWorkflow().validation,
        previewSourceValidation: 'blocked',
      },
    });

    const errors = validateAssetShardWorkflowReceipt(receipt);
    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('previewSourceValidation'),
      ])
    );
  });
});

// ---------------------------------------------------------------------------
// AssetIntakeReceipt
// ---------------------------------------------------------------------------

describe('AssetIntakeReceipt', () => {
  it('accepts a valid intake receipt', () => {
    expect(validateAssetIntakeReceipt(makeIntake())).toEqual([]);
  });

  it('rejects intake receipts with missing intakeId', () => {
    const receipt = makeIntake({ intakeId: '' });
    expect(validateAssetIntakeReceipt(receipt)).toEqual(
      expect.arrayContaining(['AssetIntakeReceipt.intakeId is required.'])
    );
  });

  it('rejects intake receipts with invalid timestamp', () => {
    const receipt = makeIntake({ generatedAt: 'not-a-date' });
    expect(validateAssetIntakeReceipt(receipt)).toEqual(
      expect.arrayContaining(['AssetIntakeReceipt.generatedAt must be a valid ISO-8601 timestamp.'])
    );
  });

  it('rejects intake receipts with unsupported intakeKind', () => {
    const receipt = makeIntake({ intakeKind: 'telepathic' as unknown as 'folder_scan' });
    expect(validateAssetIntakeReceipt(receipt)).toEqual(
      expect.arrayContaining([expect.stringContaining('intakeKind is unsupported')])
    );
  });

  it('rejects intake receipts with wrong pathPolicy', () => {
    const receipt = makeIntake({
      source: {
        ...makeIntake().source,
        pathPolicy: 'expose_all' as unknown as 'absolute_path_kept_in_private_receipt_only',
      },
    });
    expect(validateAssetIntakeReceipt(receipt)).toEqual(
      expect.arrayContaining(['AssetIntakeReceipt.source.pathPolicy must keep absolute paths private.'])
    );
  });

  it('rejects intake receipts with wrong privacyClass', () => {
    const receipt = makeIntake({
      source: {
        ...makeIntake().source,
        privacyClass: 'public' as unknown as 'local_private',
      },
    });
    expect(validateAssetIntakeReceipt(receipt)).toEqual(
      expect.arrayContaining(['AssetIntakeReceipt.source.privacyClass must be local_private.'])
    );
  });

  it('rejects intake receipts with blockedFileGate absent or invalid', () => {
    const receipt = makeIntake({
      summary: {
        ...makeIntake().summary,
        blockedFileGate: undefined as unknown as 'pass',
      },
    });
    expect(validateAssetIntakeReceipt(receipt)).toEqual(
      expect.arrayContaining(['AssetIntakeReceipt.summary.blockedFileGate must be pass or blocked.'])
    );
  });

  it('accepts intake receipts with blockedFileGate = blocked', () => {
    const receipt = makeIntake({
      summary: {
        ...makeIntake().summary,
        blockedFileGate: 'blocked',
        blockedFileCount: 1,
      },
      files: [
        {
          id: 'asset.model.001',
          name: 'platform.glb',
          relativePath: 'models/platform.glb',
          kind: 'model' as const,
          sizeBytes: 128,
          hashSha256: 'asset_hash_001',
          blocked: true,
          blockReason: 'secret-like content detected',
        },
      ],
    });
    const errors = validateAssetIntakeReceipt(receipt);
    expect(errors).not.toEqual(
      expect.arrayContaining([expect.stringContaining('blockedFileGate')])
    );
  });

  it('rejects intake receipts without requiresApproval', () => {
    const receipt = makeIntake({
      summary: {
        ...makeIntake().summary,
        requiresApproval: false as unknown as true,
      },
    });
    expect(validateAssetIntakeReceipt(receipt)).toEqual(
      expect.arrayContaining(['AssetIntakeReceipt.summary.requiresApproval must be true.'])
    );
  });

  it('rejects absolute paths in intake file entries', () => {
    const receipt = makeIntake({
      files: [
        {
          id: 'asset.model.001',
          name: 'platform.glb',
          relativePath: '/Users/josep/assets/platform.glb',
          kind: 'model' as const,
          sizeBytes: 128,
          hashSha256: 'asset_hash_001',
          blocked: false,
        },
      ],
    });
    expect(validateAssetIntakeReceipt(receipt)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('must be repo-relative/redacted, not an absolute path'),
      ])
    );
  });

  it('rejects intake file entries with missing blockReason when blocked', () => {
    const receipt = makeIntake({
      files: [
        {
          id: 'asset.model.001',
          name: 'platform.glb',
          relativePath: 'models/platform.glb',
          kind: 'model' as const,
          sizeBytes: 128,
          hashSha256: 'asset_hash_001',
          blocked: true,
        },
      ],
    });
    expect(validateAssetIntakeReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'AssetIntakeReceipt file(asset.model.001).blockReason is required when blocked.',
      ])
    );
  });

  it('rejects intake file entries with missing hashSha256 when not blocked', () => {
    const receipt = makeIntake({
      files: [
        {
          id: 'asset.model.001',
          name: 'platform.glb',
          relativePath: 'models/platform.glb',
          kind: 'model' as const,
          sizeBytes: 128,
          hashSha256: '',
          blocked: false,
        },
      ],
    });
    expect(validateAssetIntakeReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'AssetIntakeReceipt file(asset.model.001).hashSha256 is required.',
      ])
    );
  });

  it('rejects intake receipts without intakeNonce (approval gate)', () => {
    const receipt = makeIntake({ intakeNonce: '' });
    expect(validateAssetIntakeReceipt(receipt)).toEqual(
      expect.arrayContaining(['AssetIntakeReceipt.intakeNonce is required.'])
    );
  });

  it('rejects intake receipts with sourceAssetsMutated = true', () => {
    const receipt = makeIntake({
      rollback: { sourceAssetsMutated: true as unknown as false },
    });
    expect(validateAssetIntakeReceipt(receipt)).toEqual(
      expect.arrayContaining(['AssetIntakeReceipt.rollback.sourceAssetsMutated must be false.'])
    );
  });

  it('rejects empty file list', () => {
    const receipt = makeIntake({ files: [] });
    expect(validateAssetIntakeReceipt(receipt)).toEqual(
      expect.arrayContaining(['AssetIntakeReceipt.files must contain at least one file entry.'])
    );
  });

  it('clones intake receipts without retaining mutable references', () => {
    const original = makeIntake();
    const cloned = cloneAssetIntakeReceipt(original);
    cloned.files[0].name = 'changed.glb';
    expect(original.files[0].name).toBe('platform.glb');
  });

  it('exposes type guards for intake kinds and statuses', () => {
    expect(isSupportedAssetIntakeKind('folder_scan')).toBe(true);
    expect(isSupportedAssetIntakeKind('telepathic')).toBe(false);
    expect(isSupportedAssetIntakeStatus('scanned')).toBe(true);
    expect(isSupportedAssetIntakeStatus('pending')).toBe(false);
    expect(isSupportedAssetConversionKind('model_to_holo')).toBe(true);
    expect(isSupportedAssetConversionKind('magic')).toBe(false);
    expect(isSupportedAssetConversionStatus('completed')).toBe(true);
    expect(isSupportedAssetConversionStatus('running')).toBe(false);
    expect(isSupportedPreviewSourceStatus('generated')).toBe(true);
    expect(isSupportedPreviewSourceStatus('pending')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AssetConversionReceipt
// ---------------------------------------------------------------------------

describe('AssetConversionReceipt', () => {
  it('accepts a valid conversion receipt', () => {
    expect(validateAssetConversionReceipt(makeConversion())).toEqual([]);
  });

  it('rejects conversion receipts with missing conversionId', () => {
    const receipt = makeConversion({ conversionId: '' });
    expect(validateAssetConversionReceipt(receipt)).toEqual(
      expect.arrayContaining(['AssetConversionReceipt.conversionId is required.'])
    );
  });

  it('rejects conversion receipts with invalid timestamp', () => {
    const receipt = makeConversion({ generatedAt: 'not-a-date' });
    expect(validateAssetConversionReceipt(receipt)).toEqual(
      expect.arrayContaining(['AssetConversionReceipt.generatedAt must be a valid ISO-8601 timestamp.'])
    );
  });

  it('rejects conversion receipts with unsupported conversionKind', () => {
    const receipt = makeConversion({ conversionKind: 'magic' as unknown as 'model_to_holo' });
    expect(validateAssetConversionReceipt(receipt)).toEqual(
      expect.arrayContaining([expect.stringContaining('conversionKind is unsupported')])
    );
  });

  it('rejects conversion receipts with sourceMutated = true', () => {
    const receipt = makeConversion({
      summary: {
        ...makeConversion().summary,
        sourceMutated: true as unknown as false,
      },
    });
    expect(validateAssetConversionReceipt(receipt)).toEqual(
      expect.arrayContaining(['AssetConversionReceipt.summary.sourceMutated must be false.'])
    );
  });

  it('rejects conversion receipts with wrong pathPolicy', () => {
    const receipt = makeConversion({
      source: {
        ...makeConversion().source,
        pathPolicy: 'expose_all' as unknown as 'absolute_path_kept_in_private_receipt_only',
      },
    });
    expect(validateAssetConversionReceipt(receipt)).toEqual(
      expect.arrayContaining(['AssetConversionReceipt.source.pathPolicy must keep absolute paths private.'])
    );
  });

  it('rejects completed conversions with missing output fields', () => {
    const receipt = makeConversion({
      output: {
        outputFileName: '',
        outputFileHash: '',
        outputPath: 'C:/Users/josep/output.holo',
      },
    });
    const errors = validateAssetConversionReceipt(receipt);
    expect(errors).toEqual(
      expect.arrayContaining([
        'AssetConversionReceipt.output.outputFileName is required for completed conversions.',
        'AssetConversionReceipt.output.outputFileHash is required for completed conversions.',
        'AssetConversionReceipt.output.outputPath must be repo-relative/redacted, not an absolute path.',
      ])
    );
  });

  it('rejects conversion receipts with rollback sourceAssetsMutated = true', () => {
    const receipt = makeConversion({
      rollback: {
        sourceAssetsMutated: true as unknown as false,
        generatedTmpPaths: [],
      },
    });
    expect(validateAssetConversionReceipt(receipt)).toEqual(
      expect.arrayContaining(['AssetConversionReceipt.rollback.sourceAssetsMutated must be false.'])
    );
  });

  it('accepts skipped conversions without output requirements', () => {
    const receipt = makeConversion({
      summary: {
        ...makeConversion().summary,
        status: 'skipped',
      },
    });
    const errors = validateAssetConversionReceipt(receipt);
    expect(errors).not.toEqual(
      expect.arrayContaining([expect.stringContaining('output')])
    );
  });

  it('clones conversion receipts without retaining mutable references', () => {
    const original = makeConversion();
    const cloned = cloneAssetConversionReceipt(original);
    cloned.rollback.generatedTmpPaths[0] = 'changed';
    expect(original.rollback.generatedTmpPaths[0]).toBe('.tmp/holoshell/converted/platform.holo');
  });
});

// ---------------------------------------------------------------------------
// PreviewShardSourceReceipt
// ---------------------------------------------------------------------------

describe('PreviewShardSourceReceipt', () => {
  it('accepts a valid preview source receipt', () => {
    expect(validatePreviewShardSourceReceipt(makePreview())).toEqual([]);
  });

  it('rejects preview receipts with missing previewId', () => {
    const receipt = makePreview({ previewId: '' });
    expect(validatePreviewShardSourceReceipt(receipt)).toEqual(
      expect.arrayContaining(['PreviewShardSourceReceipt.previewId is required.'])
    );
  });

  it('rejects preview receipts with invalid timestamp', () => {
    const receipt = makePreview({ generatedAt: 'not-a-date' });
    expect(validatePreviewShardSourceReceipt(receipt)).toEqual(
      expect.arrayContaining(['PreviewShardSourceReceipt.generatedAt must be a valid ISO-8601 timestamp.'])
    );
  });

  it('rejects preview receipts with wrong pathPolicy', () => {
    const receipt = makePreview({
      source: {
        ...makePreview().source,
        pathPolicy: 'expose_all' as unknown as 'absolute_path_kept_in_private_receipt_only',
      },
    });
    expect(validatePreviewShardSourceReceipt(receipt)).toEqual(
      expect.arrayContaining(['PreviewShardSourceReceipt.source.pathPolicy must keep absolute paths private.'])
    );
  });

  it('rejects preview receipts with missing previewSourceHash', () => {
    const receipt = makePreview({
      summary: {
        ...makePreview().summary,
        previewSourceHash: '',
      },
    });
    expect(validatePreviewShardSourceReceipt(receipt)).toEqual(
      expect.arrayContaining(['PreviewShardSourceReceipt.summary.previewSourceHash is required.'])
    );
  });

  it('rejects preview receipts with sourceAssetsMutated = true', () => {
    const receipt = makePreview({
      summary: {
        ...makePreview().summary,
        sourceAssetsMutated: true as unknown as false,
      },
    });
    expect(validatePreviewShardSourceReceipt(receipt)).toEqual(
      expect.arrayContaining(['PreviewShardSourceReceipt.summary.sourceAssetsMutated must be false.'])
    );
  });

  it('rejects preview receipts with absolute paths in output', () => {
    const receipt = makePreview({
      output: {
        previewSourcePath: 'C:/Users/josep/preview.holo',
        privateReceiptPath: '.tmp/holoshell/private.json',
      },
    });
    expect(validatePreviewShardSourceReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'PreviewShardSourceReceipt.output.previewSourcePath must be repo-relative/redacted, not an absolute path.',
      ])
    );
  });

  it('rejects preview receipts with rollback sourceAssetsMutated = true', () => {
    const receipt = makePreview({
      rollback: {
        sourceAssetsMutated: true as unknown as false,
        generatedTmpPaths: [],
      },
    });
    expect(validatePreviewShardSourceReceipt(receipt)).toEqual(
      expect.arrayContaining(['PreviewShardSourceReceipt.rollback.sourceAssetsMutated must be false.'])
    );
  });

  it('rejects unsupported preview source status', () => {
    const receipt = makePreview({
      summary: {
        ...makePreview().summary,
        status: 'pending' as unknown as 'generated',
      },
    });
    expect(validatePreviewShardSourceReceipt(receipt)).toEqual(
      expect.arrayContaining([expect.stringContaining('summary.status is unsupported')])
    );
  });

  it('clones preview receipts without retaining mutable references', () => {
    const original = makePreview();
    const cloned = clonePreviewShardSourceReceipt(original);
    cloned.rollback.generatedTmpPaths[0] = 'changed';
    expect(original.rollback.generatedTmpPaths[0]).toBe('.tmp/holoshell/shard-preview.holo');
  });
});

// ---------------------------------------------------------------------------
// AssetShardRollbackContract
// ---------------------------------------------------------------------------

describe('AssetShardRollbackContract', () => {
  it('accepts a valid rollback contract', () => {
    expect(validateAssetShardRollbackContract(makeRollbackContract())).toEqual([]);
  });

  it('rejects rollback contracts with missing workflowId', () => {
    const contract = makeRollbackContract({ workflowId: '' });
    expect(validateAssetShardRollbackContract(contract)).toEqual(
      expect.arrayContaining(['AssetShardRollbackContract.workflowId is required.'])
    );
  });

  it('rejects rollback contracts with empty rollbackPoints', () => {
    const contract = makeRollbackContract({ rollbackPoints: [] });
    expect(validateAssetShardRollbackContract(contract)).toEqual(
      expect.arrayContaining(['AssetShardRollbackContract.rollbackPoints must contain at least one rollback point.'])
    );
  });

  it('rejects rollback points with sourceAssetsMutated = true', () => {
    const contract = makeRollbackContract({
      rollbackPoints: [
        {
          step: 'intake',
          sourceAssetsMutated: true as unknown as false,
          tmpPaths: ['.tmp/intake'],
          replayKey: 'replay-001',
        },
      ],
    });
    expect(validateAssetShardRollbackContract(contract)).toEqual(
      expect.arrayContaining([
        'AssetShardRollbackContract rollback point(intake).sourceAssetsMutated must be false.',
      ])
    );
  });

  it('rejects rollback points with missing replayKey', () => {
    const contract = makeRollbackContract({
      rollbackPoints: [
        {
          step: 'intake',
          sourceAssetsMutated: false as const,
          tmpPaths: ['.tmp/intake'],
          replayKey: '',
        },
      ],
    });
    expect(validateAssetShardRollbackContract(contract)).toEqual(
      expect.arrayContaining([
        'AssetShardRollbackContract rollback point(intake).replayKey is required.',
      ])
    );
  });

  it('rejects rollback contracts with replayDeterministic = false', () => {
    const contract = makeRollbackContract({ replayDeterministic: false });
    expect(validateAssetShardRollbackContract(contract)).toEqual(
      expect.arrayContaining(['AssetShardRollbackContract.replayDeterministic must be true.'])
    );
  });

  it('rejects rollback contracts with sourceIntegrityPreserved = false', () => {
    const contract = makeRollbackContract({ sourceIntegrityPreserved: false as unknown as true });
    expect(validateAssetShardRollbackContract(contract)).toEqual(
      expect.arrayContaining(['AssetShardRollbackContract.sourceIntegrityPreserved must be true.'])
    );
  });

  it('clones rollback contracts without retaining mutable references', () => {
    const original = makeRollbackContract();
    const cloned = cloneAssetShardRollbackContract(original);
    cloned.rollbackPoints[0].tmpPaths[0] = 'changed';
    expect(original.rollbackPoints[0].tmpPaths[0]).toBe('.tmp/holoshell/intake');
  });
});

// ---------------------------------------------------------------------------
// Full receipt chain validation
// ---------------------------------------------------------------------------

describe('AssetShardFullReceiptChain', () => {
  it('accepts a complete valid receipt chain', () => {
    const errors = validateAssetShardFullReceiptChain({
      intake: makeIntake(),
      conversion: makeConversion(),
      preview: makePreview(),
      workflow: makeWorkflow(),
      approval: makeApproval(),
      importReceipt: makeImportReceipt(),
      witness: makeWitness(),
      rollback: makeRollbackContract(),
    });
    expect(errors).toEqual([]);
  });

  it('rejects chain without intake', () => {
    const errors = validateAssetShardFullReceiptChain({
      preview: makePreview(),
      workflow: makeWorkflow(),
    });
    expect(errors).toEqual(
      expect.arrayContaining(['AssetShardFullReceiptChain.intake is required.'])
    );
  });

  it('rejects chain without preview', () => {
    const errors = validateAssetShardFullReceiptChain({
      intake: makeIntake(),
      workflow: makeWorkflow(),
    });
    expect(errors).toEqual(
      expect.arrayContaining(['AssetShardFullReceiptChain.preview is required.'])
    );
  });

  it('rejects chain without workflow', () => {
    const errors = validateAssetShardFullReceiptChain({
      intake: makeIntake(),
      preview: makePreview(),
    });
    expect(errors).toEqual(
      expect.arrayContaining(['AssetShardFullReceiptChain.workflow is required.'])
    );
  });

  it('rejects chain when completed import lacks witness', () => {
    const errors = validateAssetShardFullReceiptChain({
      intake: makeIntake(),
      preview: makePreview(),
      workflow: makeWorkflow(),
      approval: makeApproval(),
      importReceipt: makeImportReceipt(),
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'AssetShardFullReceiptChain.witness is required when importReceipt is completed.',
      ])
    );
  });

  it('validates cross-receipt fingerprint consistency', () => {
    const intake = makeIntake();
    const workflow = makeWorkflow();
    workflow.source.assetFolderFingerprint = 'different-fingerprint';

    const errors = validateAssetShardFullReceiptChain({
      intake,
      preview: makePreview(),
      workflow,
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'AssetShardFullReceiptChain: intake and workflow source fingerprints must match.',
      ])
    );
  });

  it('validates cross-receipt preview hash consistency', () => {
    const preview = makePreview();
    preview.summary.previewSourceHash = 'different_hash';
    const workflow = makeWorkflow();

    const errors = validateAssetShardFullReceiptChain({
      intake: makeIntake(),
      preview,
      workflow,
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'AssetShardFullReceiptChain: preview and workflow preview hashes must match.',
      ])
    );
  });

  it('does not require conversion, approval, import, or witness when not present', () => {
    const errors = validateAssetShardFullReceiptChain({
      intake: makeIntake(),
      preview: makePreview(),
      workflow: makeWorkflow(),
    });
    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('conversion'),
        expect.stringContaining('approval'),
        expect.stringContaining('importReceipt'),
        expect.stringContaining('witness'),
      ])
    );
  });
});
