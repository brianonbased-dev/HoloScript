/**
 * liveProofLiveAuthority.test.ts — `@live_proof` verdicts against the REAL StateAuthority.
 *
 * The authority side is entirely live: the test is the INDEPENDENT PRODUCER, writing state through
 * the same `push_state_delta` handler an agent calls, and the verifier reads it back through the
 * same `fetch_authoritative_state` handler — the real Loro CRDT, no snapshot, no stub.
 *
 * The display side is a CAPTURED FIXTURE, and deliberately so. `SURFACE_HTML` below is verbatim
 * `renderToStaticMarkup` output of a real Native2DCompiler-generated component (state `temp: 20`,
 * claim `temp < 100`, `temp` projected at twin entity `reactor-1`). It is pasted rather than
 * rendered here because mcp-server declares no react-dom, and adding one to render a fixture would
 * mean a lockfile change for a test — the render path is proven where React actually lives
 * (studio's surfaceTwinRuntime.test.ts) and the emission that produced this markup is pinned in
 * core's Native2DLiveProofVerified.test.ts, so it cannot drift silently in either direction.
 *
 * THE CANARY is co-located with the clean pass on purpose, as in surfaceTwinRuntime and
 * PerceiverConsensus: a surface rendering a GREEN badge over numbers the live authority
 * contradicts must come back FALSIFIED. If that ever passes, `verified` is decoration carrying a
 * promise — worse than the `self-referential` honesty it replaced. A green clean run alone can
 * never show the check is alive.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { SurfaceTwinProjection } from '@holoscript/core/reconstruction';
import { handleNetworkingTool, __resetNetworkingState } from '../networking-tools.js';
import { verifyLiveProofsAgainstLiveAuthority } from '../surfaceTwinFetcher.js';

const ENTITY = 'reactor-1';
const LABEL = 'Reactor within limits';
/** The surface's own initial state. It renders 20, so the badge renders GREEN. */
const DISPLAYED_TEMP = 20;

/** Verbatim renderToStaticMarkup output of the compiled surface — see the header. */
const SURFACE_HTML =
  '<div class="holoscript-2d-root w-full h-full">' +
  '<div data-holo-projects="temp">20</div>' +
  '<div data-proof-claim="temp &lt; 100" data-proof-label="Reactor within limits" ' +
  'data-proof-independence="verified" ' +
  'data-proof-anchors="[{&quot;input&quot;:&quot;temp&quot;,&quot;node&quot;:&quot;temp&quot;,&quot;entity&quot;:&quot;reactor-1&quot;}]" ' +
  'data-proof-faults="[{&quot;overrides&quot;:{&quot;temp&quot;:900},&quot;because&quot;:&quot;an overheating reactor must never read as within limits&quot;}]" ' +
  'class="flex flex-col gap-2">' +
  '<div data-proof-state="pass" class="rounded-md p-2 text-xs font-semibold bg-studio-success/10 text-studio-success">' +
  '✓ Reactor within limits holds</div>' +
  '<span class="text-[10px] text-studio-muted">Broken on purpose 1 way when this was built — the check caught it. Press one to watch it fail.</span>' +
  '<span class="text-[10px] text-studio-muted">Every number behind this is also checked against the real thing (reactor-1), so this verdict is not just the screen agreeing with itself.</span>' +
  '</div></div>';

/** The contract the surface co-emits: what it projects, and to which twin. */
const contract: { projections: SurfaceTwinProjection[] } = {
  projections: [{ element: 'TempReadout', node: 'temp', entity: ENTITY, identity: true }],
};

/** A producer writes real authoritative state through the handler an agent uses. */
const produce = (payload: Record<string, unknown>) =>
  handleNetworkingTool('push_state_delta', { entityId: ENTITY, payload });

const verify = () => verifyLiveProofsAgainstLiveAuthority({ html: SURFACE_HTML, contract });

describe('@live_proof against the live StateAuthority', () => {
  beforeEach(() => __resetNetworkingState());

  it('reads the badge and the displayed value out of the surface itself', async () => {
    await produce({ temp: DISPLAYED_TEMP });
    const [{ badge }] = await verify();
    expect(badge.label).toBe(LABEL);
    expect(badge.claim).toBe('temp < 100');
    expect(badge.independence).toBe('verified');
    expect(badge.displayedState).toBe('pass');
    expect(badge.anchors).toEqual([{ input: 'temp', node: 'temp', entity: ENTITY }]);
  });

  it('VERIFIED when the live twin holds what the surface displays', async () => {
    await produce({ temp: DISPLAYED_TEMP });
    const [{ receipt }] = await verify();
    expect(receipt.verdict).toBe('VERIFIED');
    expect(receipt.confirmed).toEqual(['temp']);
    expect(receipt.reason).toMatch(/checked against the real thing and matched/);
  });

  it('CANARY: a GREEN badge over a diverging live twin is FALSIFIED', async () => {
    // The reactor is really at 900. The surface still shows 20, so the badge is green and reports
    // the reactor as within limits. That is the failure the oracle exists for — and the badge
    // being green is precisely why nothing inside the surface could ever catch it.
    await produce({ temp: 900 });
    const [{ badge, receipt }] = await verify();
    expect(badge.displayedState).toBe('pass');
    expect(receipt.verdict).toBe('FALSIFIED');
    expect(receipt.divergent).toHaveLength(1);
    expect(receipt.divergent[0]).toMatchObject({ input: 'temp', entity: ENTITY });
    expect(receipt.reason).toMatch(/shows this claim as HOLDING/);
    expect(receipt.reason).toMatch(/900/);
  });

  it('re-reads the authority every time — a stale verdict would be worthless', async () => {
    // Same surface, same contract, two authority states. A cached or snapshot-backed read would
    // return the first verdict twice and look perfectly healthy doing it.
    await produce({ temp: DISPLAYED_TEMP });
    const [agree] = await verify();
    expect(agree.receipt.verdict).toBe('VERIFIED');

    await produce({ temp: 900 });
    const [diverge] = await verify();
    expect(diverge.receipt.verdict).toBe('FALSIFIED');
    expect(diverge.receipt.receiptHash).not.toBe(agree.receipt.receiptHash);
  });

  it('ABSTAINS when no producer has written the twin — unreachable is not lying', async () => {
    const [{ receipt }] = await verify();
    expect(receipt.verdict).toBe('ABSTAIN');
    expect(receipt.abstention?.reason).toBe('authority-unreachable');
    expect(receipt.reason).toMatch(/connection problem, not evidence the surface is wrong/);
  });

  it('states its verdict in language a non-developer can act on', async () => {
    await produce({ temp: 900 });
    const [{ receipt }] = await verify();
    // No identifiers, no paths, no jargon — the sentence carries the finding on its own.
    expect(receipt.reason).toContain(LABEL);
    expect(receipt.reason).toMatch(/the real thing does not have/);
    expect(receipt.reason).not.toMatch(/undefined|\[object|NaN/);
  });
});
