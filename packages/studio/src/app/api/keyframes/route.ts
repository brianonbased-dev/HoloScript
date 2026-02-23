import { NextRequest } from 'next/server';

/**
 * GET  /api/keyframes?sceneId=  — list all tracks + keyframes for a scene
 * POST /api/keyframes            — add/update a keyframe: { sceneId, track, time, value }
 * DELETE /api/keyframes?id=      — remove keyframe by id
 */

export interface Keyframe {
  id: string;
  track: string;       // e.g. "Column A.position.x"
  time: number;        // seconds
  value: number;       // numeric
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface AnimTrack {
  id: string;
  sceneId: string;
  name: string;          // human label e.g. "Column A → position.x"
  property: string;      // e.g. "position.x"
  objectName: string;
  keyframes: Keyframe[];
}

interface KFStore { [sceneId: string]: AnimTrack[] }

declare global { var __kfStore__: KFStore | undefined; }
const store: KFStore = globalThis.__kfStore__ ?? (globalThis.__kfStore__ = {});

function uid() { return Math.random().toString(36).slice(2, 10); }

export async function GET(request: NextRequest) {
  const sceneId = request.nextUrl.searchParams.get('sceneId') ?? 'default';
  return Response.json({ tracks: store[sceneId] ?? [], sceneId });
}

interface KFBody { sceneId?: string; trackId?: string; objectName?: string; property?: string; time?: number; value?: number; easing?: Keyframe['easing'] }

export async function POST(request: NextRequest) {
  let body: KFBody;
  try { body = (await request.json()) as KFBody; } catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }

  const sceneId = body.sceneId ?? 'default';
  if (!store[sceneId]) store[sceneId] = [];

  const tracks = store[sceneId];
  let track = body.trackId ? tracks.find((t) => t.id === body.trackId) : undefined;

  // Auto-create track if needed
  if (!track && body.objectName && body.property) {
    track = {
      id: uid(), sceneId, objectName: body.objectName,
      property: body.property,
      name: `${body.objectName} → ${body.property}`,
      keyframes: [],
    };
    tracks.push(track);
  }

  if (!track) return Response.json({ error: 'Track not found' }, { status: 404 });

  const kf: Keyframe = {
    id: uid(), track: track.id,
    time: body.time ?? 0,
    value: body.value ?? 0,
    easing: body.easing ?? 'linear',
  };
  // Replace if same time exists on this track
  const existing = track.keyframes.findIndex((k) => Math.abs(k.time - kf.time) < 0.01);
  if (existing >= 0) track.keyframes[existing] = { ...kf, id: track.keyframes[existing]!.id };
  else track.keyframes.push(kf);
  track.keyframes.sort((a, b) => a.time - b.time);

  return Response.json({ track, keyframe: kf });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  const sceneId = request.nextUrl.searchParams.get('sceneId') ?? 'default';
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  const tracks = store[sceneId] ?? [];
  for (const t of tracks) {
    const idx = t.keyframes.findIndex((k) => k.id === id);
    if (idx >= 0) { t.keyframes.splice(idx, 1); return Response.json({ ok: true }); }
  }
  return Response.json({ error: 'Not found' }, { status: 404 });
}
