/**
 * POST /api/holotwin/compile
 * Compile HoloTwin scene to Looking Glass quilt
 */
import { NextRequest, NextResponse } from 'next/server';

// Session store
interface Session {
  sessionId: string;
  device: 'go' | '16inch' | '27inch' | '65inch';
  quiltHash?: string;
  quiltUrl?: string;
}

const sessions = new Map<string, Session>();

const LOOKING_GLASS_PRESETS = {
  go: { views: 45, columns: 9, rows: 5, resolution: [1440, 1440], baseline: 0.04 },
  '16inch': { views: 48, columns: 8, rows: 6, resolution: [3360, 3360], baseline: 0.06 },
  '27inch': { views: 60, columns: 10, rows: 6, resolution: [5120, 3840], baseline: 0.065 },
  '65inch': { views: 128, columns: 16, rows: 8, resolution: [7680, 4320], baseline: 0.08 },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, device = '16inch', holoCode } = body;

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const preset = LOOKING_GLASS_PRESETS[device as keyof typeof LOOKING_GLASS_PRESETS];
    if (!preset) {
      return NextResponse.json(
        { ok: false, error: 'Invalid device. Use: go, 16inch, 27inch, or 65inch' },
        { status: 400 }
      );
    }

    // Generate quilt hash and mock URL
    const quiltHash = `quilt_${sessionId}_${Date.now()}`;
    const quiltUrl = `https://studio.holoscript.net/hologram/${quiltHash}`;

    // Store session
    let session = sessions.get(sessionId);
    if (!session) {
      session = { sessionId, device };
      sessions.set(sessionId, session);
    }
    session.quiltHash = quiltHash;
    session.quiltUrl = quiltUrl;

    // Generate quilt metadata
    const quilt = {
      config: {
        views: preset.views,
        columns: preset.columns,
        rows: preset.rows,
        resolution: preset.resolution,
        baseline: preset.baseline,
        device,
        focusDistance: device === 'go' ? 0.15 : device === '16inch' ? 0.2 : device === '27inch' ? 0.25 : 0.5,
      },
      tiles: generateTiles(preset),
      metadata: {
        quiltAspect: preset.resolution[0] / preset.resolution[1],
        tileWidth: preset.resolution[0] / preset.columns,
        tileHeight: preset.resolution[1] / preset.rows,
        numViews: preset.views,
      },
    };

    return NextResponse.json({
      ok: true,
      sessionId,
      device,
      quilt,
      hash: quiltHash,
      url: quiltUrl,
      message: `Compiled quilt for Looking Glass ${device}`,
    });
  } catch (error) {
    console.error('HoloTwin compile error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Compilation failed' },
      { status: 500 }
    );
  }
}

function generateTiles(preset: typeof LOOKING_GLASS_PRESETS['go']) {
  const tiles = [];
  for (let row = 0; row < preset.rows; row++) {
    for (let col = 0; col < preset.columns; col++) {
      const index = row * preset.columns + col;
      const cameraOffset = (col / (preset.columns - 1) - 0.5) * preset.baseline;
      const viewShear = cameraOffset / 0.2; // focusDistance
      tiles.push({ index, row, column: col, cameraOffset, viewShear });
    }
  }
  return tiles;
}
