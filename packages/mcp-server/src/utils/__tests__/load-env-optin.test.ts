import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@holoscript/secrets-broker', () => ({
  hydrateFromHoloKeydSync: () => ({ enabled: false, hydrated: [], missing: [] }),
}));

const GATE_VARS = [
  'HOLOMESH_DOTENV',
  'HOLOMESH_NO_DOTENV',
  'HOLOMESH_SANDBOX',
  'MCP_BIND_HOST',
  'HOME',
  'USERPROFILE',
  'LOADENV_FAKE_MARKER',
];

let loadMcpEnv: typeof import('../load-env').loadMcpEnv;
let saved: Record<string, string | undefined>;
let fakeHome: string;
let fakeEnvPath: string;

beforeAll(async () => {
  // Seal the import-time side effect so it can never touch a real .env.
  const prev = process.env.HOLOMESH_NO_DOTENV;
  process.env.HOLOMESH_NO_DOTENV = '1';
  ({ loadMcpEnv } = await import('../load-env'));
  if (prev === undefined) delete process.env.HOLOMESH_NO_DOTENV;
  else process.env.HOLOMESH_NO_DOTENV = prev;
});

beforeEach(() => {
  saved = Object.fromEntries(GATE_VARS.map((k) => [k, process.env[k]]));
  for (const k of GATE_VARS) delete process.env[k];
  fakeHome = mkdtempSync(join(tmpdir(), 'load-env-home-'));
  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome;
  mkdirSync(join(fakeHome, '.ai-ecosystem'));
  fakeEnvPath = join(fakeHome, '.ai-ecosystem', '.env');
  writeFileSync(fakeEnvPath, 'LOADENV_FAKE_MARKER=fake-not-a-secret\n');
});

afterEach(() => {
  for (const k of GATE_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(fakeHome, { recursive: true, force: true });
});

describe('loadMcpEnv dotenv is opt-in', () => {
  it('loads nothing by default, even with a clean env and a home .env present', () => {
    const r = loadMcpEnv({ silent: true });
    expect(r.skipped).toBe('not-opted-in');
    expect(r.loadedFrom).toBeNull();
    expect(process.env.LOADENV_FAKE_MARKER).toBeUndefined();
  });

  it('loads only when HOLOMESH_DOTENV=1', () => {
    process.env.HOLOMESH_DOTENV = '1';
    const r = loadMcpEnv({ silent: true, envPaths: [fakeEnvPath] });
    expect(r.loadedFrom).toBe(fakeEnvPath);
    expect(process.env.LOADENV_FAKE_MARKER).toBe('fake-not-a-secret');
  });

  it('HOLOMESH_NO_DOTENV=1 still wins over opt-in', () => {
    process.env.HOLOMESH_DOTENV = '1';
    process.env.HOLOMESH_NO_DOTENV = '1';
    const r = loadMcpEnv({ silent: true, envPaths: [fakeEnvPath] });
    expect(r.skipped).toBe('HOLOMESH_NO_DOTENV');
    expect(process.env.LOADENV_FAKE_MARKER).toBeUndefined();
  });

  it('refuses a sandbox board even when opted in', () => {
    process.env.HOLOMESH_DOTENV = '1';
    process.env.HOLOMESH_SANDBOX = '1';
    const r = loadMcpEnv({ silent: true, envPaths: [fakeEnvPath] });
    expect(r.skipped).toBe('sandbox');
    expect(process.env.LOADENV_FAKE_MARKER).toBeUndefined();
  });

  it.each(['127.0.0.1', 'localhost', '::1'])(
    'refuses a loopback bind (%s) even when opted in',
    (host) => {
      process.env.HOLOMESH_DOTENV = '1';
      process.env.MCP_BIND_HOST = host;
      const r = loadMcpEnv({ silent: true, envPaths: [fakeEnvPath] });
      expect(r.skipped).toBe('loopback-bind');
      expect(process.env.LOADENV_FAKE_MARKER).toBeUndefined();
    }
  );
});
