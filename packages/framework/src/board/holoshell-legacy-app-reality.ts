/**
 * HoloShell Legacy App Reality schema pack.
 *
 * Canonical local-only contract for turning Windows/process/app reality into
 * typed HoloScript-consumable receipts. This lets HoloShell and Brittney reason
 * from real PIDs, visible windows, network consumers, and agent color lanes
 * instead of inferred peer counts.
 */

export const HOLOSHELL_LEGACY_APP_REALITY_SCHEMA_VERSION =
  'hololand.holoshell.legacy-app-reality.v0.1.0' as const;

export type HoloShellLegacyAppRealitySchemaVersion =
  typeof HOLOSHELL_LEGACY_APP_REALITY_SCHEMA_VERSION;

export type HoloShellLegacyJsonValue =
  | string
  | number
  | boolean
  | null
  | HoloShellLegacyJsonValue[]
  | { [key: string]: HoloShellLegacyJsonValue };

export const HOLOSHELL_LEGACY_PROCESS_ROLES = [
  'agent_shell',
  'ai_peer_surface',
  'ai_workbench',
  'ai_model_runtime',
  'shell_surface',
  'browser',
  'terminal',
  'legacy_app',
  'system_service',
  'unknown',
] as const;

export type HoloShellLegacyProcessRole =
  (typeof HOLOSHELL_LEGACY_PROCESS_ROLES)[number];

export const HOLOSHELL_LEGACY_NETWORK_POSTURES = [
  'none',
  'possible',
  'active',
  'heavy',
  'unknown',
] as const;

export type HoloShellLegacyNetworkPosture =
  (typeof HOLOSHELL_LEGACY_NETWORK_POSTURES)[number];

export const HOLOSHELL_LEGACY_CUSTODY_STATUSES = [
  'owned',
  'observed',
  'owner_unknown',
  'safe_to_review',
  'do_not_stop',
  'unknown',
] as const;

export type HoloShellLegacyCustodyStatus =
  (typeof HOLOSHELL_LEGACY_CUSTODY_STATUSES)[number];

export const HOLOSHELL_LEGACY_LANE_COLORS = [
  'cyan',
  'violet',
  'blue',
  'green',
  'amber',
  'gray',
  'pink',
  'teal',
  'white',
] as const;

export type HoloShellLegacyLaneColor =
  (typeof HOLOSHELL_LEGACY_LANE_COLORS)[number];

export const HOLOSHELL_LEGACY_RECEIPT_ACTIONS = [
  'legacy_app_reality_snapshot',
  'self_test_snapshot',
] as const;

export type HoloShellLegacyReceiptAction =
  (typeof HOLOSHELL_LEGACY_RECEIPT_ACTIONS)[number];

export interface HoloShellLegacySourceAnchors {
  source: string;
  adapter: string;
  processHealth?: string;
  networkReality?: string;
  legacyWindowInventory?: string;
  runRegistry?: string;
}

export interface HoloShellLegacySummary {
  processCount: number;
  visibleWindowCount: number;
  agentInstanceCount: number;
  shellInstanceCount: number;
  legacyAppCount: number;
  browserCount: number;
  networkConsumerCount: number;
  heavyNetworkConsumerCount: number;
  colorLaneCount: number;
  processCountIsPeerCount: false;
  confidence: 'os_reported' | 'fixture' | 'partial' | 'unavailable';
}

export interface HoloShellLegacyLane {
  laneId: string;
  label: string;
  color: HoloShellLegacyLaneColor;
  agentKind: string;
  processCount: number;
  visibleWindowCount: number;
  networkConsumerCount: number;
  primaryPid?: number | null;
  evidence: string[];
}

