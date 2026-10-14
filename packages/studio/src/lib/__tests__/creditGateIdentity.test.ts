import { describe, it, expect } from 'vitest';
import { resolveStudioUser, benchmarkKeyMatches } from '../creditGateIdentity';

const noSession = async () => null;
const req = (h: Record<string, string>) => new Request('https://studio.test/api/x', { headers: h });

describe('resolveStudioUser (PR-4: no header-asserted identity)', () => {
  it('ignores a client-supplied x-user-id', async () => {
    const r = await resolveStudioUser(req({ 'x-user-id': 'victim-uuid' }), {
      getSession: noSession,
    });
    expect(r.id).toBeNull();
  });

  it('does not mint an apikey:<prefix> user from an arbitrary bearer', async () => {
    const r = await resolveStudioUser(req({ authorization: 'Bearer anything-at-all-123' }), {
      getSession: noSession,
    });
    expect(r.id).toBeNull();
  });

  it('uses the session user even when x-user-id names someone else', async () => {
    const r = await resolveStudioUser(req({ 'x-user-id': 'victim' }), {
      getSession: async () => ({ user: { id: 'alice', githubUsername: 'alice-gh' } }),
    });
    expect(r).toEqual({ id: 'alice', githubUsername: 'alice-gh' });
  });

  it('treats a throwing session provider as no identity', async () => {
    const r = await resolveStudioUser(req({}), {
      getSession: async () => {
        throw new Error('nextauth off');
      },
    });
    expect(r.id).toBeNull();
  });

  it('benchmark key must match exactly and is off when unset', () => {
    expect(benchmarkKeyMatches(req({ 'x-benchmark-key': 'k1' }), 'k1')).toBe(true);
    expect(benchmarkKeyMatches(req({ 'x-benchmark-key': 'k2' }), 'k1')).toBe(false);
    expect(benchmarkKeyMatches(req({ 'x-benchmark-key': 'k1' }), undefined)).toBe(false);
    expect(benchmarkKeyMatches(req({}), 'k1')).toBe(false);
  });
});
