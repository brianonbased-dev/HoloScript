/**
 * GET /api/pipeline/layers — Get current layer configs.
 * PUT /api/pipeline/layers — Update layer configs.
 *
 * Layer configs are primarily managed client-side in pipelineStore.
 * This endpoint provides server-side persistence for multi-tab sync.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { LayerId, LayerConfig } from '@/lib/recursive/types';

// Server-side config cache (initialized from client on first PUT)
let layerConfigs: Record<LayerId, LayerConfig> | null = null;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!layerConfigs) {
    return NextResponse.json({
      configs: null,
      hint: 'No server-side configs yet. Configs are managed client-side in pipelineStore.',
    });
  }

  return NextResponse.json({ configs: layerConfigs });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { layers: Record<string, Partial<LayerConfig>> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.layers || typeof body.layers !== 'object') {
    return NextResponse.json(
      { error: 'layers object is required' },
      { status: 400 },
    );
  }

  // Merge updates into existing configs
  if (layerConfigs) {
    for (const [key, patch] of Object.entries(body.layers)) {
      const layerId = Number(key) as LayerId;
      if (layerId >= 0 && layerId <= 2 && layerConfigs[layerId]) {
        layerConfigs[layerId] = { ...layerConfigs[layerId], ...patch };
      }
    }
  }

  return NextResponse.json({ updated: true, configs: layerConfigs });
}
