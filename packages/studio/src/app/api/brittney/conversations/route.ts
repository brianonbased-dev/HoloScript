import { NextRequest, NextResponse } from 'next/server';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { createConversation, listConversations } from '@/lib/brittney/conversationStore';
import { corsHeaders } from '../../_lib/cors';

/**
 * /api/brittney/conversations — server-backed Brittney chat threads.
 *
 * GET  /api/brittney/conversations?scope=…&includeArchived=1
 *        → list the authenticated user's conversations (newest activity first)
 * POST /api/brittney/conversations { scope, title? }
 *        → create a conversation thread
 *
 * Chat history previously lived ONLY in browser localStorage (200-message
 * cap, lost on browser close / new device). These routes are the durable
 * write path; the client keeps localStorage as an offline cache of the
 * active thread and syncs through here.
 *
 * Every row is scoped to ownerId = session.user.id. Accepts NextAuth
 * sessions or Brittney API keys (`Authorization: Bearer bk_*`), same as
 * POST /api/brittney.
 */

const MAX_SCOPE_CHARS = 200;
const MAX_TITLE_CHARS = 200;

export async function GET(request: NextRequest) {
  const auth = await requireAuthOrApiKey(request);
  if (auth instanceof NextResponse) return auth;

  const scope = request.nextUrl.searchParams.get('scope') ?? undefined;
  const includeArchived = request.nextUrl.searchParams.get('includeArchived') === '1';

  const conversations = await listConversations(auth.user.id, { scope, includeArchived });
  return NextResponse.json({ conversations });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthOrApiKey(request);
  if (auth instanceof NextResponse) return auth;

  let body: { scope?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const scope = (body.scope ?? '').trim();
  if (!scope) {
    return NextResponse.json({ error: '`scope` is required' }, { status: 400 });
  }
  if (scope.length > MAX_SCOPE_CHARS) {
    return NextResponse.json({ error: `scope exceeds ${MAX_SCOPE_CHARS} characters` }, { status: 413 });
  }
  const title = (body.title ?? '').trim();
  if (title.length > MAX_TITLE_CHARS) {
    return NextResponse.json({ error: `title exceeds ${MAX_TITLE_CHARS} characters` }, { status: 413 });
  }

  const conversation = await createConversation(auth.user.id, scope, title);
  return NextResponse.json({ conversation }, { status: 201 });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, OPTIONS' }),
  });
}
