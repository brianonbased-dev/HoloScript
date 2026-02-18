/**
 * AuditQuery (AuditQueryBuilder) Production Tests
 *
 * Fluent builder: tenant/actor/actorType/action/resource/resourceId/outcome/since/until/limit/offset/build.
 */

import { describe, it, expect } from 'vitest';
import { AuditQuery } from '../AuditQueryBuilder';

describe('AuditQuery — Production', () => {
  it('builds empty filter', () => {
    const filter = new AuditQuery().build();
    expect(filter).toEqual({});
  });

  it('chains tenant + actor + action', () => {
    const filter = new AuditQuery().tenant('t1').actor('user1').action('compile').build();
    expect(filter.tenantId).toBe('t1');
    expect(filter.actorId).toBe('user1');
    expect(filter.action).toBe('compile');
  });

  it('actorType', () => {
    const filter = new AuditQuery().actorType('agent').build();
    expect(filter.actorType).toBe('agent');
  });

  it('resource + resourceId', () => {
    const filter = new AuditQuery().resource('file').resourceId('abc').build();
    expect(filter.resource).toBe('file');
    expect(filter.resourceId).toBe('abc');
  });

  it('outcome', () => {
    const filter = new AuditQuery().outcome('denied').build();
    expect(filter.outcome).toBe('denied');
  });

  it('since / until', () => {
    const d1 = new Date('2026-01-01');
    const d2 = new Date('2026-02-01');
    const filter = new AuditQuery().since(d1).until(d2).build();
    expect(filter.since).toEqual(d1);
    expect(filter.until).toEqual(d2);
  });

  it('limit + offset', () => {
    const filter = new AuditQuery().limit(50).offset(10).build();
    expect(filter.limit).toBe(50);
    expect(filter.offset).toBe(10);
  });

  it('full chain', () => {
    const filter = new AuditQuery()
      .tenant('t1')
      .actor('user1')
      .actorType('user')
      .action('login')
      .resource('session')
      .resourceId('sess-123')
      .outcome('success')
      .since(new Date('2026-01-01'))
      .until(new Date('2026-02-01'))
      .limit(100)
      .offset(0)
      .build();
    expect(Object.keys(filter)).toHaveLength(11);
  });

  it('build returns a copy (immutable)', () => {
    const qb = new AuditQuery().tenant('t1');
    const f1 = qb.build();
    const f2 = qb.actor('user2').build();
    // f1 should not have actorId since build() returns a spread copy
    expect(f1.actorId).toBeUndefined();
    expect(f2.actorId).toBe('user2');
  });
});