export interface HoloShellLegacyProcess {
  pid: number;
  parentPid?: number | null;
  processName: string;
  role: HoloShellLegacyProcessRole;
  laneId?: string | null;
  laneColor?: HoloShellLegacyLaneColor | null;
  agentKind?: string | null;
  hasVisibleWindow: boolean;
  networkPosture: HoloShellLegacyNetworkPosture;
  custodyStatus: HoloShellLegacyCustodyStatus;
  memoryBytes?: number | null;
  cpuSeconds?: number | null;
  startedAt?: string | null;
  commandHash?: string | null;
  commandPreview?: string | null;
  evidence: string[];
}

export interface HoloShellLegacyWindow {
  id: string;
  title: string;
  processId: number;
  processName: string;
  role: HoloShellLegacyProcessRole;
  laneId?: string | null;
  laneColor?: HoloShellLegacyLaneColor | null;
  visible: boolean;
  foreground?: boolean;
  handle?: string | null;
  evidence: string[];
}

export interface HoloShellLegacyNetworkConsumer {
  pid: number;
  processName: string;
  role: HoloShellLegacyProcessRole;
  laneId?: string | null;
  networkPosture: HoloShellLegacyNetworkPosture;
  connectionCount?: number;
  evidence: string[];
}

export interface HoloShellLegacyRedactionPolicy {
  localOnly: true;
  commandLinesIncluded: boolean;
  commandLinesRedacted: boolean;
  rawWindowTitlesIncluded: boolean;
  remoteEndpointsIncluded: false;
  secretsRedacted: true;
}

export interface HoloShellLegacyReceipt {
  receiptType: 'legacy_app_reality_snapshot';
  actionTaken: HoloShellLegacyReceiptAction;
  mutationPerformed: false;
  snapshotHash: string;
  hashAlgorithm?: 'sha256';
  emittedAt?: string;
  parentReceiptIds?: string[];
  metadata?: Record<string, HoloShellLegacyJsonValue>;
}

export interface HoloShellLegacyAppRealitySnapshot {
  schemaVersion: HoloShellLegacyAppRealitySchemaVersion;
  generatedAt: string;
  platform: string;
  sourceAnchors: HoloShellLegacySourceAnchors;
  summary: HoloShellLegacySummary;
  lanes: HoloShellLegacyLane[];
  processes: HoloShellLegacyProcess[];
  windows: HoloShellLegacyWindow[];
  networkConsumers: HoloShellLegacyNetworkConsumer[];
  redaction: HoloShellLegacyRedactionPolicy;
  receipt: HoloShellLegacyReceipt;
  metadata?: Record<string, HoloShellLegacyJsonValue>;
}

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

function validateSourceAnchors(
  anchors: HoloShellLegacySourceAnchors | undefined,
  errors: string[]
): void {
  if (!isRecord(anchors)) {
    errors.push('HoloShellLegacyAppRealitySnapshot.sourceAnchors is required.');
    return;
  }
  validateStringField('sourceAnchors.source', anchors.source, errors);
  validateStringField('sourceAnchors.adapter', anchors.adapter, errors);
}

function validateSummary(summary: HoloShellLegacySummary | undefined, errors: string[]): void {
  if (!isRecord(summary)) {
    errors.push('HoloShellLegacyAppRealitySnapshot.summary is required.');
    return;
  }
  for (const key of [
    'processCount',
    'visibleWindowCount',
    'agentInstanceCount',
    'shellInstanceCount',
    'legacyAppCount',
    'browserCount',
    'networkConsumerCount',
    'heavyNetworkConsumerCount',
    'colorLaneCount',
  ] as const) {
    validateNumberField(`summary.${key}`, summary[key], errors);
  }
  if (summary.processCountIsPeerCount !== false) {
    errors.push('summary.processCountIsPeerCount must be false.');
  }
  if (!isOneOf(['os_reported', 'fixture', 'partial', 'unavailable'] as const, summary.confidence)) {
    errors.push(`summary.confidence is unsupported: ${String(summary.confidence)}.`);
  }
}

