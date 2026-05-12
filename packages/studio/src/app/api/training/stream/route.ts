export const maxDuration = 300;

import { NextRequest } from 'next/server';
import { corsHeaders } from '../../_lib/cors';

/**
 * GET /api/training/stream?jobId=<id>
 *
 * SSE endpoint for real-time training progress spectators.
 * Streams INeuralTrainingProgressPacket-shaped events.
 *
 * In production this proxies to NeuralStreamingTransport or a mesh
 * pub/sub channel. For now it accepts demo packets via POST to the
 * same route (same-jobId scope) and replays them to connected SSE
 * clients.
 */

const DEMO_JOB_ID = 'demo-job-001';

interface DemoPacket {
  jobId: string;
  stage: string;
  overallProgress: number;
  stageProgress: number;
  message?: string;
  estimatedTimeRemainingMs?: number;
  trainingMetrics?: Record<string, unknown>;
  actualCost?: number;
  timestamp: number;
  terminal?: 'complete' | 'error';
  error?: { stage: string; message: string; code: string; retryable: boolean };
}

const listeners = new Map<string, Set<(packet: DemoPacket) => void>>();
const histories = new Map<string, DemoPacket[]>();

function getOrCreateJobListeners(jobId: string): Set<(packet: DemoPacket) => void> {
  if (!listeners.has(jobId)) {
    listeners.set(jobId, new Set());
  }
  return listeners.get(jobId)!;
}

function getOrCreateJobHistory(jobId: string): DemoPacket[] {
  if (!histories.has(jobId)) {
    histories.set(jobId, []);
  }
  return histories.get(jobId)!;
}

function broadcast(jobId: string, packet: DemoPacket): void {
  const h = getOrCreateJobHistory(jobId);
  h.push(packet);
  if (h.length > 256) h.splice(0, h.length - 256);
  for (const cb of getOrCreateJobListeners(jobId)) {
    cb(packet);
  }
}

function sseLine(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId') ?? DEMO_JOB_ID;

  const stream = new ReadableStream({
    start(controller) {
      const cb = (packet: DemoPacket) => {
        controller.enqueue(new TextEncoder().encode(sseLine(packet)));
        if (packet.terminal) {
          controller.close();
        }
      };

      // Replay recent history so late-joining viewers see context
      for (const packet of getOrCreateJobHistory(jobId)) {
        cb(packet);
      }

      const set = getOrCreateJobListeners(jobId);
      set.add(cb);

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(':heartbeat\n\n'));
      }, 15_000);

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        set.delete(cb);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      ...corsHeaders(request),
    },
  });
}

/**
 * POST /api/training/stream?jobId=<id>
 *
 * Inject a demo/training-progress packet. Any connected SSE clients for
 * the same jobId receive it immediately.
 */
export async function POST(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId') ?? DEMO_JOB_ID;
  const body = (await request.json()) as DemoPacket;
  const packet: DemoPacket = {
    ...body,
    jobId,
    timestamp: body.timestamp ?? Date.now(),
  };
  broadcast(jobId, packet);
  return Response.json({ ok: true, received: packet });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, OPTIONS' }),
  });
}
