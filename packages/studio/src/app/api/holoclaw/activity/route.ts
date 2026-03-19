import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// GET /api/holoclaw/activity — stream daemon outbox as SSE
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const repoRoot = process.env.HOLOSCRIPT_REPO_ROOT || process.cwd();
  const stateDir = path.join(repoRoot, '.holoscript');
  const outboxPath = path.join(stateDir, 'outbox.jsonl');

  const url = new URL(request.url);
  const stream = url.searchParams.get('stream') === 'true';

  // Non-streaming: return latest entries
  if (!stream) {
    const limitParam = url.searchParams.get('limit');
    const limit = Math.min(100, Math.max(1, Number(limitParam) || 50));

    if (!fs.existsSync(outboxPath)) {
      return NextResponse.json({ entries: [], total: 0 });
    }

    const content = fs.readFileSync(outboxPath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    const entries = [];
    for (const line of lines.slice(-limit)) {
      try {
        entries.push(JSON.parse(line));
      } catch { /* skip malformed */ }
    }

    return NextResponse.json({ entries, total: lines.length });
  }

  // Streaming: SSE via ReadableStream with file polling
  const encoder = new TextEncoder();
  let lastOffset = 0;
  let cancelled = false;

  // Read initial offset
  if (fs.existsSync(outboxPath)) {
    const content = fs.readFileSync(outboxPath, 'utf-8');
    lastOffset = content.length;
  }

  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));

      const interval = setInterval(() => {
        if (cancelled) {
          clearInterval(interval);
          return;
        }

        try {
          if (!fs.existsSync(outboxPath)) return;
          const content = fs.readFileSync(outboxPath, 'utf-8');
          if (content.length <= lastOffset) return;

          const newContent = content.slice(lastOffset);
          lastOffset = content.length;

          const lines = newContent.split('\n').map(l => l.trim()).filter(Boolean);
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`));
            } catch { /* skip malformed */ }
          }
        } catch { /* file read error, retry next poll */ }
      }, 1000);

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        cancelled = true;
        clearInterval(interval);
        controller.close();
      });
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
