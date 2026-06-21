/**
 * POST /api/holotwin/stream
 * Start real-time sensor to hologram streaming.
 */
import { NextRequest, NextResponse } from 'next/server';
import { startHoloTwinStream, stopHoloTwinStream } from '../_runtime';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const stream = await startHoloTwinStream(body);

    return NextResponse.json({
      ok: true,
      sessionId: stream.sessionId,
      streaming: true,
      recompileIntervalMs: stream.recompileIntervalMs,
      autoStop: stream.autoStop,
      ticks: stream.ticks,
      lastFrameHash: stream.lastFrameHash,
      message: `Streaming started. Recompiling every ${stream.recompileIntervalMs}ms.`,
    });
  } catch (error) {
    console.error('HoloTwin stream error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Stream failed' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/holotwin/stream
 * Stop streaming.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (typeof sessionId !== 'string' || !stopHoloTwinStream(sessionId)) {
      return NextResponse.json(
        { ok: false, error: 'No active stream for sessionId' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      streaming: false,
      message: 'Streaming stopped',
    });
  } catch (error) {
    console.error('HoloTwin stream stop error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Stop failed' },
      { status: 500 }
    );
  }
}
