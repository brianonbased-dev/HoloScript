export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '../../../db/client';
import { projects } from '../../../db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getSession, requireAuth } from '../../../lib/api-auth';

import { corsHeaders } from '../_lib/cors';

/**
 * /api/projects — server-backed project store (the write path that was missing).
 *
 * GET    /api/projects          → list the authenticated user's projects
 * GET    /api/projects?id=x      → fetch a single owned project (incl. code)
 * POST   /api/projects          → create OR upsert a project { name, code?, description?, slug?, id?, metadata? }
 * DELETE /api/projects?id=x      → delete an owned project
 *
 * Every row is scoped to projects.ownerId = session.user.id (FK users.id).
 * Uses PostgreSQL via Drizzle when DATABASE_URL is set; falls back to a
 * per-process in-memory store for local dev without a database.
 *
 * History: the web app had NO server write path for projects. `saveProject()`
 * wrote to browser IndexedDB but had zero callers, ProjectManager rendered
 * hard-coded demo data, and the Postgres `projects` table (FK users.id) was
 * never queried — the root cause of the "no projects showing up" report. This
 * route is that write path.
 *
 * String-id reconciliation: clients may carry a non-uuid project id (the old
 * IndexedDB `${Date.now()}-${rand}` ids, or a freshly-minted client id). The
 * server PK is a uuid. On POST we treat a client-supplied `id` as an upsert
 * KEY only when it is a valid uuid AND already owned by the caller; otherwise
 * we mint a fresh uuid and return it so the client can adopt the canonical id.
 */

const MAX_PROJECT_CODE_CHARS = 4 * 1024 * 1024;
const MAX_NAME_CHARS = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProjectRow {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  code: string;
  metadata: Record<string, unknown>;
  visibility: string;
  createdAt: string;
  updatedAt: string;
}

// Fallback in-memory store for local dev (keyed by project id).
// Resolved via a getter (not a captured const) so tests can reset the store
// by reassigning globalThis.__projects__ between cases.
declare global {
  // eslint-disable-next-line no-var
  var __projects__: Map<string, ProjectRow> | undefined;
}
function getMemStore(): Map<string, ProjectRow> {
  return (globalThis.__projects__ ??= new Map());
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'untitled';
}

/** Ensure (ownerId, slug) is unique for the in-memory fallback. */
function uniqueMemSlug(ownerId: string, desired: string, excludeId?: string): string {
  const store = getMemStore();
  let slug = desired;
  let n = 1;
  const taken = (s: string) =>
    [...store.values()].some(
      (p) => p.ownerId === ownerId && p.slug === s && p.id !== excludeId
    );
  while (taken(slug)) {
    slug = `${desired}-${++n}`;
  }
  return slug;
}

