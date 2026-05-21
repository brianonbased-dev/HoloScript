import { describe, expect, it } from 'vitest';
import {
  HOLOSHELL_LEGACY_APP_RECONSTRUCTION_SCHEMA_VERSION,
  cloneHoloShellLegacyAppReconstruction,
  generateDenseReconstructionFixture,
  isSupportedHoloShellConfidenceLevel,
  isSupportedHoloShellControlGroupSemantic,
  isSupportedHoloShellGeometryNodeType,
  isSupportedHoloShellReconstructionAction,
  isSupportedHoloShellWitnessType,
  validateHoloShellLegacyAppReconstruction,
  type HoloShellLegacyAppReconstruction,
  type HoloShellGeometryNode,
} from '../holoshell-legacy-app-reconstruction';

function minimalReconstruction(): HoloShellLegacyAppReconstruction {
  return {
    schemaVersion: HOLOSHELL_LEGACY_APP_RECONSTRUCTION_SCHEMA_VERSION,
    generatedAt: '2026-05-21T12:00:00.000Z',
    platform: 'win32',
    sourceRealitySnapshotId: 'snapshot-001',
    sourceWindowId: 'window-001',
    sourceAnchors: {
      source: 'experiments/holoshell-human-os-frontier/legacy-app-reconstruction-room.holo',
      adapter: 'scripts/holoshell-legacy-app-reconstruction-adapter.mjs',
    },
    summary: {
      totalGeometryNodes: 3,
      totalControlGroups: 2,
      totalWitnessPlaceholders: 2,
      totalLowConfidenceBlocks: 1,
      highConfidenceNodeCount: 2,
      mediumConfidenceNodeCount: 0,
      lowConfidenceNodeCount: 1,
      inferredNodeCount: 0,
      unresolvedNodeCount: 0,
      contestedNodeCount: 0,
      screenshotIsPrimaryModel: false,
      confidenceDistribution: { high: 2, medium: 0, low: 1, inferred: 0, unresolved: 0 },
    },
    geometryNodes: [
      {
        nodeId: 'node-0',
        type: 'window_frame',
        label: 'Main Window',
        bounds: [0, 0, 0, 1920, 1080, 1],
        confidence: 'high',
        controlGroupId: 'group-navigation-0',
        parentNodeId: null,
        childNodeIds: ['node-1'],
        evidence: ['accessibility_tree'],
        contested: false,
        screenshotIsPrimary: false,
      },
      {
        nodeId: 'node-1',
        type: 'menu_bar',
        label: 'File Menu',
        bounds: [0, 0, 0, 1920, 30, 1],
        confidence: 'high',
        controlGroupId: 'group-navigation-0',
        parentNodeId: 'node-0',
        childNodeIds: [],
        evidence: ['accessibility_tree', 'ocr_text'],
        contested: false,
        screenshotIsPrimary: false,
        ocrText: 'File Edit View',
        accessibilityRole: 'menubar',
      },
      {
        nodeId: 'node-2',
        type: 'unknown',
        label: 'Unclassified element',
        bounds: [100, 200, 0, 50, 50, 1],
        confidence: 'low',
        controlGroupId: 'group-unknown-1',
        parentNodeId: 'node-0',
        childNodeIds: [],
        evidence: ['ocr_only', 'layout_heuristic'],
        contested: true,
        alternatives: [
          {
            type: 'button',
            label: 'Action button',
            confidence: 'medium',
            evidence: ['ocr_text'],
          },
        ],
        screenshotIsPrimary: false,
      },
    ],
    controlGroups: [
      {
        groupId: 'group-navigation-0',
        semantic: 'navigation',
        label: 'Menu Bar',
        nodeIds: ['node-0', 'node-1'],
        parentGroupId: null,
        confidence: 'high',
        evidence: ['grouping_heuristic'],
      },
      {
        groupId: 'group-unknown-1',
        semantic: 'unknown',
        label: 'Unclassified',
        nodeIds: ['node-2'],
        parentGroupId: null,
        confidence: 'low',
        evidence: ['layout_heuristic'],
      },
    ],
    witnessPlaceholders: [
      {
        witnessId: 'witness-0',
        type: 'screenshot_before',
        contentHash: 'sha256-' + 'a'.repeat(56),
        contentRef: '.tmp/holoshell/reconstruction/screenshot_before.png',
        capturedAt: '2026-05-21T12:00:00.000Z',
        coversNodeIds: ['node-0', 'node-1'],
        available: true,
      },
      {
        witnessId: 'witness-1',
        type: 'ocr_text_extract',
        contentHash: 'sha256-' + 'b'.repeat(56),
        contentRef: '.tmp/holoshell/reconstruction/ocr_text.json',
        capturedAt: '2026-05-21T12:00:00.000Z',
        coversNodeIds: ['node-2'],
        available: true,
      },
    ],
    lowConfidenceBlocks: [
      {
        blockId: 'lcb-0',
        nodeIds: ['node-2'],
        reason: 'OCR-only identification without accessibility tree corroboration',
        minConfidence: 'low',
        suggestedAction: 're_capture',
        blocking: false,
      },
    ],
    redaction: {
      localOnly: true,
      screenshotRole: 'evidence_anchor',
      primaryModel: 'geometry_nodes_with_semantics',
      rawScreenshotsIncluded: true,
      rawScreenshotsRedacted: false,
      ocrTextIncluded: true,
      accessibilityTreeIncluded: true,
      remoteEndpointsIncluded: false,
      secretsRedacted: true,
    },
    receipt: {
      receiptType: 'legacy_app_reconstruction',
      actionTaken: 'self_test_reconstruction',
      mutationPerformed: false,
      reconstructionId: 'reconstruction-001',
      sourceWindowId: 'window-001',
      totalGeometryNodes: 3,
      totalControlGroups: 2,
      totalWitnessPlaceholders: 2,
      totalLowConfidenceBlocks: 1,
      snapshotHash: 'sha256-fixture-hash',
      hashAlgorithm: 'sha256',
      emittedAt: '2026-05-21T12:00:00.000Z',
    },
  };
}

