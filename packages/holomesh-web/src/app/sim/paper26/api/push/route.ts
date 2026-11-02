import { NextRequest, NextResponse } from 'next/server';
import { pushMetrics } from '@/lib/simStore';
import type { PopulationMetrics } from '@/lib/simStore';
import { readMcpApiKey } from '@/lib/mcp-api-key';

/**
 * POST /sim/paper26/api/push
 *
 * Accepts a metric snapshot from Paper26SimRunner and stores it.
 * Auth: Bearer token matching SIM_PUSH_TOKEN env var (or HOLOSCRIPT_MCP_API_KEY).
 * Fails closed: with neither set (or whitespace-only), every push is refused (503).
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
  const token = (process.env['SIM_PUSH_TOKEN'] ?? '').trim() || readMcpApiKey();
  if (!token) {
    return NextResponse.json({ error: 'push auth not configured' }, { status: 503 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const key = req.headers.get('x-sim-key') ?? '';
  const provided = (auth.replace(/^Bearer\s+/i, '') || key).trim();
  if (provided !== token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body.metrics || typeof body.metrics.tick !== 'number') {
    return NextResponse.json({ error: 'metrics.tick required' }, { status: 400 });
  }

  pushMetrics(body.metrics, {
    label: body.label,
    agents: body.agents,
    targetTicks: body.targetTicks,
    running: body.running,
    elapsedMs: body.elapsedMs,
    config: body.config,
  });

  return NextResponse.json({ ok: true, tick: body.metrics.tick });
}
