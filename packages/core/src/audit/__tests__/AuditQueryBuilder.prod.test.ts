/**
 * AuditQueryBuilder Production Tests
 *
 * Fluent builder: tenant, actor, actorType, action, resource, resourceId,
 * outcome, since, until, limit, offset, build.
 */

import { describe, it, expect } from 'vitest';
import { AuditQuery } from '../AuditQueryBuilder';

describe('AuditQuery — Production', () => {
  it('builds empty filter', () => {
    expect(new AuditQuery().build()).toEqual({});
  });

  it('chains all filters', () => {
    const since = new Date('2026-01-01');
    const until = new Date('2026-02-01');
    const filter = new AuditQuery()
      .tenant('t1')
      .actor('user1')
      .actorType('user')
      .action('compile')
      .resource('script')
      .resourceId('r123')
      .outcome('success')
      .since(since)
      .until(until)
      .limit(100)
      .offset(10)
      .build();

    expect(filter.tenantId).toBe('t1');
    expect(filter.actorId).toBe('user1');
    expect(filter.actorType).toBe('user');
    expect(filter.action).toBe('compile');
    expect(filter.resource).toBe('script');
    expect(filter.resourceId).toBe('r123');
    expect(filter.outcome).toBe('success');
    expect(filter.since).toBe(since);
    expect(filter.until).toBe(until);
    expect(filter.limit).toBe(100);
    expect(filter.offset).toBe(10);
  });

  it('partial filters', () => {
    const filter = new AuditQuery().tenant('t1').outcome('failure').build();
    expect(filter.tenantId).toBe('t1');
    expect(filter.outcome).toBe('failure');
    expect(filter.actorId).toBeUndefined();
  });

  it('returns copy (immutable)', () => {
    const q = new AuditQuery().tenant('t1');
    const f1 = q.build();
    const f2 = q.build();
    expect(f1).toEqual(f2);
    expect(f1).not.toBe(f2);
  });
});
