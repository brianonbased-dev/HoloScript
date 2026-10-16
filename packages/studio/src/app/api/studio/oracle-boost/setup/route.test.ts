/**
 * oracle-boost/setup writes into the server's home directory. Founder-only:
 * anonymous 401, non-founder 403, and nothing is written for either.
 * os.homedir() points at a temp dir so no real home is touched.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const h = vi.hoisted(() => {
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  return {
    home: fs.mkdtempSync(path.join(os.tmpdir(), 'ob-setup-')),
    requireFounder: vi.fn(),
  };
});
vi.mock('os', async (orig) => {
  const actual = (await orig()) as typeof import('os');
  const patched = { ...actual, homedir: () => h.home };
  return { ...patched, default: patched };
});
vi.mock('@/lib/api-auth', () => ({ requireFounder: h.requireFounder, requireAuth: h.requireFounder }));

import * as fs from 'fs';
import { POST } from './route';

const post = (body: unknown = {}) =>
  new NextRequest('https://studio.test/api/studio/oracle-boost/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const homeEntries = () => fs.readdirSync(h.home);

beforeEach(() => {
  for (const e of homeEntries()) fs.rmSync(`${h.home}/${e}`, { recursive: true, force: true });
});
afterEach(() => h.requireFounder.mockReset());
afterAll(() => fs.rmSync(h.home, { recursive: true, force: true }));

describe('oracle-boost/setup: founder-only, no write otherwise', () => {
  it('anonymous caller gets 401 and nothing is written', async () => {
    h.requireFounder.mockResolvedValue(NextResponse.json({ error: 'auth' }, { status: 401 }));
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(homeEntries()).toEqual([]);
  });

  it('signed-in non-founder gets 403 and nothing is written', async () => {
    h.requireFounder.mockResolvedValue(NextResponse.json({ error: 'founder' }, { status: 403 }));
    const res = await POST(post());
    expect(res.status).toBe(403);
    expect(homeEntries()).toEqual([]);
  });

  it('founder provisions the files', async () => {
    h.requireFounder.mockResolvedValue({ user: { id: 'founder' } });
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(homeEntries().sort()).toEqual(['.claude', '.holoscript']);
  });
});
