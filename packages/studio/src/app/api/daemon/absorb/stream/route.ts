/**
 * /api/daemon/absorb/stream — API Gateway Stream Proxy
 *
 * Proxies Server-Sent Events (SSE) from the standalone `absorb-service`
 * directly back to the Studio UI for real-time indexing feedback.
 */

import { NextRequest } from 'next/server';
import { forwardAuthHeaders } from '@/lib/api-auth';
import {
  ABSORB_PROGRESS_CONTRACT_VERSION,
  toAbsorbProgressContractEvent,
} from '@/lib/absorbStreamContract';
import { createSSEHeartbeatStream, resolveReconnectCursor } from '@/lib/sseStreamProxy';

import { ENDPOINTS } from '@holoscript/config';
const ABSORB_SERVICE_URL = ENDPOINTS.ABSORB_SERVICE;

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text();
    const cursor = resolveReconnectCursor(req);

    const res = await fetch(`${ABSORB_SERVICE_URL}/api/absorb/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(cursor ? { 'Last-Event-ID': cursor, 'X-Reconnect-Cursor': cursor } : {}),
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
    if (!res.body) {
      return new Response(JSON.stringify({ error: 'Absorb service returned empty body' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(createSSEHeartbeatStream(res.body, { cursor }), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-HoloScript-Stream-Contract': ABSORB_PROGRESS_CONTRACT_VERSION,
        ...(cursor ? { 'X-Reconnect-Cursor': cursor } : {}),
      },
    });
  } catch (error) {
    const event = toAbsorbProgressContractEvent({
      type: 'error',
      status: 'failed',
      jobId: 'proxy',
      error: `Absorb Service is offline. ${String(error)}`,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-HoloScript-Stream-Contract': ABSORB_PROGRESS_CONTRACT_VERSION,
      },
    });
  }
}
