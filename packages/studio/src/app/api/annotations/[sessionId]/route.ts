export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import type { AnnotationSession, StoredAnnotation } from '../../../../lib/annotation-types';

import { corsHeaders } from '../../_lib/cors';
/**
 * Session-specific annotation endpoint
 *
 * GET    /api/annotations/:sessionId — Get session with all annotations
 * PATCH  /api/annotations/:sessionId — Update annotation status/metadata
 * DELETE /api/annotations/:sessionId — Delete a session
 */

const globalStore = globalThis as unknown as {
  __annotationSessions?: Map<string, AnnotationSession>;
};
const sessions = (): Map<string, AnnotationSession> =>
  globalStore.__annotationSessions ?? new Map<string, AnnotationSession>();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = sessions().get(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Summary stats for agents
  const stats = {
    total: session.annotations.length,
    pending: session.annotations.filter((a) => a.status === 'pending' || !a.status).length,
    acknowledged: session.annotations.filter((a) => a.status === 'acknowledged').length,
    resolved: session.annotations.filter((a) => a.status === 'resolved').length,
    blocking: session.annotations.filter((a) => a.severity === 'blocking').length,
    byIntent: {
      fix: session.annotations.filter((a) => a.intent === 'fix').length,
      change: session.annotations.filter((a) => a.intent === 'change').length,
      question: session.annotations.filter((a) => a.intent === 'question').length,
      approve: session.annotations.filter((a) => a.intent === 'approve').length,
    },
  };

  return NextResponse.json({ session, stats });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = sessions().get(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  try {
    const body = await req.json();

    // Update individual annotation
    if (body.annotationId) {
      const ann = session.annotations.find((a) => a.id === body.annotationId);
      if (!ann) {
        return NextResponse.json({ error: 'Annotation not found' }, { status: 404 });
      }
      if (body.status) ann.status = body.status;
      if (body.intent) ann.intent = body.intent;
      if (body.severity) ann.severity = body.severity;
      if (body.comment !== undefined) ann.comment = body.comment;
      if (body.resolvedBy) {
        ann.resolvedBy = body.resolvedBy;
        ann.resolvedAt = new Date().toISOString();
      }
      session.updatedAt = new Date().toISOString();
      return NextResponse.json({ annotation: ann });
    }

    // Bulk update session metadata
    if (body.metadata) {
      session.metadata = { ...session.metadata, ...body.metadata };
      session.updatedAt = new Date().toISOString();
    }

    return NextResponse.json({ session });
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid request body', details: String(err) },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const existed = sessions().delete(sessionId);
  if (!existed) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
