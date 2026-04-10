import { NextRequest } from 'next/server';
import { forwardAuthHeaders } from '@/lib/api-auth';
import {
  ABSORB_PROGRESS_CONTRACT_VERSION,
  toAbsorbProgressContractEvent,
} from '@/lib/absorbStreamContract';
import { createSSEHeartbeatStream, resolveReconnectCursor } from '@/lib/sseStreamProxy';

import { ENDPOINTS } from '@holoscript/config';

const ABSORB_SERVICE_URL = ENDPOINTS.ABSORB_SERVICE;

const encoder = new TextEncoder();

function normalizeAbsorbSSEStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const reader = source.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let seq = 0;

      const emitContractEvent = (payload: unknown) => {
        const normalized = toAbsorbProgressContractEvent(payload);
        if (!normalized) return;

        seq += 1;
        controller.enqueue(encoder.encode(`id: ${seq}\n`));
        controller.enqueue(encoder.encode('event: absorb.progress\n'));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(normalized)}\n\n`));
      };

      const flushFrame = (frame: string) => {
        const trimmed = frame.trim();
        if (!trimmed) return;

        if (trimmed.startsWith(':')) {
          controller.enqueue(encoder.encode(`${trimmed}\n\n`));
          return;
        }

        const dataLines = frame
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s?/, ''));

        if (dataLines.length === 0) return;

        const dataText = dataLines.join('\n');
        try {
          emitContractEvent(JSON.parse(dataText));
        } catch {
          emitContractEvent({
            type: 'progress',
            message: dataText,
          });
        }
      };

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;

            buffer += decoder.decode(value, { stream: true });

            let frameBoundary = buffer.indexOf('\n\n');
            while (frameBoundary !== -1) {
              const frame = buffer.slice(0, frameBoundary);
              buffer = buffer.slice(frameBoundary + 2);
              flushFrame(frame);
              frameBoundary = buffer.indexOf('\n\n');
            }
          }

          if (buffer.trim().length > 0) {
            flushFrame(buffer);
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      };

      void pump();
    },
    cancel() {
      return source.cancel();
    },
  });
}

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

    const normalized = normalizeAbsorbSSEStream(res.body);

    return new Response(createSSEHeartbeatStream(normalized, { cursor }), {
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
