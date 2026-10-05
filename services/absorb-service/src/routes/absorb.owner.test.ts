/**
 * Graphs, queries, and single projects are visible only to the account that
 * owns them. Someone else's id answers like a missing id. A row with no
 * stored owner, and a caller with no signed-in account, are visible to nobody.
 *
 * The ledger and the scanner are stood in for, the way holodaemon.test.ts
 * does. These tests do not charge anyone and do not touch the credits table.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const CALLER_A = '11111111-2222-4333-8444-555555555555';
const CALLER_B = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const MISSING_GRAPH = '00000000-0000-4000-8000-000000000001';
const MISSING_PROJECT = '00000000-0000-4000-8000-000000000002';

const harness = vi.hoisted(() => {
  const projects: Array<Record<string, unknown>> = [];

  function matches(row: Record<string, unknown>, clause: unknown): boolean {
    if (!clause || typeof clause !== 'object') return false;
    const node = clause as { op?: string; field?: string; value?: unknown; clauses?: unknown[] };
    if (node.op === 'eq') return row[node.field ?? ''] === node.value;
    if (node.op === 'and') return (node.clauses ?? []).every((part) => matches(row, part));
    return false;
  }

  return { projects, matches };
});

vi.mock('@holoscript/absorb-service/credits', () => {
  const api = {
    requireCredits: vi.fn(async () => ({ costCents: 0 })),
    deductCredits: vi.fn(async () => ({ balanceCents: 0 })),
    isCreditError: (result: Record<string, unknown>) => 'error' in result && 'status' in result,
  };
  return { ...api, default: api };
});

vi.mock('@holoscript/absorb-service/engine', () => {
  const api = {
    // These tests cover owners and credits, not the folder allowlist (absorb-scan-root.test.ts does).
    absorbRootRefusal: () => null,
    CodebaseScanner: class {
      async scan() {
        return {
          files: [{ path: 'src/main.ts', imports: [] }],
          stats: { durationMs: 1, fileCount: 1 },
        };
      }
    },
    CodebaseGraph: class {
      buildFromScanResult() {}
      serialize() {
        return '{}';
      }
      getAllSymbols() {
        return [{ name: 'main' }];
      }
    },
    EmbeddingIndex: class {
      async addSymbols() {}
      async search() {
        return [
          {
            score: 0.9,
            metadata: {
              name: 'main',
              type: 'function',
              filePath: 'src/main.ts',
              documentation: 'starts the program',
            },
          },
        ];
      }
    },
    createEmbeddingProvider: async () => ({ name: 'structural' }),
  };
  return { ...api, default: api };
});

vi.mock('@holoscript/absorb-service/schema', () => ({
  absorbProjects: {
    id: { field: 'id' },
    userId: { field: 'userId' },
    createdAt: { field: 'createdAt' },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (column: { field?: string }, value: unknown) => ({ op: 'eq', field: column?.field, value }),
  and: (...clauses: unknown[]) => ({ op: 'and', clauses }),
  desc: (column: unknown) => column,
}));

vi.mock('../db/client.js', () => ({
  getDb: () => ({
    select: () => {
      const state: { clause?: unknown } = {};
      const chain = {
        from() {
          return chain;
        },
        where(clause: unknown) {
          state.clause = clause;
          return chain;
        },
        orderBy() {
          return chain;
        },
        limit() {
          return Promise.resolve(harness.projects.filter((row) => harness.matches(row, state.clause)));
        },
      };
      return chain;
    },
    insert: () => ({
      values: (value: Record<string, unknown>) => ({
        returning: () => {
          const row = { ...value };
          harness.projects.push(row);
          return Promise.resolve([row]);
        },
      }),
    }),
    delete: () => ({
      where: (clause: unknown) => ({
        returning: () => {
          const removed: Array<Record<string, unknown>> = [];
          const kept: Array<Record<string, unknown>> = [];
          for (const row of harness.projects) {
            if (harness.matches(row, clause)) removed.push(row);
            else kept.push(row);
          }
          harness.projects.splice(0, harness.projects.length, ...kept);
          return Promise.resolve(removed);
        },
      }),
    }),
  }),
}));

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> };
}

interface MockRes {
  _status: number;
  _json: Record<string, unknown> | null;
  status(code: number): MockRes;
  json(data: Record<string, unknown>): MockRes;
}

let scan: Handler;
let query: Handler;
let listGraphs: Handler;
let createProject: Handler;
let readProject: Handler;
let deleteProject: Handler;

beforeAll(async () => {
  const { absorbRouter } = await import('./absorb.js');
  const stack = (absorbRouter as unknown as { stack: RouteLayer[] }).stack;
  const take = (method: string, path: string): Handler => {
    const route = stack.find((layer) => layer.route?.path === path && layer.route.methods[method])?.route;
    if (!route) throw new Error(`no ${method} ${path} route`);
    return route.stack[route.stack.length - 1].handle;
  };
  scan = take('post', '/scan');
  query = take('post', '/query');
  listGraphs = take('get', '/graphs');
  createProject = take('post', '/projects');
  readProject = take('get', '/projects/:id');
  deleteProject = take('delete', '/projects/:id');
});

beforeEach(() => {
  harness.projects.splice(0, harness.projects.length);
});

function mockRes(): MockRes {
  const res: MockRes = {
    _status: 200,
    _json: null,
    status(code) {
      res._status = code;
      return res;
    },
    json(data) {
      res._json = data;
      return res;
    },
  };
  return res;
}

function call(handler: Handler, req: Record<string, unknown>): Promise<MockRes> {
  const res = mockRes();
  return Promise.resolve(handler(req as unknown as Request, res as unknown as Response)).then(() => res);
}

let pathSeq = 0;

async function scanOwned(userId: string | undefined): Promise<string> {
  pathSeq += 1;
  const req: Record<string, unknown> = { body: { path: `/repo/owner-check-${pathSeq}`, shallow: true } };
  if (userId !== undefined) req.userId = userId;
  const res = await call(scan, req);
  expect(res._status).toBe(200);
  const graphId = res._json?.graphId;
  expect(typeof graphId).toBe('string');
  return graphId as string;
}

function queryReq(graphId: string, userId: string | undefined): Record<string, unknown> {
  const req: Record<string, unknown> = { body: { graphId, query: 'where is main', maxResults: 5 } };
  if (userId !== undefined) req.userId = userId;
  return req;
}

/** Status plus body, with the echoed graph id folded away so two refusals can be compared. */
function querySignature(res: MockRes): string {
  const body = { ...(res._json ?? {}) };
  if (typeof body.graphId === 'string') body.graphId = '<graphId>';
  return JSON.stringify({ status: res._status, body });
}

