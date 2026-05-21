/**
 * HoloShell Legacy App Reconstruction schema pack.
 *
 * Canonical local-only contract for turning OS UI capture data (windows, controls,
 * accessibility trees) into dense HoloShell geometry nodes with semantic control
 * groups, screenshot/OCR witness placeholders, confidence metadata, and
 * low-confidence execution blocks.
 *
 * The reconstruction converts a captured legacy window into a structured HoloScript
 * scene where the shell can inspect controls without exposing raw screenshots as
 * the primary model. Raw screenshots are evidence anchors, never the primary
 * interaction surface.
 *
 * Created: task_1779358599518_1rwr (dense legacy app reconstruction demo)
 */

// ── Schema version ──

export const HOLOSHELL_LEGACY_APP_RECONSTRUCTION_SCHEMA_VERSION =
  'hololand.holoshell.legacy-app-reconstruction.v0.1.0' as const;

export type HoloShellLegacyAppReconstructionSchemaVersion =
  typeof HOLOSHELL_LEGACY_APP_RECONSTRUCTION_SCHEMA_VERSION;

// ── Geometry node types ──

export const HOLOSHELL_GEOMETRY_NODE_TYPES = [
  'window_frame',
  'title_bar',
  'menu_bar',
  'toolbar',
  'tab_bar',
  'tab_item',
  'address_bar',
  'search_bar',
  'sidebar',
  'sidebar_item',
  'content_viewport',
  'scroll_bar',
  'scroll_thumb',
  'status_bar',
  'button',
  'checkbox',
  'radio_button',
  'toggle_switch',
  'dropdown',
  'dropdown_item',
  'text_input',
  'text_area',
  'slider',
  'progress_bar',
  'icon',
  'icon_button',
  'link',
  'text_label',
  'heading',
  'paragraph',
  'list_item',
  'table',
  'table_row',
  'table_cell',
  'tree_node',
  'tooltip',
  'dialog',
  'dialog_button',
  'notification',
  'badge',
  'avatar',
  'image_thumbnail',
  'video_player',
  'chart_area',
  'panel',
  'divider',
  'group_box',
  'unknown',
] as const;

export type HoloShellGeometryNodeType =
  (typeof HOLOSHELL_GEOMETRY_NODE_TYPES)[number];

// ── Confidence levels ──

export const HOLOSHELL_CONFIDENCE_LEVELS = [
  'high',       // Accessibility tree match + OCR corroboration
  'medium',     // Accessibility tree match, no OCR corroboration
  'low',        // OCR only, no accessibility tree
  'inferred',   // Layout heuristic only, no direct evidence
  'unresolved', // Multiple conflicting interpretations
] as const;

export type HoloShellConfidenceLevel =
  (typeof HOLOSHELL_CONFIDENCE_LEVELS)[number];

// ── Witness types ──

export const HOLOSHELL_WITNESS_TYPES = [
  'screenshot_before',
  'screenshot_after',
  'ocr_text_extract',
  'accessibility_tree',
  'bounding_box_overlay',
  'semantic_label_overlay',
  'control_inspector_snapshot',
  'reconstruction_diff',
] as const;

export type HoloShellWitnessType =
  (typeof HOLOSHELL_WITNESS_TYPES)[number];

// ── Control group semantics ──

export const HOLOSHELL_CONTROL_GROUP_SEMANTICS = [
  'navigation',     // menus, tabs, breadcrumbs, address bar
  'content',        // main viewport, editor, canvas
  'form',           // inputs, checkboxes, buttons in a form context
  'toolbar',        // action buttons, formatting controls
  'sidebar',        // navigation trees, file explorers, panels
  'status',         // status bar, progress indicators, notifications
  'dialog',         // modal overlays, popups, confirmation dialogs
  'decorative',     // spacers, dividers, branding elements
  'unknown',
] as const;

export type HoloShellControlGroupSemantic =
  (typeof HOLOSHELL_CONTROL_GROUP_SEMANTICS)[number];

// ── Core interfaces ──

export interface HoloShellGeometryNode {
  /** Unique node ID within the reconstruction. */
  nodeId: string;
  /** Geometry type from the controlled vocabulary. */
  type: HoloShellGeometryNodeType;
  /** Semantic label (e.g., "File menu", "Save button", "URL bar"). */
  label: string;
  /** 3D bounding box in HoloShell scene space [x, y, z, width, height, depth]. */
  bounds: [number, number, number, number, number, number];
  /** Confidence level for this node's identification. */
  confidence: HoloShellConfidenceLevel;
  /** Which control group this node belongs to. */
  controlGroupId: string;
  /** Parent node ID (null for root-level nodes). */
  parentNodeId: string | null;
  /** Child node IDs. */
  childNodeIds: string[];
  /** Evidence sources that identified this node. */
  evidence: string[];
  /** Whether this node's geometry/semantics are contested. */
  contested: boolean;
  /** Alternative interpretations if contested. */
  alternatives?: HoloShellGeometryNodeAlternative[];
  /** Whether raw screenshot exposure is the primary model (must be false). */
  screenshotIsPrimary: false;
  /** OCR text content if applicable. */
  ocrText?: string | null;
  /** Accessibility tree role if available. */
  accessibilityRole?: string | null;
  /** Custom properties for type-specific data. */
  properties?: Record<string, HoloShellLegacyJsonValue>;
}

