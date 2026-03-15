/**
 * @sync Tier Annotations - Per-field network synchronization mode control
 * Supports strong/eventual/CRDT consistency, update rate, and compression.
 *
 * Extended capabilities:
 *   - Dynamic rate adaptation (reduce update rate under congestion)
 *   - Priority starvation detection (alert if low-priority fields haven't synced)
 *   - Batch serialization (pack multiple field updates into single network packet)
 *   - CRDT merge conflict logging
 *
 * @version 2.0.0
 */

// ===========================================================================
// Core types (preserved from v1)
// ===========================================================================

export type SyncMode = 'strong' | 'eventual' | 'crdt';
export type CompressionMode = 'none' | 'delta' | 'quantized' | 'lz4';

export interface SyncFieldConfig {
  mode: SyncMode;
  updateRateHz: number;
  compression: CompressionMode;
  priority: number;
  interpolation: 'none' | 'linear' | 'hermite';
  crdtType?: 'lww-register' | 'g-counter' | 'or-set';
  maxLatencyMs: number;
  jitterBufferMs: number;
}

export const DEFAULT_SYNC_FIELD: SyncFieldConfig = {
  mode: 'eventual',
  updateRateHz: 20,
  compression: 'delta',
  priority: 1,
  interpolation: 'linear',
  maxLatencyMs: 200,
  jitterBufferMs: 50,
};

export const SYNC_PRESETS: Record<string, Partial<SyncFieldConfig>> = {
  position: {
    mode: 'eventual',
    updateRateHz: 60,
    compression: 'quantized',
    interpolation: 'hermite',
    priority: 10,
  },
  rotation: {
    mode: 'eventual',
    updateRateHz: 60,
    compression: 'quantized',
    interpolation: 'hermite',
    priority: 10,
  },
  health: { mode: 'strong', updateRateHz: 10, compression: 'none', priority: 5 },
  inventory: { mode: 'crdt', updateRateHz: 1, compression: 'lz4', crdtType: 'or-set', priority: 3 },
  score: { mode: 'crdt', updateRateHz: 5, compression: 'none', crdtType: 'g-counter', priority: 7 },
  chat: { mode: 'strong', updateRateHz: 0, compression: 'lz4', priority: 2 },
  animation: {
    mode: 'eventual',
    updateRateHz: 30,
    compression: 'delta',
    interpolation: 'linear',
    priority: 8,
  },
};

export interface SyncTierConfig {
  fields: Map<string, SyncFieldConfig>;
  defaultMode: SyncMode;
  bandwidthBudgetBps: number;
  /** Starvation threshold: alert if a field hasn't synced for this many seconds (default: 5). */
  starvationThresholdS: number;
  /** Congestion adaptation factor: multiply rates by this when congested (0..1, default: 0.5). */
  congestionAdaptationFactor: number;
}

// ===========================================================================
// CRDT merge conflict log entry
// ===========================================================================

export interface CRDTMergeConflict {
  /** Field name where the conflict occurred. */
  fieldName: string;
  /** CRDT type of the field. */
  crdtType: 'lww-register' | 'g-counter' | 'or-set';
  /** Timestamp of the conflict (ISO 8601). */
  timestamp: string;
  /** Description of the local value before merge. */
  localValue: string;
  /** Description of the remote value that conflicted. */
  remoteValue: string;
  /** Which value won ('local' | 'remote' | 'merged'). */
  resolution: 'local' | 'remote' | 'merged';
  /** Optional human-readable note. */
  note?: string;
}

// ===========================================================================
// Starvation alert
// ===========================================================================

export interface StarvationAlert {
  /** Field name that is starving. */
  fieldName: string;
  /** Priority of the field. */
  priority: number;
  /** Seconds since the field was last synced. */
  elapsedS: number;
  /** Starvation threshold that was exceeded. */
  thresholdS: number;
  /** Timestamp of the alert (ISO 8601). */
  alertedAt: string;
}

// ===========================================================================
// Batch serialization types
// ===========================================================================

/** A single field update within a batch packet. */
export interface BatchFieldUpdate {
  /** Field name. */
  name: string;
  /** Serialized value (base64 or JSON). */
  payload: string;
  /** Byte size of the serialized payload. */
  payloadBytes: number;
  /** Compression used. */
  compression: CompressionMode;
  /** Sequence number for ordering. */
  sequenceNumber: number;
}

