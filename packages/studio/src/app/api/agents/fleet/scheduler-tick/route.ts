export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/agents/fleet/scheduler-tick
 *
 * Triggered by the HoloShell Team registry (Tier-B, runs every 15 min) or any
 * external cron. Delegates to the dispatch route — this endpoint exists so the
 * registry can point at a single stable URL without embedding dispatch logic.
 *
 * The registry owns the cadence; this tick owns nothing except forwarding the
 * request and returning the result. One scheduler of record: the HoloShell
 * registry. This endpoint does not add a second cadence engine.
 *
 * Body (all optional):
 *   teamId         — team whose board to work (defaults to session team)
 *   maxDispatches  — max tasks per tick (default 1)
 *   dryRun         — preview without claiming (default false)
 *   executeAfterClaim — activate HoloClaw + execute (default: FLEET_EXECUTOR_ENABLED env)
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const params = (body ?? {}) as Record<string, unknown>;

  // Build the dispatch request body, forwarding all relevant params
  const dispatchBody: Record<string, unknown> = {};
  if (params['teamId']) dispatchBody['teamId'] = params['teamId'];
  if (params['maxDispatches'] !== undefined)
    dispatchBody['maxDispatches'] = params['maxDispatches'];
  if (params['dryRun'] !== undefined) dispatchBody['dryRun'] = params['dryRun'];
  if (params['executeAfterClaim'] !== undefined)
    dispatchBody['executeAfterClaim'] = params['executeAfterClaim'];
  if (params['capUsd'] !== undefined) dispatchBody['capUsd'] = params['capUsd'];

  // Forward auth so the dispatch route can pass it to HoloMesh
  const authHeader = req.headers.get('authorization');
  const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) fetchHeaders['Authorization'] = authHeader;

  // Internal call — use the request's own origin
  const origin = req.nextUrl.origin;

  try {
    const dispatchRes = await fetch(`${origin}/api/agents/fleet/dispatch`, {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify(dispatchBody),
      signal: AbortSignal.timeout(290_000),
    });

    const data: unknown = await dispatchRes.json().catch(() => null);

    if (!dispatchRes.ok) {
      return NextResponse.json(
        { error: 'Dispatch failed', upstream: data },
        { status: dispatchRes.status }
      );
    }

    return NextResponse.json({ tick: true, ...((data as Record<string, unknown>) ?? {}) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Tick failed' },
      { status: 502 }
    );
  }
}