describe('HoloShell legacy app reconstruction schema', () => {
  it('accepts a valid reconstruction with geometry nodes and control groups', () => {
    expect(validateHoloShellLegacyAppReconstruction(minimalReconstruction())).toEqual([]);
  });

  it('rejects screenshotIsPrimary = true on geometry nodes', () => {
    const reconstruction = minimalReconstruction();
    (reconstruction.geometryNodes[0] as HoloShellGeometryNode).screenshotIsPrimary = true as never;
    const errors = validateHoloShellLegacyAppReconstruction(reconstruction);
    expect(errors).toEqual(
      expect.arrayContaining([
        'geometryNodes[0].screenshotIsPrimary must be false — screenshots are evidence anchors, not the primary model.',
      ])
    );
  });

  it('rejects wrong schema version', () => {
    const reconstruction = minimalReconstruction();
    reconstruction.schemaVersion = 'wrong-version' as never;
    const errors = validateHoloShellLegacyAppReconstruction(reconstruction);
    expect(errors).toEqual(
      expect.arrayContaining([
        `schemaVersion must be ${HOLOSHELL_LEGACY_APP_RECONSTRUCTION_SCHEMA_VERSION}.`,
      ])
    );
  });

  it('rejects screenshotIsPrimaryModel = true in summary', () => {
    const reconstruction = minimalReconstruction();
    reconstruction.summary.screenshotIsPrimaryModel = true as never;
    const errors = validateHoloShellLegacyAppReconstruction(reconstruction);
    expect(errors).toEqual(
      expect.arrayContaining(['summary.screenshotIsPrimaryModel must be false.'])
    );
  });

  it('rejects screenshotRole != evidence_anchor in redaction', () => {
    const reconstruction = minimalReconstruction();
    reconstruction.redaction.screenshotRole = 'primary_view' as never;
    const errors = validateHoloShellLegacyAppReconstruction(reconstruction);
    expect(errors).toEqual(
      expect.arrayContaining([
        'redaction.screenshotRole must be "evidence_anchor" — screenshots are never the primary model.',
      ])
    );
  });

  it('rejects primaryModel != geometry_nodes_with_semantics in redaction', () => {
    const reconstruction = minimalReconstruction();
    reconstruction.redaction.primaryModel = 'screenshot_overlay' as never;
    const errors = validateHoloShellLegacyAppReconstruction(reconstruction);
    expect(errors).toEqual(
      expect.arrayContaining([
        'redaction.primaryModel must be "geometry_nodes_with_semantics".',
      ])
    );
  });

  it('rejects unsupported geometry node type', () => {
    const reconstruction = minimalReconstruction();
    reconstruction.geometryNodes[0].type = 'holographic_display' as never;
    const errors = validateHoloShellLegacyAppReconstruction(reconstruction);
    expect(errors).toEqual(
      expect.arrayContaining([
        'geometryNodes[0].type is unsupported: holographic_display.',
      ])
    );
  });

  it('rejects unsupported confidence level', () => {
    const reconstruction = minimalReconstruction();
    reconstruction.geometryNodes[0].confidence = 'ultra' as never;
    const errors = validateHoloShellLegacyAppReconstruction(reconstruction);
    expect(errors).toEqual(
      expect.arrayContaining([
        'geometryNodes[0].confidence is unsupported: ultra.',
      ])
    );
  });

  it('rejects summary count mismatch for geometry nodes', () => {
    const reconstruction = minimalReconstruction();
    reconstruction.summary.totalGeometryNodes = 999;
    const errors = validateHoloShellLegacyAppReconstruction(reconstruction);
    expect(errors).toEqual(
      expect.arrayContaining(['summary.totalGeometryNodes must match geometryNodes.length.'])
    );
  });

  it('rejects summary count mismatch for control groups', () => {
    const reconstruction = minimalReconstruction();
    reconstruction.summary.totalControlGroups = 99;
    const errors = validateHoloShellLegacyAppReconstruction(reconstruction);
    expect(errors).toEqual(
      expect.arrayContaining(['summary.totalControlGroups must match controlGroups.length.'])
    );
  });

  it('rejects confidence distribution mismatch', () => {
    const reconstruction = minimalReconstruction();
    reconstruction.summary.confidenceDistribution.high = 0;
    const errors = validateHoloShellLegacyAppReconstruction(reconstruction);
    expect(errors).toEqual(
      expect.arrayContaining([
        'summary.confidenceDistribution.high (0) does not match actual count (2).',
      ])
    );
  });

  it('rejects unsupported control group semantic', () => {
    const reconstruction = minimalReconstruction();
    reconstruction.controlGroups[0].semantic = 'floating' as never;
    const errors = validateHoloShellLegacyAppReconstruction(reconstruction);
    expect(errors).toEqual(
      expect.arrayContaining([
        'controlGroups[0].semantic is unsupported: floating.',
      ])
    );
  });

  it('rejects unsupported witness type', () => {
    const reconstruction = minimalReconstruction();
    reconstruction.witnessPlaceholders[0].type = 'video_recording' as never;
    const errors = validateHoloShellLegacyAppReconstruction(reconstruction);
    expect(errors).toEqual(
      expect.arrayContaining([
        'witnessPlaceholders[0].type is unsupported: video_recording.',
      ])
    );
  });

  it('rejects unsupported suggested action in low-confidence block', () => {
    const reconstruction = minimalReconstruction();
    reconstruction.lowConfidenceBlocks[0].suggestedAction = 'auto_resolve' as never;
    const errors = validateHoloShellLegacyAppReconstruction(reconstruction);
    expect(errors).toEqual(
      expect.arrayContaining([
        'lowConfidenceBlocks[0].suggestedAction is unsupported: auto_resolve.',
      ])
    );
  });

  it('rejects receipt with wrong receiptType', () => {
    const reconstruction = minimalReconstruction();
    reconstruction.receipt.receiptType = 'wrong_type' as never;
    const errors = validateHoloShellLegacyAppReconstruction(reconstruction);
    expect(errors).toEqual(
      expect.arrayContaining(['receipt.receiptType must be legacy_app_reconstruction.'])
    );
  });

  it('clones arrays without sharing mutable evidence', () => {
    const reconstruction = minimalReconstruction();
    const cloned = cloneHoloShellLegacyAppReconstruction(reconstruction);
    cloned.geometryNodes[0].evidence.push('mutated');
    cloned.controlGroups[0].nodeIds.push('new-node');
    cloned.witnessPlaceholders[0].coversNodeIds.push('new-witness-node');
    cloned.lowConfidenceBlocks[0].nodeIds.push('new-block-node');

    expect(reconstruction.geometryNodes[0].evidence).not.toContain('mutated');
    expect(reconstruction.controlGroups[0].nodeIds).not.toContain('new-node');
    expect(reconstruction.witnessPlaceholders[0].coversNodeIds).not.toContain('new-witness-node');
    expect(reconstruction.lowConfidenceBlocks[0].nodeIds).not.toContain('new-block-node');
  });

  it('clones bounds arrays without sharing references', () => {
    const reconstruction = minimalReconstruction();
    const cloned = cloneHoloShellLegacyAppReconstruction(reconstruction);
    cloned.geometryNodes[0].bounds[0] = 9999;

    expect(reconstruction.geometryNodes[0].bounds[0]).not.toBe(9999);
  });

  it('exposes type guards for node types, confidence levels, and semantics', () => {
    expect(isSupportedHoloShellGeometryNodeType('button')).toBe(true);
    expect(isSupportedHoloShellGeometryNodeType('holographic_display')).toBe(false);
    expect(isSupportedHoloShellConfidenceLevel('high')).toBe(true);
    expect(isSupportedHoloShellConfidenceLevel('ultra')).toBe(false);
    expect(isSupportedHoloShellControlGroupSemantic('navigation')).toBe(true);
    expect(isSupportedHoloShellControlGroupSemantic('floating')).toBe(false);
    expect(isSupportedHoloShellWitnessType('screenshot_before')).toBe(true);
    expect(isSupportedHoloShellWitnessType('video_recording')).toBe(false);
    expect(isSupportedHoloShellReconstructionAction('reconstruct_window')).toBe(true);
    expect(isSupportedHoloShellReconstructionAction('destroy_window')).toBe(false);
  });

  describe('dense reconstruction fixture generator', () => {
    it('generates a fixture with at least 1000 geometry nodes by default', () => {
      const fixture = generateDenseReconstructionFixture();
      expect(fixture.geometryNodes.length).toBeGreaterThanOrEqual(1000);
      expect(fixture.summary.totalGeometryNodes).toBe(fixture.geometryNodes.length);
      expect(fixture.summary.screenshotIsPrimaryModel).toBe(false);
      expect(fixture.redaction.screenshotRole).toBe('evidence_anchor');
      expect(fixture.redaction.primaryModel).toBe('geometry_nodes_with_semantics');
    });

    it('generates a fixture with a custom node count', () => {
      const fixture = generateDenseReconstructionFixture(50);
      expect(fixture.geometryNodes.length).toBe(50);
      expect(fixture.summary.totalGeometryNodes).toBe(50);
    });

    it('generates valid geometry nodes with correct invariants', () => {
      const fixture = generateDenseReconstructionFixture(100);
      for (const node of fixture.geometryNodes) {
        expect(node.screenshotIsPrimary).toBe(false);
        expect(node.evidence.length).toBeGreaterThanOrEqual(1);
        expect(node.bounds).toHaveLength(6);
        expect(HOLOSHELL_LEGACY_APP_RECONSTRUCTION_SCHEMA_VERSION).toBeDefined();
      }
    });

    it('generates control groups that cover all geometry nodes', () => {
      const fixture = generateDenseReconstructionFixture(100);
      const allGroupNodeIds = new Set(fixture.controlGroups.flatMap((g) => g.nodeIds));
      const allNodeIds = new Set(fixture.geometryNodes.map((n) => n.nodeId));
      for (const nodeId of allNodeIds) {
        expect(allGroupNodeIds.has(nodeId)).toBe(true);
      }
    });

    it('generates confidence distribution that matches actual node counts', () => {
      const fixture = generateDenseReconstructionFixture(100);
      const dist = fixture.summary.confidenceDistribution;
      const sum = (dist.high ?? 0) + (dist.medium ?? 0) + (dist.low ?? 0) + (dist.inferred ?? 0) + (dist.unresolved ?? 0);
      expect(sum).toBe(fixture.geometryNodes.length);
    });

    it('validates cleanly with the main validator', () => {
      const fixture = generateDenseReconstructionFixture(100);
      const errors = validateHoloShellLegacyAppReconstruction(fixture);
      expect(errors).toEqual([]);
    });

    it('generates 8 witness placeholders (one per witness type)', () => {
      const fixture = generateDenseReconstructionFixture(100);
      expect(fixture.witnessPlaceholders).toHaveLength(8);
      expect(fixture.witnessPlaceholders.every((w) => w.available)).toBe(true);
    });

    it('generates low-confidence blocks for low/inferred/unresolved nodes', () => {
      const fixture = generateDenseReconstructionFixture(100);
      expect(fixture.lowConfidenceBlocks.length).toBeGreaterThanOrEqual(0);
      for (const block of fixture.lowConfidenceBlocks) {
        expect(['low', 'inferred', 'unresolved']).toContain(block.minConfidence);
      }
    });

    it('clones dense fixture without shared references', () => {
      const fixture = generateDenseReconstructionFixture(100);
      const cloned = cloneHoloShellLegacyAppReconstruction(fixture);
      cloned.geometryNodes[0].bounds[0] = -9999;
      cloned.geometryNodes[0].evidence.push('extra');
      cloned.controlGroups[0].nodeIds.push('extra-node');

      expect(fixture.geometryNodes[0].bounds[0]).not.toBe(-9999);
      expect(fixture.geometryNodes[0].evidence).not.toContain('extra');
      expect(fixture.controlGroups[0].nodeIds).not.toContain('extra-node');
    });
  });
});