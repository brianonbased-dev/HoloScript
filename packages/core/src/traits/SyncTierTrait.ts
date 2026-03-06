/**
 * @sync Tier Annotations - Per-field network synchronization mode control
 * Supports strong/eventual/CRDT consistency, update rate, and compression.
 * @version 1.0.0
 */
export type SyncMode = 'strong' | 'eventual' | 'crdt';
export type CompressionMode = 'none' | 'delta' | 'quantized' | 'lz4';
export interface SyncFieldConfig {
  mode: SyncMode; updateRateHz: number; compression: CompressionMode;
  priority: number; interpolation: 'none' | 'linear' | 'hermite';
  crdtType?: 'lww-register' | 'g-counter' | 'or-set';
  maxLatencyMs: number; jitterBufferMs: number;
}
export const DEFAULT_SYNC_FIELD: SyncFieldConfig = {
  mode: 'eventual', updateRateHz: 20, compression: 'delta', priority: 1,
  interpolation: 'linear', maxLatencyMs: 200, jitterBufferMs: 50,
};
export const SYNC_PRESETS: Record<string, Partial<SyncFieldConfig>> = {
  'position': { mode: 'eventual', updateRateHz: 60, compression: 'quantized', interpolation: 'hermite', priority: 10 },
  'rotation': { mode: 'eventual', updateRateHz: 60, compression: 'quantized', interpolation: 'hermite', priority: 10 },
  'health': { mode: 'strong', updateRateHz: 10, compression: 'none', priority: 5 },
  'inventory': { mode: 'crdt', updateRateHz: 1, compression: 'lz4', crdtType: 'or-set', priority: 3 },
  'score': { mode: 'crdt', updateRateHz: 5, compression: 'none', crdtType: 'g-counter', priority: 7 },
  'chat': { mode: 'strong', updateRateHz: 0, compression: 'lz4', priority: 2 },
  'animation': { mode: 'eventual', updateRateHz: 30, compression: 'delta', interpolation: 'linear', priority: 8 },
};
export interface SyncTierConfig { fields: Map<string, SyncFieldConfig>; defaultMode: SyncMode; bandwidthBudgetBps: number; }
export class SyncTierTrait {
  public readonly traitName = 'SyncTier';
  private fields: Map<string, SyncFieldConfig> = new Map();
  private defaultMode: SyncMode; private bandwidthBudget: number;
  constructor(config: Partial<SyncTierConfig> = {}) {
    this.defaultMode = config.defaultMode ?? 'eventual';
    this.bandwidthBudget = config.bandwidthBudgetBps ?? 50000;
    if (config.fields) for (const [k,v] of config.fields) this.fields.set(k, v);
  }
  addField(name: string, config: Partial<SyncFieldConfig> = {}): void {
    const preset = SYNC_PRESETS[name];
    this.fields.set(name, { ...DEFAULT_SYNC_FIELD, ...preset, ...config });
  }
  removeField(name: string): void { this.fields.delete(name); }
  getField(name: string): SyncFieldConfig | undefined { return this.fields.get(name); }
  getAllFields(): Map<string, SyncFieldConfig> { return new Map(this.fields); }
  estimateBandwidth(): number {
    let bps = 0;
    for (const [, cfg] of this.fields) {
      const baseSize = cfg.compression === 'none' ? 32 : cfg.compression === 'delta' ? 8 : cfg.compression === 'quantized' ? 4 : 16;
      bps += baseSize * 8 * cfg.updateRateHz;
    }
    return bps;
  }
  exceedsBandwidthBudget(): boolean { return this.estimateBandwidth() > this.bandwidthBudget; }
  getFieldsByMode(mode: SyncMode): [string, SyncFieldConfig][] {
    return [...this.fields.entries()].filter(([,c]) => c.mode === mode);
  }
  getFieldsByPriority(): [string, SyncFieldConfig][] {
    return [...this.fields.entries()].sort(([,a],[,b]) => b.priority - a.priority);
  }
}
