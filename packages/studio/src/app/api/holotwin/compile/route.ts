/**
 * POST /api/holotwin/compile
 * Compile HoloTwin scene to Looking Glass quilt
 */
import { NextRequest, NextResponse } from 'next/server';
import { compileHoloTwinQuilt } from '../_runtime';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await compileHoloTwinQuilt(body);

    return NextResponse.json({
      ok: true,
      ...result,
      message: `Compiled quilt for Looking Glass ${result.device}`,
    });
  } catch (error) {
    console.error('HoloTwin compile error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Compilation failed' },
      { status: 500 }
    );
  }
}
