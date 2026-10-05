/**
 * POST /scan confines its root to the folders this server may scan
 * (2026-10-04 custody review: any authenticated caller could map any server
 * directory). Mock req/res, no supertest, like admin.test.ts.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const scan = vi.hoisted(() => vi.fn());

vi.mock('../db/client.js', () => ({ getDb: vi.fn(() => null) }));
vi.mock('@holoscript/absorb-service/engine', async () => ({
  // The real policy, so the test proves the shipped check, not a stand-in.
  ...(await vi.importActual<object>(
    '../../../../packages/absorb-service/src/engine/absorb-root-policy'
  )),
  CodebaseScanner: class {
    scan = scan;
  },
  CodebaseGraph: class {},
}));

import { absorbRouter } from './absorb.js';

function scanHandler(): (req: Request, res: Response) => Promise<unknown> {
  const layer = (absorbRouter as unknown as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: any }> } }>;
  }).stack.find((entry) => entry.route?.path === '/scan' && entry.route.methods.post);
  if (!layer?.route) throw new Error('POST /scan not registered');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('POST /scan root confinement', () => {
  const previous = process.env.ABSORB_ALLOWED_ROOTS;
  afterEach(() => {
    if (previous === undefined) delete process.env.ABSORB_ALLOWED_ROOTS;
    else process.env.ABSORB_ALLOWED_ROOTS = previous;
    scan.mockReset();
  });

  it('refuses a folder outside the allowed roots before scanning or reading any cache', async () => {
    process.env.ABSORB_ALLOWED_ROOTS = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-allowed-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-outside-'));
    const res = mockRes();
    await scanHandler()({ body: { path: outside } } as Request, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toMatchObject({ error: 'path_not_allowed' });
    expect(scan).not.toHaveBeenCalled();
  });
});
