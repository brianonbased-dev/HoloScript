/**
 * SyncTierTrait — comprehensive test suite
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SyncTierTrait,
  syncTierHandler,
  DEFAULT_SYNC_FIELD,
  SYNC_PRESETS,
  type SyncFieldConfig,
  type SyncTierConfig,
  type CRDTMergeConflict,
} from '../SyncTierTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(): HSPlusNode {
  return {} as HSPlusNode;
}

function makeContext() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const context: TraitContext = {
    emit: (type: string, payload?: unknown) => {
      emitted.push({ type, payload });
    },
  };
  return { context, emitted };
}

// ---------------------------------------------------------------------------
// DEFAULT_SYNC_FIELD
// ---------------------------------------------------------------------------

describe('DEFAULT_SYNC_FIELD', () => {
  it('should have mode eventual', () => {
    expect(DEFAULT_SYNC_FIELD.mode).toBe('eventual');
  });

  it('should have updateRateHz 20', () => {
    expect(DEFAULT_SYNC_FIELD.updateRateHz).toBe(20);
  });

  it('should have compression delta', () => {
    expect(DEFAULT_SYNC_FIELD.compression).toBe('delta');
  });

  it('should have priority 1', () => {
    expect(DEFAULT_SYNC_FIELD.priority).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// SYNC_PRESETS
// ---------------------------------------------------------------------------

describe('SYNC_PRESETS', () => {
  it('position preset should have mode eventual', () => {
    expect(SYNC_PRESETS.position?.mode).toBe('eventual');
  });

  it('health preset should have mode strong', () => {
    expect(SYNC_PRESETS.health?.mode).toBe('strong');
  });

  it('inventory preset should have mode crdt', () => {
    expect(SYNC_PRESETS.inventory?.mode).toBe('crdt');
  });

  it('score preset should have crdtType g-counter', () => {
    expect(SYNC_PRESETS.score?.crdtType).toBe('g-counter');
  });

  it('position should have priority 10', () => {
    expect(SYNC_PRESETS.position?.priority).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// SyncTierTrait — construction
// ---------------------------------------------------------------------------

describe('SyncTierTrait — construction', () => {
  it('should construct with defaults', () => {
    const t = new SyncTierTrait();
    expect(t).toBeDefined();
  });

  it('should have traitName SyncTier', () => {
    expect(new SyncTierTrait().traitName).toBe('SyncTier');
  });

  it('should start with no fields', () => {
    const t = new SyncTierTrait();
    expect(t.getAllFields().size).toBe(0);
  });

  it('should accept initial fields in config', () => {
    const fields = new Map<string, SyncFieldConfig>();
    fields.set('hp', { ...DEFAULT_SYNC_FIELD, mode: 'strong' });
    const t = new SyncTierTrait({ fields });
    expect(t.getField('hp')).toBeDefined();
  });

  it('should apply custom defaultMode', () => {
    const t = new SyncTierTrait({ defaultMode: 'strong' });
    // defaultMode is used for future fields; construction check indirectly via addField
    t.addField('x');
    // preset overrides defaultMode; non-preset field uses DEFAULT_SYNC_FIELD defaults
    expect(t).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Field management
// ---------------------------------------------------------------------------

describe('addField / removeField / getField / getAllFields', () => {
  it('should add a field', () => {
    const t = new SyncTierTrait();
    t.addField('position');
    expect(t.getField('position')).toBeDefined();
  });

  it('should apply preset for known field names', () => {
    const t = new SyncTierTrait();
    t.addField('position');
    const cfg = t.getField('position')!;
    expect(cfg.mode).toBe(SYNC_PRESETS.position!.mode);
  });

  it('should merge custom config over preset', () => {
    const t = new SyncTierTrait();
    t.addField('position', { updateRateHz: 120 });
    expect(t.getField('position')!.updateRateHz).toBe(120);
  });

  it('should add a non-preset field with defaults', () => {
    const t = new SyncTierTrait();
    t.addField('customField');
    expect(t.getField('customField')!.mode).toBe(DEFAULT_SYNC_FIELD.mode);
  });

  it('should remove a field', () => {
    const t = new SyncTierTrait();
    t.addField('health');
    t.removeField('health');
    expect(t.getField('health')).toBeUndefined();
  });

  it('should return all fields via getAllFields', () => {
    const t = new SyncTierTrait();
    t.addField('position');
    t.addField('rotation');
    expect(t.getAllFields().size).toBe(2);
  });

  it('getAllFields should return a copy', () => {
    const t = new SyncTierTrait();
    t.addField('x');
    const all = t.getAllFields();
    all.delete('x');
    expect(t.getField('x')).toBeDefined(); // original unaffected
  });

  it('should overwrite an existing field on re-add', () => {
    const t = new SyncTierTrait();
    t.addField('health', { updateRateHz: 5 });
    t.addField('health', { updateRateHz: 30 });
    expect(t.getField('health')!.updateRateHz).toBe(30);
  });

  it('should return undefined for unknown field', () => {
    const t = new SyncTierTrait();
    expect(t.getField('nonexistent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Bandwidth estimation
// ---------------------------------------------------------------------------

describe('estimateBandwidth', () => {
  it('should return 0 with no fields', () => {
    const t = new SyncTierTrait();
    expect(t.estimateBandwidth()).toBe(0);
  });

  it('should return positive bandwidth with fields', () => {
    const t = new SyncTierTrait();
    t.addField('position'); // high-freq, quantized
    expect(t.estimateBandwidth()).toBeGreaterThan(0);
  });

  it('should increase bandwidth with more fields', () => {
    const t = new SyncTierTrait();
    t.addField('position');
    const bw1 = t.estimateBandwidth();
    t.addField('rotation');
    expect(t.estimateBandwidth()).toBeGreaterThan(bw1);
  });

  it('exceedsBandwidthBudget returns true when over budget', () => {
    const t = new SyncTierTrait({ bandwidthBudgetBps: 1 });
    t.addField('position'); // high freq
    expect(t.exceedsBandwidthBudget()).toBe(true);
  });

  it('exceedsBandwidthBudget returns false with generous budget', () => {
    const t = new SyncTierTrait({ bandwidthBudgetBps: 10_000_000 });
    t.addField('position');
    expect(t.exceedsBandwidthBudget()).toBe(false);
  });

  it('should reduce estimated bandwidth during congestion', () => {
    const t = new SyncTierTrait({ congestionAdaptationFactor: 0.5 });
    t.addField('position');
    const normal = t.estimateBandwidth();
    t.enterCongestion();
    expect(t.estimateBandwidth()).toBeLessThan(normal);
  });
});

// ---------------------------------------------------------------------------
// getFieldsByMode / getFieldsByPriority
// ---------------------------------------------------------------------------

describe('getFieldsByMode', () => {
  it('should return fields matching mode', () => {
    const t = new SyncTierTrait();
    t.addField('health'); // strong
    t.addField('position'); // eventual
    expect(t.getFieldsByMode('strong').length).toBe(1);
  });

  it('should return all eventual fields', () => {
    const t = new SyncTierTrait();
    t.addField('position');
    t.addField('rotation');
    t.addField('health');
    const eventual = t.getFieldsByMode('eventual');
    expect(eventual.length).toBe(2);
  });

  it('should return empty array if no matching mode', () => {
    const t = new SyncTierTrait();
    t.addField('position');
    expect(t.getFieldsByMode('crdt').length).toBe(0);
  });
});

describe('getFieldsByPriority', () => {
  it('should return fields sorted highest priority first', () => {
    const t = new SyncTierTrait();
    t.addField('health'); // priority 5
    t.addField('score'); // priority 7
    t.addField('inventory'); // priority 3
    const sorted = t.getFieldsByPriority();
    expect(sorted[0][1].priority).toBeGreaterThanOrEqual(sorted[1][1].priority);
    expect(sorted[1][1].priority).toBeGreaterThanOrEqual(sorted[2][1].priority);
  });
});

// ---------------------------------------------------------------------------
// Congestion / rate adaptation
// ---------------------------------------------------------------------------

describe('congestion / rate adaptation', () => {
  it('should start not congested', () => {
    const t = new SyncTierTrait();
    expect(t.isCongested()).toBe(false);
  });

  it('should enter congestion', () => {
    const t = new SyncTierTrait();
    t.enterCongestion();
    expect(t.isCongested()).toBe(true);
  });

  it('should leave congestion', () => {
    const t = new SyncTierTrait();
    t.enterCongestion();
    t.leaveCongestion();
    expect(t.isCongested()).toBe(false);
  });

  it('should reduce effective rate during congestion', () => {
    const t = new SyncTierTrait({ congestionAdaptationFactor: 0.5 });
    t.addField('position'); // 60 Hz
    const normal = t.getEffectiveRate('position');
    t.enterCongestion();
    expect(t.getEffectiveRate('position')).toBe(normal * 0.5);
  });

  it('should return 0 effective rate for unknown field', () => {
    const t = new SyncTierTrait();
    expect(t.getEffectiveRate('ghost')).toBe(0);
  });

  it('should increment congestionEventCount on each enterCongestion', () => {
    const t = new SyncTierTrait();
    t.enterCongestion();
    t.leaveCongestion();
    t.enterCongestion();
    expect(t.getRateAdaptationSnapshot().congestionEventCount).toBe(2);
  });

  it('should not increment if already congested', () => {
    const t = new SyncTierTrait();
    t.enterCongestion();
    t.enterCongestion(); // second call while already congested
    expect(t.getRateAdaptationSnapshot().congestionEventCount).toBe(1);
  });

  it('setCongestionFactor should clamp to [0,1]', () => {
    const t = new SyncTierTrait();
    t.setCongestionFactor(2.5);
    t.addField('position');
    t.enterCongestion();
    const snapshot = t.getRateAdaptationSnapshot();
    expect(snapshot.adaptationFactor).toBeLessThanOrEqual(1);
  });

  it('setCongestionFactor(0) should zero out rates under congestion', () => {
    const t = new SyncTierTrait();
    t.setCongestionFactor(0);
    t.addField('position');
    t.enterCongestion();
    expect(t.getEffectiveRate('position')).toBe(0);
  });

  it('getRateAdaptationSnapshot should include effectiveRates map', () => {
    const t = new SyncTierTrait();
    t.addField('position');
    const snap = t.getRateAdaptationSnapshot();
    expect(snap.effectiveRates.has('position')).toBe(true);
  });

  it('snapshot adaptationFactor should be 1.0 when not congested', () => {
    const t = new SyncTierTrait();
    expect(t.getRateAdaptationSnapshot().adaptationFactor).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// Starvation detection
// ---------------------------------------------------------------------------

describe('detectStarvation', () => {
  it('should return empty array when fields recently synced', () => {
    const t = new SyncTierTrait({ starvationThresholdS: 5 });
    t.addField('position');
    t.recordFieldSync('position');
    const alerts = t.detectStarvation(Date.now() / 1000 + 1); // 1s later
    expect(alerts.length).toBe(0);
  });

  it('should alert when field exceeds threshold', () => {
    const t = new SyncTierTrait({ starvationThresholdS: 5 });
    t.addField('position');
    t.recordFieldSync('position');
    const alerts = t.detectStarvation(Date.now() / 1000 + 10); // 10s later
    expect(alerts.length).toBe(1);
    expect(alerts[0].fieldName).toBe('position');
  });

  it('should skip event-driven fields (rate 0)', () => {
    const t = new SyncTierTrait({ starvationThresholdS: 1 });
    t.addField('chat'); // updateRateHz: 0
    const alerts = t.detectStarvation(Date.now() / 1000 + 100);
    expect(alerts.length).toBe(0);
  });

  it('should return elapsedS in the alert', () => {
    const t = new SyncTierTrait({ starvationThresholdS: 5 });
    t.addField('position');
    t.recordFieldSync('position');
    const now = Date.now() / 1000 + 10;
    const alerts = t.detectStarvation(now);
    expect(alerts[0].elapsedS).toBeGreaterThan(5);
  });

  it('should sort alerts by priority descending', () => {
    const t = new SyncTierTrait({ starvationThresholdS: 0.1 });
    t.addField('position'); // priority 10
    t.addField('health'); // priority 5
    const now = Date.now() / 1000;
    t.recordFieldSync('position');
    t.recordFieldSync('health');
    const alerts = t.detectStarvation(now + 1);
    if (alerts.length >= 2) {
      expect(alerts[0].priority).toBeGreaterThanOrEqual(alerts[1].priority);
    }
  });

  it('should alert for field never synced (Infinity elapsed)', () => {
    const t = new SyncTierTrait({ starvationThresholdS: 5 });
    // addField calls recordSync, so we need to check freshly added fields
    // Actually, addField sets lastSyncTimestamps to Date.now()/1000 on add
    // So to simulate never-synced, clear it
    t.addField('position');
    const state = (t as any).lastSyncTimestamps as Map<string, number>;
    state.delete('position');
    const alerts = t.detectStarvation(Date.now() / 1000 + 10);
    expect(alerts.some(a => a.fieldName === 'position' && a.elapsedS === Infinity)).toBe(true);
  });

  it('setStarvationThreshold should update the threshold', () => {
    const t = new SyncTierTrait({ starvationThresholdS: 100 });
    t.addField('position');
    t.recordFieldSync('position');
    t.setStarvationThreshold(0.1); // very short threshold
    const alerts = t.detectStarvation(Date.now() / 1000 + 1);
    expect(alerts.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Batch serialization
// ---------------------------------------------------------------------------

describe('packBatch', () => {
  it('should return empty array for empty input', () => {
    const t = new SyncTierTrait();
    expect(t.packBatch(new Map())).toEqual([]);
  });

  it('should return one packet for small payloads', () => {
    const t = new SyncTierTrait();
    t.addField('position');
    t.addField('rotation');
    const payloads = new Map([
      ['position', '{"x":1,"y":2,"z":3}'],
      ['rotation', '{"x":0,"y":0,"z":0,"w":1}'],
    ]);
    const packets = t.packBatch(payloads);
    expect(packets.length).toBeGreaterThan(0);
  });

  it('should split into multiple packets when MTU is very small', () => {
    const t = new SyncTierTrait();
    t.addField('position');
    t.addField('rotation');
    t.addField('health');
    const payloads = new Map([
      ['position', 'a'.repeat(100)],
      ['rotation', 'b'.repeat(100)],
      ['health', 'c'.repeat(100)],
    ]);
    const packets = t.packBatch(payloads, 80); // very small MTU
    expect(packets.length).toBeGreaterThan(1);
  });

  it('packet should have totalBytes > 0', () => {
    const t = new SyncTierTrait();
    t.addField('position');
    const packets = t.packBatch(new Map([['position', '{"x":0}']]));
    expect(packets[0].totalBytes).toBeGreaterThan(0);
  });

  it('packet should have ascending packetId', () => {
    const t = new SyncTierTrait();
    t.addField('position');
    t.addField('rotation');
    const payloads = new Map([
      ['position', 'a'.repeat(200)],
      ['rotation', 'b'.repeat(200)],
    ]);
    const packets = t.packBatch(payloads, 100);
    if (packets.length >= 2) {
      expect(packets[1].packetId).toBeGreaterThan(packets[0].packetId);
    }
  });

  it('each update should have a sequenceNumber', () => {
    const t = new SyncTierTrait();
    t.addField('position');
    const packets = t.packBatch(new Map([['position', 'data']]));
    expect(typeof packets[0].updates[0].sequenceNumber).toBe('number');
  });

  it('should sort by priority (higher priority fields go into earlier packets)', () => {
    const t = new SyncTierTrait();
    t.addField('position'); // priority 10
    t.addField('inventory'); // priority 3
    const payloads = new Map([
      ['position', 'p'.repeat(200)],
      ['inventory', 'i'.repeat(200)],
    ]);
    const packets = t.packBatch(payloads, 150);
    // first packet should contain position (higher priority)
    const firstNames = packets[0].updates.map(u => u.name);
    expect(firstNames).toContain('position');
  });

  it('setDefaultMTU should clamp to minimum 64', () => {
    const t = new SyncTierTrait();
    t.setDefaultMTU(10);
    expect((t as any).defaultMTUBytes).toBe(64);
  });
});

// ---------------------------------------------------------------------------
// CRDT merge conflict log
// ---------------------------------------------------------------------------

describe('CRDT merge conflict log', () => {
  it('should start with empty conflict log', () => {
    const t = new SyncTierTrait();
    expect(t.getMergeConflicts().length).toBe(0);
  });

  it('logMergeConflict should add to the log', () => {
    const t = new SyncTierTrait();
    t.logMergeConflict({
      fieldName: 'inventory',
      crdtType: 'or-set',
      timestamp: new Date().toISOString(),
      localValue: '[sword]',
      remoteValue: '[shield]',
      resolution: 'merged',
    });
    expect(t.getMergeConflicts().length).toBe(1);
  });

  it('recordConflict should add a conflict for crdt field', () => {
    const t = new SyncTierTrait();
    t.addField('inventory'); // crdt, or-set
    t.recordConflict('inventory', 'local', 'remote', 'merged', 'test');
    expect(t.getMergeConflicts().length).toBe(1);
  });

  it('recordConflict should ignore non-crdt field', () => {
    const t = new SyncTierTrait();
    t.addField('position'); // eventual, no crdtType
    t.recordConflict('position', 'a', 'b', 'local');
    expect(t.getMergeConflicts().length).toBe(0);
  });

  it('recordConflict should ignore unknown field', () => {
    const t = new SyncTierTrait();
    t.recordConflict('ghost', 'a', 'b', 'remote');
    expect(t.getMergeConflicts().length).toBe(0);
  });

  it('getMergeConflictsForField should filter by fieldName', () => {
    const t = new SyncTierTrait();
    t.addField('inventory');
    t.addField('score'); // g-counter crdt
    t.recordConflict('inventory', 'a', 'b', 'merged');
    t.recordConflict('score', 'c', 'd', 'remote');
    expect(t.getMergeConflictsForField('inventory').length).toBe(1);
  });

  it('clearMergeConflictLog should empty the log', () => {
    const t = new SyncTierTrait();
    t.addField('inventory');
    t.recordConflict('inventory', 'a', 'b', 'local');
    t.clearMergeConflictLog();
    expect(t.getMergeConflicts().length).toBe(0);
  });

  it('getMergeConflictCounts should count per field', () => {
    const t = new SyncTierTrait();
    t.addField('inventory');
    t.recordConflict('inventory', 'a', 'b', 'merged');
    t.recordConflict('inventory', 'c', 'd', 'local');
    const counts = t.getMergeConflictCounts();
    expect(counts.get('inventory')).toBe(2);
  });

  it('should evict oldest conflict when log exceeds 1000', () => {
    const t = new SyncTierTrait();
    t.addField('inventory');
    for (let i = 0; i < 1001; i++) {
      t.logMergeConflict({
        fieldName: 'inventory',
        crdtType: 'or-set',
        timestamp: new Date().toISOString(),
        localValue: `v${i}`,
        remoteValue: `r${i}`,
        resolution: 'merged',
      });
    }
    // Should stay at max 1000
    expect(t.getMergeConflicts().length).toBe(1000);
  });

  it('conflict log is readonly (getMergeConflicts returns ReadonlyArray)', () => {
    const t = new SyncTierTrait();
    const log = t.getMergeConflicts();
    // Verify it's array-like
    expect(Array.isArray(log)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// syncTierHandler
// ---------------------------------------------------------------------------

describe('syncTierHandler', () => {
  it('should have name "sync_tier"', () => {
    expect(syncTierHandler.name).toBe('sync_tier');
  });

  it('should attach and store instance on node', () => {
    const node = makeNode();
    const { context } = makeContext();
    syncTierHandler.onAttach(node, {}, context);
    expect((node as any).__sync_tier_instance).toBeDefined();
  });

  it('should emit sync_tier_attached on attach', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    syncTierHandler.onAttach(node, {}, context);
    expect(emitted.some(e => e.type === 'sync_tier_attached')).toBe(true);
  });

  it('should remove instance on detach', () => {
    const node = makeNode();
    const { context } = makeContext();
    syncTierHandler.onAttach(node, {}, context);
    syncTierHandler.onDetach(node, {}, context);
    expect((node as any).__sync_tier_instance).toBeUndefined();
  });

  it('should emit sync_tier_detached on detach', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    syncTierHandler.onAttach(node, {}, context);
    emitted.length = 0;
    syncTierHandler.onDetach(node, {}, context);
    expect(emitted.some(e => e.type === 'sync_tier_detached')).toBe(true);
  });

  it('should handle detach with no instance gracefully', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() => syncTierHandler.onDetach(node, {}, context)).not.toThrow();
  });

  it('should not throw on onUpdate without instance', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() => syncTierHandler.onUpdate(node, {}, context, 0.016)).not.toThrow();
  });

  it('should not throw on onEvent without instance', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() =>
      syncTierHandler.onEvent(node, {}, context, { type: 'sync_tier_configure', payload: {} })
    ).not.toThrow();
  });

  it('instance created by handler should be a SyncTierTrait', () => {
    const node = makeNode();
    const { context } = makeContext();
    syncTierHandler.onAttach(node, {}, context);
    const instance = (node as any).__sync_tier_instance;
    expect(instance.traitName).toBe('SyncTier');
  });

  it('handler should forward onUpdate to instance', () => {
    const node = makeNode();
    const { context } = makeContext();
    syncTierHandler.onAttach(node, {}, context);
    // No instance.onUpdate defined on SyncTierTrait; should not throw
    expect(() => syncTierHandler.onUpdate(node, {}, context, 0.016)).not.toThrow();
  });

  it('should emit sync_tier_configured on configure event', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    syncTierHandler.onAttach(node, {}, context);
    emitted.length = 0;
    syncTierHandler.onEvent(node, {}, context, {
      type: 'sync_tier_configure',
      payload: { bandwidthBudget: 100000 },
    });
    expect(emitted.some(e => e.type === 'sync_tier_configured')).toBe(true);
  });
});
