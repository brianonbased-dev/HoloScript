import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(() => null),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid'),
}));

type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

let exportDir = '';

function sampleFrame(frame = 0) {
  return {
    frame,
    timestamp: frame * 16.6,
    voxels: [
      {
        id: `voxel-${frame}`,
        position: [1, 2, 3],
        provenance: 0.9,
        ricci: 0.12,
      },
    ],
    edges: [
      {
        source: `voxel-${frame}`,
        target: `voxel-${frame + 1}`,
        weight: 0.7,
        mutualInfo: 0.42,
        provenance: 0.8,
      },
    ],
    hubbleCorrection: 0.03,
    violationCount: 0,
    frameTimeMs: 16.6,
  };
}

function sampleBody(frames = 1) {
  return {
    projectId: 'project-alpha',
    metadata: {
      voxelCount: 1,
      edgeCount: 1,
      seed: 123,
      experimentId: 'paper-run-1',
    },
    provenance: {
      paper: 'emergent-spacetime',
      device: 'local-hardware',
    },
    data: {
      timeSeries: Array.from({ length: frames }, (_, index) => sampleFrame(index)),
    },
  };
}

function createMockReq(overrides: Record<string, unknown> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    authenticated: true,
    userId: 'user-1',
    githubUsername: 'octocat',
    tier: 'pro',
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response & {
  _status: number;
  _json: unknown;
  _sent: unknown;
  _headers: Record<string, string>;
} {
  const res: Response & {
    _status: number;
    _json: unknown;
    _sent: unknown;
    _headers: Record<string, string>;
  } = {
    _status: 200,
    _json: null,
    _sent: null,
    _headers: {},
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
    send(data: unknown) {
      res._sent = data;
      return res;
    },
    setHeader(name: string, value: number | string | readonly string[]) {
      res._headers[name] = Array.isArray(value) ? value.join(', ') : String(value);
      return res;
    },
  } as unknown as Response & {
    _status: number;
    _json: unknown;
    _sent: unknown;
    _headers: Record<string, string>;
  };
  return res;
}

async function getRouteHandler(method: string, pathPattern: string): Promise<RouteHandler> {
  const { router } = await import('./emergent-spacetime.js');
  const stack = (router as any).stack;
  for (const layer of stack) {
    if (layer.route && layer.route.path === pathPattern && layer.route.methods[method]) {
      return layer.route.stack[0].handle;
    }
  }
  throw new Error(`No route found: ${method.toUpperCase()} ${pathPattern}`);
}

async function postSampleExport(ownerId = 'user-1') {
  const handler = await getRouteHandler('post', '/export');
  const req = createMockReq({ body: sampleBody(), userId: ownerId });
  const res = createMockRes();
  await handler(req, res);
  return res;
}

describe('emergent spacetime export route', () => {
  beforeEach(() => {
    vi.resetModules();
    exportDir = mkdtempSync(join(tmpdir(), 'emergent-spacetime-test-'));
    process.env.EMERGENT_SPACETIME_EXPORT_DIR = exportDir;
    process.env.EMERGENT_SPACETIME_EXPORT_MAX_FRAMES = '2';
    process.env.EMERGENT_SPACETIME_EXPORT_MAX_BYTES = String(1024 * 1024);
    process.env.EMERGENT_SPACETIME_EXPORT_TTL_DAYS = '7';
  });

  afterEach(() => {
    delete process.env.EMERGENT_SPACETIME_EXPORT_DIR;
    delete process.env.EMERGENT_SPACETIME_EXPORT_MAX_FRAMES;
    delete process.env.EMERGENT_SPACETIME_EXPORT_MAX_BYTES;
    delete process.env.EMERGENT_SPACETIME_EXPORT_TTL_DAYS;
    rmSync(exportDir, { recursive: true, force: true });
  });

  it('rejects unauthenticated export writes', async () => {
    const handler = await getRouteHandler('post', '/export');
    const req = createMockReq({ authenticated: false, userId: undefined, body: sampleBody() });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(401);
    expect((res._json as { error: string }).error).toBe('Authentication required');
  }, 15_000);

  it('persists exports with owner, project, retention, and evidence metadata', async () => {
    const postRes = await postSampleExport();
    expect(postRes._status).toBe(201);

    const id = (postRes._json as { id: string }).id;
    expect(id).toBe('es-export-mock-uuid');
    expect((postRes._json as { evidenceSha256: string }).evidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(join(exportDir, `${id}.json`))).toBe(true);

    vi.resetModules();
    const getHandler = await getRouteHandler('get', '/:id');
    const getReq = createMockReq({ params: { id } });
    const getRes = createMockRes();
    await getHandler(getReq, getRes);

    const payload = getRes._json as {
      ownerId: string;
      projectId: string;
      provenance: { submittedBy: { userId: string }; frameCount: number };
      retention: { ttlDays: number };
    };
    expect(getRes._status).toBe(200);
    expect(payload.ownerId).toBe('user-1');
    expect(payload.projectId).toBe('project-alpha');
    expect(payload.provenance.submittedBy.userId).toBe('user-1');
    expect(payload.provenance.frameCount).toBe(1);
    expect(payload.retention.ttlDays).toBe(7);
  });

  it('hides exports from other owners', async () => {
    const postRes = await postSampleExport('user-1');
    const id = (postRes._json as { id: string }).id;

    const getHandler = await getRouteHandler('get', '/:id');
    const getReq = createMockReq({ params: { id }, userId: 'user-2' });
    const getRes = createMockRes();
    await getHandler(getReq, getRes);

    expect(getRes._status).toBe(404);

    const listHandler = await getRouteHandler('get', '/');
    const listReq = createMockReq({ userId: 'user-2' });
    const listRes = createMockRes();
    await listHandler(listReq, listRes);

    expect((listRes._json as { total: number }).total).toBe(0);
  });

  it('enforces time-series frame limits before persisting', async () => {
    const handler = await getRouteHandler('post', '/export');
    const req = createMockReq({ body: sampleBody(3) });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(413);
    expect((res._json as { error: string }).error).toBe('Too many time-series frames');
    expect(existsSync(join(exportDir, 'index.json'))).toBe(false);
  });

  it('soft-deletes exports while retaining the evidence receipt', async () => {
    const postRes = await postSampleExport();
    const id = (postRes._json as { id: string }).id;

    const deleteHandler = await getRouteHandler('delete', '/:id');
    const deleteReq = createMockReq({ params: { id } });
    const deleteRes = createMockRes();
    await deleteHandler(deleteReq, deleteRes);

    expect(deleteRes._status).toBe(200);
    expect((deleteRes._json as { deleted: boolean }).deleted).toBe(true);
    expect((deleteRes._json as { evidenceSha256: string }).evidenceSha256).toMatch(/^[a-f0-9]{64}$/);

    const getHandler = await getRouteHandler('get', '/:id');
    const getReq = createMockReq({ params: { id } });
    const getRes = createMockRes();
    await getHandler(getReq, getRes);
    expect(getRes._status).toBe(404);

    const index = JSON.parse(readFileSync(join(exportDir, 'index.json'), 'utf8')) as {
      exports: Array<{ id: string; deletedAt?: string }>;
    };
    expect(index.exports.find((entry) => entry.id === id)?.deletedAt).toBeTruthy();
    expect(existsSync(join(exportDir, `${id}.json`))).toBe(true);
  });
});