/** A batch packet containing multiple field updates. */
export interface BatchPacket {
  /** Monotonically increasing packet ID. */
  packetId: number;
  /** Timestamp when the packet was assembled (ISO 8601). */
  assembledAt: string;
  /** Individual field updates packed into this packet. */
  updates: BatchFieldUpdate[];
  /** Total payload size in bytes. */
  totalBytes: number;
  /** Maximum transmission unit limit in bytes. */
  mtuBytes: number;
}

// ===========================================================================
// Rate adaptation snapshot
// ===========================================================================

export interface RateAdaptationSnapshot {
  /** Whether congestion mode is currently active. */
  congested: boolean;
  /** Current adaptation factor (1.0 = normal, <1.0 = reduced). */
  adaptationFactor: number;
  /** Effective rates per field (after adaptation). */
  effectiveRates: Map<string, number>;
  /** Number of times congestion mode was entered. */
  congestionEventCount: number;
}

// ===========================================================================
// SyncTierTrait (extended)
// ===========================================================================

export class SyncTierTrait {
  public readonly traitName = 'SyncTier';
  private fields: Map<string, SyncFieldConfig> = new Map();
  private defaultMode: SyncMode;
  private bandwidthBudget: number;

  // -- Rate adaptation --
  private congested: boolean = false;
  private congestionFactor: number;
  private congestionEventCount: number = 0;

  // -- Starvation detection --
  private starvationThresholdS: number;
  private lastSyncTimestamps: Map<string, number> = new Map();

  // -- CRDT merge conflict log --
  private mergeConflictLog: CRDTMergeConflict[] = [];
  private readonly maxConflictLogSize = 1000;

  // -- Batch serialization --
  private nextPacketId: number = 0;
  private nextSequenceNumber: number = 0;
  private defaultMTUBytes: number = 1200; // Typical safe UDP MTU

  constructor(config: Partial<SyncTierConfig> = {}) {
    this.defaultMode = config.defaultMode ?? 'eventual';
    this.bandwidthBudget = config.bandwidthBudgetBps ?? 50000;
    this.starvationThresholdS = config.starvationThresholdS ?? 5;
    this.congestionFactor = config.congestionAdaptationFactor ?? 0.5;
    if (config.fields) for (const [k, v] of config.fields) this.fields.set(k, v);
  }

  // =========================================================================
  // Field management (preserved from v1)
  // =========================================================================

  addField(name: string, config: Partial<SyncFieldConfig> = {}): void {
    const preset = SYNC_PRESETS[name];
    this.fields.set(name, { ...DEFAULT_SYNC_FIELD, ...preset, ...config });
    this.lastSyncTimestamps.set(name, Date.now() / 1000);
  }

  removeField(name: string): void {
    this.fields.delete(name);
    this.lastSyncTimestamps.delete(name);
  }

  getField(name: string): SyncFieldConfig | undefined {
    return this.fields.get(name);
  }
  getAllFields(): Map<string, SyncFieldConfig> {
    return new Map(this.fields);
  }

  estimateBandwidth(): number {
    let bps = 0;
    for (const [, cfg] of this.fields) {
      const baseSize =
        cfg.compression === 'none'
          ? 32
          : cfg.compression === 'delta'
            ? 8
            : cfg.compression === 'quantized'
              ? 4
              : 16;
      const effectiveRate = this.congested
        ? cfg.updateRateHz * this.congestionFactor
        : cfg.updateRateHz;
      bps += baseSize * 8 * effectiveRate;
    }
    return bps;
  }

  exceedsBandwidthBudget(): boolean {
    return this.estimateBandwidth() > this.bandwidthBudget;
  }

  getFieldsByMode(mode: SyncMode): [string, SyncFieldConfig][] {
    return [...this.fields.entries()].filter(([, c]) => c.mode === mode);
  }

  getFieldsByPriority(): [string, SyncFieldConfig][] {
    return [...this.fields.entries()].sort(([, a], [, b]) => b.priority - a.priority);
  }

  // =========================================================================
  // Dynamic rate adaptation
  // =========================================================================

