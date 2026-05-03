/**
 * HoloTwin API Routes — IoT Sensor → HoloScript → Looking Glass
 *
 * REST API for HoloTwin digital twin pipeline.
 * Backed by MCP tools in packages/mcp-server/src/holotwin-mcp-tools.ts
 */

import { NextRequest, NextResponse } from 'next/server';

// In-memory session store (production should use Redis/database)
interface HoloTwinSession {
  sessionId: string;
  physicalId: string;
  protocol: 'mqtt' | 'http';
  connectionString: string;
  device: 'go' | '16inch' | '27inch' | '65inch';
  isConnected: boolean;
  createdAt: number;
}

const sessions = new Map<string, HoloTwinSession>();

/**
 * POST /api/holotwin/connect
 * Connect to IoT sensor/broker
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { physicalId, protocol = 'mqtt', connectionString, displayDevice = '16inch' } = body;

    if (!physicalId || !connectionString) {
      return NextResponse.json(
        { ok: false, error: 'physicalId and connectionString are required' },
        { status: 400 }
      );
    }

    const sessionId = `holotwin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session: HoloTwinSession = {
      sessionId,
      physicalId,
      protocol,
      connectionString,
      device: displayDevice,
      isConnected: true,
      createdAt: Date.now(),
    };

    sessions.set(sessionId, session);

    // In production: establish actual MQTT/HTTP connection here
    // For now, simulate connection success

    return NextResponse.json({
      ok: true,
      sessionId,
      physicalId,
      protocol,
      device: displayDevice,
      message: `Connected to ${physicalId} via ${protocol}`,
    });
  } catch (error) {
    console.error('HoloTwin connect error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Connection failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/holotwin/connect
 * List active sessions
 */
export async function GET() {
  const activeSessions = Array.from(sessions.values()).map((s) => ({
    sessionId: s.sessionId,
    physicalId: s.physicalId,
    protocol: s.protocol,
    device: s.device,
    isConnected: s.isConnected,
    uptime: Date.now() - s.createdAt,
  }));

  return NextResponse.json({
    ok: true,
    sessions: activeSessions,
    count: activeSessions.length,
  });
}