function responseSignature(res: MockRes): string {
  return JSON.stringify({ status: res._status, body: res._json });
}

function graphIds(res: MockRes): string[] {
  const graphs = res._json?.graphs;
  if (!Array.isArray(graphs)) return [];
  return graphs.map((entry) => (entry as { graphId?: string }).graphId ?? '');
}

async function postProject(userId: string, name: string): Promise<string> {
  const res = await call(createProject, {
    userId,
    body: { name, sourceType: 'local', localPath: `/tmp/${name}` },
  });
  expect(res._status).toBe(201);
  const project = res._json?.project as { id?: string } | undefined;
  expect(typeof project?.id).toBe('string');
  return project!.id as string;
}

describe('owner checks on graphs, query and projects', () => {
  it('caller B does not see caller A graphs', async () => {
    const graphA = await scanOwned(CALLER_A);
    const graphB = await scanOwned(CALLER_B);

    const listed = await call(listGraphs, { userId: CALLER_B });
    expect(listed._status).toBe(200);
    const ids = graphIds(listed);
    expect(ids).not.toContain(graphA);
    expect(ids).toContain(graphB);
  });

  it('caller A still sees their own graph', async () => {
    const graphA = await scanOwned(CALLER_A);

    const listed = await call(listGraphs, { userId: CALLER_A });
    expect(listed._status).toBe(200);
    expect(graphIds(listed)).toContain(graphA);
  });

  it('caller B querying caller A graph gets the same response as a missing graph', async () => {
    const graphA = await scanOwned(CALLER_A);
    const missing = await call(query, queryReq(MISSING_GRAPH, CALLER_B));
    const denied = await call(query, queryReq(graphA, CALLER_B));

    expect(missing._status).toBe(404);
    expect(missing._json).toEqual({ error: 'Graph not found', graphId: MISSING_GRAPH });
    expect(denied._status).toBe(404);
    expect(denied._json).toEqual({ error: 'Graph not found', graphId: graphA });
    expect(querySignature(denied)).toBe(querySignature(missing));
  });

  it('caller A can query their own graph', async () => {
    const graphA = await scanOwned(CALLER_A);
    const res = await call(query, queryReq(graphA, CALLER_A));

    expect(res._status).toBe(200);
    expect(res._json?.graphId).toBe(graphA);
    expect(Array.isArray(res._json?.results)).toBe(true);
    expect((res._json?.results as unknown[]).length).toBeGreaterThan(0);
  });

  it('caller B reading or deleting caller A project gets the missing project response and the project still exists', async () => {
    const projectA = await postProject(CALLER_A, 'project-a');
    const missingRead = await call(readProject, { userId: CALLER_B, params: { id: MISSING_PROJECT } });
    const deniedRead = await call(readProject, { userId: CALLER_B, params: { id: projectA } });
    const missingDelete = await call(deleteProject, { userId: CALLER_B, params: { id: MISSING_PROJECT } });
    const deniedDelete = await call(deleteProject, { userId: CALLER_B, params: { id: projectA } });

    expect(missingRead._status).toBe(404);
    expect(missingRead._json).toEqual({ error: 'Project not found' });
    expect(responseSignature(deniedRead)).toBe(responseSignature(missingRead));
    expect(responseSignature(deniedDelete)).toBe(responseSignature(missingDelete));

    const stillThere = await call(readProject, { userId: CALLER_A, params: { id: projectA } });
    expect(stillThere._status).toBe(200);
    expect((stillThere._json?.project as { id?: string }).id).toBe(projectA);
  });

  it('caller A can read their own project', async () => {
    const projectA = await postProject(CALLER_A, 'project-a-own');
    const res = await call(readProject, { userId: CALLER_A, params: { id: projectA } });

    expect(res._status).toBe(200);
    expect(res._json?.project).toMatchObject({ id: projectA, userId: CALLER_A, name: 'project-a-own' });
  });

  it('a caller with no signed-in account gets nothing from these routes', async () => {
    const graphA = await scanOwned(CALLER_A);
    const projectA = await postProject(CALLER_A, 'not-for-strangers');
    const strangers: Array<string | undefined> = [undefined, 'orchestrator:fleet-key', 'anonymous'];

    for (const userId of strangers) {
      const listed = await call(listGraphs, userId === undefined ? {} : { userId });
      expect(listed._json).toEqual({ graphs: [] });

      const missing = await call(query, queryReq(MISSING_GRAPH, userId));
      const denied = await call(query, queryReq(graphA, userId));
      expect(querySignature(denied)).toBe(querySignature(missing));
      expect(denied._json).toEqual({ error: 'Graph not found', graphId: graphA });

      const missingRead = await call(readProject, { ...(userId === undefined ? {} : { userId }), params: { id: MISSING_PROJECT } });
      const deniedRead = await call(readProject, { ...(userId === undefined ? {} : { userId }), params: { id: projectA } });
      expect(responseSignature(deniedRead)).toBe(responseSignature(missingRead));
      expect(deniedRead._json).toEqual({ error: 'Project not found' });

      const missingDelete = await call(deleteProject, { ...(userId === undefined ? {} : { userId }), params: { id: MISSING_PROJECT } });
      const deniedDelete = await call(deleteProject, { ...(userId === undefined ? {} : { userId }), params: { id: projectA } });
      expect(responseSignature(deniedDelete)).toBe(responseSignature(missingDelete));
    }

    const stillThere = await call(readProject, { userId: CALLER_A, params: { id: projectA } });
    expect(stillThere._status).toBe(200);
    expect((stillThere._json?.project as { id?: string }).id).toBe(projectA);
  });

  it('a graph with no owner is not visible on these routes', async () => {
    const ownerless = await scanOwned(undefined);

    for (const userId of [CALLER_A, CALLER_B, undefined] as const) {
      const listed = await call(listGraphs, userId === undefined ? {} : { userId });
      expect(graphIds(listed)).not.toContain(ownerless);
    }

    for (const userId of [CALLER_A, CALLER_B]) {
      const missing = await call(query, queryReq(MISSING_GRAPH, userId));
      const denied = await call(query, queryReq(ownerless, userId));
      expect(querySignature(denied)).toBe(querySignature(missing));
      expect(denied._json).toEqual({ error: 'Graph not found', graphId: ownerless });
    }
  });

  it('a project with no owner is not visible and is not deleted', async () => {
    const legacyId = 'cccccccc-dddd-4eee-8fff-000000000000';
    harness.projects.push({
      id: legacyId,
      userId: null,
      name: 'legacy-no-owner',
      sourceType: 'local',
      status: 'pending',
    });

    for (const userId of [CALLER_A, CALLER_B, undefined] as const) {
      const req = { ...(userId === undefined ? {} : { userId }), params: { id: legacyId } };
      const missingRead = await call(readProject, {
        ...(userId === undefined ? {} : { userId }),
        params: { id: MISSING_PROJECT },
      });
      const deniedRead = await call(readProject, req);
      expect(responseSignature(deniedRead)).toBe(responseSignature(missingRead));
      expect(deniedRead._json).toEqual({ error: 'Project not found' });

      const missingDelete = await call(deleteProject, {
        ...(userId === undefined ? {} : { userId }),
        params: { id: MISSING_PROJECT },
      });
      const deniedDelete = await call(deleteProject, req);
      expect(responseSignature(deniedDelete)).toBe(responseSignature(missingDelete));
    }

    expect(harness.projects.map((row) => row.id)).toEqual([legacyId]);
  });
});
