import { NextRequest, NextResponse } from 'next/server';
import { verifyLiveProofsLive } from '@holoscript/core/reconstruction';
import { readEntity } from '@/lib/world-state-loro';

/**
 * POST /api/verified-view/live-proof   { html, contract }
 *
 * Is this surface telling the truth right now?
 *
 * `html` is the surface as it ACTUALLY RENDERED — the viewer's own markup, carrying the
 * `data-proof-*` attributes the compiler emitted and the verdict the badge really displayed.
 * `contract` is the `holoViewContract` that surface co-emits, saying what it projects and to
 * which twin. This route reads the displayed values back out of that markup and asks the live
 * world-state authority what those values actually are.
 *
 * The surface is POSTed rather than re-rendered here on purpose, and not only because a compiled
 * panel is a Client Component that a route handler cannot render: re-rendering would check a
 * surface the server just made up, while the whole question is whether the one IN FRONT OF THE
 * VIEWER is faithful. Reading their markup is the stronger reading, not the convenient one.
 *
 * Nothing here re-runs the claim. A `@live_proof` badge already worked out its own answer from
 * its own numbers; this asks the different question — whether those numbers are the twin's.
 *
 * The verdict that matters is the uncomfortable one: a badge rendering GREEN over a value the
 * authority contradicts comes back FALSIFIED. Make that happen deliberately with
 *   POST /api/world-state/craft-1  { "fields": { "altitude": 900 } }
 * An authority nobody has written ABSTAINS instead — no one has said what is true, which is not
 * the same as the surface lying.
 *
 * Read `reason`: one plain sentence per claim, for someone who will not be reading the code.
 */

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { html?: unknown; contract?: unknown };
  try {
    body = (await req.json()) as { html?: unknown; contract?: unknown };
  } catch {
    return NextResponse.json({ _error: 'body must be JSON' }, { status: 400 });
  }

  const { html, contract } = body;
  if (typeof html !== 'string' || !html) {
    return NextResponse.json(
      { _error: 'html must be the rendered surface markup' },
      { status: 400 }
    );
  }
  const projections = (contract as { projections?: unknown })?.projections;
  if (!Array.isArray(projections)) {
    return NextResponse.json(
      { _error: 'contract.projections must be the surface holoViewContract projections' },
      { status: 400 }
    );
  }

  const results = await verifyLiveProofsLive({
    html,
    contract: { projections: projections as never },
    // The authority side, read through the same path the viewer bridge uses. `{_null:true}` is its
    // "no producer has ever written this" sentinel -> null -> the check ABSTAINS rather than
    // falsifying, because unreachable is not lying.
    fetchAuthoritativeState: async (entity: string) => {
      const state = readEntity(entity);
      return (state as { _null?: unknown })._null === true ? null : state;
    },
  });

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      claims: results.map(({ badge, receipt }) => ({
        claim: badge.label,
        onScreen: badge.displayedState === 'pass' ? 'says it holds' : 'says it is broken',
        independence: badge.independence,
        verdict: receipt.verdict,
        reason: receipt.reason,
        confirmed: receipt.confirmed,
        divergent: receipt.divergent,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
