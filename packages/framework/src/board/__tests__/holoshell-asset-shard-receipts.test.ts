import { describe, expect, it } from 'vitest';
import {
  cloneAssetShardWorkflowReceipt,
  isSupportedAssetShardKind,
  isSupportedAssetShardStatus,
  type AssetShardImportApprovalReceipt,
  type AssetShardImportReceipt,
  type AssetShardWorkflowReceipt,
  type PlayableShardWitnessReceipt,
  validateAssetShardImportApprovalReceipt,
  validateAssetShardReceiptBundle,
  validateAssetShardWorkflowReceipt,
  validatePlayableShardWitnessReceipt,
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
});
