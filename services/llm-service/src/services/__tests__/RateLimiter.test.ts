import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it } from 'vitest';
import { RateLimiter } from '../RateLimiter';

const roots: string[] = [];

async function makeStorePath() {
  const root = await mkdtemp(join(tmpdir(), 'llm-rate-'));
  roots.push(root);
  return join(root, 'windows.json');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('RateLimiter', () => {
  it('shares durable counters across service instances', async () => {
    const storePath = await makeStorePath();
    let now = Date.parse('2026-05-10T12:00:00.000Z');
    const first = new RateLimiter({ requestsPerMinute: 1, requestsPerHour: 10 }, { storePath, now: () => now });
    const second = new RateLimiter({ requestsPerMinute: 1, requestsPerHour: 10 }, { storePath, now: () => now });

    await expect(first.check('user-session')).resolves.toBeNull();
    await expect(second.check('user-session')).resolves.toMatchObject({
      limited: true,
      retryAfterSeconds: 60,
    });

    now += 60_001;
    await expect(second.check('user-session')).resolves.toBeNull();

    first.destroy();
    second.destroy();
  });
});
