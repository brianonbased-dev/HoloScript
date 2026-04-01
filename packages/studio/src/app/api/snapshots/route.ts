import { NextRequest } from 'next/server';
import { getDb } from '../../../db/client';
import { sceneSnapshots } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { isStorageConfigured, uploadFile, deleteFile } from '../../../lib/storage-s3';
import { logger } from '@/lib/logger';

/**
 * /api/snapshots — scene snapshot store.
 *
 * GET    /api/snapshots?sceneId=x  → list snapshots for scene
 * POST   /api/snapshots            → save snapshot { sceneId, label, dataUrl, code }
 * DELETE /api/snapshots?id=x       → delete snapshot
 *
 * Uses PostgreSQL via Drizzle when DATABASE_URL is set.
 * Falls back to in-memory store for local dev without a database.
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
  const sceneId = request.nextUrl.searchParams.get('sceneId') ?? 'default';

  const db = getDb();
  if (db) {
    const rows = await db
      .select()
      .from(sceneSnapshots)
      .where(eq(sceneSnapshots.projectId, sceneId))
      .orderBy(desc(sceneSnapshots.createdAt))
      .limit(30);

    const snapshots = rows.map((r) => {
      const meta = r.metadata as Record<string, string> | null;
      return {
        id: r.id,
        sceneId: r.projectId,
        label: meta?.label ?? 'Snapshot',
        dataUrl: r.imageUrl,
        code: meta?.code ?? '',
        createdAt: r.createdAt.toISOString(),
      };
    });

    return Response.json({ snapshots });
  }

  // Fallback: in-memory
  return Response.json({ snapshots: store[sceneId] ?? [] });
}

export async function POST(request: NextRequest) {
  let body: Partial<Snapshot>;
  try {
    body = (await request.json()) as Partial<Snapshot>;
  } catch {
    return Response.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const { sceneId = 'default', label = 'Snapshot', dataUrl = '', code = '' } = body;

  // Upload base64 image to S3 when configured
  let imageUrl = dataUrl;
  if (dataUrl && dataUrl.startsWith('data:image/') && isStorageConfigured()) {
    try {
      const [header, base64Data] = dataUrl.split(',');
      const mimeMatch = header.match(/data:([^;]+)/);
      const mime = mimeMatch?.[1] ?? 'image/png';
      const ext = mime.split('/')[1] ?? 'png';
      const buffer = Buffer.from(base64Data, 'base64');
      const key = `snapshots/${sceneId}/${Date.now().toString(36)}.${ext}`;
      imageUrl = await uploadFile(key, buffer, mime);
    } catch {
      // Fall back to storing base64 inline
      imageUrl = dataUrl;
    }
  }

  const db = getDb();
  if (db) {
    const [row] = await db
      .insert(sceneSnapshots)
      .values({
        projectId: sceneId,
        imageUrl,
        metadata: { label, code },
      })
      .returning();

    return Response.json({
      snapshot: {
        id: row.id,
        sceneId: row.projectId,
        label,
        dataUrl: row.imageUrl,
        code,
        createdAt: row.createdAt.toISOString(),
      },
    });
  }

  // Fallback: in-memory
  const snap: Snapshot = {
    id: uid(),
    sceneId,
    label,
    dataUrl,
    code,
    createdAt: new Date().toISOString(),
  };

  if (!store[sceneId]) store[sceneId] = [];
  store[sceneId]!.push(snap);
  if (store[sceneId]!.length > 30) store[sceneId]!.shift();

  return Response.json({ snapshot: snap });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const db = getDb();
  if (db) {
    const deleted = await db
      .delete(sceneSnapshots)
      .where(eq(sceneSnapshots.id, id))
      .returning();

    if (deleted.length > 0) {
      // Clean up S3 image if it's an S3 URL (not base64)
      const imageUrl = deleted[0].imageUrl;
      if (imageUrl && !imageUrl.startsWith('data:') && isStorageConfigured()) {
        const key = imageUrl.split('/').slice(-3).join('/'); // snapshots/sceneId/file.ext
        deleteFile(key).catch((err) => logger.warn('Swallowed error caught:', err)); // Best-effort cleanup
      }
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // Fallback: in-memory
  for (const sceneId of Object.keys(store)) {
    const idx = store[sceneId]!.findIndex((s) => s.id === id);
    if (idx !== -1) {
      store[sceneId]!.splice(idx, 1);
      return Response.json({ ok: true });
    }
  }
  return Response.json({ error: 'Not found' }, { status: 404 });
}
