/**
 * POST /api/holotwin/disconnect
 * Disconnect from IoT sensor and stop session
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    // In production:
    // 1. Close MQTT/HTTP connection
    // 2. Clean up stream session
    // 3. Release resources

    return NextResponse.json({
      ok: true,
      sessionId,
      message: 'Disconnected from IoT sensor',
    });
  } catch (error) {
    console.error('HoloTwin disconnect error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Disconnect failed' },
      { status: 500 }
    );
  }
}
