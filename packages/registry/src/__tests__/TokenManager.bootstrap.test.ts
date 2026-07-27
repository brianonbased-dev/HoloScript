import { describe, expect, it } from 'vitest';

import { TokenManager } from '../auth/TokenManager.js';

describe('TokenManager deployment bootstrap', () => {
  it('registers an exact externally managed token without retaining the raw secret', () => {
    const manager = new TokenManager();
    const rawToken = 'hls_external_deployment_secret';
    const record = manager.register(rawToken, {
      name: 'bootstrap-admin',
      orgScope: 'holoscript',
      permissions: ['admin'],
    });

    expect(record.token).not.toBe(rawToken);
    expect(record.token).toMatch(/^[0-9a-f]{64}$/);
    expect(manager.validate(rawToken)).toMatchObject({
      valid: true,
      record: {
        id: record.id,
        orgScope: 'holoscript',
        permissions: ['admin'],
      },
    });
    expect(manager.hasPermission(record, 'publish')).toBe(true);
  });

  it('accepts the same environment token after a process restart', () => {
    const rawToken = 'hls_stable_across_restart';
    const first = new TokenManager();
    const firstRecord = first.register(rawToken, {
      name: 'bootstrap-admin',
      orgScope: 'holoscript',
      permissions: ['admin'],
    });
    const restarted = new TokenManager();
    const restartedRecord = restarted.register(rawToken, {
      name: 'bootstrap-admin',
      orgScope: 'holoscript',
      permissions: ['admin'],
    });

    expect(restartedRecord.id).toBe(firstRecord.id);
    expect(restarted.validate(rawToken).valid).toBe(true);
  });

  it('rejects an empty externally managed token', () => {
    const manager = new TokenManager();
    expect(() =>
      manager.register('  ', {
        name: 'bootstrap-admin',
        orgScope: 'holoscript',
        permissions: ['admin'],
      })
    ).toThrow('Raw token is required');
  });
});
