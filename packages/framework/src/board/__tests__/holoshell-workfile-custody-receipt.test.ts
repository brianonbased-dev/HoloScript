import { describe, expect, it } from 'vitest';
import {
  cloneHoloShellWorkFileCustodyReceipt,
  isSupportedWorkFileAdapterKind,
  isSupportedWorkFileCustodyOutcome,
  isSupportedWorkFileKind,
  type HoloShellWorkFileCustodyReceipt,
  validateHoloShellWorkFileCustodyReceipt,
} from '../holoshell-workfile-custody-receipt';

function makeReceipt(
  overrides: Partial<HoloShellWorkFileCustodyReceipt> = {}
): HoloShellWorkFileCustodyReceipt {
  return {
    id: 'workfile_custody_20260515_001',
    workflow: 'revise-quarterly-plan-with-receipts',
    startedAt: '2026-05-15T12:00:00Z',
    endedAt: '2026-05-15T12:00:04Z',
    snapshot: {
      redactedPath: 'QuarterlyPlan.xlsx',
      pathHash: 'path_hash_001',
      basename: 'QuarterlyPlan.xlsx',
      extension: '.xlsx',
      kind: 'xlsx',
      sizeBytes: 524_288,
      sourceHash: 'source_hash_001',
      sourceHashAlgorithm: 'sha256',
      capturedAt: '2026-05-15T12:00:00Z',
      privacyClass: 'local-private',
      sourceMutated: false,
    },
    parser: {
      adapter: 'native-parser',
      parserName: 'holoshell-workfile-adapter',
      parserVersion: '0.1.0',
      parseStatus: 'warn',
      supported: true,
      detectedFeatures: ['xlsx-zip-container', 'worksheets'],
      warnings: [
        {
          kind: 'formula-present',
          severity: 'info',
          message: 'Workbook has calculation metadata; preview before export.',
          evidence: 'xl/calcChain.xml',
        },
      ],
    },
    preview: {
      previewId: 'preview_001',
      previewKind: 'cell-diff',
      sourceHash: 'source_hash_001',
      previewHash: 'preview_hash_001',
      outputKind: 'xlsx',
      requiresApproval: true,
    },
    exportReceipt: {
      outputRedactedPath: 'QuarterlyPlan.holoshell-export.xlsx',
      outputHash: 'output_hash_001',
      outputHashAlgorithm: 'sha256',
      outputKind: 'xlsx',
      approvalId: 'approval_001',
      sourceHash: 'source_hash_001',
      exportedAt: '2026-05-15T12:00:04Z',
    },
    sourceMutated: false,
    approvalRequired: true,
    approvalId: 'approval_001',
    replayKey: 'sha256:source_hash_001:preview_hash_001',
    outcome: 'warn',
    hash: 'receipt_hash_001',
    hashAlgorithm: 'sha256',
    provenance: [
      'experiments/holoshell-human-os-frontier/document-spreadsheet-custody-pipeline.hs',
    ],
    verificationCommands: ['node scripts/holoshell-workfile-adapter.mjs --self-test'],
    metadata: {
      rowCount: 42,
      deterministic: true,
      notes: ['preview-only source custody'],
    },
    ...overrides,
  };
}

describe('HoloShell work-file custody receipt', () => {
  it('accepts a complete read-before-export receipt', () => {
    expect(validateHoloShellWorkFileCustodyReceipt(makeReceipt())).toEqual([]);
  });

  it('rejects source mutation in either receipt envelope', () => {
    const receipt = makeReceipt({
      sourceMutated: true as unknown as HoloShellWorkFileCustodyReceipt['sourceMutated'],
      snapshot: {
        ...makeReceipt().snapshot,
        sourceMutated:
          true as unknown as HoloShellWorkFileCustodyReceipt['snapshot']['sourceMutated'],
      },
    });

    expect(validateHoloShellWorkFileCustodyReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'HoloShellWorkFileCustodyReceipt.sourceMutated must be false.',
        'WorkFileSnapshot.sourceMutated must be false.',
      ])
    );
  });

  it('rejects unsupported enums with field-specific errors', () => {
    const receipt = makeReceipt({
      outcome: 'maybe' as HoloShellWorkFileCustodyReceipt['outcome'],
      snapshot: {
        ...makeReceipt().snapshot,
        kind: 'numbers' as HoloShellWorkFileCustodyReceipt['snapshot']['kind'],
        privacyClass: 'publicish' as HoloShellWorkFileCustodyReceipt['snapshot']['privacyClass'],
      },
      parser: {
        ...makeReceipt().parser,
        adapter: 'screen-scrape' as HoloShellWorkFileCustodyReceipt['parser']['adapter'],
        parseStatus: 'partial' as HoloShellWorkFileCustodyReceipt['parser']['parseStatus'],
        warnings: [
          {
            kind: 'surprise' as NonNullable<
              HoloShellWorkFileCustodyReceipt['parser']['warnings']
            >[number]['kind'],
            severity: 'medium' as NonNullable<
              HoloShellWorkFileCustodyReceipt['parser']['warnings']
            >[number]['severity'],
            message: '',
          },
        ],
      },
    });

    expect(validateHoloShellWorkFileCustodyReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'HoloShellWorkFileCustodyReceipt.outcome is unsupported: maybe.',
        'WorkFileSnapshot.kind is unsupported: numbers.',
        'WorkFileSnapshot.privacyClass is unsupported: publicish.',
        'WorkFileParserEvidence.adapter is unsupported: screen-scrape.',
        'WorkFileParserEvidence.parseStatus is unsupported: partial.',
        'WorkFileWarning.kind is unsupported: surprise.',
        'WorkFileWarning.severity is unsupported: medium.',
        'WorkFileWarning.message is required.',
      ])
    );
  });

  it('requires preview and export hashes to match the captured source hash', () => {
    const receipt = makeReceipt({
      preview: { ...makeReceipt().preview, sourceHash: 'other_source_hash' },
      exportReceipt: { ...makeReceipt().exportReceipt!, sourceHash: 'export_source_hash' },
    });

    expect(validateHoloShellWorkFileCustodyReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'WorkFilePreviewReceipt.sourceHash must match WorkFileSnapshot.sourceHash.',
        'WorkFileExportReceipt.sourceHash must match WorkFileSnapshot.sourceHash.',
      ])
    );
  });

  it('clones nested evidence without retaining mutable references', () => {
    const original = makeReceipt();
    const cloned = cloneHoloShellWorkFileCustodyReceipt(original);

    cloned.parser.detectedFeatures![0] = 'changed';
    cloned.parser.warnings![0].message = 'changed';
    cloned.metadata!.notes = ['changed'];

    expect(original.parser.detectedFeatures![0]).toBe('xlsx-zip-container');
    expect(original.parser.warnings![0].message).toBe(
      'Workbook has calculation metadata; preview before export.'
    );
    expect(original.metadata!.notes).toEqual(['preview-only source custody']);
  });

  it('exposes type guards for HoloShell adapter routing', () => {
    expect(isSupportedWorkFileKind('docx')).toBe(true);
    expect(isSupportedWorkFileKind('pages')).toBe(false);
    expect(isSupportedWorkFileAdapterKind('office-automation')).toBe(true);
    expect(isSupportedWorkFileAdapterKind('raw-shell')).toBe(false);
    expect(isSupportedWorkFileCustodyOutcome('blocked-by-policy')).toBe(true);
    expect(isSupportedWorkFileCustodyOutcome('blocked')).toBe(false);
  });
});
