export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import type { AnnotationSession } from '../../../lib/annotation-types';

import { corsHeaders } from '../_lib/cors';
/**
 * Annotation Sessions API
 *
 * POST /api/annotations — Create a new session or add annotations to existing
 * GET  /api/annotations — List all sessions
 * DELETE /api/annotations — Clear all sessions
 */

// In-memory store (survives hot reloads in dev via globalThis)
const globalStore = globalThis as unknown as {
  __annotationSessions?: Map<string, AnnotationSession>;
};
if (!globalStore.__annotationSessions) {
  globalStore.__annotationSessions = new Map();
}
const sessions = globalStore.__annotationSessions;

export async function GET() {
  const all = Array.from(sessions.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return NextResponse.json({
    sessions: all,
    count: all.length,
    pending: all.reduce(
      (sum, s) => sum + s.annotations.filter((a) => a.status !== 'resolved').length,
      0
    ),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, annotations, route, metadata, action } = body;

    // Action: resolve an annotation
    if (action === 'resolve' && sessionId && body.annotationId) {
      const session = sessions.get(sessionId);
      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      const ann = session.annotations.find((a) => a.id === body.annotationId);
      if (ann) {
        ann.status = 'resolved';
        ann.resolvedAt = new Date().toISOString();
        ann.resolvedBy = body.resolvedBy ?? 'agent';
        session.updatedAt = new Date().toISOString();
      }
      return NextResponse.json({ session });
    }

    // Action: acknowledge annotations
    if (action === 'acknowledge' && sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      for (const ann of session.annotations) {
        if (ann.status === 'pending') {
          ann.status = 'acknowledged';
        }
      }
      session.updatedAt = new Date().toISOString();
      return NextResponse.json({ session });
    }

    // Create or update session
    const id = sessionId ?? `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const existing = sessions.get(id);

    if (existing) {
      // Merge new annotations
      if (annotations?.length) {
        existing.annotations.push(...annotations);
      }
      existing.updatedAt = new Date().toISOString();
      if (metadata) existing.metadata = { ...existing.metadata, ...metadata };
      return NextResponse.json({ session: existing, created: false });
    }

    const session: AnnotationSession = {
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      route: route ?? '/',
      annotations: annotations ?? [],
      metadata,
    };
    sessions.set(id, session);

    return NextResponse.json({ session, created: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid request body', details: String(err) },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  sessions.clear();
  return NextResponse.json({ cleared: true });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
