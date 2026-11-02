import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../simStore', () => ({ pushMetrics: vi.fn() }));

import { POST } from '../../app/sim/paper26/api/push/route';

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/sim/paper26/api/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ metrics: { tick: 7 } }),
  });
}

describe('POST /sim/paper26/api/push auth (fail closed)', () => {
  beforeEach(() => {
    vi.stubEnv('SIM_PUSH_TOKEN', '');
    vi.stubEnv('HOLOSCRIPT_MCP_API_KEY', '');
    vi.stubEnv('HOLOSCRIPT_API_KEY', 'old-name-must-not-count');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('refuses with 503 when SIM_PUSH_TOKEN and the key are both unset', async () => {
    const res = await POST(req({ authorization: 'Bearer anything' }));
    expect(res.status).toBe(503);
  });

  it('refuses with 503 when the key is whitespace only', async () => {
    vi.stubEnv('HOLOSCRIPT_MCP_API_KEY', '   \t ');
    vi.stubEnv('SIM_PUSH_TOKEN', '  ');
    const res = await POST(req({ authorization: 'Bearer    ' }));
    expect(res.status).toBe(503);
  });

  it('rejects a wrong bearer with 401 (same and different length)', async () => {
    vi.stubEnv('HOLOSCRIPT_MCP_API_KEY', ' right-key ');
    expect((await POST(req({ authorization: 'Bearer wrong-key' }))).status).toBe(401);
    expect((await POST(req({ authorization: 'Bearer x' }))).status).toBe(401);
    expect((await POST(req())).status).toBe(401);
  });

  it('accepts the right bearer', async () => {
    vi.stubEnv('HOLOSCRIPT_MCP_API_KEY', ' right-key ');
    const res = await POST(req({ authorization: 'Bearer right-key' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, tick: 7 });
  });

  it('SIM_PUSH_TOKEN wins over the key', async () => {
    vi.stubEnv('SIM_PUSH_TOKEN', 'sim-token');
    vi.stubEnv('HOLOSCRIPT_MCP_API_KEY', 'right-key');
    expect((await POST(req({ authorization: 'Bearer right-key' }))).status).toBe(401);
    expect((await POST(req({ 'x-sim-key': 'sim-token' }))).status).toBe(200);
  });
});
