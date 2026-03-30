import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  let isClosed = false;

  const sendEvent = async (data: any) => {
    if (isClosed) return;
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch (e) {
      isClosed = true;
    }
  };

  // Send an initial connected message
  sendEvent({
    serviceId: 'system',
    action: 'Activity stream connected',
    status: 'success',
  });

  // Keep alive ping
  const interval = setInterval(() => {
    sendEvent({
      serviceId: 'system',
      action: 'ping',
      status: 'success',
    });
  }, 15000);

  req.signal.addEventListener('abort', () => {
    isClosed = true;
    clearInterval(interval);
    writer.close().catch(() => {});
  });

  return new NextResponse(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