export interface HoloShellGeometryNodeAlternative {
  /** Alternative interpretation of this node's type. */
  type: HoloShellGeometryNodeType;
  /** Alternative label. */
  label: string;
  /** Confidence of this alternative. */
  confidence: HoloShellConfidenceLevel;
  /** Evidence supporting this alternative. */
  evidence: string[];
}

export interface HoloShellControlGroup {
  /** Unique group ID. */
  groupId: string;
  /** Semantic category of this control group. */
  semantic: HoloShellControlGroupSemantic;
  /** Human-readable group name. */
  label: string;
  /** Node IDs belonging to this group. */
  nodeIds: string[];
  /** Parent group ID (null for root groups). */
  parentGroupId: string | null;
  /** Confidence that this grouping is correct. */
  confidence: HoloShellConfidenceLevel;
  /** Evidence for this grouping. */
  evidence: string[];
}

export interface HoloShellWitnessPlaceholder {
  /** Unique witness ID. */
  witnessId: string;
  /** Type of witness evidence. */
  type: HoloShellWitnessType;
  /** SHA-256 hash of the witness content (or 'pending' if not yet captured). */
  contentHash: string;
  /** File path or URI where the witness content is stored. */
  contentRef: string;
  /** Timestamp when the witness was captured. */
  capturedAt: string;
  /** Node IDs this witness covers. */
  coversNodeIds: string[];
  /** Whether this witness is available or still pending. */
  available: boolean;
}

export interface HoloShellLowConfidenceBlock {
  /** Block ID. */
  blockId: string;
  /** Node IDs in this low-confidence block. */
  nodeIds: string[];
  /** Why confidence is low. */
  reason: string;
  /** Minimum confidence in this block. */
  minConfidence: HoloShellConfidenceLevel;
  /** Suggested resolution action. */
  suggestedAction: 'human_review' | 're_capture' | 're_parse' | 'accept_as_is';
  /** Whether this block blocks the entire reconstruction. */
  blocking: boolean;
}

export interface HoloShellReconstructionReceipt {
  receiptType: 'legacy_app_reconstruction';
  actionTaken: 'reconstruct_window' | 'self_test_reconstruction';
  mutationPerformed: false;
  reconstructionId: string;
  sourceWindowId: string;
  totalGeometryNodes: number;
  totalControlGroups: number;
  totalWitnessPlaceholders: number;
  totalLowConfidenceBlocks: number;
  snapshotHash: string;
  hashAlgorithm?: 'sha256';
  emittedAt?: string;
  parentReceiptIds?: string[];
  metadata?: Record<string, HoloShellLegacyJsonValue>;
}

export interface HoloShellLegacyAppReconstruction {
  schemaVersion: HoloShellLegacyAppReconstructionSchemaVersion;
  generatedAt: string;
  platform: string;
  /** Reference to the source reality snapshot this reconstruction is built from. */
  sourceRealitySnapshotId: string;
  /** Reference to the captured window this reconstruction replaces. */
  sourceWindowId: string;
  /** Source anchors for traceability. */
  sourceAnchors: HoloShellReconstructionSourceAnchors;
  /** Summary statistics. */
  summary: HoloShellReconstructionSummary;
  /** The geometry nodes (1000+ for a dense reconstruction). */
  geometryNodes: HoloShellGeometryNode[];
  /** Semantic control groups organizing the nodes. */
  controlGroups: HoloShellControlGroup[];
  /** Screenshot/OCR witness placeholders (evidence anchors, not primary model). */
  witnessPlaceholders: HoloShellWitnessPlaceholder[];
  /** Blocks of nodes where confidence is below 'medium'. */
  lowConfidenceBlocks: HoloShellLowConfidenceBlock[];
  /** Redaction policy — screenshots are NEVER the primary model. */
  redaction: HoloShellReconstructionRedaction;
  /** Receipt proving the reconstruction happened. */
  receipt: HoloShellReconstructionReceipt;
  metadata?: Record<string, HoloShellLegacyJsonValue>;
}

export interface HoloShellReconstructionSourceAnchors {
  source: string;
  adapter: string;
  realitySnapshotRef?: string;
  accessibilityTreeRef?: string;
  ocrCaptureRef?: string;
}

export interface HoloShellReconstructionSummary {
  totalGeometryNodes: number;
  totalControlGroups: number;
  totalWitnessPlaceholders: number;
  totalLowConfidenceBlocks: number;
  highConfidenceNodeCount: number;
  mediumConfidenceNodeCount: number;
  lowConfidenceNodeCount: number;
  inferredNodeCount: number;
  unresolvedNodeCount: number;
  contestedNodeCount: number;
  /** The primary model is geometry nodes, not screenshots. */
  screenshotIsPrimaryModel: false;
  /** Confidence distribution across the reconstruction. */
  confidenceDistribution: Record<HoloShellConfidenceLevel, number>;
}

