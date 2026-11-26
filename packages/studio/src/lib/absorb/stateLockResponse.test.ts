import { describe, expect, it } from 'vitest';
import { AbsorbStateLockTimeoutError } from './projectState';
import { withAbsorbStateLock503 } from './stateLockResponse';

describe('withAbsorbStateLock503', () => {
  it('turns a lock timeout into 503 + Retry-After', async () => {
    const res = await withAbsorbStateLock503(async () => {
      throw new AbsorbStateLockTimeoutError(3);
    })();
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('3');
  });

  it('rethrows any other error', async () => {
    await expect(
      withAbsorbStateLock503(async () => {
        throw new Error('boom');
      })()
    ).rejects.toThrow('boom');
  });
});
