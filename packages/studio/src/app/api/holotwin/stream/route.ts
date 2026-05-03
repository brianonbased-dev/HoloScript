/**
 * POST /api/holotwin/stream
 * Start real-time sensor → hologram streaming
 */
import { NextRequest, NextResponse } from 'next/server';

interface StreamSession {
  sessionId: string;
  isStreaming: boolean;
  startedAt?: number;
  recompileIntervalMs: number;
}

const streamSessions = new Map<string, StreamSession>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, recompileIntervalMs = 1000, autoStop = false } = body;

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    // Start streaming session
    const streamSession: StreamSession = {
      sessionId,
      isStreaming: true,
      startedAt: Date.now(),
      recompileIntervalMs,
    };

    streamSessions.set(sessionId, streamSession);

    // In production: start actual streaming loop with:
    // 1. Subscribe to MQTT/HTTP sensor updates
    // 2. Update scene properties based on mappings
    // 3. Trigger quilt recompilation at specified interval
    // 4. Push updated quilt to Looking Glass

    return NextResponse.json({
      ok: true,
      sessionId,
      streaming: true,
      recompileIntervalMs,
      autoStop,
      message: `Streaming started. Recompiling every ${recompileIntervalMs}ms.`,
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
 * Stop streaming
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    const streamSession = streamSessions.get(sessionId);
    if (!streamSession) {
      return NextResponse.json(
        { ok: false, error: 'No active stream for sessionId' },
        { status: 404 }
      );
    }

    streamSession.isStreaming = false;
    streamSessions.delete(sessionId);

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
