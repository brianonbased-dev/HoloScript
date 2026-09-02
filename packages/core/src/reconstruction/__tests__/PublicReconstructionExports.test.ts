import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import * as reconstruction from '../index';

describe('@holoscript/core/reconstruction public exports', () => {
  it('exports the agent-inference perceiver consumed by MCP server', () => {
    expect(reconstruction.deriveAgentInferencePerception).toBeTypeOf('function');
  });

  it('exports the @live_proof → twin oracle wire', () => {
    // The compile-time half (grade a claim's independence) and the runtime half (close it against
    // a live twin receipt) are both public: a consumer must be able to re-derive `verified` from
    // the artifact instead of trusting the label the compiler stamped on the badge.
    expect(reconstruction.deriveLiveProofInputs).toBeTypeOf('function');
    expect(reconstruction.anchorLiveProofClaim).toBeTypeOf('function');
    expect(reconstruction.gradeLiveProofIndependence).toBeTypeOf('function');
    expect(reconstruction.checkLiveProofTwinVerdict).toBeTypeOf('function');
    expect(reconstruction.isTwinCheckable).toBeTypeOf('function');
    expect(reconstruction.LIVE_PROOF_TWIN_VERSION).toBe('live-proof-twin-v1');
  });

  it('ships every value this package DECLARES it ships', () => {
    // The published .d.ts for this subpath is a hand-maintained template literal in
    // scripts/generate-types.mjs, not tsup output — so a new export can pass typecheck, tests and
    // build while being invisible to every downstream consumer, and nothing fails until someone
    // imports it. This reconciles the declaration list against what the barrel actually exports.
    const source = readFileSync(
      new URL('../../../scripts/generate-types.mjs', import.meta.url),
      'utf8'
    );
    const start = source.indexOf('const reconstructionDTS = `');
    expect(start, 'reconstructionDTS block not found — did the generator get restructured?').
      toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf('\n`;', start));
    const declared = [...block.matchAll(/export declare (?:function|const) (\w+)/g)].map(
      (m) => m[1]
    );
    expect(declared.length).toBeGreaterThan(0);

    const runtime = new Set(Object.keys(reconstruction));
    expect(declared.filter((name) => !runtime.has(name))).toEqual([]);
  });
});
