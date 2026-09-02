import { describe, it, expect, vi } from 'vitest';
import {
  createHoloKeydSource,
  hydrateFromHoloKeyd,
  hydrateFromHoloKeydSync,
} from '../holokeyd-source';
import { createServiceSecretResolver } from '../service-secret-resolver';

const HOST = { HOLOKEYD_HOST: 'holojetson.local' };
const silent = () => {};

/** A fake spawn: answers from a map, and records what it was asked. */
function fakeRun(answers: Record<string, string>) {
  const calls: string[] = [];
  const run = vi.fn(async (_args: readonly string[], input: string) => {
    const name = input.trim();
    calls.push(name);
    if (!(name in answers)) return '';
    return `${answers[name]}\n`;
  });
  return { run, calls };
}

/** A fake spawn that fails the way an unreachable host does. */
function deadRun(code: unknown = 255) {
  const calls: string[] = [];
  const run = vi.fn(async (_args: readonly string[], input: string) => {
    calls.push(input.trim());
    throw Object.assign(new Error('ssh: connect failed'), { code });
  });
  return { run, calls };
}

describe('createHoloKeydSource — the flag gate', () => {
  it('is OFF when HOLOKEYD_HOST is unset, so unconfigured deploys are unchanged', () => {
    expect(createHoloKeydSource({ env: {} })).toBeNull();
  });

  it('is OFF for a malformed host rather than passing it to argv', () => {
    expect(createHoloKeydSource({ env: { HOLOKEYD_HOST: 'evil host; rm -rf /' } })).toBeNull();
  });

  it('is ON once a well-formed host is configured', () => {
    const s = createHoloKeydSource({ env: HOST });
    expect(s).not.toBeNull();
    expect(s!.id).toBe('holokeyd://holojetson.local');
  });
});