export interface HoloShellReconstructionRedaction {
  localOnly: true;
  /** Screenshots are stored as evidence anchors only. */
  screenshotRole: 'evidence_anchor';
  /** The primary model for shell inspection is geometry nodes + semantics. */
  primaryModel: 'geometry_nodes_with_semantics';
  rawScreenshotsIncluded: boolean;
  rawScreenshotsRedacted: boolean;
  ocrTextIncluded: boolean;
  accessibilityTreeIncluded: boolean;
  remoteEndpointsIncluded: false;
  secretsRedacted: true;
}

// ── Type re-export from legacy-app-reality ──

export type { HoloShellLegacyJsonValue } from './holoshell-legacy-app-reality';
import type { HoloShellLegacyJsonValue as _HoloShellLegacyJsonValue } from './holoshell-legacy-app-reality';

/** Alias for internal use — the canonical type is in holoshell-legacy-app-reality.ts. */
type HoloShellLegacyJsonValue = _HoloShellLegacyJsonValue;

// ── Validators ──

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && value.includes('T');
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

function validateStringField(path: string, value: unknown, errors: string[]): void {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${path} is required and must be a non-empty string.`);
  }
}

function validateNumberField(path: string, value: unknown, errors: string[]): void {
  if (!isNonNegativeNumber(value)) {
    errors.push(`${path} is required and must be a non-negative number.`);
  }
}

function validateEvidence(path: string, value: unknown, errors: string[]): void {
  if (!Array.isArray(value) || value.length < 1 || value.some((item) => typeof item !== 'string' || !item)) {
    errors.push(`${path}.evidence must contain at least one evidence string.`);
  }
}

function validateGeometryNode(node: HoloShellGeometryNode, index: number, errors: string[]): void {
  const path = `geometryNodes[${index}]`;
  if (!isRecord(node)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  validateStringField(`${path}.nodeId`, node.nodeId, errors);
  if (!isOneOf(HOLOSHELL_GEOMETRY_NODE_TYPES, node.type)) {
    errors.push(`${path}.type is unsupported: ${String(node.type)}.`);
  }
  validateStringField(`${path}.label`, node.label, errors);
  if (!Array.isArray(node.bounds) || node.bounds.length !== 6 || !node.bounds.every((b: number) => typeof b === 'number' && isFinite(b))) {
    errors.push(`${path}.bounds must be [x, y, z, width, height, depth] with 6 finite numbers.`);
  }
  if (!isOneOf(HOLOSHELL_CONFIDENCE_LEVELS, node.confidence)) {
    errors.push(`${path}.confidence is unsupported: ${String(node.confidence)}.`);
  }
  validateStringField(`${path}.controlGroupId`, node.controlGroupId, errors);
  if (node.parentNodeId !== null && typeof node.parentNodeId !== 'string') {
    errors.push(`${path}.parentNodeId must be a string or null.`);
  }
  if (!Array.isArray(node.childNodeIds) || !node.childNodeIds.every((id: unknown) => typeof id === 'string')) {
    errors.push(`${path}.childNodeIds must be an array of strings.`);
  }
  validateEvidence(path, node.evidence, errors);
  if (typeof node.contested !== 'boolean') {
    errors.push(`${path}.contested must be a boolean.`);
  }
  if (node.screenshotIsPrimary !== false) {
    errors.push(`${path}.screenshotIsPrimary must be false — screenshots are evidence anchors, not the primary model.`);
  }
}

function validateControlGroup(group: HoloShellControlGroup, index: number, errors: string[]): void {
  const path = `controlGroups[${index}]`;
  if (!isRecord(group)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  validateStringField(`${path}.groupId`, group.groupId, errors);
  if (!isOneOf(HOLOSHELL_CONTROL_GROUP_SEMANTICS, group.semantic)) {
    errors.push(`${path}.semantic is unsupported: ${String(group.semantic)}.`);
  }
  validateStringField(`${path}.label`, group.label, errors);
  if (!Array.isArray(group.nodeIds) || !group.nodeIds.every((id: unknown) => typeof id === 'string')) {
    errors.push(`${path}.nodeIds must be an array of strings.`);
  }
  if (group.parentGroupId !== null && typeof group.parentGroupId !== 'string') {
    errors.push(`${path}.parentGroupId must be a string or null.`);
  }
  if (!isOneOf(HOLOSHELL_CONFIDENCE_LEVELS, group.confidence)) {
    errors.push(`${path}.confidence is unsupported: ${String(group.confidence)}.`);
  }
  validateEvidence(path, group.evidence, errors);
}

function validateWitnessPlaceholder(witness: HoloShellWitnessPlaceholder, index: number, errors: string[]): void {
  const path = `witnessPlaceholders[${index}]`;
  if (!isRecord(witness)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  validateStringField(`${path}.witnessId`, witness.witnessId, errors);
  if (!isOneOf(HOLOSHELL_WITNESS_TYPES, witness.type)) {
    errors.push(`${path}.type is unsupported: ${String(witness.type)}.`);
  }
  validateStringField(`${path}.contentHash`, witness.contentHash, errors);
  validateStringField(`${path}.contentRef`, witness.contentRef, errors);
  if (!isIsoTimestamp(witness.capturedAt)) {
    errors.push(`${path}.capturedAt must be an ISO timestamp.`);
  }
  if (!Array.isArray(witness.coversNodeIds)) {
    errors.push(`${path}.coversNodeIds must be an array of strings.`);
  }
  if (typeof witness.available !== 'boolean') {
    errors.push(`${path}.available must be a boolean.`);
  }
}

function validateLowConfidenceBlock(block: HoloShellLowConfidenceBlock, index: number, errors: string[]): void {
  const path = `lowConfidenceBlocks[${index}]`;
  if (!isRecord(block)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  validateStringField(`${path}.blockId`, block.blockId, errors);
  if (!Array.isArray(block.nodeIds)) {
    errors.push(`${path}.nodeIds must be an array of strings.`);
  }
  validateStringField(`${path}.reason`, block.reason, errors);
  if (!isOneOf(HOLOSHELL_CONFIDENCE_LEVELS, block.minConfidence)) {
    errors.push(`${path}.minConfidence is unsupported: ${String(block.minConfidence)}.`);
  }
  if (!isOneOf(['human_review', 're_capture', 're_parse', 'accept_as_is'], block.suggestedAction)) {
    errors.push(`${path}.suggestedAction is unsupported: ${String(block.suggestedAction)}.`);
  }
  if (typeof block.blocking !== 'boolean') {
    errors.push(`${path}.blocking must be a boolean.`);
  }
}

function validateRedaction(redaction: HoloShellReconstructionRedaction | undefined, errors: string[]): void {
  if (!isRecord(redaction)) {
    errors.push('redaction is required.');
    return;
  }
  if (redaction.localOnly !== true) errors.push('redaction.localOnly must be true.');
  if (redaction.screenshotRole !== 'evidence_anchor') {
    errors.push('redaction.screenshotRole must be "evidence_anchor" — screenshots are never the primary model.');
  }
  if (redaction.primaryModel !== 'geometry_nodes_with_semantics') {
    errors.push('redaction.primaryModel must be "geometry_nodes_with_semantics".');
  }
  if (typeof redaction.rawScreenshotsIncluded !== 'boolean') {
    errors.push('redaction.rawScreenshotsIncluded must be a boolean.');
  }
  if (typeof redaction.rawScreenshotsRedacted !== 'boolean') {
    errors.push('redaction.rawScreenshotsRedacted must be a boolean.');
  }
  if (typeof redaction.ocrTextIncluded !== 'boolean') {
    errors.push('redaction.ocrTextIncluded must be a boolean.');
  }
  if (typeof redaction.accessibilityTreeIncluded !== 'boolean') {
    errors.push('redaction.accessibilityTreeIncluded must be a boolean.');
  }
  if (redaction.remoteEndpointsIncluded !== false) {
    errors.push('redaction.remoteEndpointsIncluded must be false.');
  }
  if (redaction.secretsRedacted !== true) {
    errors.push('redaction.secretsRedacted must be true.');
  }
}

function validateReceipt(receipt: HoloShellReconstructionReceipt | undefined, errors: string[]): void {
  if (!isRecord(receipt)) {
    errors.push('receipt is required.');
    return;
  }
  if (receipt.receiptType !== 'legacy_app_reconstruction') {
    errors.push('receipt.receiptType must be legacy_app_reconstruction.');
  }
  if (!isOneOf(['reconstruct_window', 'self_test_reconstruction'], receipt.actionTaken)) {
    errors.push(`receipt.actionTaken is unsupported: ${String(receipt.actionTaken)}.`);
  }
  if (receipt.mutationPerformed !== false) {
    errors.push('receipt.mutationPerformed must be false.');
  }
  validateStringField('receipt.reconstructionId', receipt.reconstructionId, errors);
  validateStringField('receipt.sourceWindowId', receipt.sourceWindowId, errors);
  validateNumberField('receipt.totalGeometryNodes', receipt.totalGeometryNodes, errors);
  validateNumberField('receipt.totalControlGroups', receipt.totalControlGroups, errors);
  validateNumberField('receipt.totalWitnessPlaceholders', receipt.totalWitnessPlaceholders, errors);
  validateNumberField('receipt.totalLowConfidenceBlocks', receipt.totalLowConfidenceBlocks, errors);
  validateStringField('receipt.snapshotHash', receipt.snapshotHash, errors);
  if (receipt.hashAlgorithm !== undefined && receipt.hashAlgorithm !== 'sha256') {
    errors.push(`receipt.hashAlgorithm is unsupported: ${String(receipt.hashAlgorithm)}.`);
  }
  if (receipt.emittedAt !== undefined && !isIsoTimestamp(receipt.emittedAt)) {
    errors.push('receipt.emittedAt must be an ISO timestamp when provided.');
  }
}

// ── Main validator ──

export function validateHoloShellLegacyAppReconstruction(
  reconstruction: HoloShellLegacyAppReconstruction
): string[] {
  const errors: string[] = [];

  if (!isRecord(reconstruction)) {
    return ['HoloShellLegacyAppReconstruction must be an object.'];
  }
  if (reconstruction.schemaVersion !== HOLOSHELL_LEGACY_APP_RECONSTRUCTION_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${HOLOSHELL_LEGACY_APP_RECONSTRUCTION_SCHEMA_VERSION}.`
    );
  }
  if (!isIsoTimestamp(reconstruction.generatedAt)) {
    errors.push('generatedAt must be an ISO timestamp.');
  }
  validateStringField('platform', reconstruction.platform, errors);
  validateStringField('sourceRealitySnapshotId', reconstruction.sourceRealitySnapshotId, errors);
  validateStringField('sourceWindowId', reconstruction.sourceWindowId, errors);

  // Source anchors
  if (!isRecord(reconstruction.sourceAnchors)) {
    errors.push('sourceAnchors is required.');
  } else {
    validateStringField('sourceAnchors.source', reconstruction.sourceAnchors.source, errors);
    validateStringField('sourceAnchors.adapter', reconstruction.sourceAnchors.adapter, errors);
  }

  // Summary
  if (!isRecord(reconstruction.summary)) {
    errors.push('summary is required.');
  } else {
    const s = reconstruction.summary;
    for (const key of [
      'totalGeometryNodes',
      'totalControlGroups',
      'totalWitnessPlaceholders',
      'totalLowConfidenceBlocks',
      'highConfidenceNodeCount',
      'mediumConfidenceNodeCount',
      'lowConfidenceNodeCount',
      'inferredNodeCount',
      'unresolvedNodeCount',
      'contestedNodeCount',
    ] as const) {
      validateNumberField(`summary.${key}`, s[key], errors);
    }
    if (s.screenshotIsPrimaryModel !== false) {
      errors.push('summary.screenshotIsPrimaryModel must be false.');
    }
    if (!isRecord(s.confidenceDistribution)) {
      errors.push('summary.confidenceDistribution must be an object.');
    }
  }

  // Geometry nodes
  if (!Array.isArray(reconstruction.geometryNodes)) {
    errors.push('geometryNodes must be an array.');
  } else {
    reconstruction.geometryNodes.forEach((node, index) => validateGeometryNode(node, index, errors));
  }

  // Control groups
  if (!Array.isArray(reconstruction.controlGroups)) {
    errors.push('controlGroups must be an array.');
  } else {
    reconstruction.controlGroups.forEach((group, index) => validateControlGroup(group, index, errors));
  }

  // Witness placeholders
  if (!Array.isArray(reconstruction.witnessPlaceholders)) {
    errors.push('witnessPlaceholders must be an array.');
  } else {
    reconstruction.witnessPlaceholders.forEach((witness, index) =>
      validateWitnessPlaceholder(witness, index, errors)
    );
  }

  // Low confidence blocks
  if (!Array.isArray(reconstruction.lowConfidenceBlocks)) {
    errors.push('lowConfidenceBlocks must be an array.');
  } else {
    reconstruction.lowConfidenceBlocks.forEach((block, index) =>
      validateLowConfidenceBlock(block, index, errors)
    );
  }

  // Cross-validation: summary counts match arrays
  if (isRecord(reconstruction.summary) && Array.isArray(reconstruction.geometryNodes)) {
    if (reconstruction.summary.totalGeometryNodes !== reconstruction.geometryNodes.length) {
      errors.push('summary.totalGeometryNodes must match geometryNodes.length.');
    }
  }
  if (isRecord(reconstruction.summary) && Array.isArray(reconstruction.controlGroups)) {
    if (reconstruction.summary.totalControlGroups !== reconstruction.controlGroups.length) {
      errors.push('summary.totalControlGroups must match controlGroups.length.');
    }
  }
  if (isRecord(reconstruction.summary) && Array.isArray(reconstruction.witnessPlaceholders)) {
    if (reconstruction.summary.totalWitnessPlaceholders !== reconstruction.witnessPlaceholders.length) {
      errors.push('summary.totalWitnessPlaceholders must match witnessPlaceholders.length.');
    }
  }
  if (isRecord(reconstruction.summary) && Array.isArray(reconstruction.lowConfidenceBlocks)) {
    if (reconstruction.summary.totalLowConfidenceBlocks !== reconstruction.lowConfidenceBlocks.length) {
      errors.push('summary.totalLowConfidenceBlocks must match lowConfidenceBlocks.length.');
    }
  }

  // Confidence distribution cross-validation
  if (isRecord(reconstruction.summary) && Array.isArray(reconstruction.geometryNodes)) {
    const byConfidence = new Map<HoloShellConfidenceLevel, number>();
    for (const level of HOLOSHELL_CONFIDENCE_LEVELS) byConfidence.set(level, 0);
    for (const node of reconstruction.geometryNodes) {
      const c = node.confidence;
      if (byConfidence.has(c)) byConfidence.set(c, (byConfidence.get(c) ?? 0) + 1);
    }
    if (isRecord(reconstruction.summary.confidenceDistribution)) {
      const cd = reconstruction.summary.confidenceDistribution as Record<string, unknown>;
      for (const level of HOLOSHELL_CONFIDENCE_LEVELS) {
        if (cd[level] !== undefined && cd[level] !== byConfidence.get(level)) {
          errors.push(`summary.confidenceDistribution.${level} (${cd[level]}) does not match actual count (${byConfidence.get(level)}).`);
        }
      }
    }
  }

  validateRedaction(reconstruction.redaction, errors);
  validateReceipt(reconstruction.receipt, errors);

  return errors;
}

