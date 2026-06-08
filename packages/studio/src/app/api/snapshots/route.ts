export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../db/client';
import { sceneSnapshots } from '../../../db/schema';
import { and, eq, desc, like } from 'drizzle-orm';
import { isStorageConfigured, uploadFile, deleteFile } from '../../../lib/storage-s3';
import { logger } from '@/lib/logger';

import { corsHeaders } from '../_lib/cors';
import { requireAuth } from '@/lib/api-auth';
import {
  scopedSceneKey,
  unscopeSceneId,
  ownerScopePrefix,
  escapeLike,
} from '../_lib/sceneOwnerScope';
import { virusScanHookPoint } from '@/lib/virusScanHookPoint';

/** SEC-T12: max raw JSON body for POST (scene code + data URL). */
const MAX_SNAPSHOT_POST_BYTES = 36 * 1024 * 1024;
/** SEC-T12: max decoded image bytes when data:image/* is uploaded to S3. */
const MAX_SNAPSHOT_IMAGE_BYTES = 25 * 1024 * 1024;
/** SEC-T12: max HoloScript snapshot code stored alongside the image. */
const MAX_SNAPSHOT_CODE_CHARS = 2 * 1024 * 1024;

const ALLOWED_SNAPSHOT_IMAGE_HEADER = /^data:image\/(png|jpeg|jpg|webp|gif);/i;

/**
 * /api/snapshots — scene snapshot store.
 *
 * GET    /api/snapshots?sceneId=x  → list snapshots for scene
 * POST   /api/snapshots            → save snapshot { sceneId, label, dataUrl, code }
 * DELETE /api/snapshots?id=x       → delete snapshot
 *
 * Uses PostgreSQL via Drizzle when DATABASE_URL is set.
 * Falls back to in-memory store for local dev without a database.
 *
 * SECURITY (task_1780469216849_kd86): every read/write requires auth and is
 * scoped to the caller via an owner-namespaced storage key
 * (`${userId}::${sceneId}` in the `project_id` text column). DELETE additionally
 * verifies the snapshot's owner-prefixed key matches the caller before removing
 * it — a second user deleting by a guessed `id` gets 404, not the owner's row.
 * See ../_lib/sceneOwnerScope.ts for the rationale.
 */

interface Snapshot {
  id: string;
  sceneId: string;
  label: string;
  dataUrl: string;
  code: string;
  createdAt: string;
}

interface SnapshotStore {
  [sceneId: string]: Snapshot[];
}

// Fallback in-memory store for local dev
declare global {
  var __snapshots__: SnapshotStore | undefined;
}
const store: SnapshotStore = globalThis.__snapshots__ ?? (globalThis.__snapshots__ = {});

