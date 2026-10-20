/**
 * /api/self-improve/status reads/writes the server's home folder. Founder-only.
 */
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const h = vi.hoisted(() => {
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'si-home-'));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return { home, requireFounder: vi.fn() };
});
vi.mock('@/lib/api-auth', () => ({ requireFounder: h.requireFounder, requireAuth: h.requireFounder }));

import * as fs from 'fs';
import { GET, POST } from './route';

const post = () =>
  new NextRequest('https://studio.test/api/self-improve/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iterations: 1 }),
  });

afterEach(() => h.requireFounder.mockReset());
afterAll(() => fs.rmSync(h.home, { recursive: true, force: true }));

describe('self-improve/status is founder-only', () => {
  for (const [label, status] of [['anonymous', 401], ['non-founder', 403]] as const) {
    it(`${label}: POST ${status} and nothing written; GET ${status}`, async () => {
      h.requireFounder.mockResolvedValue(NextResponse.json({ error: label }, { status }));
      expect((await POST(post())).status).toBe(status);
      expect(fs.readdirSync(h.home)).toEqual([]);
      const res = await GET(new NextRequest('https://studio.test/api/self-improve/status'));
      expect(res.status).toBe(status);
    });
  }

  it('founder: POST writes the receipt', async () => {
    h.requireFounder.mockResolvedValue({ user: { id: 'founder' } });
    expect((await POST(post())).status).toBe(201);
  });
});
