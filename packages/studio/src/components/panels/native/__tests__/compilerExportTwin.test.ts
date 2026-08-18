/**
 * compilerExportTwin.test.ts — CG-757: the compilerExport panel is a REAL
 * @verified_view twin consumer. Its displayed numbers are no longer a synthetic
 * compileAST() estimate; the panel's own compiler-emitted contract binds every
 * scalar to the compile-job-studio StateAuthority entity, written by the
 * genuine compile fan-out producer (packages/mcp-server/src/compileFanout.ts).
 *
 * Discipline (research/2026-07-10_verified-view-v1-design.md §4): the CANARY —
 * a diverging twin that MUST flip the verdict to FALSIFIED — is co-located in
 * this file with the clean check, so a self-passing verifier cannot hide.
 * NON-CIRCULAR: displayed values come from the render-authored markup; the
 * authoritative side is an injected fetcher — two independent sources.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { extractDisplayedProjections, verifySurfaceTwinLive } from '@holoscript/core/reconstruction';

import CompilerExportComponent, { holoViewContract } from '../compilerExport.native';

// The panel renders its static defaults: status "pending", 0 targets, 0.00 KB.
const html = renderToStaticMarkup(React.createElement(CompilerExportComponent));
const displayed = extractDisplayedProjections(html);

const CLEAN_TWIN = { status: 'pending', targetCount: 0, totalKb: 0 };
// What a finished fan-out actually writes (shape from runCompileFanout) — if the
// panel still showed its defaults against this twin, it would be lying.
const DIVERGED_TWIN = { status: 'complete', targetCount: 4, totalKb: 38.61 };

const fetcherFor = (twin: Record<string, unknown>) => async (entity: string) =>
  entity === 'compile-job-studio' ? twin : null;

describe('compilerExport — a real twin consumer, not an estimate', () => {
  it('the compiler-emitted contract binds every scalar to the compile-job-studio entity', () => {
    const projections = holoViewContract.projections as Array<{
      node: string;
      entity?: string;
      identity?: boolean;
      transform?: Record<string, unknown>;
    }>;
    const byNode = new Map(projections.map((p) => [p.node, p]));
    for (const node of ['status', 'targetCount', 'totalKb']) {
      expect(byNode.get(node)?.entity).toBe('compile-job-studio');
    }
    expect(byNode.get('status')?.identity).toBe(true);
    expect(byNode.get('targetCount')?.identity).toBe(true);
    expect(byNode.get('totalKb')?.transform).toMatchObject({ precision: 2, suffix: ' KB' });
    // The old synthetic estimate must be gone from the render path.
    expect(html).not.toContain('compileAST');
  });

  it('reads the DISPLAYED values from the render-authored markup', () => {
    expect(displayed['status']).toBe('pending');
    expect(displayed['targetCount']).toBe('0');
    expect(displayed['totalKb']).toBe('0.00 KB');
  });

  it('CONSENSUS when the live twin holds what the panel displays (transform re-applied)', async () => {
    const r = await verifySurfaceTwinLive({
      contract: holoViewContract,
      displayedValues: displayed,
      fetchAuthoritativeState: fetcherFor(CLEAN_TWIN),
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.checked).toBe(3);
    expect(r.divergences).toEqual([]);
  });

  it('CANARY: a panel lying about a finished job is FALSIFIED', async () => {
    const r = await verifySurfaceTwinLive({
      contract: holoViewContract,
      displayedValues: displayed,
      fetchAuthoritativeState: fetcherFor(DIVERGED_TWIN),
    });
    expect(r.verdict).toBe('FALSIFIED');
    expect(r.divergences.length).toBeGreaterThanOrEqual(3);
  });

  it('an unreachable authority ABSTAINS — never a false verdict', async () => {
    const r = await verifySurfaceTwinLive({
      contract: holoViewContract,
      displayedValues: displayed,
      fetchAuthoritativeState: async () => null,
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.checked).toBe(0);
    expect(r.abstentions.length).toBe(3);
  });
});
