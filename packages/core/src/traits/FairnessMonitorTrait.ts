/**
 * Fairness Monitor Trait
 *
 * Streams deployed-model inference decisions into a sliding fairness window,
 * emits deterministic receipts for every sweep, and escalates disparate-impact
 * drift through the shared security/audit surfaces.
 */

import type { HSPlusNode, TraitContext, TraitHandler } from './TraitTypes';
import { extractPayload } from './TraitTypes';

export type FairnessMonitorRisk = 'green' | 'amber' | 'red';
export type FairnessMonitorStatus = 'within_policy' | 'drift_watch' | 'policy_drift';

export interface FairnessMonitorMetrics {
  approvalRate: Record<string, number>;
  adverseImpactRatio: number;
  demographicParityDiff: number;
  fourFifthsPass: boolean;
}

export interface FairnessInferenceRecord {
  recordId?: string;
  modelId?: string;
  protectedAttribute: string;
  approved: boolean;
  observedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface FairnessMonitorReceipt {
  kind: 'fairness.monitor.receipt.v1';
  receiptId: string;
  modelId: string;
  protectedAttribute: string;
  sampleSize: number;
  windowSize: number;
  sweepNumber: number;
  metrics: FairnessMonitorMetrics;
  risk: FairnessMonitorRisk;
  status: FairnessMonitorStatus;
  threshold: number;
  driftThreshold: number;
  issuedAt: string;
  sourceReceiptHash?: string;
  receiptHash: string;
}

export interface FairnessDriftEvent {
  kind: 'fairness.drift.v1';
  modelId: string;
  protectedAttribute: string;
  sampleSize: number;
  adverseImpactRatio: number;
  threshold: number;
  driftThreshold: number;
  risk: FairnessMonitorRisk;
  receiptHash: string;
  metrics: FairnessMonitorMetrics;
  observedAt: string;
}

export interface FairnessMonitorConfig {
  enabled: boolean;
  window_size: number;
  min_window_size: number;
  protected_attribute_field: string;
  decision_field: string;
  positive_decision_values: readonly string[];
  sweep_cadence: number;
  adverse_impact_threshold: number;
  drift_threshold: number;
  emit_audit_log: boolean;
  emit_security_event: boolean;
  model_id?: string;
}

export interface FairnessMonitorState {
  records: FairnessInferenceRecord[];
  receipts: FairnessMonitorReceipt[];
  driftEvents: FairnessDriftEvent[];
  sweepNumber: number;
  recordsSinceSweep: number;
  lastSweepAt?: string;
}

interface FairnessSweepLike {
  receipt?: {
    modelId?: string;
    protectedAttribute?: string;
    sampleSize?: number;
    metrics?: FairnessMonitorMetrics;
    receiptHash?: string;
    issuedAt?: string;
  };
  modelId?: string;
  protectedAttribute?: string;
  sampleSize?: number;
  metrics?: FairnessMonitorMetrics;
  receiptHash?: string;
  issuedAt?: string;
}

const DEFAULT_POSITIVE_DECISION_VALUES = ['true', 'approved', 'approve', 'pass', '1', 'yes'];

const DEFAULT_CONFIG: FairnessMonitorConfig = {
  enabled: true,
  window_size: 200,
  min_window_size: 20,
  protected_attribute_field: 'protectedAttribute',
  decision_field: 'approved',
  positive_decision_values: DEFAULT_POSITIVE_DECISION_VALUES,
  sweep_cadence: 25,
  adverse_impact_threshold: 0.8,
  drift_threshold: 0.05,
  emit_audit_log: true,
  emit_security_event: true,
};

export const fairnessMonitorHandler: TraitHandler<FairnessMonitorConfig> = {
  name: 'fairness_monitor',

  defaultConfig: DEFAULT_CONFIG,

  onAttach(node, _config, context) {
    fairnessMonitorNode(node).__fairnessMonitorState = {
      records: [],
      receipts: [],
      driftEvents: [],
      sweepNumber: 0,
      recordsSinceSweep: 0,
    };

    context.emit('fairness_monitor_ready', { node });
  },

  onDetach(node) {
    delete fairnessMonitorNode(node).__fairnessMonitorState;
  },

  onEvent(node, config, context, event) {
    const state = fairnessMonitorNode(node).__fairnessMonitorState;
    if (!state || !config.enabled) return;

    const payload = extractPayload(event);

    if (
      event.type === 'fairness_monitor:record_inference' ||
      event.type === 'fairness_monitor:record_batch' ||
      event.type === 'inference:result'
    ) {
      const records = normalizeInferenceRecords(payload, config);
      if (records.length === 0) {
        context.emit('fairness_monitor_error', {
          node,
          error: 'FAIRNESS_RECORD_REQUIRED',
        });
        return;
      }

      appendRecords(state, records, config.window_size);
      context.emit('fairness_monitor_window_updated', {
        node,
        windowSize: state.records.length,
        recordsAdded: records.length,
      });

      if (shouldRunCadenceSweep(state, config)) {
        emitSweep(node, state, config, context);
      }
      return;
    }

    if (event.type === 'fairness_monitor:sweep_result') {
      const sweep = normalizeSweep(payload);
      if (!sweep.metrics) {
        context.emit('fairness_monitor_error', {
          node,
          error: 'FAIRNESS_METRICS_REQUIRED',
        });
        return;
      }
      emitSweep(node, state, config, context, sweep);
      return;
    }

    if (event.type === 'fairness_monitor:tick' || event.type === 'fairness_monitor:sweep') {
      emitSweep(node, state, config, context);
      return;
    }

    if (event.type === 'fairness_monitor:query') {
      context.emit('fairness_monitor_query_result', {
        node,
        records: [...state.records],
        receipts: [...state.receipts],
        driftEvents: [...state.driftEvents],
        lastSweepAt: state.lastSweepAt,
      });
    }
  },
};

export function runFairnessMonitorSweep(
  records: readonly FairnessInferenceRecord[],
  config: FairnessMonitorConfig = DEFAULT_CONFIG,
  options: {
    modelId?: string;
    sweepNumber?: number;
    issuedAt?: string;
    sourceReceiptHash?: string;
    metrics?: FairnessMonitorMetrics;
    protectedAttribute?: string;
    sampleSize?: number;
  } = {}
): FairnessMonitorReceipt {
  const metrics = options.metrics ?? analyzeFairnessWindow(records);
  const sampleSize = options.sampleSize ?? records.length;
  if (sampleSize < 1) {
    throw new Error('Fairness monitor sweep requires at least one inference record');
  }

  const modelId = options.modelId ?? records[0]?.modelId ?? config.model_id ?? 'unknown-model';
  const protectedAttribute =
    options.protectedAttribute ?? config.protected_attribute_field ?? 'protectedAttribute';
  const risk = deriveFairnessRisk(metrics, config);
  const status: FairnessMonitorStatus =
    risk === 'red' ? 'policy_drift' : risk === 'amber' ? 'drift_watch' : 'within_policy';
  const issuedAt = options.issuedAt ?? new Date().toISOString();
  const baseReceipt = {
    kind: 'fairness.monitor.receipt.v1' as const,
    modelId,
    protectedAttribute,
    sampleSize,
    windowSize: records.length || sampleSize,
    sweepNumber: options.sweepNumber ?? 1,
    metrics,
    risk,
    status,
    threshold: config.adverse_impact_threshold,
    driftThreshold: config.drift_threshold,
    issuedAt,
    sourceReceiptHash: options.sourceReceiptHash,
  };
  const receiptHash = stableFairnessMonitorHash(baseReceipt);

  return {
    ...baseReceipt,
    receiptId: `fm_${receiptHash}`,
    receiptHash,
  };
}

export function analyzeFairnessWindow(
  records: readonly FairnessInferenceRecord[]
): FairnessMonitorMetrics {
  if (records.length === 0) {
    throw new Error('Fairness monitor metrics require at least one inference record');
  }

  const totals = new Map<string, { approved: number; total: number }>();
  for (const record of records) {
    const group = record.protectedAttribute || 'unknown';
    const entry = totals.get(group) ?? { approved: 0, total: 0 };
    entry.total += 1;
    if (record.approved) entry.approved += 1;
    totals.set(group, entry);
  }

  const approvalRate: Record<string, number> = {};
  const rates: number[] = [];
  for (const [group, entry] of totals) {
    const rate = entry.total > 0 ? roundMetric(entry.approved / entry.total) : 0;
    approvalRate[group] = rate;
    rates.push(rate);
  }

  const maxRate = Math.max(...rates);
  const minRate = Math.min(...rates);
  const adverseImpactRatio = maxRate <= 0 ? 1 : roundMetric(minRate / maxRate);
  const demographicParityDiff = roundMetric(maxRate - minRate);

  return {
    approvalRate,
    adverseImpactRatio,
    demographicParityDiff,
    fourFifthsPass: adverseImpactRatio >= 0.8,
  };
}

export function deriveFairnessRisk(
  metrics: FairnessMonitorMetrics,
  config: Pick<FairnessMonitorConfig, 'adverse_impact_threshold' | 'drift_threshold'>
): FairnessMonitorRisk {
  if (metrics.adverseImpactRatio >= config.adverse_impact_threshold) return 'green';
  if (
    metrics.adverseImpactRatio >=
    config.adverse_impact_threshold - Math.max(0, config.drift_threshold)
  ) {
    return 'amber';
  }
  return 'red';
}

export function stableFairnessMonitorHash(input: unknown): string {
  const canonical = canonicalize(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

function emitSweep(
  node: HSPlusNode,
  state: FairnessMonitorState,
  config: FairnessMonitorConfig,
  context: TraitContext,
  sweep?: FairnessSweepLike
): void {
  if (!sweep && state.records.length < config.min_window_size) {
    context.emit('fairness_monitor_waiting', {
      node,
      windowSize: state.records.length,
      minWindowSize: config.min_window_size,
    });
    return;
  }

  const now = sweep?.issuedAt ?? sweep?.receipt?.issuedAt ?? new Date().toISOString();
  const sweepNumber = state.sweepNumber + 1;
  const receipt = runFairnessMonitorSweep(state.records, config, {
    modelId: sweep?.modelId ?? sweep?.receipt?.modelId,
    protectedAttribute: sweep?.protectedAttribute ?? sweep?.receipt?.protectedAttribute,
    sampleSize: sweep?.sampleSize ?? sweep?.receipt?.sampleSize,
    metrics: sweep?.metrics ?? sweep?.receipt?.metrics,
    sourceReceiptHash: sweep?.receiptHash ?? sweep?.receipt?.receiptHash,
    sweepNumber,
    issuedAt: now,
  });

  state.sweepNumber = sweepNumber;
  state.recordsSinceSweep = 0;
  state.lastSweepAt = now;
  state.receipts.push(receipt);

  context.emit('fairness_monitor_receipt', {
    node,
    receipt,
  });

  if (receipt.metrics.adverseImpactRatio < config.adverse_impact_threshold) {
    const driftEvent: FairnessDriftEvent = {
      kind: 'fairness.drift.v1',
      modelId: receipt.modelId,
      protectedAttribute: receipt.protectedAttribute,
      sampleSize: receipt.sampleSize,
      adverseImpactRatio: receipt.metrics.adverseImpactRatio,
      threshold: receipt.threshold,
      driftThreshold: receipt.driftThreshold,
      risk: receipt.risk,
      receiptHash: receipt.receiptHash,
      metrics: receipt.metrics,
      observedAt: now,
    };
    state.driftEvents.push(driftEvent);

    if (config.emit_security_event) {
      context.emit('fairness_drift_event', {
        ...driftEvent,
        action: 'fairness_monitor.drift',
        actor: receipt.modelId,
        outcome: 'error',
      });
    }
  }

  if (config.emit_audit_log) {
    context.emit('audit_log', {
      action: 'fairness_monitor.sweep',
      actor: receipt.modelId,
      result: receipt.risk === 'green' ? 'success' : 'error',
      outcome: receipt.risk === 'green' ? 'success' : 'error',
      severity: receipt.risk === 'red' ? 'critical' : receipt.risk === 'amber' ? 'warning' : 'info',
      details: {
        adverseImpactRatio: receipt.metrics.adverseImpactRatio,
        protectedAttribute: receipt.protectedAttribute,
        risk: receipt.risk,
        receiptHash: receipt.receiptHash,
        threshold: receipt.threshold,
      },
    });
  }
}

function appendRecords(
  state: FairnessMonitorState,
  records: readonly FairnessInferenceRecord[],
  windowSize: number
): void {
  state.records.push(...records);
  state.recordsSinceSweep += records.length;
  const boundedWindowSize = Math.max(1, Math.floor(windowSize));
  if (state.records.length > boundedWindowSize) {
    state.records.splice(0, state.records.length - boundedWindowSize);
  }
}

function shouldRunCadenceSweep(
  state: FairnessMonitorState,
  config: FairnessMonitorConfig
): boolean {
  if (state.records.length < config.min_window_size) return false;
  return state.recordsSinceSweep >= Math.max(1, Math.floor(config.sweep_cadence));
}

function normalizeInferenceRecords(
  payload: Record<string, unknown>,
  config: FairnessMonitorConfig
): FairnessInferenceRecord[] {
  const candidateBatch = Array.isArray(payload.records)
    ? payload.records
    : Array.isArray(payload.batch)
      ? payload.batch
      : undefined;
  const rawRecords = candidateBatch ?? [payload];
  const records: FairnessInferenceRecord[] = [];

  for (const rawRecord of rawRecords) {
    if (!rawRecord || typeof rawRecord !== 'object') continue;
    const record = rawRecord as Record<string, unknown>;
    const protectedAttribute = readProtectedAttribute(record, config);
    const decision = readDecision(record, config);
    if (!protectedAttribute || decision === undefined) continue;
    records.push({
      recordId: typeof record.recordId === 'string' ? record.recordId : undefined,
      modelId: readModelId(record, config),
      protectedAttribute,
      approved: decision,
      observedAt: typeof record.observedAt === 'string' ? record.observedAt : undefined,
      metadata:
        record.metadata && typeof record.metadata === 'object'
          ? (record.metadata as Record<string, unknown>)
          : undefined,
    });
  }

  return records;
}

function normalizeSweep(payload: Record<string, unknown>): FairnessSweepLike {
  const receipt =
    payload.receipt && typeof payload.receipt === 'object'
      ? (payload.receipt as FairnessSweepLike['receipt'])
      : undefined;
  return {
    receipt,
    modelId: typeof payload.modelId === 'string' ? payload.modelId : undefined,
    protectedAttribute:
      typeof payload.protectedAttribute === 'string' ? payload.protectedAttribute : undefined,
    sampleSize: typeof payload.sampleSize === 'number' ? payload.sampleSize : undefined,
    metrics: readMetrics(payload.metrics) ?? readMetrics(receipt?.metrics),
    receiptHash: typeof payload.receiptHash === 'string' ? payload.receiptHash : undefined,
    issuedAt: typeof payload.issuedAt === 'string' ? payload.issuedAt : undefined,
  };
}

function readProtectedAttribute(
  record: Record<string, unknown>,
  config: FairnessMonitorConfig
): string | undefined {
  const value =
    record[config.protected_attribute_field] ?? record.protectedAttribute ?? record.group;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readDecision(
  record: Record<string, unknown>,
  config: FairnessMonitorConfig
): boolean | undefined {
  const value = record[config.decision_field] ?? record.approved ?? record.decision;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    return config.positive_decision_values.includes(value.trim().toLowerCase());
  }
  return undefined;
}

function readModelId(
  record: Record<string, unknown>,
  config: FairnessMonitorConfig
): string | undefined {
  const value = record.modelId ?? config.model_id;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readMetrics(value: unknown): FairnessMonitorMetrics | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const metrics = value as Partial<FairnessMonitorMetrics>;
  if (
    !metrics.approvalRate ||
    typeof metrics.approvalRate !== 'object' ||
    typeof metrics.adverseImpactRatio !== 'number' ||
    typeof metrics.demographicParityDiff !== 'number' ||
    typeof metrics.fourFifthsPass !== 'boolean'
  ) {
    return undefined;
  }
  return metrics as FairnessMonitorMetrics;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(6));
}

function fairnessMonitorNode(
  node: HSPlusNode
): HSPlusNode & { __fairnessMonitorState?: FairnessMonitorState } {
  return node as HSPlusNode & { __fairnessMonitorState?: FairnessMonitorState };
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue)
    .sort()
    .filter((key) => objectValue[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalize(objectValue[key])}`)
    .join(',')}}`;
}
