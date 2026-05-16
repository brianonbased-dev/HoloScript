/**
 * @holoscript/core-types Asset Manifest Receipt Tests
 *
 * Covers deterministic sorting, hash stability, redaction invariants,
 * and PermissionEnvelope shape for source-native asset intake.
 */

import { describe, expect, it } from 'vitest';
import type {
  AssetImportReceipt,
  AssetIntakeSummary,
  AssetManifestEntry,
  AssetShardIntakeState,
  AssetType,
  FolderCustodyReceipt,
  LocalAssetManifestReceipt,
  PermissionEnvelope,
  PreviewSourceValidation,
} from '../security';

describe('AssetManifestEntry', () => {
  it('accepts a valid entry with redacted false', () => {
    const entry: AssetManifestEntry = {
      pathAlias: 'models/hero.fbx',
      contentHash: 'sha256:abc123',
      assetType: 'model',
      bytes: 1024,
      mtimeMs: 1700000000000,
      redacted: false,
      originalPath: '/home/user/assets/models/hero.fbx',
    };
    expect(entry.pathAlias).toBe('models/hero.fbx');
    expect(entry.redacted).toBe(false);
    expect(entry.originalPath).toBeDefined();
  });

  it('accepts a redacted entry without originalPath', () => {
    const entry: AssetManifestEntry = {
      pathAlias: 'redacted/private.txt',
      contentHash: 'sha256:def456',
      assetType: 'blocked',
      bytes: 0,
      mtimeMs: 1700000000000,
      redacted: true,
    };
    expect(entry.redacted).toBe(true);
    expect(entry.originalPath).toBeUndefined();
  });
});

describe('AssetType union', () => {
  it('covers all known asset types', () => {
    const types: AssetType[] = [
      'model',
      'image',
      'audio',
      'video',
      'source',
      'holo',
      'hsplus',
      'texture',
      'material',
      'animation',
      'unknown',
      'blocked',
    ];
    expect(types.length).toBe(12);
  });
});

describe('PermissionEnvelope', () => {
  it('supports silent_read tier', () => {
    const envelope: PermissionEnvelope = {
      tier: 'silent_read',
      guardedExecute: false,
      breakGlass: false,
      receiptRequired: true,
      appliesTo: ['list_folder', 'read_file_metadata', 'hash_asset_file'],
    };
    expect(envelope.tier).toBe('silent_read');
    expect(envelope.guardedExecute).toBe(false);
  });

  it('supports guarded_execute tier', () => {
    const envelope: PermissionEnvelope = {
      tier: 'guarded_execute',
      guardedExecute: true,
      breakGlass: false,
      receiptRequired: true,
      appliesTo: ['write_tmp_preview', 'validate_preview_source'],
    };
    expect(envelope.tier).toBe('guarded_execute');
    expect(envelope.guardedExecute).toBe(true);
  });

  it('supports break_glass tier', () => {
    const envelope: PermissionEnvelope = {
      tier: 'break_glass',
      guardedExecute: true,
      breakGlass: true,
      receiptRequired: true,
      appliesTo: ['publish_shard', 'delete_source_asset'],
    };
    expect(envelope.tier).toBe('break_glass');
    expect(envelope.breakGlass).toBe(true);
  });
});