  /**
   * Enter congestion mode: all update rates are multiplied by the
   * congestion adaptation factor until leaveCongestion() is called.
   *
   * This does NOT modify the stored SyncFieldConfig. Instead, consumers
   * should call getEffectiveRate() to get the adapted rate.
   */
  enterCongestion(): void {
    if (!this.congested) {
      this.congested = true;
      this.congestionEventCount++;
    }
  }

  /** Leave congestion mode, restoring normal update rates. */
  leaveCongestion(): void {
    this.congested = false;
  }

  /** Check whether congestion mode is currently active. */
  isCongested(): boolean {
    return this.congested;
  }

  /**
   * Get the effective update rate for a field, accounting for congestion.
   * During congestion, rates are reduced by the congestion factor.
   */
  getEffectiveRate(fieldName: string): number {
    const cfg = this.fields.get(fieldName);
    if (!cfg) return 0;
    return this.congested ? cfg.updateRateHz * this.congestionFactor : cfg.updateRateHz;
  }

  /** Set a custom congestion adaptation factor (0..1). */
  setCongestionFactor(factor: number): void {
    this.congestionFactor = Math.max(0, Math.min(1, factor));
  }

  /** Snapshot the current rate adaptation state. */
  getRateAdaptationSnapshot(): RateAdaptationSnapshot {
    const effectiveRates = new Map<string, number>();
    for (const [name] of this.fields) {
      effectiveRates.set(name, this.getEffectiveRate(name));
    }
    return {
      congested: this.congested,
      adaptationFactor: this.congested ? this.congestionFactor : 1.0,
      effectiveRates,
      congestionEventCount: this.congestionEventCount,
    };
  }

  // =========================================================================
  // Priority starvation detection
  // =========================================================================

  /**
   * Record that a field was just synced (call this when a sync actually happens).
   */
  recordFieldSync(fieldName: string): void {
    this.lastSyncTimestamps.set(fieldName, Date.now() / 1000);
  }

  /**
   * Detect fields that have not been synced within the starvation threshold.
   *
   * Returns an array of StarvationAlert for each starving field. Fields are
   * checked against their last recorded sync time. High-priority fields that
   * are starving are listed first.
   *
   * @param nowS - Current time in seconds (default: Date.now()/1000).
   */
  detectStarvation(nowS?: number): StarvationAlert[] {
    const now = nowS ?? Date.now() / 1000;
    const alerts: StarvationAlert[] = [];

    for (const [name, cfg] of this.fields) {
      // Skip event-driven fields (rate 0)
      if (cfg.updateRateHz === 0) continue;

      const lastSync = this.lastSyncTimestamps.get(name);
      if (lastSync === undefined) {
        // Never synced — always starving
        alerts.push({
          fieldName: name,
          priority: cfg.priority,
          elapsedS: Infinity,
          thresholdS: this.starvationThresholdS,
          alertedAt: new Date().toISOString(),
        });
        continue;
      }

      const elapsed = now - lastSync;
      if (elapsed > this.starvationThresholdS) {
        alerts.push({
          fieldName: name,
          priority: cfg.priority,
          elapsedS: elapsed,
          thresholdS: this.starvationThresholdS,
          alertedAt: new Date().toISOString(),
        });
      }
    }

    // Sort by priority descending (highest priority first)
    alerts.sort((a, b) => b.priority - a.priority);
    return alerts;
  }

  /** Set the starvation threshold in seconds. */
  setStarvationThreshold(seconds: number): void {
    this.starvationThresholdS = Math.max(0, seconds);
  }

  // =========================================================================
  // Batch serialization
  // =========================================================================

