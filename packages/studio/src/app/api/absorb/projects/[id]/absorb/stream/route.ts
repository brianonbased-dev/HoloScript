export const maxDuration = 300;

import { NextRequest } from 'next/server';
import { forwardAuthHeaders } from '@/lib/api-auth';
import {
  ABSORB_PROGRESS_CONTRACT_VERSION,
  toAbsorbProgressContractEvent,
} from '@/lib/absorbStreamContract';
import { createSSEHeartbeatStream, resolveReconnectCursor } from '@/lib/sseStreamProxy';

import { ENDPOINTS } from '@holoscript/config';

const ABSORB_SERVICE_URL = ENDPOINTS.ABSORB_SERVICE;

function buildBodyForGet(req: NextRequest, projectId: string): string {
  const p = req.nextUrl.searchParams;
  const body = {
    projectId,
    depth: p.get('depth') ?? 'shallow',
    tier: p.get('tier') ?? 'medium',
  };
  return JSON.stringify(body);
}

async function proxyStream(
  req: NextRequest,
  projectId: string,
  bodyText: string
): Promise<Response> {
  try {
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

    if (!res.body) {
      return new Response(
        JSON.stringify({ error: 'Absorb service returned an empty stream body.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
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
      jobId: projectId,
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: projectId } = await params;
  return proxyStream(req, projectId, buildBodyForGet(req, projectId));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: projectId } = await params;
  const bodyText = await req.text();
  const effectiveBody = bodyText.trim().length > 0 ? bodyText : JSON.stringify({ projectId });
  return proxyStream(req, projectId, effectiveBody);
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