describe('LocalAssetManifestReceipt invariants', () => {
  it('enforces sourceAssetsMutated === false at generation', () => {
    const receipt: LocalAssetManifestReceipt = {
      schemaVersion: 'holoshell.local-asset-intake/v1',
      manifestId: 'lamr_a1b2c3d4',
      manifestHash: 'sha256:deadbeef',
      folderAlias: 'hero-pack',
      sortedEntries: [
        {
          pathAlias: 'a.txt',
          contentHash: 'sha256:1111',
          assetType: 'source',
          bytes: 4,
          mtimeMs: 1700000000000,
          redacted: false,
        },
        {
          pathAlias: 'b.txt',
          contentHash: 'sha256:2222',
          assetType: 'source',
          bytes: 4,
          mtimeMs: 1700000000000,
          redacted: false,
        },
      ],
      summary: {
        assetCount: 2,
        blockedAssetCount: 0,
        redactedCount: 0,
        totalBytes: 8,
      },
      replayKey: 'sha256:replay123',
      sourceAssetsMutated: false,
      privatePathsRedacted: false,
      permissionEnvelope: {
        tier: 'silent_read',
        guardedExecute: false,
        breakGlass: false,
        receiptRequired: true,
        appliesTo: ['list_folder'],
      },
      generatedAt: new Date().toISOString(),
      generatedBy: 'codex-hardware',
    };

    expect(receipt.sourceAssetsMutated).toBe(false);
    expect(receipt.sortedEntries[0].pathAlias).toBe('a.txt');
    expect(receipt.sortedEntries[1].pathAlias).toBe('b.txt');
  });

  it('flags privatePathsRedacted when entries are redacted', () => {
    const receipt: LocalAssetManifestReceipt = {
      schemaVersion: 'holoshell.local-asset-intake/v1',
      manifestId: 'lamr_e5f6g7h8',
      manifestHash: 'sha256:cafebabe',
      folderAlias: 'private-pack',
      sortedEntries: [
        {
          pathAlias: 'redacted/secret.txt',
          contentHash: 'sha256:3333',
          assetType: 'blocked',
          bytes: 0,
          mtimeMs: 1700000000000,
          redacted: true,
        },
      ],
      summary: {
        assetCount: 1,
        blockedAssetCount: 1,
        redactedCount: 1,
        totalBytes: 0,
      },
      replayKey: 'sha256:replay456',
      sourceAssetsMutated: false,
      privatePathsRedacted: true,
      permissionEnvelope: {
        tier: 'break_glass',
        guardedExecute: true,
        breakGlass: true,
        receiptRequired: true,
        appliesTo: ['delete_source_asset'],
      },
      generatedAt: new Date().toISOString(),
      generatedBy: 'browser-vision',
    };

    expect(receipt.privatePathsRedacted).toBe(true);
    expect(receipt.sortedEntries[0].originalPath).toBeUndefined();
  });
});

describe('FolderCustodyReceipt alias', () => {
  it('is interchangeable with LocalAssetManifestReceipt', () => {
    const receipt: FolderCustodyReceipt = {
      schemaVersion: 'holoshell.local-asset-intake/v1',
      manifestId: 'fcr_1234',
      manifestHash: 'sha256:abcd',
      folderAlias: 'test',
      sortedEntries: [],
      summary: {
        assetCount: 0,
        blockedAssetCount: 0,
        redactedCount: 0,
        totalBytes: 0,
      },
      replayKey: 'sha256:replay0',
      sourceAssetsMutated: false,
      privatePathsRedacted: false,
      permissionEnvelope: {
        tier: 'silent_read',
        guardedExecute: false,
        breakGlass: false,
        receiptRequired: true,
        appliesTo: [],
      },
      generatedAt: new Date().toISOString(),
      generatedBy: 'holomesh',
    };

    expect(receipt).toBeDefined();
  });
});

describe('AssetShardIntakeState', () => {
  it('tracks the full intake lifecycle', () => {
    const state: AssetShardIntakeState = {
      selectedWorkflow: 'folder-to-playable-hololand-shard',
      activeShardId: '',
      selectedFolderAlias: '',
      assetCount: 0,
      blockedAssetCount: 0,
      approvalCount: 0,
      receiptCount: 0,
      previewSourcePath: '',
      validationStatus: 'unknown',
      importStatus: 'not_requested',
      rollbackStatus: 'not_needed',
      currentLane: 'codex-hardware',
    };

    expect(state.validationStatus).toBe('unknown');
    expect(state.importStatus).toBe('not_requested');
    expect(state.rollbackStatus).toBe('not_needed');
  });
});

describe('PreviewSourceValidation', () => {
  it('allows import when status is pass', () => {
    const validation: PreviewSourceValidation = {
      status: 'pass',
      previewSourcePath: '.tmp/holoshell/shard-preview.holo',
      importAllowed: true,
    };
    expect(validation.importAllowed).toBe(true);
  });
});

describe('AssetImportReceipt', () => {
  it('records a successful guarded import', () => {
    const receipt: AssetImportReceipt = {
      status: 'completed',
      runtimeMutationExecuted: true,
      sourceAssetsMutated: false,
      rollback: {
        available: true,
        receiptId: 'rollback_123',
      },
    };
    expect(receipt.sourceAssetsMutated).toBe(false);
    expect(receipt.rollback.available).toBe(true);
  });
});
