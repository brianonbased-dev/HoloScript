const encoder = new TextEncoder();

export function resolveReconnectCursor(request: {
  headers: { get(name: string): string | null };
  nextUrl?: { searchParams: URLSearchParams };
}): string | undefined {
  return (
    request.headers.get('last-event-id') ??
    request.headers.get('x-reconnect-cursor') ??
    request.nextUrl?.searchParams.get('cursor') ??
    undefined
  );
}

export function createSSEHeartbeatStream<TChunk extends Uint8Array>(
  source: ReadableStream<TChunk>,
  options: { heartbeatIntervalMs?: number; cursor?: string } = {}
): ReadableStream<Uint8Array> {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15000;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const reader = source.getReader();
      let closed = false;

      if (options.cursor) {
        controller.enqueue(
          encoder.encode(`event: cursor\ndata: ${JSON.stringify({ cursor: options.cursor })}\n\n`)
        );
      }

      controller.enqueue(encoder.encode(`: heartbeat open\n\n`));

      const timer = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        }
      }, heartbeatIntervalMs);

      const cleanup = () => {
        if (!closed) {
          closed = true;
          clearInterval(timer);
        }
      };

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) controller.enqueue(value);
          }
          cleanup();
          controller.close();
        } catch (error) {
          cleanup();
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
