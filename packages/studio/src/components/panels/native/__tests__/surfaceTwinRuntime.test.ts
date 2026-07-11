/**
 * surfaceTwinRuntime.test.ts — @verified_view v1 Slice 2: the RUNTIME twin check, end to end,
 * running in CI. It renders a REAL compiled @verified_view panel with renderToStaticMarkup
 * (node-native — no jsdom, so it actually runs in the existing suite, addressing the premortem's
 * #1 risk "the runtime verifier never runs in CI"), reads the DISPLAYED values from the
 * render-authored markup, and checks them against an authoritative twin snapshot.
 *
 * The CANARY — a diverging authoritative value that MUST flip the verdict to FALSIFIED — is
 * co-located IN THE SAME FILE as the clean check, so a self-passing verifier cannot hide behind
 * a green "clean" run (premortem discipline, ported from the cross-perceiver red-flip).
 *
 * NON-CIRCULAR: `displayed` is read from the rendered markup (what the surface authored);
 * `authoritative` is a separate StateAuthority snapshot (in production, fetch_authoritative_state).
 * Two independent sources — the check only compares. Wiring the real fetch + auto-deriving the
 * contract's entity bindings from the panel is production integration (Slice 2b); this proves the
 * runtime pipeline on a real rendered panel.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  extractDisplayedProjections,
  checkSurfaceTwinCorrespondence,
  verifySurfaceTwinLive,
  type SurfaceTwinProjection,
} from '@holoscript/core/reconstruction';
import VerifiedViewComponent from '../verifiedView.native';

// verifiedView renders static state { stats: { sessions: 42, errors: 3 } }.
const html = renderToStaticMarkup(React.createElement(VerifiedViewComponent));
const displayed = extractDisplayedProjections(html);

// A contract binding the panel's two projections to a twin entity (field = node's post-root path).
const contract: { projections: SurfaceTwinProjection[] } = {
  projections: [
    { element: 'Sessions', node: 'stats.sessions', entity: 'reactor-7', identity: true },
    { element: 'Errors', node: 'stats.errors', entity: 'reactor-7', identity: true },
  ],
};

describe('surface twin runtime — verifiedView rendered → extracted → twin-checked', () => {
  it('reads the DISPLAYED values from the render-authored markup', () => {
    expect(displayed['stats.sessions']).toBe('42');
    expect(displayed['stats.errors']).toBe('3');
  });

  it('CONSENSUS when the authoritative twin matches what the surface displays', () => {
    const r = checkSurfaceTwinCorrespondence({
      contract,
      displayedValues: displayed,
      authoritativeState: { 'reactor-7': { sessions: 42, errors: 3 } },
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.checked).toBe(2);
    expect(r.divergences).toEqual([]);
  });

  it('CANARY: FALSIFIED when the twin diverges — a self-passing verifier is caught HERE', () => {
    const r = checkSurfaceTwinCorrespondence({
      contract,
      displayedValues: displayed,
      // twin says 999 sessions; the surface renders 42 → the dashboard is lying about the twin
      authoritativeState: { 'reactor-7': { sessions: 999, errors: 3 } },
    });
    expect(r.verdict).toBe('FALSIFIED');
    expect(r.divergences).toHaveLength(1);
    expect(r.divergences[0]).toMatchObject({
      node: 'stats.sessions',
      entity: 'reactor-7',
      displayed: '42',
      authoritative: 999,
    });
  });

  it('LIVE (injected fetch): CONSENSUS via verifySurfaceTwinLive against a mock authority', async () => {
    const r = await verifySurfaceTwinLive({
      contract,
      displayedValues: displayed,
      // stands in for fetch_authoritative_state(entity) — the production seam
      fetchAuthoritativeState: async (e) =>
        e === 'reactor-7' ? { sessions: 42, errors: 3 } : null,
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.checked).toBe(2);
  });

  it('LIVE CANARY: diverging authority → FALSIFIED through the full render→extract→fetch path', async () => {
    const r = await verifySurfaceTwinLive({
      contract,
      displayedValues: displayed,
      fetchAuthoritativeState: async () => ({ sessions: 999, errors: 3 }),
    });
    expect(r.verdict).toBe('FALSIFIED');
    expect(r.divergences[0]).toMatchObject({ node: 'stats.sessions', displayed: '42', authoritative: 999 });
  });

  it('LIVE: an unreachable authority abstains (authority-unavailable), never a false FALSIFIED', async () => {
    const r = await verifySurfaceTwinLive({
      contract,
      displayedValues: displayed,
      fetchAuthoritativeState: async () => {
        throw new Error('StateAuthority down');
      },
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.abstentions.every((a) => a.reason === 'authority-unavailable')).toBe(true);
  });
});
