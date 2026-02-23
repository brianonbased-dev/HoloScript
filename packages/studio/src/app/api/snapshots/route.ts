import { NextRequest } from 'next/server';

/**
 * /api/snapshots — in-memory snapshot store.
 *
 * GET  /api/snapshots?sceneId=x      → list snapshots for scene
 * POST /api/snapshots                → save snapshot { sceneId, label, dataUrl, code }
 * DELETE /api/snapshots?id=x         → delete snapshot
 */

interface Snapshot {
  id: string;
  sceneId: string;
  label: string;
  dataUrl: string;  // base64 PNG from canvas.toDataURL()
  code: string;
  createdAt: string;
}

interface SnapshotStore { [sceneId: string]: Snapshot[] }

declare global { var __snapshots__: SnapshotStore | undefined; }
const store: SnapshotStore = globalThis.__snapshots__ ?? (globalThis.__snapshots__ = {});

function uid() { return `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

export async function GET(request: NextRequest) {
  const sceneId = request.nextUrl.searchParams.get('sceneId') ?? 'default';
  return Response.json({ snapshots: store[sceneId] ?? [] });
}

export async function POST(request: NextRequest) {
  let body: Partial<Snapshot>;
  try { body = (await request.json()) as Partial<Snapshot>; }
  catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }

  const { sceneId = 'default', label = 'Snapshot', dataUrl = '', code = '' } = body;
  const snap: Snapshot = { id: uid(), sceneId, label, dataUrl, code, createdAt: new Date().toISOString() };

  if (!store[sceneId]) store[sceneId] = [];
  store[sceneId]!.push(snap);
  // Keep max 30 per scene
  if (store[sceneId]!.length > 30) store[sceneId]!.shift();

  return Response.json({ snapshot: snap });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  for (const sceneId of Object.keys(store)) {
    const idx = store[sceneId]!.findIndex((s) => s.id === id);
    if (idx !== -1) {
      store[sceneId]!.splice(idx, 1);
      return Response.json({ ok: true });
    }
  }
  return Response.json({ error: 'Not found' }, { status: 404 });
}
