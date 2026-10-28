import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const brokerMock = vi.hoisted(() =>
  vi.fn((names: string[]) => {
    for (const n of names) process.env[n] = 'fake-vault-value';
    return { enabled: true, hydrated: names, missing: [] as string[] };
  })
);

vi.mock('@holoscript/secrets-broker', () => ({
  hydrateFromHoloKeydSync: brokerMock,
}));

const VAULT_NAMES = [
  'OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'XAI_API_KEY',
  'GEMINI_API_KEY',
];
const GATE_VARS = [
  'HOLOMESH_DOTENV',
  'HOLOMESH_NO_DOTENV',
  'HOLOMESH_SANDBOX',
  'MCP_BIND_HOST',
  'HOLOKEYD_HOST',
  'HOLOKEYD_HYDRATE',
  ...VAULT_NAMES,
];

let saved: Record<string, string | undefined>;

async function freshImport() {
  vi.resetModules();
  return import('../load-env');
}

function noneHydrated() {
  for (const n of VAULT_NAMES) expect(process.env[n]).toBeUndefined();
}

beforeEach(() => {
  saved = Object.fromEntries(GATE_VARS.map((k) => [k, process.env[k]]));
  for (const k of GATE_VARS) delete process.env[k];
  process.env.HOLOKEYD_HOST = 'vault.test.invalid';
  brokerMock.mockClear();
});

afterEach(() => {
  for (const k of GATE_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('vault hydration follows the env-loading policy', () => {
  it('import-time default hydrates nothing', async () => {
    await freshImport();
    expect(brokerMock).not.toHaveBeenCalled();
    noneHydrated();
  });

  it('refuses a sandbox board even when opted in', async () => {
    process.env.HOLOMESH_NO_DOTENV = '1';
    const { hydrateFromVault } = await freshImport();
    delete process.env.HOLOMESH_NO_DOTENV;
    process.env.HOLOMESH_DOTENV = '1';
    process.env.HOLOMESH_SANDBOX = '1';
    const r = hydrateFromVault();
    expect(r.skipped).toBe('sandbox');
    expect(brokerMock).not.toHaveBeenCalled();
    noneHydrated();
  });

  it.each(['127.0.0.1', 'localhost', '::1'])(
    'refuses a loopback bind (%s) even when opted in',
    async (host) => {
      process.env.HOLOMESH_NO_DOTENV = '1';
      const { hydrateFromVault } = await freshImport();
      delete process.env.HOLOMESH_NO_DOTENV;
      process.env.HOLOMESH_DOTENV = '1';
      process.env.MCP_BIND_HOST = host;
      const r = hydrateFromVault();
      expect(r.skipped).toBe('loopback-bind');
      expect(brokerMock).not.toHaveBeenCalled();
      noneHydrated();
    }
  );

  it('HOLOMESH_NO_DOTENV=1 wins over opt-in', async () => {
    process.env.HOLOMESH_NO_DOTENV = '1';
    process.env.HOLOMESH_DOTENV = '1';
    const { hydrateFromVault } = await freshImport();
    const r = hydrateFromVault();
    expect(r.skipped).toBe('HOLOMESH_NO_DOTENV');
    expect(brokerMock).not.toHaveBeenCalled();
    noneHydrated();
  });

  it('hydrates when opted in on a normal bind', async () => {
    process.env.HOLOMESH_NO_DOTENV = '1';
    const { hydrateFromVault } = await freshImport();
    delete process.env.HOLOMESH_NO_DOTENV;
    process.env.HOLOMESH_DOTENV = '1';
    process.env.MCP_BIND_HOST = '0.0.0.0';
    const r = hydrateFromVault();
    expect(r.skipped).toBeUndefined();
    expect(brokerMock).toHaveBeenCalledTimes(1);
    expect(process.env.OPENROUTER_API_KEY).toBe('fake-vault-value');
  });
});
