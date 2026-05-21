import { NextRequest, NextResponse } from 'next/server';
import { pushMetrics } from '@/lib/simStore';
import type { PopulationMetrics } from '@/lib/simStore';

/**
 * POST /sim/paper26/api/push
 *
 * Accepts a metric snapshot from Paper26SimRunner and stores it.
 * Auth: Bearer token matching SIM_PUSH_TOKEN env var (or HOLOSCRIPT_API_KEY).
 *
 * Body:
 *   {
 *     metrics: PopulationMetrics,
 *     label?: string,
 *     agents?: number,
 *     targetTicks?: number,
 *     running?: boolean,
 *     elapsedMs?: number,
 *     config?: { innerFreq, latentDim, sycophancyFrac }
 *   }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth
  const token = process.env['SIM_PUSH_TOKEN'] ?? process.env['HOLOSCRIPT_API_KEY'];
  if (token) {
    const auth = req.headers.get('authorization') ?? '';
    const key  = req.headers.get('x-sim-key') ?? '';
    const provided = auth.replace(/^Bearer\s+/i, '') || key;
    if (provided !== token) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  let body: {
    metrics: PopulationMetrics;
    label?: string;
    agents?: number;
    targetTicks?: number;
    running?: boolean;
    elapsedMs?: number;
    config?: { innerFreq: number; latentDim: number; sycophancyFrac: number };
  };

  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body.metrics || typeof body.metrics.tick !== 'number') {
    return NextResponse.json({ error: 'metrics.tick required' }, { status: 400 });
  }

  pushMetrics(body.metrics, {
    label:       body.label,
    agents:      body.agents,
    targetTicks: body.targetTicks,
    running:     body.running,
    elapsedMs:   body.elapsedMs,
    config:      body.config,
  });

  return NextResponse.json({ ok: true, tick: body.metrics.tick });
}