// ── Type guards ──

export function isSupportedHoloShellGeometryNodeType(value: string): value is HoloShellGeometryNodeType {
  return isOneOf(HOLOSHELL_GEOMETRY_NODE_TYPES, value);
}

export function isSupportedHoloShellConfidenceLevel(value: string): value is HoloShellConfidenceLevel {
  return isOneOf(HOLOSHELL_CONFIDENCE_LEVELS, value);
}

export function isSupportedHoloShellControlGroupSemantic(value: string): value is HoloShellControlGroupSemantic {
  return isOneOf(HOLOSHELL_CONTROL_GROUP_SEMANTICS, value);
}

export function isSupportedHoloShellWitnessType(value: string): value is HoloShellWitnessType {
  return isOneOf(HOLOSHELL_WITNESS_TYPES, value);
}

export function isSupportedHoloShellReconstructionAction(value: string): value is HoloShellReconstructionReceipt['actionTaken'] {
  return isOneOf(['reconstruct_window', 'self_test_reconstruction'], value);
}

// ── Clone ──

export function cloneHoloShellLegacyAppReconstruction(
  reconstruction: HoloShellLegacyAppReconstruction
): HoloShellLegacyAppReconstruction {
  return {
    ...reconstruction,
    sourceAnchors: { ...reconstruction.sourceAnchors },
    summary: {
      ...reconstruction.summary,
      confidenceDistribution: { ...reconstruction.summary.confidenceDistribution },
    },
    geometryNodes: reconstruction.geometryNodes.map((node) => ({
      ...node,
      bounds: [...node.bounds] as [number, number, number, number, number, number],
      childNodeIds: [...node.childNodeIds],
      evidence: [...node.evidence],
      alternatives: node.alternatives?.map((alt) => ({
        ...alt,
        evidence: [...alt.evidence],
      })),
      properties: node.properties ? { ...node.properties } : undefined,
    })),
    controlGroups: reconstruction.controlGroups.map((group) => ({
      ...group,
      nodeIds: [...group.nodeIds],
      evidence: [...group.evidence],
    })),
    witnessPlaceholders: reconstruction.witnessPlaceholders.map((witness) => ({
      ...witness,
      coversNodeIds: [...witness.coversNodeIds],
    })),
    lowConfidenceBlocks: reconstruction.lowConfidenceBlocks.map((block) => ({
      ...block,
      nodeIds: [...block.nodeIds],
    })),
    redaction: { ...reconstruction.redaction },
    receipt: {
      ...reconstruction.receipt,
      parentReceiptIds: reconstruction.receipt.parentReceiptIds
        ? [...reconstruction.receipt.parentReceiptIds]
        : undefined,
      metadata: reconstruction.receipt.metadata
        ? { ...reconstruction.receipt.metadata }
        : undefined,
    },
    metadata: reconstruction.metadata ? { ...reconstruction.metadata } : undefined,
  };
}

