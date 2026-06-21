/**
 * POST /api/holotwin/map
 * Map sensor telemetry to scene properties
 */
import { NextRequest, NextResponse } from 'next/server';
import { mapHoloTwinSensors } from '../_runtime';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = mapHoloTwinSensors(body);

    return NextResponse.json({
      ok: true,
      sessionId: result.sessionId,
      mappingsCount: result.mappingsCount,
      message: `Mapped ${result.mappingsCount} sensor(s) to scene properties`,
    });
  } catch (error) {
    console.error('HoloTwin map error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Mapping failed' },
      { status: 500 }
    );
  }
}
