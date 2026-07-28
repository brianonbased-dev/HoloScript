import { NextRequest, NextResponse } from 'next/server';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { appendMessages, type MessageInput } from '@/lib/brittney/conversationStore';
import { corsHeaders } from '../../../../_lib/cors';

/**
 * POST /api/brittney/conversations/[id]/messages — append chat turns.
 *
 * Body: { messages: [{ role, content, toolCalls?, timestamp? }, …] }
 *
 * The server assigns monotonic `seq` numbers (unique per conversation), bumps
 * the conversation's messageCount / lastMessageAt, and auto-titles the thread
 * from its first user message when no title is set. Batched so a client can
 * back-sync an offline localStorage thread in one call.
 */

const MAX_BATCH = 100;
const MAX_CONTENT_CHARS = 128 * 1024;
// SEC: tool_calls is jsonb with no DB-level bound — cap the serialized payload
// per message so large MCP/absorb tool results can't bloat rows via this route.
const MAX_TOOL_CALLS_CHARS = 64 * 1024;

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuthOrApiKey(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: '`messages` must be a non-empty array' }, { status: 400 });
  }
  if (body.messages.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `messages exceeds batch limit of ${MAX_BATCH}` },
      { status: 413 }
    );
  }

  const inputs: MessageInput[] = [];
  for (const raw of body.messages) {
    const m = raw as Partial<MessageInput> & { role?: string };
    if (m.role !== 'user' && m.role !== 'assistant') {
      return NextResponse.json(
        { error: 'message role must be "user" or "assistant"' },
        { status: 400 }
      );
    }
    // Tool-only assistant turns (server write-through parity, qq65): empty
    // content is valid when the message carries toolCalls — otherwise the
    // client retry queue wedges on a turn the model answered with tools alone.
    const hasToolCalls = Array.isArray(m.toolCalls) && m.toolCalls.length > 0;
    if (typeof m.content !== 'string' || (m.content.length === 0 && !hasToolCalls)) {
      return NextResponse.json(
        { error: 'message content must be a non-empty string' },
        { status: 400 }
      );
    }
    if (m.content.length > MAX_CONTENT_CHARS) {
      return NextResponse.json(
        { error: `message content exceeds ${MAX_CONTENT_CHARS} characters` },
        { status: 413 }
      );
    }
    const toolCalls = Array.isArray(m.toolCalls) ? m.toolCalls : undefined;
    if (toolCalls) {
      let serialized: string;
      try {
        serialized = JSON.stringify(toolCalls);
      } catch {
        return NextResponse.json({ error: 'toolCalls must be JSON-serializable' }, { status: 400 });
      }
      if (serialized.length > MAX_TOOL_CALLS_CHARS) {
        return NextResponse.json(
          { error: `toolCalls exceeds ${MAX_TOOL_CALLS_CHARS} serialized characters` },
          { status: 413 }
        );
      }
    }
    inputs.push({
      role: m.role,
      content: m.content,
      toolCalls,
      timestamp: typeof m.timestamp === 'number' ? m.timestamp : undefined,
    });
  }

  const result = await appendMessages(auth.user.id, id, inputs);
  if (!result) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  return NextResponse.json(result, { status: 201 });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'POST, OPTIONS' }),
  });
}
