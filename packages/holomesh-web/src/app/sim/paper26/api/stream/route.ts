import { subscribe } from '@/lib/simStore';

/**
 * GET /sim/paper26/api/stream
 *
 * Server-Sent Events stream.  Each event is a JSON object:
 *   { metrics: PopulationMetrics, receipt: SimReceipt }
 *
 * The dashboard connects here for live chart updates.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          unsubscribe?.();
        }
      };

      // Send a heartbeat comment every 25s to keep the connection alive through
      // Railway's 30s idle timeout
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      unsubscribe = subscribe(send);
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache',
      'Connection':                  'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering':           'no',   // disable Nginx buffering on Railway
    },
  });
}
