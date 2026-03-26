/**
 * /api/daemon/absorb/stream — API Gateway Stream Proxy
 *
 * Proxies Server-Sent Events (SSE) from the standalone `absorb-service`
 * directly back to the Studio UI for real-time indexing feedback.
 */

import { NextRequest } from 'next/server';
import { forwardAuthHeaders } from '@/lib/api-auth';

const ABSORB_SERVICE_URL = process.env.ABSORB_SERVICE_INTERNAL_URL || process.env.ABSORB_SERVICE_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text();

    const res = await fetch(`${ABSORB_SERVICE_URL}/api/absorb/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...forwardAuthHeaders(req),
      },
      body: bodyText,
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(
        JSON.stringify({ error: `Absorb service failed [${res.status}]: ${errText}` }),
        { status: res.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Pipe the external SSE directly back to the Next.js client
    return new Response(res.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'error',
              jobId: 'proxy',
              error: `Absorb Service is offline. ${String(error)}`,
            })}\n\n`
          )
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }
}
