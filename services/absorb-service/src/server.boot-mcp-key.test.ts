/**
 * Host boot: absorb must start without HOLOSCRIPT_MCP_API_KEY once
 * REQUIRED_VARS.ABSORB_SERVICE no longer lists it. requireConfig must still
 * enforce DATABASE_URL. Legacy MCP key names must never satisfy boot.
 */
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SENTINEL_LEGACY = 'SENTINEL_HOLOSCRIPT_API_KEY_VALUE';
const SENTINEL_MCP = 'SENTINEL_MCP_API_KEY_VALUE';
const FAKE_DATABASE_URL = 'postgres://fake:fake@127.0.0.1:1/fake';

function passthrough(_req: unknown, _res: unknown, next: () => void): void {
  next();
}

vi.mock('./boot-secrets.js', () => ({
  hydrateServiceSecrets: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./db/ensureMoltbookSchema.js', () => ({
  ensureMoltbookSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./db/ensureCreditLedgerIndex.js', () => ({
  ensureCreditLedgerIndex: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./db/client.js', () => ({
  getDb: vi.fn(() => null),
  closeDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./mcp-handler.js', () => ({
  mountMcpTransports: vi.fn(),
  handleMcpDiscovery: vi.fn((_req: unknown, res: { status: (n: number) => { end: () => void } }) => {
    res.status(200).end();
  }),
  getActiveSessionCount: vi.fn(() => 0),
  getRegisteredToolCount: vi.fn(() => 0),
  assertMcpToolInventoryReady: vi.fn().mockResolvedValue(1),
}));

vi.mock('./routes/absorb.js', () => ({ absorbRouter: passthrough }));
vi.mock('./routes/credits.js', () => ({ creditsRouter: passthrough }));
vi.mock('./routes/creditsWebhook.js', () => ({ creditsWebhookRouter: passthrough }));
vi.mock('./routes/holodaemon.js', () => ({ holodaemonRouter: passthrough }));
vi.mock('./routes/pipeline.js', () => ({ pipelineRouter: passthrough }));
vi.mock('./routes/moltbook.js', () => ({ moltbookRouter: passthrough }));
vi.mock('./routes/admin.js', () => ({ adminRouter: passthrough }));
vi.mock('./routes/emergent-spacetime.js', () => ({ router: passthrough }));
vi.mock('./middleware/auth.js', () => ({
  authMiddleware: passthrough,
}));

const savedEnv = { ...process.env };
let exitSpy: ReturnType<typeof vi.spyOn>;
let server: Server | undefined;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...savedEnv };
  for (const k of [
    'HOLOSCRIPT_MCP_API_KEY',
    'HOLOSCRIPT_API_KEY',
    'MCP_API_KEY',
    'ABSORB_API_KEY',
    'DATABASE_URL',
    'PORT',
  ]) {
    delete process.env[k];
  }
  process.env.PORT = '0';
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  server = undefined;
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
    server = undefined;
  }
  exitSpy.mockRestore();
  process.env = { ...savedEnv };
});

describe('absorb-service host boot vs HOLOSCRIPT_MCP_API_KEY', () => {
  it('starts with HOLOSCRIPT_MCP_API_KEY unset (legacy sentinels ignored); process.exit never called', async () => {
    process.env.DATABASE_URL = FAKE_DATABASE_URL;
    process.env.HOLOSCRIPT_API_KEY = SENTINEL_LEGACY;
    process.env.MCP_API_KEY = SENTINEL_MCP;
    delete process.env.HOLOSCRIPT_MCP_API_KEY;

    const { start } = await import('./server.js');
    server = await start();

    expect(exitSpy).not.toHaveBeenCalled();
    const addr = server.address();
    expect(addr).toBeTruthy();
    expect(typeof addr === 'object' && addr && 'port' in addr && addr.port > 0).toBe(true);
  });

  it('still fails requireConfig when DATABASE_URL is unset (check still runs); does not exit the process', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.HOLOSCRIPT_MCP_API_KEY;
    process.env.HOLOSCRIPT_API_KEY = SENTINEL_LEGACY;
    process.env.MCP_API_KEY = SENTINEL_MCP;

    const { start } = await import('./server.js');
    const err = await start().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('DATABASE_URL');
    expect((err as Error).message).not.toContain(SENTINEL_LEGACY);
    expect((err as Error).message).not.toContain(SENTINEL_MCP);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