describe('createHoloKeydSource — resolution', () => {
  it('returns the value the device hands back', async () => {
    const { run } = fakeRun({ OPENROUTER_API_KEY: 'sk-or-test' });
    const s = createHoloKeydSource({ env: HOST, run })!;
    await expect(s.resolve('OPENROUTER_API_KEY')).resolves.toBe('sk-or-test');
  });

  it('caches, so N reads cost one round trip', async () => {
    const { run } = fakeRun({ A_KEY: 'v' });
    const s = createHoloKeydSource({ env: HOST, run })!;
    await s.resolve('A_KEY');
    await s.resolve('A_KEY');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rejects a name that is not a plain secret name WITHOUT spawning', async () => {
    const { run } = fakeRun({});
    const s = createHoloKeydSource({ env: HOST, run })!;
    await expect(s.resolve('A KEY; cat /etc/shadow')).resolves.toBeUndefined();
    await expect(s.resolve('')).resolves.toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it('returns undefined — not a throw — when the device does not hold the name', async () => {
    const { run } = fakeRun({ PRESENT: 'v' });
    const s = createHoloKeydSource({ env: HOST, run })!;
    await expect(s.resolve('ABSENT')).resolves.toBeUndefined();
  });
});

describe('createHoloKeydSource — a dead host costs ONE timeout, not one per secret', () => {
  it('stops spawning after the host proves unreachable', async () => {
    const { run } = deadRun(255);
    const s = createHoloKeydSource({ env: HOST, run })!;
    expect(s.reachable()).toBe(true);
    await s.resolve('ONE');
    expect(s.reachable()).toBe(false);
    await s.resolve('TWO');
    await s.resolve('THREE');
    // Without this, hydrating twelve names behind a downed Jetson would stall for minutes.
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does NOT disable the source when a single name merely comes back empty', async () => {
    const { run } = fakeRun({ SECOND: 'v' });
    const s = createHoloKeydSource({ env: HOST, run })!;
    await expect(s.resolve('FIRST')).resolves.toBeUndefined();
    expect(s.reachable()).toBe(true);
    await expect(s.resolve('SECOND')).resolves.toBe('v');
  });
});

describe('createServiceSecretResolver — ordering is vault, then env, then holokeyd', () => {
  it('leaves behavior UNCHANGED while the plaintext still exists', async () => {
    const { run } = fakeRun({ OPENROUTER_API_KEY: 'from-device' });
    const r = createServiceSecretResolver({
      env: { ...HOST, OPENROUTER_API_KEY: 'from-env' },
      vault: null,
      remoteSource: createHoloKeydSource({ env: HOST, run }),
      log: silent,
    });
    // env wins: putting the device ahead of env would silently change which value
    // every already-configured secret resolves to.
    await expect(r.resolve('OPENROUTER_API_KEY')).resolves.toBe('from-env');
    expect(run).not.toHaveBeenCalled();
  });

  it('BRIDGES: resolves from the device once the plaintext is deleted', async () => {
    const { run } = fakeRun({ OPENROUTER_API_KEY: 'from-device' });
    const r = createServiceSecretResolver({
      env: { ...HOST }, // no OPENROUTER_API_KEY — the post-migration state
      vault: null,
      remoteSource: createHoloKeydSource({ env: HOST, run }),
      log: silent,
    });
    await expect(r.resolve('OPENROUTER_API_KEY')).resolves.toBe('from-device');
  });

  it('still returns undefined with the plaintext gone and the bridge OFF', async () => {
    const r = createServiceSecretResolver({ env: {}, vault: null, remoteSource: null, log: silent });
    // This is the exact failure the bridge exists to fix; it must still be reachable
    // when unconfigured, or the test above proves nothing.
    await expect(r.resolve('OPENROUTER_API_KEY')).resolves.toBeUndefined();
  });

  it('follows an infra:// ref to the device when the vault cannot answer it', async () => {
    const { run } = fakeRun({ REAL_NAME: 'from-device' });
    const r = createServiceSecretResolver({
      env: { ...HOST, ALIAS: 'infra://REAL_NAME' },
      vault: null,
      remoteSource: createHoloKeydSource({ env: HOST, run }),
      log: silent,
    });
    await expect(r.resolve('ALIAS')).resolves.toBe('from-device');
  });
});

describe('hydrateFromHoloKeyd — for consumers that read process.env directly', () => {
  it('fills only the names that are missing', async () => {
    const { run } = fakeRun({ MISSING_KEY: 'filled', PRESENT_KEY: 'device' });
    const target: Record<string, string | undefined> = { ...HOST, PRESENT_KEY: 'already-set' };
    const out = await hydrateFromHoloKeyd(['MISSING_KEY', 'PRESENT_KEY'], { env: HOST, run, target });
    expect(out.enabled).toBe(true);
    expect(out.hydrated).toEqual(['MISSING_KEY']);
    expect(target.MISSING_KEY).toBe('filled');
    // An existing value always wins, so hydration cannot change a configured process.
    expect(target.PRESENT_KEY).toBe('already-set');
  });

  it('reports not-enabled rather than throwing when the bridge is OFF', async () => {
    const target: Record<string, string | undefined> = {};
    const out = await hydrateFromHoloKeyd(['ANY_KEY'], { env: {}, target });
    expect(out).toEqual({ enabled: false, hydrated: [], missing: ['ANY_KEY'] });
    expect(target.ANY_KEY).toBeUndefined();
  });

  it('reports names the device did not hold, without throwing', async () => {
    const { run } = fakeRun({});
    const target: Record<string, string | undefined> = {};
    const out = await hydrateFromHoloKeyd(['NOPE'], { env: HOST, run, target });
    expect(out.enabled).toBe(true);
    expect(out.missing).toEqual(['NOPE']);
  });
});

describe('hydrateFromHoloKeydSync — boot hydration, before module constants are read', () => {
  const syncRun = (answers: Record<string, string>) => {
    const calls: string[] = [];
    const runSync = vi.fn((_a: readonly string[], input: string) => {
      const name = input.trim();
      calls.push(name);
      if (!(name in answers)) return '';
      return `${answers[name]}\n`;
    });
    return { runSync, calls };
  };

  it('costs ZERO round trips while every name is still in .env', () => {
    const { runSync } = syncRun({ OPENROUTER_API_KEY: 'device' });
    const target: Record<string, string | undefined> = { OPENROUTER_API_KEY: 'from-dotenv' };
    const out = hydrateFromHoloKeydSync(['OPENROUTER_API_KEY'], { env: HOST, target, runSync });
    expect(runSync).not.toHaveBeenCalled();
    expect(out.hydrated).toEqual([]);
    expect(target.OPENROUTER_API_KEY).toBe('from-dotenv');
  });

  it('fills the name once the plaintext is gone', () => {
    const { runSync } = syncRun({ OPENROUTER_API_KEY: 'device' });
    const target: Record<string, string | undefined> = {};
    const out = hydrateFromHoloKeydSync(['OPENROUTER_API_KEY'], { env: HOST, target, runSync });
    expect(out.hydrated).toEqual(['OPENROUTER_API_KEY']);
    expect(target.OPENROUTER_API_KEY).toBe('device');
  });

  it('is OFF, not throwing, when the bridge is unconfigured', () => {
    const target: Record<string, string | undefined> = {};
    const out = hydrateFromHoloKeydSync(['A'], { env: {}, target });
    expect(out).toEqual({ enabled: false, hydrated: [], missing: ['A'] });
  });

  it('a down host costs ONE timeout at boot, not one per name', () => {
    const runSync = vi.fn(() => {
      throw Object.assign(new Error('ssh: connect failed'), { code: 255 });
    });
    const target: Record<string, string | undefined> = {};
    const out = hydrateFromHoloKeydSync(['A', 'B', 'C'], { env: HOST, target, runSync });
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(out.hydrated).toEqual([]);
    expect(out.missing).toEqual(['A', 'B', 'C']);
  });

  it('keeps going when one name is merely absent from the device', () => {
    const { runSync } = syncRun({ SECOND: 'v' });
    const target: Record<string, string | undefined> = {};
    const out = hydrateFromHoloKeydSync(['FIRST', 'SECOND'], { env: HOST, target, runSync });
    expect(out.hydrated).toEqual(['SECOND']);
    expect(out.missing).toEqual(['FIRST']);
  });
});