function validateLane(lane: HoloShellLegacyLane, index: number, errors: string[]): void {
  const path = `lanes[${index}]`;
  if (!isRecord(lane)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  validateStringField(`${path}.laneId`, lane.laneId, errors);
  validateStringField(`${path}.label`, lane.label, errors);
  if (!isOneOf(HOLOSHELL_LEGACY_LANE_COLORS, lane.color)) {
    errors.push(`${path}.color is unsupported: ${String(lane.color)}.`);
  }
  validateStringField(`${path}.agentKind`, lane.agentKind, errors);
  validateNumberField(`${path}.processCount`, lane.processCount, errors);
  validateNumberField(`${path}.visibleWindowCount`, lane.visibleWindowCount, errors);
  validateNumberField(`${path}.networkConsumerCount`, lane.networkConsumerCount, errors);
  if (lane.primaryPid !== undefined && lane.primaryPid !== null && !isPositiveInteger(lane.primaryPid)) {
    errors.push(`${path}.primaryPid must be a positive integer when provided.`);
  }
  validateEvidence(path, lane.evidence, errors);
}

function validateProcess(process: HoloShellLegacyProcess, index: number, errors: string[]): void {
  const path = `processes[${index}]`;
  if (!isRecord(process)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if (!isPositiveInteger(process.pid)) errors.push(`${path}.pid must be a positive integer.`);
  if (process.parentPid !== undefined && process.parentPid !== null && !isPositiveInteger(process.parentPid)) {
    errors.push(`${path}.parentPid must be a positive integer when provided.`);
  }
  validateStringField(`${path}.processName`, process.processName, errors);
  if (!isOneOf(HOLOSHELL_LEGACY_PROCESS_ROLES, process.role)) {
    errors.push(`${path}.role is unsupported: ${String(process.role)}.`);
  }
  if (process.laneColor !== undefined && process.laneColor !== null && !isOneOf(HOLOSHELL_LEGACY_LANE_COLORS, process.laneColor)) {
    errors.push(`${path}.laneColor is unsupported: ${String(process.laneColor)}.`);
  }
  if (typeof process.hasVisibleWindow !== 'boolean') {
    errors.push(`${path}.hasVisibleWindow must be a boolean.`);
  }
  if (!isOneOf(HOLOSHELL_LEGACY_NETWORK_POSTURES, process.networkPosture)) {
    errors.push(`${path}.networkPosture is unsupported: ${String(process.networkPosture)}.`);
  }
  if (!isOneOf(HOLOSHELL_LEGACY_CUSTODY_STATUSES, process.custodyStatus)) {
    errors.push(`${path}.custodyStatus is unsupported: ${String(process.custodyStatus)}.`);
  }
  if (process.memoryBytes !== undefined && process.memoryBytes !== null && !isNonNegativeNumber(process.memoryBytes)) {
    errors.push(`${path}.memoryBytes must be a non-negative number when provided.`);
  }
  if (process.cpuSeconds !== undefined && process.cpuSeconds !== null && !isNonNegativeNumber(process.cpuSeconds)) {
    errors.push(`${path}.cpuSeconds must be a non-negative number when provided.`);
  }
  if (process.startedAt !== undefined && process.startedAt !== null && !isIsoTimestamp(process.startedAt)) {
    errors.push(`${path}.startedAt must be an ISO timestamp when provided.`);
  }
  validateEvidence(path, process.evidence, errors);
}

function validateWindow(window: HoloShellLegacyWindow, index: number, errors: string[]): void {
  const path = `windows[${index}]`;
  if (!isRecord(window)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  validateStringField(`${path}.id`, window.id, errors);
  validateStringField(`${path}.title`, window.title, errors);
  if (!isPositiveInteger(window.processId)) errors.push(`${path}.processId must be a positive integer.`);
  validateStringField(`${path}.processName`, window.processName, errors);
  if (!isOneOf(HOLOSHELL_LEGACY_PROCESS_ROLES, window.role)) {
    errors.push(`${path}.role is unsupported: ${String(window.role)}.`);
  }
  if (window.laneColor !== undefined && window.laneColor !== null && !isOneOf(HOLOSHELL_LEGACY_LANE_COLORS, window.laneColor)) {
    errors.push(`${path}.laneColor is unsupported: ${String(window.laneColor)}.`);
  }
  if (typeof window.visible !== 'boolean') errors.push(`${path}.visible must be a boolean.`);
  validateEvidence(path, window.evidence, errors);
}

function validateNetworkConsumer(
  consumer: HoloShellLegacyNetworkConsumer,
  index: number,
  errors: string[]
): void {
  const path = `networkConsumers[${index}]`;
  if (!isRecord(consumer)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if (!isPositiveInteger(consumer.pid)) errors.push(`${path}.pid must be a positive integer.`);
  validateStringField(`${path}.processName`, consumer.processName, errors);
  if (!isOneOf(HOLOSHELL_LEGACY_PROCESS_ROLES, consumer.role)) {
    errors.push(`${path}.role is unsupported: ${String(consumer.role)}.`);
  }
  if (!isOneOf(HOLOSHELL_LEGACY_NETWORK_POSTURES, consumer.networkPosture)) {
    errors.push(`${path}.networkPosture is unsupported: ${String(consumer.networkPosture)}.`);
  }
  if (consumer.connectionCount !== undefined && !isNonNegativeNumber(consumer.connectionCount)) {
    errors.push(`${path}.connectionCount must be a non-negative number when provided.`);
  }
  validateEvidence(path, consumer.evidence, errors);
}

function validateRedaction(redaction: HoloShellLegacyRedactionPolicy | undefined, errors: string[]): void {
  if (!isRecord(redaction)) {
    errors.push('HoloShellLegacyAppRealitySnapshot.redaction is required.');
    return;
  }
  if (redaction.localOnly !== true) errors.push('redaction.localOnly must be true.');
  if (typeof redaction.commandLinesIncluded !== 'boolean') errors.push('redaction.commandLinesIncluded must be a boolean.');
  if (typeof redaction.commandLinesRedacted !== 'boolean') errors.push('redaction.commandLinesRedacted must be a boolean.');
  if (typeof redaction.rawWindowTitlesIncluded !== 'boolean') errors.push('redaction.rawWindowTitlesIncluded must be a boolean.');
  if (redaction.remoteEndpointsIncluded !== false) errors.push('redaction.remoteEndpointsIncluded must be false.');
  if (redaction.secretsRedacted !== true) errors.push('redaction.secretsRedacted must be true.');
}

function validateReceipt(receipt: HoloShellLegacyReceipt | undefined, errors: string[]): void {
  if (!isRecord(receipt)) {
    errors.push('HoloShellLegacyAppRealitySnapshot.receipt is required.');
    return;
  }
  if (receipt.receiptType !== 'legacy_app_reality_snapshot') {
    errors.push('receipt.receiptType must be legacy_app_reality_snapshot.');
  }
  if (!isOneOf(HOLOSHELL_LEGACY_RECEIPT_ACTIONS, receipt.actionTaken)) {
    errors.push(`receipt.actionTaken is unsupported: ${String(receipt.actionTaken)}.`);
  }
  if (receipt.mutationPerformed !== false) errors.push('receipt.mutationPerformed must be false.');
  validateStringField('receipt.snapshotHash', receipt.snapshotHash, errors);
  if (receipt.hashAlgorithm !== undefined && receipt.hashAlgorithm !== 'sha256') {
    errors.push(`receipt.hashAlgorithm is unsupported: ${String(receipt.hashAlgorithm)}.`);
  }
  if (receipt.emittedAt !== undefined && !isIsoTimestamp(receipt.emittedAt)) {
    errors.push('receipt.emittedAt must be an ISO timestamp when provided.');
  }
}

export function isSupportedHoloShellLegacyProcessRole(value: string): value is HoloShellLegacyProcessRole {
  return isOneOf(HOLOSHELL_LEGACY_PROCESS_ROLES, value);
}

export function isSupportedHoloShellLegacyLaneColor(value: string): value is HoloShellLegacyLaneColor {
  return isOneOf(HOLOSHELL_LEGACY_LANE_COLORS, value);
}

export function isSupportedHoloShellLegacyReceiptAction(value: string): value is HoloShellLegacyReceiptAction {
  return isOneOf(HOLOSHELL_LEGACY_RECEIPT_ACTIONS, value);
}

export function validateHoloShellLegacyAppRealitySnapshot(
  snapshot: HoloShellLegacyAppRealitySnapshot
): string[] {
  const errors: string[] = [];

  if (!isRecord(snapshot)) {
    return ['HoloShellLegacyAppRealitySnapshot must be an object.'];
  }
  if (snapshot.schemaVersion !== HOLOSHELL_LEGACY_APP_REALITY_SCHEMA_VERSION) {
    errors.push(
      `HoloShellLegacyAppRealitySnapshot.schemaVersion must be ${HOLOSHELL_LEGACY_APP_REALITY_SCHEMA_VERSION}.`
    );
  }
  if (!isIsoTimestamp(snapshot.generatedAt)) {
    errors.push('HoloShellLegacyAppRealitySnapshot.generatedAt must be an ISO timestamp.');
  }
  validateStringField('platform', snapshot.platform, errors);
  validateSourceAnchors(snapshot.sourceAnchors, errors);
  validateSummary(snapshot.summary, errors);

  if (!Array.isArray(snapshot.lanes)) errors.push('lanes must be an array.');
  else snapshot.lanes.forEach((lane, index) => validateLane(lane, index, errors));

  if (!Array.isArray(snapshot.processes)) errors.push('processes must be an array.');
  else snapshot.processes.forEach((process, index) => validateProcess(process, index, errors));

  if (!Array.isArray(snapshot.windows)) errors.push('windows must be an array.');
  else snapshot.windows.forEach((window, index) => validateWindow(window, index, errors));

  if (!Array.isArray(snapshot.networkConsumers)) errors.push('networkConsumers must be an array.');
  else snapshot.networkConsumers.forEach((consumer, index) => validateNetworkConsumer(consumer, index, errors));

  validateRedaction(snapshot.redaction, errors);
  validateReceipt(snapshot.receipt, errors);

  if (
    isRecord(snapshot.summary)
    && Array.isArray(snapshot.processes)
    && snapshot.summary.processCount !== snapshot.processes.length
  ) {
    errors.push('summary.processCount must match processes.length.');
  }
  if (
    isRecord(snapshot.summary)
    && Array.isArray(snapshot.windows)
    && snapshot.summary.visibleWindowCount !== snapshot.windows.filter((window) => window.visible).length
  ) {
    errors.push('summary.visibleWindowCount must match visible windows.');
  }

  return errors;
}

export function cloneHoloShellLegacyAppRealitySnapshot(
  snapshot: HoloShellLegacyAppRealitySnapshot
): HoloShellLegacyAppRealitySnapshot {
  return {
    ...snapshot,
    sourceAnchors: { ...snapshot.sourceAnchors },
    summary: { ...snapshot.summary },
    lanes: snapshot.lanes.map((lane) => ({
      ...lane,
      evidence: [...lane.evidence],
    })),
    processes: snapshot.processes.map((process) => ({
      ...process,
      evidence: [...process.evidence],
    })),
    windows: snapshot.windows.map((window) => ({
      ...window,
      evidence: [...window.evidence],
    })),
    networkConsumers: snapshot.networkConsumers.map((consumer) => ({
      ...consumer,
      evidence: [...consumer.evidence],
    })),
    redaction: { ...snapshot.redaction },
    receipt: {
      ...snapshot.receipt,
      ...(snapshot.receipt.parentReceiptIds
        ? { parentReceiptIds: [...snapshot.receipt.parentReceiptIds] }
        : {}),
      ...(snapshot.receipt.metadata ? { metadata: { ...snapshot.receipt.metadata } } : {}),
    },
    ...(snapshot.metadata ? { metadata: { ...snapshot.metadata } } : {}),
  };
}
