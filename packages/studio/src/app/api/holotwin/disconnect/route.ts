/**
 * POST /api/holotwin/disconnect
 * Disconnect from IoT sensor and stop session
 */
import { NextRequest, NextResponse } from 'next/server';
import { disconnectHoloTwin } from '../_runtime';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = disconnectHoloTwin(body.sessionId);

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