function toClient(r: ProjectRow, includeCode: boolean) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    visibility: r.visibility,
    metadata: r.metadata,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ...(includeCode ? { code: r.code } : {}),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const id = request.nextUrl.searchParams.get('id');
  const db = getDb();

  if (db) {
    if (id) {
      const [row] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
        .limit(1);
      if (!row) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      return NextResponse.json({ project: dbRowToClient(row, true) });
    }

    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, userId))
      .orderBy(desc(projects.updatedAt))
      .limit(200);
    return NextResponse.json({ projects: rows.map((r) => dbRowToClient(r, false)) });
  }

  // Fallback: in-memory, owner-scoped.
  const store = getMemStore();
  if (id) {
    const row = store.get(id);
    if (!row || row.ownerId !== userId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ project: toClient(row, true) });
  }
  const list = [...store.values()]
    .filter((p) => p.ownerId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((p) => toClient(p, false));
  return NextResponse.json({ projects: list });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  let body: {
    id?: string;
    name?: string;
    slug?: string;
    code?: string;
    description?: string;
    visibility?: string;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: '`name` is required' }, { status: 400 });
  }
  if (name.length > MAX_NAME_CHARS) {
    return NextResponse.json(
      { error: `name exceeds ${MAX_NAME_CHARS} characters` },
      { status: 413 }
    );
  }
  const code = body.code ?? '';
  if (code.length > MAX_PROJECT_CODE_CHARS) {
    return NextResponse.json(
      { error: `code exceeds ${MAX_PROJECT_CODE_CHARS} characters` },
      { status: 413 }
    );
  }
  const description = body.description ?? null;
  const visibility = body.visibility === 'public' ? 'public' : 'private';
  const metadata = (body.metadata ?? {}) as Record<string, unknown>;
  const desiredSlug = slugify(body.slug || name);

  // A client-supplied id is only an upsert KEY when it's a valid uuid that the
  // caller already owns. Anything else (legacy IndexedDB string ids, junk) →
  // mint a fresh uuid; the client adopts the returned canonical id.
  const upsertId = body.id && UUID_RE.test(body.id) ? body.id : null;

  const db = getDb();
  if (db) {
    if (upsertId) {
      const [existing] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, upsertId), eq(projects.ownerId, userId)))
        .limit(1);
      if (existing) {
        const [updated] = await db
          .update(projects)
          .set({
            name,
            description,
            code,
            visibility,
            metadata,
            updatedAt: new Date(),
          })
          .where(and(eq(projects.id, upsertId), eq(projects.ownerId, userId)))
          .returning();
        return NextResponse.json({ project: dbRowToClient(updated, true) });
      }
      // upsertId given but not owned → fall through to insert with new uuid.
    }

    // Insert. Reconcile slug collisions for this owner with a numeric suffix.
    const row = await insertWithUniqueSlug(db, {
      ownerId: userId,
      name,
      desiredSlug,
      description,
      code,
      visibility,
      metadata,
    });
    return NextResponse.json({ project: dbRowToClient(row, true) }, { status: 201 });
  }

  // Fallback: in-memory.
  const store = getMemStore();
  const now = new Date().toISOString();
  if (upsertId && store.get(upsertId)?.ownerId === userId) {
    const prev = store.get(upsertId)!;
    const slug = uniqueMemSlug(userId, desiredSlug, upsertId);
    const updated: ProjectRow = {
      ...prev,
      name,
      slug,
      description,
      code,
      visibility,
      metadata,
      updatedAt: now,
    };
    store.set(upsertId, updated);
    return NextResponse.json({ project: toClient(updated, true) });
  }
  const id = randomUUID();
  const row: ProjectRow = {
    id,
    ownerId: userId,
    name,
    slug: uniqueMemSlug(userId, desiredSlug),
    description,
    code,
    metadata,
    visibility,
    createdAt: now,
    updatedAt: now,
  };
  store.set(id, row);
  return NextResponse.json({ project: toClient(row, true) }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = getDb();
  if (db) {
    const deleted = await db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
      .returning();
    if (deleted.length === 0) {
      // Don't distinguish missing-vs-not-owned so a non-owner can't probe.
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  // Fallback: in-memory.
  const store = getMemStore();
  const row = store.get(id);
  if (!row || row.ownerId !== userId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  store.delete(id);
  return NextResponse.json({ ok: true });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}

// --- DB helpers -------------------------------------------------------------

type DbProjectRow = {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  code: string | null;
  metadata: unknown;
  visibility: string;
  createdAt: Date;
  updatedAt: Date;
};

function dbRowToClient(r: DbProjectRow, includeCode: boolean) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    visibility: r.visibility,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    ...(includeCode ? { code: r.code ?? '' } : {}),
  };
}

/**
 * Insert a project, resolving (ownerId, slug) uniqueness violations by
 * appending a numeric suffix and retrying. The schema enforces a unique index
 * on (owner_id, slug); without this a second project named "Untitled" by the
 * same user would 500 on the DB constraint instead of saving cleanly.
 */
async function insertWithUniqueSlug(
  db: NonNullable<ReturnType<typeof getDb>>,
  input: {
    ownerId: string;
    name: string;
    desiredSlug: string;
    description: string | null;
    code: string;
    visibility: string;
    metadata: Record<string, unknown>;
  }
): Promise<DbProjectRow> {
  for (let attempt = 1; attempt <= 25; attempt++) {
    const slug = attempt === 1 ? input.desiredSlug : `${input.desiredSlug}-${attempt}`;
    try {
      const [row] = await db
        .insert(projects)
        .values({
          ownerId: input.ownerId,
          name: input.name,
          slug,
          description: input.description,
          code: input.code,
          visibility: input.visibility,
          metadata: input.metadata,
        })
        .returning();
      return row;
    } catch (err) {
      // Postgres unique_violation = 23505. Retry with the next suffix; rethrow
      // anything else.
      const code = (err as { code?: string })?.code;
      if (code === '23505' && attempt < 25) continue;
      throw err;
    }
  }
  throw new Error('Could not allocate a unique project slug after 25 attempts');
}
