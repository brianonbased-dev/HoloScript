/**
 * Data & Storage + Observability Traits — Unit Tests
 *
 * Tests DatabaseTrait, CacheTrait, StreamTrait, SnapshotTrait,
 * MigrateTrait, QueryTrait, IndexTrait, HealthcheckTrait,
 * ProfilerTrait, SLOMonitorTrait, LogAggregatorTrait, IncidentTrait.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { databaseHandler } from '../DatabaseTrait';
import { cacheHandler } from '../CacheTrait';
import { streamHandler } from '../StreamTrait';
import { snapshotHandler } from '../SnapshotTrait';
import { migrateHandler } from '../MigrateTrait';
import { queryHandler } from '../QueryTrait';
import { indexHandler } from '../IndexTrait';
import { healthcheckHandler } from '../HealthcheckTrait';
import { profilerHandler } from '../ProfilerTrait';
import { sloMonitorHandler } from '../SLOMonitorTrait';
import { logAggregatorHandler } from '../LogAggregatorTrait';
import { incidentHandler } from '../IncidentTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

// ═══════════════════════════════════════════════════════════════════════════════
// DatabaseTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('DatabaseTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => { node = createMockNode('db'); ctx = createMockContext(); });

  it('should attach and initialize state', () => {
    attachTrait(databaseHandler, node, {}, ctx);
    expect((node as any).__databaseState).toBeDefined();
  });

  it('should put and get values', () => {
    attachTrait(databaseHandler, node, {}, ctx);
    sendEvent(databaseHandler, node, {}, ctx, { type: 'database:put', key: 'k1', value: 42 });
    sendEvent(databaseHandler, node, {}, ctx, { type: 'database:get', key: 'k1' });
    const result = getLastEvent(ctx, 'database:result') as any;
    expect(result.found).toBe(true);
    expect(result.value).toBe(42);
  });

  it('should delete values', () => {
    attachTrait(databaseHandler, node, {}, ctx);
    sendEvent(databaseHandler, node, {}, ctx, { type: 'database:put', key: 'k1', value: 'v' });
    sendEvent(databaseHandler, node, {}, ctx, { type: 'database:delete', key: 'k1' });
    const result = getLastEvent(ctx, 'database:result') as any;
    expect(result.op).toBe('delete');
    expect(result.found).toBe(true);
  });

  it('should clean up on detach', () => {
    attachTrait(databaseHandler, node, {}, ctx);
    databaseHandler.onDetach!(node as any, databaseHandler.defaultConfig, ctx as any);
    expect((node as any).__databaseState).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CacheTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('CacheTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => { node = createMockNode('cache'); ctx = createMockContext(); });

  it('should cache and hit', () => {
    attachTrait(cacheHandler, node, {}, ctx);
    sendEvent(cacheHandler, node, {}, ctx, { type: 'cache:set', key: 'a', value: 1 });
    sendEvent(cacheHandler, node, {}, ctx, { type: 'cache:get', key: 'a' });
    const r = getLastEvent(ctx, 'cache:result') as any;
    expect(r.hit).toBe(true);
    expect(r.value).toBe(1);
  });

  it('should miss for unknown keys', () => {
    attachTrait(cacheHandler, node, {}, ctx);
    sendEvent(cacheHandler, node, {}, ctx, { type: 'cache:get', key: 'missing' });
    const r = getLastEvent(ctx, 'cache:result') as any;
    expect(r.hit).toBe(false);
  });

  it('should track stats', () => {
    attachTrait(cacheHandler, node, {}, ctx);
    sendEvent(cacheHandler, node, {}, ctx, { type: 'cache:set', key: 'a', value: 1 });
    sendEvent(cacheHandler, node, {}, ctx, { type: 'cache:get', key: 'a' });
    sendEvent(cacheHandler, node, {}, ctx, { type: 'cache:get', key: 'b' });
    sendEvent(cacheHandler, node, {}, ctx, { type: 'cache:get_stats' });
    const stats = getLastEvent(ctx, 'cache:stats') as any;
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('should clean up on detach', () => {
    attachTrait(cacheHandler, node, {}, ctx);
    cacheHandler.onDetach!(node as any, cacheHandler.defaultConfig, ctx as any);
    expect((node as any).__cacheState).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// StreamTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('StreamTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => { node = createMockNode('stream'); ctx = createMockContext(); });

  it('should subscribe and receive published messages', () => {
    attachTrait(streamHandler, node, {}, ctx);
    sendEvent(streamHandler, node, {}, ctx, { type: 'stream:subscribe', topic: 'events', subscriberId: 's1' });
    sendEvent(streamHandler, node, {}, ctx, { type: 'stream:publish', topic: 'events', data: { x: 1 } });
    expect(getEventCount(ctx, 'stream:message')).toBe(1);
    const msg = getLastEvent(ctx, 'stream:message') as any;
    expect(msg.data.x).toBe(1);
    expect(msg.sequence).toBe(1);
  });

  it('should clean up on detach', () => {
    attachTrait(streamHandler, node, {}, ctx);
    streamHandler.onDetach!(node as any, streamHandler.defaultConfig, ctx as any);
    expect((node as any).__streamState).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SnapshotTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('SnapshotTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => { node = createMockNode('snap'); ctx = createMockContext(); });

  it('should capture and list snapshots', () => {
    attachTrait(snapshotHandler, node, {}, ctx);
    sendEvent(snapshotHandler, node, {}, ctx, { type: 'snapshot:capture', snapshotId: 's1', data: { state: 'ok' } });
    expect(getEventCount(ctx, 'snapshot:captured')).toBe(1);
    sendEvent(snapshotHandler, node, {}, ctx, { type: 'snapshot:list' });
    const info = getLastEvent(ctx, 'snapshot:info') as any;
    expect(info.count).toBe(1);
  });

  it('should clean up on detach', () => {
    attachTrait(snapshotHandler, node, {}, ctx);
    snapshotHandler.onDetach!(node as any, snapshotHandler.defaultConfig, ctx as any);
    expect((node as any).__snapshotState).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MigrateTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('MigrateTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => { node = createMockNode('migrate'); ctx = createMockContext(); });

  it('should register and run migrations', () => {
    attachTrait(migrateHandler, node, {}, ctx);
    sendEvent(migrateHandler, node, {}, ctx, { type: 'migrate:register', version: 1, description: 'init' });
    sendEvent(migrateHandler, node, {}, ctx, { type: 'migrate:register', version: 2, description: 'add cols' });
    sendEvent(migrateHandler, node, {}, ctx, { type: 'migrate:run' });
    expect(getEventCount(ctx, 'migrate:step')).toBe(2);
    const complete = getLastEvent(ctx, 'migrate:complete') as any;
    expect(complete.stepsRun).toBe(2);
  });

  it('should clean up on detach', () => {
    attachTrait(migrateHandler, node, {}, ctx);
    migrateHandler.onDetach!(node as any, migrateHandler.defaultConfig, ctx as any);
    expect((node as any).__migrateState).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// QueryTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('QueryTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => { node = createMockNode('query'); ctx = createMockContext(); });

  it('should execute a query with limit', () => {
    attachTrait(queryHandler, node, {}, ctx);
    sendEvent(queryHandler, node, {}, ctx, { type: 'query:execute', collection: 'users', limit: 10 });
    const result = getLastEvent(ctx, 'query:result') as any;
    expect(result.collection).toBe('users');
    expect(result.limit).toBe(10);
  });

  it('should clean up on detach', () => {
    attachTrait(queryHandler, node, {}, ctx);
    queryHandler.onDetach!(node as any, queryHandler.defaultConfig, ctx as any);
    expect((node as any).__queryState).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// IndexTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('IndexTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => { node = createMockNode('idx'); ctx = createMockContext(); });

  it('should add and lookup index entries', () => {
    attachTrait(indexHandler, node, {}, ctx);
    sendEvent(indexHandler, node, {}, ctx, { type: 'index:add', indexName: 'by_name', key: 'alice', docId: 'd1' });
    sendEvent(indexHandler, node, {}, ctx, { type: 'index:add', indexName: 'by_name', key: 'alice', docId: 'd2' });
    sendEvent(indexHandler, node, {}, ctx, { type: 'index:lookup', indexName: 'by_name', key: 'alice' });
    const result = getLastEvent(ctx, 'index:result') as any;
    expect(result.docIds).toEqual(['d1', 'd2']);
  });

  it('should clean up on detach', () => {
    attachTrait(indexHandler, node, {}, ctx);
    indexHandler.onDetach!(node as any, indexHandler.defaultConfig, ctx as any);
    expect((node as any).__indexState).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HealthcheckTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('HealthcheckTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => { node = createMockNode('hc'); ctx = createMockContext(); });

  it('should register and report check status', () => {
    attachTrait(healthcheckHandler, node, { auto_interval_ms: 0 }, ctx);
    sendEvent(healthcheckHandler, node, { auto_interval_ms: 0 }, ctx, { type: 'healthcheck:register', checkId: 'db' });
    sendEvent(healthcheckHandler, node, { auto_interval_ms: 0 }, ctx, { type: 'healthcheck:check_ok', checkId: 'db' });
    sendEvent(healthcheckHandler, node, { auto_interval_ms: 0 }, ctx, { type: 'healthcheck:run' });
    const result = getLastEvent(ctx, 'healthcheck:result') as any;
    expect(result.status).toBe('healthy');
  });

  it('should clean up on detach', () => {
    attachTrait(healthcheckHandler, node, {}, ctx);
    healthcheckHandler.onDetach!(node as any, healthcheckHandler.defaultConfig, ctx as any);
    expect((node as any).__healthcheckState).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ProfilerTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('ProfilerTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => { node = createMockNode('prof'); ctx = createMockContext(); });

  it('should measure span durations', () => {
    attachTrait(profilerHandler, node, {}, ctx);
    sendEvent(profilerHandler, node, {}, ctx, { type: 'profiler:start', spanName: 'render' });
    sendEvent(profilerHandler, node, {}, ctx, { type: 'profiler:end', spanName: 'render' });
    const result = getLastEvent(ctx, 'profiler:result') as any;
    expect(result.spanName).toBe('render');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should clean up on detach', () => {
    attachTrait(profilerHandler, node, {}, ctx);
    profilerHandler.onDetach!(node as any, profilerHandler.defaultConfig, ctx as any);
    expect((node as any).__profilerState).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SLOMonitorTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('SLOMonitorTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => { node = createMockNode('slo'); ctx = createMockContext(); });

  it('should define and track SLO budget', () => {
    attachTrait(sloMonitorHandler, node, {}, ctx);
    sendEvent(sloMonitorHandler, node, {}, ctx, { type: 'slo:define', sloId: 'api', target: 0.99 });
    sendEvent(sloMonitorHandler, node, {}, ctx, { type: 'slo:record_good', sloId: 'api' });
    sendEvent(sloMonitorHandler, node, {}, ctx, { type: 'slo:record_good', sloId: 'api' });
    sendEvent(sloMonitorHandler, node, {}, ctx, { type: 'slo:get_status', sloId: 'api' });
    const status = getLastEvent(ctx, 'slo:status') as any;
    expect(status.inBudget).toBe(true);
    expect(status.actual).toBe(1);
  });

  it('should clean up on detach', () => {
    attachTrait(sloMonitorHandler, node, {}, ctx);
    sloMonitorHandler.onDetach!(node as any, sloMonitorHandler.defaultConfig, ctx as any);
    expect((node as any).__sloState).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LogAggregatorTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('LogAggregatorTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => { node = createMockNode('logs'); ctx = createMockContext(); });

  it('should write and query logs', () => {
    attachTrait(logAggregatorHandler, node, {}, ctx);
    sendEvent(logAggregatorHandler, node, {}, ctx, { type: 'log:write', level: 'info', message: 'hello', source: 'app' });
    sendEvent(logAggregatorHandler, node, {}, ctx, { type: 'log:write', level: 'error', message: 'fail', source: 'db' });
    sendEvent(logAggregatorHandler, node, {}, ctx, { type: 'log:query', level: 'error' });
    const result = getLastEvent(ctx, 'log:result') as any;
    expect(result.count).toBe(1);
    expect(result.entries[0].message).toBe('fail');
  });

  it('should clean up on detach', () => {
    attachTrait(logAggregatorHandler, node, {}, ctx);
    logAggregatorHandler.onDetach!(node as any, logAggregatorHandler.defaultConfig, ctx as any);
    expect((node as any).__logAggregatorState).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// IncidentTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('IncidentTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => { node = createMockNode('inc'); ctx = createMockContext(); });

  it('should open, acknowledge, and resolve incidents', () => {
    attachTrait(incidentHandler, node, {}, ctx);
    sendEvent(incidentHandler, node, {}, ctx, { type: 'incident:open', incidentId: 'i1', title: 'DB Down', severity: 'critical' });
    expect(getEventCount(ctx, 'incident:updated')).toBe(1);

    sendEvent(incidentHandler, node, {}, ctx, { type: 'incident:acknowledge', incidentId: 'i1' });
    expect(getEventCount(ctx, 'incident:updated')).toBe(2);

    sendEvent(incidentHandler, node, {}, ctx, { type: 'incident:resolve', incidentId: 'i1', resolution: 'Fixed connection' });
    expect(getEventCount(ctx, 'incident:updated')).toBe(3);
    const last = getLastEvent(ctx, 'incident:updated') as any;
    expect(last.status).toBe('resolved');
  });

  it('should clean up on detach', () => {
    attachTrait(incidentHandler, node, {}, ctx);
    incidentHandler.onDetach!(node as any, incidentHandler.defaultConfig, ctx as any);
    expect((node as any).__incidentState).toBeUndefined();
  });
});
