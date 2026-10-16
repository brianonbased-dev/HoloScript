/**
 * oracle-boost/telemetry returns the server's telemetry file path and raw
 * entries. Founder-only: anonymous 401, non-founder 403, nothing read.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const h = vi.hoisted(() => {
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-tel-'));
  const file = path.join(dir, 'oracle-telemetry.jsonl');
  fs.writeFileSync(file, JSON.stringify({ outcome: 'ok', source: 'test' }) + '\n');
  process.env.ORACLE_TELEMETRY_PATH = file;
  return { file, requireFounder: vi.fn() };
});
vi.mock('@/lib/api-auth', () => ({ requireFounder: h.requireFounder, requireAuth: h.requireFounder }));

import { GET } from './route';

const get = () => new NextRequest('https://studio.test/api/studio/oracle-boost/telemetry');

afterEach(() => h.requireFounder.mockReset());

describe('oracle-boost/telemetry: founder-only', () => {
  it('anonymous caller gets 401 and no path or entries', async () => {
    h.requireFounder.mockResolvedValue(NextResponse.json({ error: 'auth' }, { status: 401 }));
    const res = await GET(get());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.telemetry_path).toBeUndefined();
    expect(body.recent).toBeUndefined();
  });

  it('signed-in non-founder gets 403 and no path or entries', async () => {
    h.requireFounder.mockResolvedValue(NextResponse.json({ error: 'founder' }, { status: 403 }));
    const res = await GET(get());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.telemetry_path).toBeUndefined();
  });

  it('founder gets the aggregate', async () => {
    h.requireFounder.mockResolvedValue({ user: { id: 'founder' } });
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect((await res.json()).total_entries).toBe(1);
  });
});
