/**
 * oracle-boost/status only checks the telemetry folder; it never creates it.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-st-'));
  const dir = path.join(base, 'not-created');
  process.env.ORACLE_TELEMETRY_PATH = path.join(dir, 'oracle-telemetry.jsonl');
  return { base, dir };
});
vi.mock('@/lib/api-auth', () => ({ requireAuth: async () => ({ user: { id: 'u1' } }) }));

import * as fs from 'fs';
import { POST } from './route';

afterAll(() => fs.rmSync(h.base, { recursive: true, force: true }));

describe('oracle-boost/status creates no directories', () => {
  it('reports telemetry_writable fail and leaves the folder absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const res = await POST(
      new NextRequest('https://studio.test/api/studio/oracle-boost/status', {
        method: 'POST',
        body: JSON.stringify({ tier: 'free' }),
      })
    );
    const body = await res.json();
    expect(body.checks.telemetry_writable).toBe('fail');
    expect(fs.existsSync(h.dir)).toBe(false);
    vi.unstubAllGlobals();
  });
});