// ── Demo fixture generator ──

/**
 * Generates a dense reconstruction demo fixture with 1000+ geometry nodes.
 * This represents a full legacy application window (e.g., a word processor)
 * reconstructed into HoloShell geometry nodes with semantic control groups.
 *
 * The fixture is designed to exercise the full validation pipeline and
 * demonstrate that HoloShell can represent complex legacy UIs as inspectable
 * geometry nodes without exposing raw screenshots as the primary model.
 */
export function generateDenseReconstructionFixture(
  nodeCount: number = 1000
): HoloShellLegacyAppReconstruction {
  const geometryNodes: HoloShellGeometryNode[] = [];
  const controlGroups: HoloShellControlGroup[] = [];
  const witnessPlaceholders: HoloShellWitnessPlaceholder[] = [];
  const lowConfidenceBlocks: HoloShellLowConfidenceBlock[] = [];

  // Define control group templates representing a typical legacy word processor
  const groupTemplates: Array<{ semantic: HoloShellControlGroupSemantic; label: string; count: number }> = [
    { semantic: 'navigation', label: 'Menu Bar', count: Math.floor(nodeCount * 0.08) },
    { semantic: 'toolbar', label: 'Formatting Toolbar', count: Math.floor(nodeCount * 0.12) },
    { semantic: 'toolbar', label: 'Standard Toolbar', count: Math.floor(nodeCount * 0.06) },
    { semantic: 'sidebar', label: 'Document Navigator', count: Math.floor(nodeCount * 0.07) },
    { semantic: 'content', label: 'Document Viewport', count: Math.floor(nodeCount * 0.40) },
    { semantic: 'form', label: 'Find/Replace Dialog', count: Math.floor(nodeCount * 0.05) },
    { semantic: 'status', label: 'Status Bar', count: Math.floor(nodeCount * 0.04) },
    { semantic: 'dialog', label: 'Modal Overlays', count: Math.floor(nodeCount * 0.06) },
    { semantic: 'decorative', label: 'Window Chrome', count: Math.floor(nodeCount * 0.08) },
    { semantic: 'unknown', label: 'Unclassified Elements', count: Math.floor(nodeCount * 0.04) },
  ];

  // Adjust last group to hit exact count
  const allocatedCount = groupTemplates.reduce((sum, g) => sum + g.count, 0);
  groupTemplates[groupTemplates.length - 1].count += (nodeCount - allocatedCount);

  // Geometry node types per group semantic
  const typeBySemantic: Record<string, HoloShellGeometryNodeType[]> = {
    navigation: ['menu_bar', 'dropdown', 'dropdown_item', 'link', 'text_label'],
    toolbar: ['toolbar', 'icon_button', 'button', 'divider', 'icon', 'dropdown'],
    sidebar: ['sidebar', 'sidebar_item', 'tree_node', 'icon', 'text_label', 'link'],
    content: ['content_viewport', 'paragraph', 'heading', 'text_label', 'image_thumbnail', 'table', 'table_row', 'table_cell', 'link', 'divider'],
    form: ['text_input', 'button', 'checkbox', 'dropdown', 'text_label', 'dialog', 'dialog_button'],
    status: ['status_bar', 'text_label', 'progress_bar', 'badge', 'icon'],
    dialog: ['dialog', 'dialog_button', 'text_input', 'text_label', 'icon_button', 'divider'],
    decorative: ['window_frame', 'title_bar', 'divider', 'icon', 'badge', 'avatar'],
    unknown: ['unknown', 'panel', 'group_box', 'text_label'],
  };

  // Confidence distribution targets
  const confidenceBySemantic: Record<string, HoloShellConfidenceLevel> = {
    navigation: 'high',
    toolbar: 'high',
    sidebar: 'medium',
    content: 'medium',
    form: 'high',
    status: 'high',
    dialog: 'low',
    decorative: 'high',
    unknown: 'inferred',
  };

  const generatedAt = '2026-05-21T12:00:00.000Z';
  let nodeIdCounter = 0;

  for (const groupTemplate of groupTemplates) {
    const groupId = `group-${groupTemplate.semantic}-${groupTemplates.indexOf(groupTemplate)}`;
    const types = typeBySemantic[groupTemplate.semantic] || ['unknown'];
    const defaultConfidence = confidenceBySemantic[groupTemplate.semantic] || 'medium';
    const groupNodeIds: string[] = [];

    for (let i = 0; i < groupTemplate.count; i++) {
      const nodeId = `node-${nodeIdCounter}`;
      const type = types[i % types.length];
      const contested = Math.random() < 0.05; // 5% contested
      const confidence: HoloShellConfidenceLevel = contested
        ? (Math.random() < 0.5 ? 'low' : 'unresolved')
        : defaultConfidence;

      const node: HoloShellGeometryNode = {
        nodeId,
        type,
        label: `${groupTemplate.label} ${type} ${i}`,
        bounds: [
          Math.floor(Math.random() * 1920),
          Math.floor(Math.random() * 1080),
          0,
          Math.floor(20 + Math.random() * 200),
          Math.floor(10 + Math.random() * 50),
          1,
        ],
        confidence,
        controlGroupId: groupId,
        parentNodeId: i === 0 ? null : `node-${nodeIdCounter - 1}`,
        childNodeIds: [],
        evidence: contested
          ? ['ocr_only', 'layout_heuristic']
          : ['accessibility_tree', 'ocr_text'],
        contested,
        screenshotIsPrimary: false,
        ocrText: type.includes('text') || type.includes('label') || type.includes('paragraph')
          ? `Sample text for ${type} ${i}`
          : null,
        accessibilityRole: type === 'button' ? 'button' : type === 'text_input' ? 'textbox' : type === 'link' ? 'link' : type,
      };
      groupNodeIds.push(nodeId);
      geometryNodes.push(node);
      nodeIdCounter++;
    }

    controlGroups.push({
      groupId,
      semantic: groupTemplate.semantic,
      label: groupTemplate.label,
      nodeIds: groupNodeIds,
      parentGroupId: null,
      confidence: defaultConfidence,
      evidence: ['grouping_heuristic', 'layout_analysis'],
    });
  }

  // Link child nodes to parents
  for (const node of geometryNodes) {
    if (node.parentNodeId) {
      const parent = geometryNodes.find((n) => n.nodeId === node.parentNodeId);
      if (parent) {
        parent.childNodeIds.push(node.nodeId);
      }
    }
  }

  // Generate witness placeholders
  const witnessTypes: HoloShellWitnessType[] = [
    'screenshot_before',
    'screenshot_after',
    'ocr_text_extract',
    'accessibility_tree',
    'bounding_box_overlay',
    'semantic_label_overlay',
    'control_inspector_snapshot',
    'reconstruction_diff',
  ];

  for (let i = 0; i < witnessTypes.length; i++) {
    witnessPlaceholders.push({
      witnessId: `witness-${i}`,
      type: witnessTypes[i],
      contentHash: `sha256-${witnessTypes[i]}-${'x'.repeat(56)}`,
      contentRef: `.tmp/holoshell/reconstruction/${witnessTypes[i]}.json`,
      capturedAt: generatedAt,
      coversNodeIds: geometryNodes.slice(i * 125, (i + 1) * 125).map((n) => n.nodeId),
      available: true,
    });
  }

  // Generate low-confidence blocks
  const lowConfidenceNodes = geometryNodes.filter((n) => n.confidence === 'low' || n.confidence === 'inferred' || n.confidence === 'unresolved');
  for (let i = 0; i < Math.ceil(lowConfidenceNodes.length / 10); i++) {
    const blockNodes = lowConfidenceNodes.slice(i * 10, (i + 1) * 10);
    if (blockNodes.length > 0) {
      lowConfidenceBlocks.push({
        blockId: `lcb-${i}`,
        nodeIds: blockNodes.map((n) => n.nodeId),
        reason: blockNodes[0].confidence === 'low'
          ? 'OCR-only identification without accessibility tree corroboration'
          : blockNodes[0].confidence === 'inferred'
            ? 'Layout heuristic only — no direct evidence for this element'
            : 'Multiple conflicting interpretations — human review needed',
        minConfidence: blockNodes[0].confidence as HoloShellConfidenceLevel,
        suggestedAction: blockNodes[0].confidence === 'unresolved' ? 'human_review' : 're_capture',
        blocking: blockNodes[0].confidence === 'unresolved',
      });
    }
  }

  // Confidence distribution
  const confidenceDistribution: Record<HoloShellConfidenceLevel, number> = {
    high: 0,
    medium: 0,
    low: 0,
    inferred: 0,
    unresolved: 0,
  };
  for (const node of geometryNodes) {
    confidenceDistribution[node.confidence] = (confidenceDistribution[node.confidence] || 0) + 1;
  }

  // Build the full reconstruction
  const reconstruction: HoloShellLegacyAppReconstruction = {
    schemaVersion: HOLOSHELL_LEGACY_APP_RECONSTRUCTION_SCHEMA_VERSION,
    generatedAt,
    platform: 'win32',
    sourceRealitySnapshotId: 'snapshot-fixture-001',
    sourceWindowId: 'window-legacy-app-001',
    sourceAnchors: {
      source: 'experiments/holoshell-human-os-frontier/legacy-app-reconstruction-room.holo',
      adapter: 'scripts/holoshell-legacy-app-reconstruction-adapter.mjs',
      realitySnapshotRef: '.tmp/holoshell/legacy-app-reality-snapshot.json',
      accessibilityTreeRef: '.tmp/holoshell/accessibility-tree.json',
      ocrCaptureRef: '.tmp/holoshell/ocr-capture.json',
    },
    summary: {
      totalGeometryNodes: geometryNodes.length,
      totalControlGroups: controlGroups.length,
      totalWitnessPlaceholders: witnessPlaceholders.length,
      totalLowConfidenceBlocks: lowConfidenceBlocks.length,
      highConfidenceNodeCount: confidenceDistribution.high,
      mediumConfidenceNodeCount: confidenceDistribution.medium,
      lowConfidenceNodeCount: confidenceDistribution.low,
      inferredNodeCount: confidenceDistribution.inferred,
      unresolvedNodeCount: confidenceDistribution.unresolved,
      contestedNodeCount: geometryNodes.filter((n) => n.contested).length,
      screenshotIsPrimaryModel: false,
      confidenceDistribution,
    },
    geometryNodes,
    controlGroups,
    witnessPlaceholders,
    lowConfidenceBlocks,
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
      reconstructionId: 'reconstruction-fixture-001',
      sourceWindowId: 'window-legacy-app-001',
      totalGeometryNodes: geometryNodes.length,
      totalControlGroups: controlGroups.length,
      totalWitnessPlaceholders: witnessPlaceholders.length,
      totalLowConfidenceBlocks: lowConfidenceBlocks.length,
      snapshotHash: 'fixture-hash-reconstruction-001',
      hashAlgorithm: 'sha256',
      emittedAt: generatedAt,
    },
  };

  return reconstruction;
}