function uid() {
  return `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const sceneId = request.nextUrl.searchParams.get('sceneId') ?? 'default';
  const scopedKey = scopedSceneKey(userId, sceneId);

  const db = getDb();
  if (db) {
    const rows = await db
      .select()
      .from(sceneSnapshots)
      .where(eq(sceneSnapshots.projectId, scopedKey))
      .orderBy(desc(sceneSnapshots.createdAt))
      .limit(30);

    const snapshots = rows.map((r) => {
      const meta = r.metadata as Record<string, string> | null;
      return {
        id: r.id,
        sceneId: unscopeSceneId(r.projectId, userId),
        label: meta?.label ?? 'Snapshot',
        dataUrl: r.imageUrl,
        code: meta?.code ?? '',
        createdAt: r.createdAt.toISOString(),
      };
    });

    return Response.json({ snapshots });
  }

  // Fallback: in-memory (owner-scoped key)
  return Response.json({
    snapshots: (store[scopedKey] ?? []).map((s) => ({ ...s, sceneId })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const n = parseInt(contentLength, 10);
    if (Number.isFinite(n) && n > MAX_SNAPSHOT_POST_BYTES) {
      return Response.json(
        { error: `Request body exceeds ${MAX_SNAPSHOT_POST_BYTES} bytes` },
        { status: 413 }
      );
    }
  }

  let body: Partial<Snapshot>;
  try {
    body = (await request.json()) as Partial<Snapshot>;
  } catch {
    return Response.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const { sceneId = 'default', label = 'Snapshot', dataUrl = '', code = '' } = body;
  const scopedKey = scopedSceneKey(userId, sceneId);

  if (code.length > MAX_SNAPSHOT_CODE_CHARS) {
    return Response.json(
      { error: `Snapshot code exceeds ${MAX_SNAPSHOT_CODE_CHARS} characters` },
      { status: 413 }
    );
  }

  if (
    dataUrl &&
    dataUrl.startsWith('data:') &&
    !ALLOWED_SNAPSHOT_IMAGE_HEADER.test(dataUrl.split(',')[0] ?? '')
  ) {
    return Response.json(
      { error: 'Only data:image/png, jpeg, webp, or gif snapshots are allowed' },
      { status: 400 }
    );
  }

  // Upload base64 image to S3 when configured
  let imageUrl = dataUrl;
  if (dataUrl && dataUrl.startsWith('data:image/') && isStorageConfigured()) {
    try {
      const comma = dataUrl.indexOf(',');
      if (comma === -1) {
        return Response.json({ error: 'Malformed data URL' }, { status: 400 });
      }
      const header = dataUrl.slice(0, comma);
      const base64Data = dataUrl.slice(comma + 1);
      const approxDecoded = Math.floor((base64Data.length * 3) / 4);
      if (approxDecoded > MAX_SNAPSHOT_IMAGE_BYTES) {
        return Response.json(
          { error: `Snapshot image exceeds ${MAX_SNAPSHOT_IMAGE_BYTES} bytes (decoded estimate)` },
          { status: 413 }
        );
      }
      const mimeMatch = header.match(/data:([^;]+)/);
      const mime = mimeMatch?.[1] ?? 'image/png';
      const ext = (mime.split('/')[1] ?? 'png').replace(/[^a-z0-9]/gi, '') || 'png';
      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length > MAX_SNAPSHOT_IMAGE_BYTES) {
        return Response.json(
          { error: `Snapshot image exceeds ${MAX_SNAPSHOT_IMAGE_BYTES} bytes` },
          { status: 413 }
        );
      }
      virusScanHookPoint(`snapshots:${ext}`, buffer);
      const key = `snapshots/${encodeURIComponent(scopedKey)}/${Date.now().toString(36)}.${ext}`;
      imageUrl = await uploadFile(key, buffer, mime);
    } catch (err) {
      logger.warn('[snapshots] S3 upload failed:', err);
      return Response.json({ error: 'Failed to upload snapshot image' }, { status: 502 });
    }
  } else if (dataUrl && dataUrl.startsWith('data:image/') && !isStorageConfigured()) {
    const comma = dataUrl.indexOf(',');
    if (comma !== -1) {
      const base64Data = dataUrl.slice(comma + 1);
      const approxDecoded = Math.floor((base64Data.length * 3) / 4);
      if (approxDecoded > MAX_SNAPSHOT_IMAGE_BYTES) {
        return Response.json(
          { error: `Snapshot image exceeds ${MAX_SNAPSHOT_IMAGE_BYTES} bytes` },
          { status: 413 }
        );
      }
      try {
        const buf = Buffer.from(base64Data, 'base64');
        if (buf.length > MAX_SNAPSHOT_IMAGE_BYTES) {
          return Response.json(
            { error: `Snapshot image exceeds ${MAX_SNAPSHOT_IMAGE_BYTES} bytes` },
            { status: 413 }
          );
        }
        virusScanHookPoint('snapshots:inline', buf);
      } catch {
        return Response.json({ error: 'Invalid base64 in data URL' }, { status: 400 });
      }
    }
  }

  const db = getDb();
  if (db) {
    const [row] = await db
      .insert(sceneSnapshots)
      .values({
        projectId: scopedKey,
        imageUrl,
        metadata: { label, code },
      })
      .returning();

    return Response.json({
      snapshot: {
        id: row.id,
        sceneId: unscopeSceneId(row.projectId, userId),
        label,
        dataUrl: row.imageUrl,
        code,
        createdAt: row.createdAt.toISOString(),
      },
    });
  }

  // Fallback: in-memory (owner-scoped key)
  const snap: Snapshot = {
    id: uid(),
    sceneId,
    label,
    dataUrl,
    code,
    createdAt: new Date().toISOString(),
  };

  if (!store[scopedKey]) store[scopedKey] = [];
  store[scopedKey]!.push(snap);
  if (store[scopedKey]!.length > 30) store[scopedKey]!.shift();

  return Response.json({ snapshot: snap });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const ownerPrefix = ownerScopePrefix(userId);

  const db = getDb();
  if (db) {
    // Scope the delete to rows owned by the caller. A snapshot's owner is
    // encoded as the `${userId}::` prefix on its project_id; a non-owner
    // deleting by a guessed id matches no row and gets 404 (not the owner's).
    const deleted = await db
      .delete(sceneSnapshots)
      .where(
        and(
          eq(sceneSnapshots.id, id),
          like(sceneSnapshots.projectId, `${escapeLike(ownerPrefix)}%`)
        )
      )
      .returning();

    if (deleted.length > 0) {
      // Clean up S3 image if it's an S3 URL (not base64)
      const imageUrl = deleted[0].imageUrl;
      if (imageUrl && !imageUrl.startsWith('data:') && isStorageConfigured()) {
        const key = imageUrl.split('/').slice(-3).join('/'); // snapshots/<scopedKey>/file.ext
        deleteFile(key).catch((err) => logger.warn('Swallowed error caught:', err)); // Best-effort cleanup
      }
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // Fallback: in-memory — only search the caller's owner-scoped buckets.
  for (const scopedKey of Object.keys(store)) {
    if (!scopedKey.startsWith(ownerPrefix)) continue;
    const idx = store[scopedKey]!.findIndex((s) => s.id === id);
    if (idx !== -1) {
      store[scopedKey]!.splice(idx, 1);
      return Response.json({ ok: true });
    }
  }
  return Response.json({ error: 'Not found' }, { status: 404 });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
