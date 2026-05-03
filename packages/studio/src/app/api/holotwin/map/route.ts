/**
 * POST /api/holotwin/map
 * Map sensor telemetry to scene properties
 */
import { NextRequest, NextResponse } from 'next/server';

interface SensorMapping {
  sensor_key: string;
  scene_property: string;
  transform: 'scale' | 'color' | 'position' | 'emissive' | 'label';
  min: number;
  max: number;
  invert: boolean;
}

// Session store (production should use Redis/database)
interface Session {
  sessionId: string;
  mappings: SensorMapping[];
}

const sessions = new Map<string, Session>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, mappings } = body;

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(mappings)) {
      return NextResponse.json(
        { ok: false, error: 'mappings must be an array' },
        { status: 400 }
      );
    }

    // Validate mappings
    for (const mapping of mappings) {
      if (!mapping.sensor_key || !mapping.scene_property) {
        return NextResponse.json(
          { ok: false, error: 'Each mapping requires sensor_key and scene_property' },
          { status: 400 }
        );
      }
    }

    // Store mappings
    let session = sessions.get(sessionId);
    if (!session) {
      session = { sessionId, mappings: [] };
      sessions.set(sessionId, session);
    }
    session.mappings = mappings;

    return NextResponse.json({
      ok: true,
      sessionId,
      mappingsCount: mappings.length,
      message: `Mapped ${mappings.length} sensor(s) to scene properties`,
    });
  } catch (error) {
    console.error('HoloTwin map error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Mapping failed' },
      { status: 500 }
    );
  }
}
