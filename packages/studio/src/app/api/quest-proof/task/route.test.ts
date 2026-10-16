/**
 * /api/quest-proof/task writes a seed file and spawns a script that files a
 * task on the founder's board. Founder-only: 401/403, nothing written or run.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const h = vi.hoisted(() => ({ requireFounder: vi.fn(), spawn: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ requireFounder: h.requireFounder, requireAuth: h.requireFounder }));
vi.mock('node:child_process', () => ({ spawn: h.spawn, default: { spawn: h.spawn } }));
vi.mock('node:fs/promises', () => ({
  mkdir: h.mkdir,
  writeFile: h.writeFile,
  default: { mkdir: h.mkdir, writeFile: h.writeFile },
}));

import { GET, POST } from './route';

const post = () =>
  new NextRequest('https://studio.test/api/quest-proof/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId: 'r1', message: 'Fix the thing.' }),
  });

afterEach(() => vi.resetAllMocks());

describe('quest-proof/task is founder-only', () => {
  for (const [label, status] of [['anonymous', 401], ['non-founder', 403]] as const) {
    it(`${label}: POST ${status}, nothing written or spawned`, async () => {
      h.requireFounder.mockResolvedValue(NextResponse.json({ error: label }, { status }));
      const res = await POST(post());
      expect(res.status).toBe(status);
      expect(h.mkdir).not.toHaveBeenCalled();
      expect(h.writeFile).not.toHaveBeenCalled();
      expect(h.spawn).not.toHaveBeenCalled();
    });

    it(`${label}: GET ?record=1 ${status}, nothing written or spawned`, async () => {
      h.requireFounder.mockResolvedValue(NextResponse.json({ error: label }, { status }));
      const res = await GET(
        new NextRequest('https://studio.test/api/quest-proof/task?record=1&message=hi')
      );
      expect(res.status).toBe(status);
      expect(h.writeFile).not.toHaveBeenCalled();
      expect(h.spawn).not.toHaveBeenCalled();
    });
  }
});