  /**
   * Pack pending field updates into one or more BatchPackets, respecting
   * the MTU limit.
   *
   * @param fieldPayloads - Map of field name to serialized payload string.
   * @param mtuBytes - Maximum packet size in bytes (default: 1200).
   * @returns Array of BatchPackets. If all updates fit in one packet, the
   *   array has length 1.
   */
  packBatch(fieldPayloads: Map<string, string>, mtuBytes?: number): BatchPacket[] {
    const mtu = mtuBytes ?? this.defaultMTUBytes;
    const packets: BatchPacket[] = [];
    let currentUpdates: BatchFieldUpdate[] = [];
    let currentBytes = 0;

    // Sort fields by priority (highest first) so important fields go in earlier packets
    const sorted = [...fieldPayloads.entries()].sort(([nameA], [nameB]) => {
      const cfgA = this.fields.get(nameA);
      const cfgB = this.fields.get(nameB);
      return (cfgB?.priority ?? 0) - (cfgA?.priority ?? 0);
    });

    for (const [name, payload] of sorted) {
      const cfg = this.fields.get(name);
      const payloadBytes = new TextEncoder().encode(payload).length;

      // Header overhead per field update (name + metadata): rough estimate
      const overhead = new TextEncoder().encode(name).length + 16;
      const fieldTotalBytes = payloadBytes + overhead;

      if (currentBytes + fieldTotalBytes > mtu && currentUpdates.length > 0) {
        // Flush current packet
        packets.push(this.createPacket(currentUpdates, currentBytes, mtu));
        currentUpdates = [];
        currentBytes = 0;
      }

      currentUpdates.push({
        name,
        payload,
        payloadBytes,
        compression: cfg?.compression ?? 'none',
        sequenceNumber: this.nextSequenceNumber++,
      });
      currentBytes += fieldTotalBytes;
    }

    // Flush remaining
    if (currentUpdates.length > 0) {
      packets.push(this.createPacket(currentUpdates, currentBytes, mtu));
    }

    return packets;
  }

  private createPacket(
    updates: BatchFieldUpdate[],
    totalBytes: number,
    mtuBytes: number
  ): BatchPacket {
    return {
      packetId: this.nextPacketId++,
      assembledAt: new Date().toISOString(),
      updates,
      totalBytes,
      mtuBytes,
    };
  }

  /** Set the default MTU for batch packets. */
  setDefaultMTU(bytes: number): void {
    this.defaultMTUBytes = Math.max(64, bytes);
  }

  // =========================================================================
  // CRDT merge conflict logging
  // =========================================================================

  /**
   * Log a CRDT merge conflict for auditing and debugging.
   *
   * The conflict log is bounded to maxConflictLogSize entries. Oldest entries
   * are evicted when the limit is reached.
   */
  logMergeConflict(conflict: CRDTMergeConflict): void {
    this.mergeConflictLog.push(conflict);
    if (this.mergeConflictLog.length > this.maxConflictLogSize) {
      this.mergeConflictLog.shift();
    }
  }

  /**
   * Convenience method to log a conflict with minimal parameters.
   */
  recordConflict(
    fieldName: string,
    localValue: string,
    remoteValue: string,
    resolution: 'local' | 'remote' | 'merged',
    note?: string
  ): void {
    const cfg = this.fields.get(fieldName);
    if (!cfg || cfg.mode !== 'crdt' || !cfg.crdtType) return;

    this.logMergeConflict({
      fieldName,
      crdtType: cfg.crdtType,
      timestamp: new Date().toISOString(),
      localValue,
      remoteValue,
      resolution,
      note,
    });
  }

  /** Get all recorded merge conflicts. */
  getMergeConflicts(): ReadonlyArray<CRDTMergeConflict> {
    return this.mergeConflictLog;
  }

  /** Get merge conflicts for a specific field. */
  getMergeConflictsForField(fieldName: string): CRDTMergeConflict[] {
    return this.mergeConflictLog.filter((c) => c.fieldName === fieldName);
  }

  /** Clear the merge conflict log. */
  clearMergeConflictLog(): void {
    this.mergeConflictLog = [];
  }

  /** Get count of merge conflicts grouped by field name. */
  getMergeConflictCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const c of this.mergeConflictLog) {
      counts.set(c.fieldName, (counts.get(c.fieldName) ?? 0) + 1);
    }
    return counts;
  }
}

// ── Handler wrapper (auto-generated) ──
import type { TraitHandler } from './TraitTypes';

export const syncTierHandler = {
  name: 'sync_tier',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    node.__sync_tierState = { active: true, config };
    ctx.emit('sync_tier_attached', { node });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    ctx.emit('sync_tier_detached', { node });
    delete node.__sync_tierState;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    if (event.type === 'sync_tier_configure') {
      Object.assign(node.__sync_tierState?.config ?? {}, event.payload ?? {});
      ctx.emit('sync_tier_configured', { node });
    }
  },
  onUpdate(_node: any, _config: any, _ctx: any, _dt: number): void {},
} as const satisfies TraitHandler;
