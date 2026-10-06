export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { POST as dispatchPOST } from '../dispatch/route';

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
 *   maxDispatches  — max tasks per tick (default 1)
 *   dryRun         — preview without claiming (default false)
 *
 * THAT IS ALL THE TICK CARRIES. The tick's caller can be nothing but the fleet
 * service token (the /api gate admits it on this entry alone), and that token is
 * a cron's credential, not a founder's. So the three settings that decide what a
 * tick may spend or touch stay with the operator and are never read from the
 * request:
 *   - the daily spend cap      FLEET_DAILY_SPEND_CAP_USD, else the default cap
 *   - the executor switch      FLEET_EXECUTOR_ENABLED
 *   - the team whose board     HOLOMESH_TEAM_ID, else the default team
 * A body that sets `capUsd`, `executeAfterClaim` or `teamId` gets none of them:
 * they are dropped here, and named in `ignoredParams` so the caller can see it.
 * The tick works the configured team and says which one (`teamId`); it does not
 * refuse a mismatch, because refusing would need a second copy of the default
 * team id that could drift from the one dispatch actually uses.
 *
 * A founder who wants a different cap, the executor, or another team's board
 * uses the dispatch route, which takes all three under a founder session (the
 * Fleet panel posts to it directly). The tick is not a way round that route.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const params = (body ?? {}) as Record<string, unknown>;

  // Build the dispatch request body from an allowlist: only the cadence knobs a
  // tick needs go through. Anything else a caller sent — including a field added
  // to dispatch tomorrow — is not forwarded unless someone names it here.
  const dispatchBody: Record<string, unknown> = {};
  if (params['maxDispatches'] !== undefined)
    dispatchBody['maxDispatches'] = params['maxDispatches'];
  if (params['dryRun'] !== undefined) dispatchBody['dryRun'] = params['dryRun'];

  // The settings above that the operator owns, if the caller tried to set any.
  const ignoredParams = ['teamId', 'capUsd', 'executeAfterClaim'].filter(
    (key) => params[key] !== undefined
  );

  // Forward auth so the dispatch route can pass it to HoloMesh
  const authHeader = req.headers.get('authorization');
  const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) fetchHeaders['Authorization'] = authHeader;
  // Forward the fleet service token (the autonomous tick's founder-delegated
  // credential) so the dispatch route's spend/mutation gate accepts this call.
  const svcToken = req.headers.get('x-fleet-service-token');
  if (svcToken) fetchHeaders['x-fleet-service-token'] = svcToken;

  // Call the dispatch handler directly — avoids the Railway LB self-fetch loop
  // that returns 502 when the public hostname resolves back through the load balancer.
  const internalReq = new NextRequest(new URL('/api/agents/fleet/dispatch', 'http://internal'), {
    method: 'POST',
    headers: fetchHeaders,
    body: JSON.stringify(dispatchBody),
  });

  try {
    const dispatchRes = await dispatchPOST(internalReq);
    const data: unknown = await dispatchRes.json().catch(() => null);

    if (!dispatchRes.ok) {
      return NextResponse.json(
        { error: 'Dispatch failed', upstream: data },
        { status: dispatchRes.status }
      );
    }

    return NextResponse.json({
      tick: true,
      ...(ignoredParams.length > 0 ? { ignoredParams } : {}),
      ...((data as Record<string, unknown>) ?? {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Tick failed' },
      { status: 502 }
    );
  }
}
