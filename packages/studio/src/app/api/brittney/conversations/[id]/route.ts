import { NextRequest, NextResponse } from 'next/server';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import {
  deleteConversation,
  getConversation,
  getMessages,
  updateConversation,
} from '@/lib/brittney/conversationStore';
import { corsHeaders } from '../../../_lib/cors';

/**
 * /api/brittney/conversations/[id] — single Brittney chat thread.
 *
 * GET    → conversation + its messages (?afterSeq=N for incremental fetch,
 *          ?excludeMessages=1 for metadata only)
 * PATCH  → { title?, archived? } rename / archive / unarchive
 * DELETE → delete the conversation and its messages
 *
 * Owner-scoped: a non-owner gets 404 (indistinguishable from missing so the
 * id space can't be probed).
 */

const MAX_TITLE_CHARS = 200;

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuthOrApiKey(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const conversation = await getConversation(auth.user.id, id);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  if (request.nextUrl.searchParams.get('excludeMessages') === '1') {
    return NextResponse.json({ conversation });
  }

  const afterSeqRaw = request.nextUrl.searchParams.get('afterSeq');
  const afterSeq = afterSeqRaw !== null ? Number.parseInt(afterSeqRaw, 10) : undefined;
  if (afterSeq !== undefined && !Number.isFinite(afterSeq)) {
    return NextResponse.json({ error: 'afterSeq must be an integer' }, { status: 400 });
  }

  const messages = await getMessages(auth.user.id, id, { afterSeq });
  return NextResponse.json({ conversation, messages: messages ?? [] });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuthOrApiKey(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let body: { title?: string; archived?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.title === undefined && body.archived === undefined) {
    return NextResponse.json({ error: 'Provide `title` and/or `archived`' }, { status: 400 });
  }
  if (body.title !== undefined && typeof body.title !== 'string') {
    return NextResponse.json({ error: '`title` must be a string' }, { status: 400 });
  }
  if (body.title !== undefined && body.title.length > MAX_TITLE_CHARS) {
    return NextResponse.json({ error: `title exceeds ${MAX_TITLE_CHARS} characters` }, { status: 413 });
  }
  if (body.archived !== undefined && typeof body.archived !== 'boolean') {
    return NextResponse.json({ error: '`archived` must be a boolean' }, { status: 400 });
  }

  const conversation = await updateConversation(auth.user.id, id, {
    title: body.title?.trim(),
    archived: body.archived,
  });
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  return NextResponse.json({ conversation });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuthOrApiKey(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const deleted = await deleteConversation(auth.user.id, id);
  if (!deleted) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, PATCH, DELETE, OPTIONS' }),
  });
}
