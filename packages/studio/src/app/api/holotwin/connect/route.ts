/**
 * HoloTwin API Routes — IoT Sensor → HoloScript → Looking Glass
 *
 * REST API for HoloTwin digital twin pipeline.
 * Backed by MCP tools in packages/mcp-server/src/holotwin-mcp-tools.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectHoloTwin, listHoloTwinSessions } from '../_runtime';

/**
 * POST /api/holotwin/connect
 * Connect to IoT sensor/broker
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const session = await connectHoloTwin(body);

    return NextResponse.json({
      ok: true,
      sessionId: session.sessionId,
      physicalId: session.physicalId,
      protocol: session.protocol,
      device: session.device,
      connectionProbe: session.connectionProbe,
      message: `Connected to ${session.physicalId} via ${session.protocol}`,
    });
  } catch (error) {
    console.error('HoloTwin connect error:', error);
    const message = error instanceof Error ? error.message : 'Connection failed';
    return NextResponse.json(
      { ok: false, error: message },
      { status: message.includes('connection failed') ? 502 : 400 }
    );
  }
}

/**
 * GET /api/holotwin/connect
 * List active sessions
 */
export async function GET() {
  const activeSessions = listHoloTwinSessions();

  return NextResponse.json({
    ok: true,
    sessions: activeSessions,
    count: activeSessions.length,
  });
}
