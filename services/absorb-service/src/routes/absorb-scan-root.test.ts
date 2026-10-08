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
// The credits module is counted at load and its two calls are spies, so a refused
// root can be shown to do no credits work at all: not loaded, not looked at, not charged.
const credits = vi.hoisted(() => ({
  loads: 0,
  requireCredits: vi.fn(async (userId: string) => ({
    userId,
    costCents: 10,
    operationType: 'absorb_shallow',
  })),
  deductCredits: vi.fn(async () => ({ balanceCents: 990 })),
}));

vi.mock('../db/client.js', () => ({ getDb: vi.fn(() => null) }));
vi.mock('@holoscript/absorb-service/credits', () => {
  credits.loads += 1;
  const api = {
    requireCredits: credits.requireCredits,
    deductCredits: credits.deductCredits,
    isCreditError: (r: Record<string, unknown>) => 'error' in r && 'status' in r,
  };
  return { ...api, default: api };
});
vi.mock('@holoscript/absorb-service/engine', async () => {
  const api = {
    // The real policy, so the test proves the shipped check, not a stand-in.
    ...(await vi.importActual<object>(
      '../../../../packages/absorb-service/src/engine/absorb-root-policy'
    )),
    CodebaseScanner: class {
      scan = scan;
    },
    CodebaseGraph: class {
      buildFromScanResult() {}
      serialize() {
        return '{}';
      }
    },
  };
  return { ...api, default: api };
});

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

  // A caller who would be charged: authenticated, a uuid user, a project id.
  const USER = '11111111-2222-4333-8444-555555555555';
  const PROJECT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const payingReq = (root: string) =>
    ({
      body: { path: root, shallow: true, projectId: PROJECT },
      authenticated: true,
      userId: USER,
    }) as unknown as Request;
  const made: string[] = [];
  const tempDir = (parent: string, prefix: string) => {
    const dir = fs.mkdtempSync(path.join(parent, prefix));
    made.push(dir);
    return dir;
  };
  /** A fresh router, so absorb.ts's cached credits import starts empty in each test. */
  async function freshScanHandler() {
    vi.resetModules();
    credits.loads = 0;
    credits.requireCredits.mockClear();
    credits.deductCredits.mockClear();
    const { absorbRouter: router } = await import('./absorb.js');
    const layer = (router as unknown as {
      stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: any }> } }>;
    }).stack.find((entry) => entry.route?.path === '/scan' && entry.route.methods.post);
    if (!layer?.route) throw new Error('POST /scan not registered');
    return layer.route.stack[layer.route.stack.length - 1].handle as (
      req: Request,
      res: Response
    ) => Promise<unknown>;
  }
  afterEach(() => {
    for (const dir of made.splice(0).reverse()) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('refuses a paying caller\'s disallowed root before loading, checking or charging credits', async () => {
    process.env.ABSORB_ALLOWED_ROOTS = tempDir(os.tmpdir(), 'scan-allowed-');
    const outside = tempDir(os.tmpdir(), 'scan-outside-');
    const handler = await freshScanHandler();
    const res = mockRes();
    await handler(payingReq(outside), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toMatchObject({ error: 'path_not_allowed' });
    expect(scan).not.toHaveBeenCalled();
    expect(credits.loads).toBe(0);
    expect(credits.requireCredits).not.toHaveBeenCalled();
    expect(credits.deductCredits).not.toHaveBeenCalled();
  });

  it('control: the same caller on an allowed root is scanned and charged once', async () => {
    const allowed = tempDir(os.tmpdir(), 'scan-allowed-');
    process.env.ABSORB_ALLOWED_ROOTS = allowed;
    const inside = tempDir(allowed, 'proj-');
    scan.mockResolvedValue({
      files: [{ path: 'a.ts', imports: [] }],
      stats: { durationMs: 1, fileCount: 1 },
    });
    const handler = await freshScanHandler();
    const res = mockRes();
    await handler(payingReq(inside), res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(credits.loads).toBe(1);
    expect(credits.requireCredits).toHaveBeenCalledTimes(1);
    expect(credits.deductCredits).toHaveBeenCalledTimes(1);
  });
});
