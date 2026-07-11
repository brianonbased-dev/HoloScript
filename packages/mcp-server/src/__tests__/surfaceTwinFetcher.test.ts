/**
 * surfaceTwinFetcher.test.ts — @verified_view v1: the runtime twin check against the REAL
 * StateAuthority (Loro CRDT), end to end, with NO fabricated snapshot. The test itself is the
 * INDEPENDENT PRODUCER — it writes authoritative state via the real `push_state_delta` handler,
 * then an independent display side is checked against it through the production fetcher.
 *
 * This is the honest "make it real" proof: the moat verifier runs against the actual StateAuthority
 * an agent would query (via `fetch_authoritative_state`), not a hardcoded `authoritativeState` blob.
 * The two sides are genuinely independent — one written through the producer path, one supplied as
 * the display — which is exactly what the moat requires (W.767/W.769 non-circularity).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { handleNetworkingTool, __resetNetworkingState } from '../networking-tools.js';
import {
  createAuthoritativeStateFetcher,
  verifySurfaceAgainstLiveAuthority,
} from '../surfaceTwinFetcher.js';
import type { SurfaceTwinProjection } from '@holoscript/core/reconstruction';

const proj = (
  element: string,
  node: string,
  entity: string,
  extra?: Partial<SurfaceTwinProjection>
): SurfaceTwinProjection => ({ element, node, entity, identity: true, ...extra });

/** A producer writes real authoritative state through the SAME handler an agent uses. */
async function produce(entityId: string, payload: Record<string, unknown>) {
  return handleNetworkingTool('push_state_delta', { entityId, payload });
}

describe('surfaceTwinFetcher — live StateAuthority round-trip (no fabrication)', () => {
  beforeEach(() => __resetNetworkingState());

  it('createAuthoritativeStateFetcher reads back exactly what a producer wrote', async () => {
    await produce('compile-job-42', { targetCount: 5, status: 'done' });
    const fetch = createAuthoritativeStateFetcher();
    expect(await fetch('compile-job-42')).toMatchObject({ targetCount: 5, status: 'done' });
  });

  it('an entity no producer wrote → null (so the verifier abstains, never false-FALSIFIES)', async () => {
    const fetch = createAuthoritativeStateFetcher();
    expect(await fetch('never-written')).toBeNull();
  });

  it('CONSENSUS: the displayed value matches the authoritative twin the producer wrote', async () => {
    await produce('compile-job-7', { targetCount: 5 });
    const r = await verifySurfaceAgainstLiveAuthority({
      contract: { projections: [proj('Targets', 'job.targetCount', 'compile-job-7')] },
      displayedValues: { 'job.targetCount': 5 }, // surface shows 5; live twin holds 5
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.checked).toBe(1);
  });

  it('FALSIFIED: the surface diverges from the live authoritative twin (the dashboard is lying)', async () => {
    await produce('compile-job-7', { targetCount: 5 });
    const r = await verifySurfaceAgainstLiveAuthority({
      contract: { projections: [proj('Targets', 'job.targetCount', 'compile-job-7')] },
      displayedValues: { 'job.targetCount': 3 }, // surface shows 3; live twin holds 5
    });
    expect(r.verdict).toBe('FALSIFIED');
    expect(r.divergences[0]).toMatchObject({
      node: 'job.targetCount',
      entity: 'compile-job-7',
      displayed: 3,
      authoritative: 5,
    });
  });

  it('an unpopulated twin ABSTAINS as authority-unavailable — never a false FALSIFIED', async () => {
    const r = await verifySurfaceAgainstLiveAuthority({
      contract: { projections: [proj('Targets', 'job.targetCount', 'compile-job-absent')] },
      displayedValues: { 'job.targetCount': 3 },
    });
    expect(r.verdict).toBe('CONSENSUS'); // abstained, not falsified
    expect(r.checked).toBe(0);
    expect(r.abstentions).toEqual([
      { node: 'job.targetCount', entity: 'compile-job-absent', reason: 'authority-unavailable' },
    ]);
  });

  it('formatted twin (Slice 3): a precision transform checks against the LIVE value', async () => {
    await produce('reactor-3', { temp: 800 });
    const r = await verifySurfaceAgainstLiveAuthority({
      contract: {
        projections: [
          proj('Temp', 'reactor.temp', 'reactor-3', { identity: false, transform: { precision: 2 } }),
        ],
      },
      displayedValues: { 'reactor.temp': '800.00' }, // rendered (800).toFixed(2)
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.checked).toBe(1);
  });
});
